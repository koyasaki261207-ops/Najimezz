import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useAppSettings } from "../hooks/useAppSettings";
import { useLyrics } from "../hooks/useLyrics";
import { useMedia } from "../hooks/useMedia";
import { useNotchWindow } from "../hooks/useNotchWindow";
import { usePomodoro } from "../hooks/usePomodoro";
import { useShelf } from "../hooks/useShelf";
import { useWater } from "../hooks/useWater";
import { useWeather } from "../hooks/useWeather";
import { NOTCH_PAGES } from "../notch/pageRegistry";
import type { NotchPageDefinition, NotchPageId } from "../types/notch";
import { AiPage } from "./AiPage";
import { CalendarPage } from "./CalendarPage";
import { MusicPage } from "./MusicPage";
import { NotchDock } from "./NotchDock";
import { NusaMascot } from "./NusaMascot";
import { PomodoroPage } from "./PomodoroPage";
import { ShelfPage } from "./ShelfPage";
import { StatusBar } from "./StatusBar";
import { WaterPage } from "./WaterPage";
import { WeatherPage } from "./WeatherPage";

interface AskNusaEventPayload {
  open: boolean;
}

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

function resolveScaleFactor(scaleOption: string): number {
  switch (scaleOption) {
    case "115":
      return 1.08;
    case "130":
      return 1.14;
    case "150":
      return 1.2;
    default:
      return 1;
  }
}

