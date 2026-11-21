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
import { addCalendarEventDirect, toDateKey } from "../hooks/useCalendarEvents";
import { useLyrics } from "../hooks/useLyrics";
import { useMascot } from "../hooks/useMascot";
import { useMedia } from "../hooks/useMedia";
import { useNotchWindow } from "../hooks/useNotchWindow";
import { usePomodoro } from "../hooks/usePomodoro";
import { useShelf } from "../hooks/useShelf";
import { useWater } from "../hooks/useWater";
import { useWeather } from "../hooks/useWeather";
import { NOTCH_PAGES } from "../notch/pageRegistry";
import type { NotchPageDefinition, NotchPageId } from "../types/notch";
import { AiPage, type AskStage } from "./AiPage";
import { CalendarPage } from "./CalendarPage";
import { MascotFace } from "./MascotFace";
import { MusicPage } from "./MusicPage";
import { NotchDock } from "./NotchDock";
import { NusaMascot } from "./NusaMascot";
import { PomodoroPage } from "./PomodoroPage";
import { ShelfPage } from "./ShelfPage";
import { StatusBar } from "./StatusBar";
import { SystemPage } from "./SystemPage";
import { WaterPage } from "./WaterPage";
import { WeatherPage } from "./WeatherPage";

interface AskNusaEventPayload {
  open: boolean;
}

interface NusaActionEventPayload {
  target: string;
  action: string;
  payload: Record<string, unknown>;
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
  const { expanded, pinned, isTauri, togglePinned, setBrowserHover } =
    useNotchWindow();
  const { settings, updateSettings } = useAppSettings();
  const mascotCtrl = useMascot(settings.showMascot);
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

  const handleMilestoneNotify = useCallback(
    (message: string) => {
      showToast(message);
      if (
        settings.showMascot &&
        (message.startsWith("Xong ") ||
          message.startsWith("Hoàn tất ") ||
          message.startsWith("Đạt mục tiêu "))
      ) {
        mascotCtrl.triggerReaction("happy");
      }
    },
    [mascotCtrl, settings.showMascot, showToast]
  );

  const pomodoroCtrl = usePomodoro({
    focusMinutes: settings.pomodoroFocusMin,
    shortBreakMinutes: settings.pomodoroBreakMin,
    reminderSounds: settings.reminderSounds,
    onNotify: handleMilestoneNotify,
  });

  const waterCtrl = useWater({
    goalMl: settings.waterGoalMl,
    reminderSounds: settings.reminderSounds,
    onNotify: handleMilestoneNotify,
  });

  const pomodoroRef = useRef(pomodoroCtrl);
  const waterRef = useRef(waterCtrl);

  useEffect(() => {
    pomodoroRef.current = pomodoroCtrl;
  }, [pomodoroCtrl]);

