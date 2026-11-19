import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useLyrics } from "../hooks/useLyrics";
import { useMedia } from "../hooks/useMedia";
import { useNotchWindow } from "../hooks/useNotchWindow";
import { useShelf } from "../hooks/useShelf";
import { useWeather } from "../hooks/useWeather";
import { NOTCH_PAGES } from "../notch/pageRegistry";
import type { NotchPageId } from "../types/notch";
import { MusicPage } from "./MusicPage";
import { NotchDock } from "./NotchDock";
import { NusaMascot } from "./NusaMascot";
import { ShelfPage } from "./ShelfPage";
import { StatusBar } from "./StatusBar";
import { WeatherPage } from "./WeatherPage";

const SHOW_LYRICS_STORAGE_KEY = "nusa.showLyrics";

function NotchEar({ side }: { side: "left" | "right" }) {
  return (
    <svg
      className={`notch-ear notch-ear-${side}`}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      {side === "left" ? (
        <path d="M18 0H0C10 0 18 8 18 18V0Z" fill="#000000" />
      ) : (
        <path d="M0 0H18C8 0 0 8 0 18V0Z" fill="#000000" />
      )}
    </svg>
  );
}

export function NotchShell() {
  const { expanded, pinned, isTauri, togglePinned, setBrowserHover } = useNotchWindow();
  const mediaCtrl = useMedia();
  const lyricsCtrl = useLyrics(mediaCtrl.media, mediaCtrl.positionMs);
  const weatherCtrl = useWeather();
  const shelfCtrl = useShelf();

  const [activeIndex, setActiveIndex] = useState(0);
  const [showLyrics, setShowLyrics] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SHOW_LYRICS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const activePage = NOTCH_PAGES[activeIndex];
  const ActivePageComponent = activePage.component;
  const { media } = mediaCtrl;

  const isTallMode = expanded && activePage.id === "music" && showLyrics;
  const showCollapsedLyrics = !expanded && showLyrics && media.hasSession;

  useEffect(() => {
    if (!isTauri) return;
    invoke("set_notch_tall", { tall: isTallMode }).catch(() => {});
  }, [isTallMode, isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    invoke("set_notch_collapsed_wide", { wide: showCollapsedLyrics }).catch(() => {});
  }, [showCollapsedLyrics, isTauri]);

  useEffect(() => {
    if (!shelfCtrl.isDragHovering) return;
    const shelfIdx = NOTCH_PAGES.findIndex((p) => p.id === "shelf");
    if (shelfIdx >= 0) {
      setActiveIndex(shelfIdx);
    }
  }, [shelfCtrl.isDragHovering]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 1900);
  }, []);

  const handleToggleLyrics = useCallback(() => {
    setShowLyrics((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SHOW_LYRICS_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const stepPage = useCallback((delta: number) => {
    setActiveIndex((prev) => (prev + delta + NOTCH_PAGES.length) % NOTCH_PAGES.length);
  }, []);

  const handleSelectPage = useCallback((pageId: NotchPageId) => {
    const idx = NOTCH_PAGES.findIndex((p) => p.id === pageId);
    if (idx >= 0) {
      setActiveIndex(idx);
    }
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!expanded) return;
      if (Math.abs(event.deltaY) < 12 && Math.abs(event.deltaX) < 12) return;
      const dominant =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      stepPage(dominant > 0 ? 1 : -1);
    },
    [expanded, stepPage]
  );

  const handleOpenSettings = useCallback(() => {
    showToast("Settings window will be connected in next phase");
  }, [showToast]);

  const frameClass = expanded
    ? isTallMode
      ? "is-expanded is-tall"
      : "is-expanded"
    : showCollapsedLyrics
      ? "is-collapsed is-collapsed-lyrics"
      : "is-collapsed";

  const isLyricMuted =
    lyricsCtrl.loading ||
    lyricsCtrl.lyrics.instrumental ||
    (!lyricsCtrl.lyrics.synced && lyricsCtrl.lyrics.plainLines.length === 0) ||
    (lyricsCtrl.lyrics.synced && lyricsCtrl.activeLineIndex < 0);

  return (
    <div className="notch-viewport">
      <div
        className={`notch-frame ${frameClass}`}
        onMouseEnter={() => setBrowserHover(true)}
        onMouseLeave={() => setBrowserHover(false)}
        onWheel={handleWheel}
      >
        <NotchEar side="left" />
        <NotchEar side="right" />

        <div className="notch-surface">
          {!expanded ? (
            <div className={`notch-collapsed-bar ${showCollapsedLyrics ? "has-lyrics" : ""}`}>
              <div className="collapsed-left">
                {media.hasSession && media.thumbnail ? (
                  <img
                    className="collapsed-cover"
                    src={media.thumbnail}
                    alt={media.title}
                  />
                ) : (
                  <NusaMascot size={20} />
                )}
                {media.hasSession && media.isPlaying && (
                  <div className="collapsed-eq" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>

              {showCollapsedLyrics && (
                <div className="collapsed-lyric-slot" title={lyricsCtrl.currentLineText}>
                  <span
                    key={lyricsCtrl.currentLineKey}
                    className={`collapsed-lyric-text ${isLyricMuted ? "is-muted" : ""}`}
                  >
                    {lyricsCtrl.currentLineText}
                  </span>
                </div>
              )}

              <div className="collapsed-right">
                <StatusBar compact />
              </div>
            </div>
          ) : (
            <div className="notch-expanded-layout">
              <header className="notch-header">
                <div className="notch-header-left">
                  {activePage.showHeaderTitle && (
                    <span className="notch-page-title">{activePage.label}</span>
                  )}
                </div>

                <div className="notch-header-center">
                  <StatusBar />
                </div>

                <div className="notch-header-right">
                  <button
                    type="button"
                    className={`notch-pin-btn ${pinned ? "is-pinned" : ""}`}
                    title={pinned ? "Unpin notch" : "Pin notch open"}
                    aria-label={pinned ? "Unpin notch" : "Pin notch open"}
                    onClick={togglePinned}
                  >
                    <Pin size={12} strokeWidth={2.2} />
                  </button>
                </div>
              </header>

              <div className="notch-body-row">
                <button
                  type="button"
                  className="notch-nav-arrow"
                  aria-label="Previous page"
                  onClick={() => stepPage(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={2.2} />
                </button>

                <main className="notch-page-stage">
                  {activePage.id === "music" ? (
                    <MusicPage
                      mediaCtrl={mediaCtrl}
                      lyricsCtrl={lyricsCtrl}
                      showLyrics={showLyrics}
                      onToggleLyrics={handleToggleLyrics}
                    />
                  ) : activePage.id === "weather" ? (
                    <WeatherPage weatherCtrl={weatherCtrl} />
                  ) : activePage.id === "shelf" ? (
                    <ShelfPage onNotify={showToast} shelfCtrl={shelfCtrl} />
                  ) : (
                    <ActivePageComponent />
                  )}
                </main>

                <button
                  type="button"
                  className="notch-nav-arrow"
                  aria-label="Next page"
                  onClick={() => stepPage(1)}
                >
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>

              {toastMessage && <div className="notch-toast">{toastMessage}</div>}

              <NotchDock
                pages={NOTCH_PAGES}
                activePageId={activePage.id}
                onOpenSettings={handleOpenSettings}
                onSelectPage={handleSelectPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