export function NotchShell() {
  const { expanded, pinned, isTauri, togglePinned, setBrowserHover } = useNotchWindow();
  const { settings, updateSettings } = useAppSettings();
  const mediaCtrl = useMedia();
  const lyricsCtrl = useLyrics(
    mediaCtrl.media,
    mediaCtrl.positionMs,
    settings.lyricsOffsetMs
  );
  const weatherCtrl = useWeather();
  const shelfCtrl = useShelf();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  const pomodoroCtrl = usePomodoro({
    focusMinutes: settings.pomodoroFocusMin,
    shortBreakMinutes: settings.pomodoroBreakMin,
    reminderSounds: settings.reminderSounds,
    onNotify: showToast,
  });

  const waterCtrl = useWater({
    goalMl: settings.waterGoalMl,
    reminderSounds: settings.reminderSounds,
    onNotify: showToast,
  });

  const visiblePages = useMemo<NotchPageDefinition[]>(() => {
    const pageMap = new Map(NOTCH_PAGES.map((p) => [p.id, p]));
    const enabledSet = new Set(settings.enabledPages);
    const ordered: NotchPageDefinition[] = [];

    for (const id of settings.pagesOrder) {
      if (enabledSet.has(id)) {
        const def = pageMap.get(id);
        if (def) ordered.push(def);
      }
    }

    if (ordered.length === 0) {
      const fallback = pageMap.get("music") ?? NOTCH_PAGES[0];
      ordered.push(fallback);
    }

    return ordered;
  }, [settings.pagesOrder, settings.enabledPages]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isAppMega, setIsAppMega] = useState(false);
  const [pendingOpenAsk, setPendingOpenAsk] = useState(false);
  const [askFocusNonce, setAskFocusNonce] = useState(0);
  const enabledPagesRef = useRef<NotchPageId[]>(settings.enabledPages);

  useEffect(() => {
    enabledPagesRef.current = settings.enabledPages;
  }, [settings.enabledPages]);

  useEffect(() => {
    if (activeIndex >= visiblePages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visiblePages.length]);

  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;

    listen<AskNusaEventPayload>("notch:ask-nusa", (event) => {
      if (event.payload.open) {
        if (!enabledPagesRef.current.includes("ai")) {
          updateSettings({
            enabledPages: [...enabledPagesRef.current, "ai"],
          });
        }
        setPendingOpenAsk(true);
      } else {
        setPendingOpenAsk(false);
        setIsAppMega(false);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isTauri, updateSettings]);

  useEffect(() => {
    if (!pendingOpenAsk) return;
    const aiIdx = visiblePages.findIndex((p) => p.id === "ai");
    if (aiIdx >= 0) {
      setActiveIndex(aiIdx);
      setAskFocusNonce((n) => n + 1);
      setPendingOpenAsk(false);
    }
  }, [pendingOpenAsk, visiblePages]);

  const activePage = visiblePages[activeIndex] ?? visiblePages[0];
  const ActivePageComponent = activePage.component;
  const { media } = mediaCtrl;

  const isMegaPage = activePage.id === "calendar" || activePage.id === "ai";
  const isMegaMode = expanded && isMegaPage && isAppMega;
  const isTallMode =
    expanded &&
    !isMegaMode &&
    ((activePage.id === "music" && settings.showLyrics) ||
      activePage.id === "calendar");
  const showCollapsedLyrics =
    !expanded && !pinned && settings.showLyrics && media.hasSession;
  const isHiddenTopBar =
    !expanded && !pinned && !showCollapsedLyrics && settings.minimalNotch;

  useEffect(() => {
    if (!expanded || !isMegaPage) {
      setIsAppMega(false);
    }
  }, [expanded, activePage.id, isMegaPage]);

  useEffect(() => {
    if (!isTauri) return;
    if (!expanded || activePage.id !== "ai") {
      invoke("set_ask_open", { open: false }).catch(() => {});
    }
  }, [expanded, activePage.id, isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    invoke("set_notch_mega", { mega: isMegaMode }).catch(() => {});
  }, [isMegaMode, isTauri]);

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
    const shelfIdx = visiblePages.findIndex((p) => p.id === "shelf");
    if (shelfIdx >= 0) {
      setActiveIndex(shelfIdx);
    }
  }, [shelfCtrl.isDragHovering, visiblePages]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleToggleLyrics = useCallback(() => {
    updateSettings({ showLyrics: !settings.showLyrics });
  }, [settings.showLyrics, updateSettings]);

  const stepPage = useCallback(
    (delta: number) => {
      setIsAppMega(false);
      setActiveIndex(
        (prev) => (prev + delta + visiblePages.length) % visiblePages.length
      );
    },
    [visiblePages.length]
  );

  const handleSelectPage = useCallback(
    (pageId: NotchPageId) => {
      const idx = visiblePages.findIndex((p) => p.id === pageId);
      if (idx >= 0) {
        setIsAppMega(false);
        setActiveIndex(idx);
      }
    },
    [visiblePages]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!expanded || visiblePages.length <= 1) return;
      if (Math.abs(event.deltaY) < 12 && Math.abs(event.deltaX) < 12) return;
      const dominant =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      stepPage(dominant > 0 ? 1 : -1);
    },
    [expanded, stepPage, visiblePages.length]
  );

  const handleOpenSettings = useCallback(() => {
    if (isTauri) {
      invoke("open_settings_window", { tab: null }).catch((err) => {
        showToast(typeof err === "string" ? err : "Không thể mở cửa sổ Cài đặt");
      });
    } else {
      window.open("?window=settings", "_blank", "width=780,height=600");
    }
  }, [isTauri, showToast]);

  const handleCollapsedClick = useCallback(() => {
    if (expanded || settings.openTrigger !== "click") return;
    if (isTauri) {
      invoke("set_notch_expanded", { expanded: true }).catch(() => {});
    } else {
      setBrowserHover(true);
    }
  }, [expanded, isTauri, setBrowserHover, settings.openTrigger]);

  const frameSizeClass = expanded
    ? isMegaMode
      ? "is-expanded is-mega"
      : isTallMode
        ? "is-expanded is-tall"
        : "is-expanded"
    : showCollapsedLyrics
      ? "is-collapsed is-collapsed-lyrics"
      : isHiddenTopBar
        ? "is-collapsed is-hidden-bar"
        : "is-collapsed";

  const frameModifierClasses = [
    frameSizeClass,
    settings.notchStyle === "floating" ? "style-floating" : "",
    settings.glassEffect ? "has-glass" : "",
    settings.animationSpeed === "fast" ? "anim-fast" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const glassAlpha = (1 - (settings.glassTint / 100) * 0.48).toFixed(2);
  const scaleFactor = resolveScaleFactor(settings.notchScale);

  const frameInlineStyle = {
    "--glass-alpha": glassAlpha,
    "--notch-scale": String(scaleFactor),
  } as CSSProperties;

  const isLyricMuted =
    lyricsCtrl.loading ||
    lyricsCtrl.lyrics.instrumental ||
    (!lyricsCtrl.lyrics.synced && lyricsCtrl.lyrics.plainLines.length === 0) ||
    (lyricsCtrl.lyrics.synced && lyricsCtrl.activeLineIndex < 0);

  return (
    <div className="notch-viewport">
      <div
        className={`notch-frame ${frameModifierClasses}`}
        style={frameInlineStyle}
        onMouseEnter={() => {
          if (settings.openTrigger === "hover") {
            setBrowserHover(true);
          }
        }}
        onMouseLeave={() => setBrowserHover(false)}
        onWheel={handleWheel}
      >
        <NotchEar side="left" />
        <NotchEar side="right" />

        <div className="notch-surface" onClick={handleCollapsedClick}>
          {!expanded ? (
            isHiddenTopBar ? (
              <div className="notch-hidden-bar" aria-label="Hover to open Nusa">
                {media.hasSession && media.isPlaying && (
                  <span className="hidden-bar-music-dot" aria-hidden="true" />
                )}
                <span className="hidden-bar-pill" aria-hidden="true" />
                {pomodoroCtrl.status === "running" && (
                  <span className="hidden-bar-pomo-dot" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div
                className={`notch-collapsed-bar ${showCollapsedLyrics ? "has-lyrics" : ""}`}
              >
                <div className="collapsed-left">
                  {media.hasSession && media.thumbnail ? (
                    <img
                      className="collapsed-cover"
                      src={media.thumbnail}
                      alt={media.title}
                    />
                  ) : settings.showMascot ? (
                    <NusaMascot size={20} />
                  ) : (
                    <span className="collapsed-dot-brand" aria-hidden="true" />
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
                  <StatusBar compact showDateTime={settings.showDateTime} />
                </div>
              </div>
            )
          ) : (
            <div className="notch-expanded-layout">
              <header className="notch-header">
                <div className="notch-header-left">
                  {activePage.showHeaderTitle && (
                    <span className="notch-page-title">{activePage.label}</span>
                  )}
                </div>

                <div className="notch-header-center">
                  <StatusBar showDateTime={settings.showDateTime} />
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
                  disabled={visiblePages.length <= 1}
                  onClick={() => stepPage(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={2.2} />
                </button>

                <main className="notch-page-stage">
                  {activePage.id === "music" ? (
                    <MusicPage
                      lyricsCtrl={lyricsCtrl}
                      mediaCtrl={mediaCtrl}
                      onToggleLyrics={handleToggleLyrics}
                      showLyrics={settings.showLyrics}
                    />
                  ) : activePage.id === "pomodoro" ? (
                    <PomodoroPage pomodoroCtrl={pomodoroCtrl} />
                  ) : activePage.id === "water" ? (
                    <WaterPage waterCtrl={waterCtrl} />
                  ) : activePage.id === "weather" ? (
                    <WeatherPage weatherCtrl={weatherCtrl} />
                  ) : activePage.id === "shelf" ? (
                    <ShelfPage onNotify={showToast} shelfCtrl={shelfCtrl} />
                  ) : activePage.id === "calendar" ? (
                    <CalendarPage
                      isMega={isMegaMode}
                      onNotify={showToast}
                      onSetMega={setIsAppMega}
                      weekStartsOn={settings.weekStartsOn}
                    />
                  ) : activePage.id === "ai" ? (
                    <AiPage
                      focusNonce={askFocusNonce}
                      isMega={isMegaMode}
                      onNotify={showToast}
                      onSetMega={setIsAppMega}
                    />
                  ) : (
                    <ActivePageComponent />
                  )}
                </main>

                <button
                  type="button"
                  className="notch-nav-arrow"
                  aria-label="Next page"
                  disabled={visiblePages.length <= 1}
                  onClick={() => stepPage(1)}
                >
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>

              {toastMessage && <div className="notch-toast">{toastMessage}</div>}

              <NotchDock
                activePageId={activePage.id}
                enableHoverIcons={settings.showPageIconsOnHover}
                onOpenSettings={handleOpenSettings}
                onSelectPage={handleSelectPage}
                pages={visiblePages}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