  useEffect(() => {
    waterRef.current = waterCtrl;
  }, [waterCtrl]);

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
  const [isCalendarMega, setIsCalendarMega] = useState(false);
  const [isAiMega, setIsAiMega] = useState(false);
  const [askPillMode, setAskPillMode] = useState(false);
  const [askStage, setAskStage] = useState<AskStage>("pill");
  const [askFocusNonce, setAskFocusNonce] = useState(0);

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
        setAskPillMode(true);
        setAskStage("pill");
        setIsAiMega(false);
        setAskFocusNonce((n) => n + 1);
      } else {
        setAskPillMode(false);
        setAskStage("pill");
        setIsAiMega(false);
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
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;

    listen<NusaActionEventPayload>("ai:nusa-action", (event) => {
      const { target, action, payload } = event.payload;

      if (target === "calendar" && action === "add_event") {
        const title =
          typeof payload.title === "string" ? payload.title : "Sự kiện mới";
        const dateKey =
          typeof payload.date === "string" && payload.date.trim()
            ? payload.date.trim()
            : toDateKey(new Date());
        const time = typeof payload.time === "string" ? payload.time : "";
        const note = typeof payload.note === "string" ? payload.note : "";
        const created = addCalendarEventDirect({ dateKey, title, time, note });
        if (created) {
          showToast(`AI đã thêm lịch: ${created.title}`);
        }
        return;
      }

      if (target === "pomodoro") {
        const pomo = pomodoroRef.current;
        if (action === "start" && pomo.status !== "running") {
          pomo.toggleStartPause();
        } else if (action === "pause" && pomo.status === "running") {
          pomo.toggleStartPause();
        } else if (action === "toggle") {
          pomo.toggleStartPause();
        } else if (action === "reset") {
          pomo.resetTimer();
        } else if (action === "skip") {
          pomo.skipStep();
        }
        return;
      }

      if (target === "water") {
        const water = waterRef.current;
        if (action === "add") {
          const amount =
            typeof payload.amountMl === "number" && payload.amountMl > 0
              ? payload.amountMl
              : 250;
          water.addWater(amount);
        } else if (action === "reset") {
          water.resetToday();
        }
        return;
      }

      if (target === "notch" && action === "switch_page") {
        const pageId =
          typeof payload.page === "string" ? (payload.page as NotchPageId) : null;
        if (pageId) {
          const idx = visiblePages.findIndex((p) => p.id === pageId);
          if (idx >= 0) {
            setAskPillMode(false);
            invoke("set_ask_open", { open: false }).catch(() => {});
            setActiveIndex(idx);
          }
        }
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
  }, [isTauri, showToast, visiblePages]);

  const activePage = visiblePages[activeIndex] ?? visiblePages[0];
  const ActivePageComponent = activePage.component;
  const { media } = mediaCtrl;

  const isStandaloneAsk = expanded && askPillMode;
  const isMegaMode = isStandaloneAsk
    ? askStage === "answered"
    : expanded && activePage.id === "calendar" && isCalendarMega;
  const isTallMode = isStandaloneAsk
    ? askStage === "thinking"
    : expanded &&
      !isMegaMode &&
      ((activePage.id === "music" && settings.showLyrics) ||
        activePage.id === "calendar" ||
        (activePage.id === "ai" && isAiMega));
  const showCollapsedLyrics =
    !expanded && !pinned && settings.showLyrics && media.hasSession;

  const canShowMascot =
    !expanded &&
    !pinned &&
    !showCollapsedLyrics &&
    settings.showMascot &&
    mascotCtrl.mood !== "hidden";

  const showMascotFace =
    canShowMascot &&
    (mascotCtrl.peeking ||
      (!settings.minimalNotch && !(media.hasSession && media.isPlaying)));

  const isHiddenTopBar =
    !expanded &&
    !pinned &&
    !showCollapsedLyrics &&
    !showMascotFace &&
    settings.minimalNotch;

  useEffect(() => {
    if (!expanded) {
      setAskPillMode(false);
      setAskStage("pill");
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded || isStandaloneAsk || activePage.id !== "calendar") {
      setIsCalendarMega(false);
    }
  }, [expanded, isStandaloneAsk, activePage.id]);

  useEffect(() => {
    if (!expanded || (!isStandaloneAsk && activePage.id !== "ai")) {
      setIsAiMega(false);
    }
  }, [expanded, isStandaloneAsk, activePage.id]);

  useEffect(() => {
    if (!isTauri) return;
    if (!expanded || (!askPillMode && activePage.id !== "ai")) {
      invoke("set_ask_open", { open: false }).catch(() => {});
    }
  }, [expanded, askPillMode, activePage.id, isTauri]);

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
    invoke("set_notch_collapsed_wide", { wide: showCollapsedLyrics }).catch(
      () => {}
    );
  }, [showCollapsedLyrics, isTauri]);

  useEffect(() => {
    if (!shelfCtrl.isDragHovering) return;
    const shelfIdx = visiblePages.findIndex((p) => p.id === "shelf");
    if (shelfIdx >= 0) {
      setAskPillMode(false);
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

  const handleDismissAskPill = useCallback(() => {
    setAskPillMode(false);
    setAskStage("pill");
    setIsAiMega(false);
  }, []);

  const stepPage = useCallback(
    (delta: number) => {
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
        setActiveIndex(idx);
        if (pageId === "ai") {
          setAskFocusNonce((n) => n + 1);
        }
      }
    },
    [visiblePages]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!expanded || isStandaloneAsk || visiblePages.length <= 1) return;
      if (Math.abs(event.deltaY) < 12 && Math.abs(event.deltaX) < 12) return;
      const dominant =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      stepPage(dominant > 0 ? 1 : -1);
    },
    [expanded, isStandaloneAsk, stepPage, visiblePages.length]
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

  const frameSizeClass = isStandaloneAsk
    ? askStage === "answered"
      ? "is-ask-pill is-ask-answered"
      : askStage === "thinking"
        ? "is-ask-pill is-ask-thinking"
        : "is-ask-pill"
    : expanded
      ? isMegaMode
        ? "is-expanded is-mega"
        : isTallMode
          ? "is-expanded is-tall"
          : "is-expanded"
      : showCollapsedLyrics
        ? "is-collapsed is-collapsed-lyrics"
        : showMascotFace
          ? "is-collapsed is-mascot-mode"
          : isHiddenTopBar
            ? "is-collapsed is-hidden-bar"
            : "is-collapsed";

  const frameModifierClasses = [
    frameSizeClass,
    !isStandaloneAsk && settings.notchStyle === "floating" ? "style-floating" : "",
    !isStandaloneAsk && settings.glassEffect ? "has-glass" : "",
    settings.animationSpeed === "fast" ? "anim-fast" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const glassAlpha = (1 - (settings.glassTint / 100) * 0.48).toFixed(2);
  const scaleFactor = resolveScaleFactor(settings.notchScale);

  const screenLogicalHeight =
    typeof window !== "undefined" && window.screen?.height > 0
      ? window.screen.height
      : 900;
  const askMaxHeightPx = Math.max(
    176,
    Math.min(256, Math.floor(screenLogicalHeight * 0.25))
  );

  const frameInlineStyle = {
    "--glass-alpha": glassAlpha,
    "--notch-scale": String(scaleFactor),
    "--ask-max-height": `${askMaxHeightPx}px`,
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
        {!isStandaloneAsk && (
          <>
            <NotchEar side="left" />
            <NotchEar side="right" />
          </>
        )}

        <div className="notch-surface" onClick={handleCollapsedClick}>
          {isStandaloneAsk ? (
            <div className="ask-pill-host">
              <AiPage
                isMega={askStage === "answered"}
                focusNonce={askFocusNonce}
                standalonePill
                onSetMega={setIsAiMega}
                onStageChange={setAskStage}
                onDismissPill={handleDismissAskPill}
                onNotify={showToast}
              />
              {toastMessage && <div className="notch-toast">{toastMessage}</div>}
            </div>
          ) : !expanded ? (
            showMascotFace && mascotCtrl.mood !== "hidden" ? (
              <MascotFace mood={mascotCtrl.mood} />
            ) : isHiddenTopBar ? (
              <div className="notch-hidden-bar" aria-label="Hover to open Nusa">
                {media.hasSession && media.isPlaying && (
                  <span className="hidden-bar-music-dot" aria-hidden="true" />
                )}
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
                  <div
                    className="collapsed-lyric-slot"
                    title={lyricsCtrl.currentLineText}
                  >
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
                      mediaCtrl={mediaCtrl}
                      lyricsCtrl={lyricsCtrl}
                      showLyrics={settings.showLyrics}
                      onToggleLyrics={handleToggleLyrics}
                    />
                  ) : activePage.id === "pomodoro" ? (
                    <PomodoroPage pomodoroCtrl={pomodoroCtrl} />
                  ) : activePage.id === "water" ? (
                    <WaterPage waterCtrl={waterCtrl} />
                  ) : activePage.id === "weather" ? (
                    <WeatherPage weatherCtrl={weatherCtrl} />
                  ) : activePage.id === "shelf" ? (
                    <ShelfPage shelfCtrl={shelfCtrl} onNotify={showToast} />
                  ) : activePage.id === "calendar" ? (
                    <CalendarPage
                      isMega={isCalendarMega}
                      weekStartsOn={settings.weekStartsOn}
                      onSetMega={setIsCalendarMega}
                      onNotify={showToast}
                    />
                  ) : activePage.id === "system" ? (
                    <SystemPage onNotify={showToast} />
                  ) : activePage.id === "ai" ? (
                    <AiPage
                      isMega={isAiMega}
                      focusNonce={askFocusNonce}
                      onSetMega={setIsAiMega}
                      onNotify={showToast}
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
                pages={visiblePages}
                activePageId={activePage.id}
                enableHoverIcons={settings.showPageIconsOnHover}
                onSelectPage={handleSelectPage}
                onOpenSettings={handleOpenSettings}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
