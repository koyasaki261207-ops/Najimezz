import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Contrast,
  Droplet,
  Inbox,
  Info,
  List,
  Minus,
  Monitor,
  Music,
  Plus,
  Power,
  RotateCcw,
  Settings,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useAppSettings } from "../hooks/useAppSettings";
import { useNotchWindow } from "../hooks/useNotchWindow";
import {
  AI_MODEL_OPTIONS,
  THINKING_LEVEL_OPTIONS,
  type AiModelId,
  type ThinkingLevel,
} from "../types/ai";
import type { NotchPageId } from "../types/notch";
import type {
  AnimationSpeedOption,
  LyricsOffsetOption,
  NotchScaleOption,
  OpenTriggerOption,
  WeekStartOption,
} from "../types/settings";
import { NusaMascot } from "./NusaMascot";

type SettingsTabId =
  | "general"
  | "display"
  | "pages"
  | "appearance"
  | "music"
  | "notifications"
  | "ask-nusa"
  | "calendar"
  | "pomodoro"
  | "water"
  | "shelf"
  | "about";

const VALID_SETTINGS_TABS: SettingsTabId[] = [
  "general",
  "display",
  "pages",
  "appearance",
  "music",
  "notifications",
  "ask-nusa",
  "calendar",
  "pomodoro",
  "water",
  "shelf",
  "about",
];

function resolveTabFromQuery(): SettingsTabId {
  if (typeof window === "undefined") return "general";
  const raw = new URLSearchParams(window.location.search).get("tab");
  if (raw && VALID_SETTINGS_TABS.includes(raw as SettingsTabId)) {
    return raw as SettingsTabId;
  }
  return "general";
}

interface SidebarNavItem {
  id: SettingsTabId;
  label: string;
  bg: string;
  icon: typeof Settings;
}

interface AskShortcutStatus {
  enabled: boolean;
  registered: boolean;
  shortcut: string;
  error: string | null;
}

const SIDEBAR_ITEMS: SidebarNavItem[] = [
  { id: "general", label: "General", bg: "#6B7280", icon: Settings },
  { id: "display", label: "Display", bg: "#5B64F5", icon: Monitor },
  { id: "pages", label: "Pages", bg: "#0EA5E9", icon: List },
  { id: "appearance", label: "Appearance", bg: "#3F3F46", icon: Contrast },
  { id: "music", label: "Music and lyrics", bg: "#F43F5E", icon: Music },
  { id: "notifications", label: "Notifications", bg: "#EF4444", icon: Bell },
  { id: "ask-nusa", label: "Ask Nusa", bg: "#7C3AED", icon: Sparkles },
  { id: "calendar", label: "Calendar", bg: "#22C55E", icon: Calendar },
  { id: "pomodoro", label: "Pomodoro", bg: "#6366F1", icon: Timer },
  { id: "water", label: "Water", bg: "#0284C7", icon: Droplet },
  { id: "shelf", label: "Shelf", bg: "#F59E0B", icon: Inbox },
];

const PAGE_META: Record<NotchPageId, { label: string; accent: string }> = {
  music: { label: "Music", accent: "#FF3B5C" },
  pomodoro: { label: "Pomodoro", accent: "#8B5CF6" },
  water: { label: "Water", accent: "#38BDF8" },
  weather: { label: "Weather", accent: "#FBBF24" },
  shelf: { label: "Shelf", accent: "#F59E0B" },
  calendar: { label: "Calendar", accent: "#22C55E" },
  ai: { label: "Ask Nusa", accent: "#7C3AED" },
};

const SIZE_OPTIONS: { id: NotchScaleOption; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "100", label: "100%" },
  { id: "115", label: "115%" },
  { id: "130", label: "130%" },
  { id: "150", label: "150%" },
];

const LYRICS_OFFSET_OPTIONS: { value: LyricsOffsetOption; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 300, label: "0.3 s" },
  { value: 600, label: "0.6 s" },
  { value: 1000, label: "1 s" },
];

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}

function ToggleSwitch({
  checked,
  disabled = false,
  ariaLabel,
  onChange,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`nusa-switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="nusa-switch-thumb" />
    </button>
  );
}

function PageMiniPreview({ pageId }: { pageId: NotchPageId }) {
  const accent = PAGE_META[pageId].accent;
  return (
    <div className="page-mini-preview" aria-hidden="true">
      <div className="page-mini-screen">
        {pageId === "music" && (
          <>
            <span className="mini-art" style={{ backgroundColor: accent }} />
            <div className="mini-lines">
              <span className="mini-line w-lg" />
              <span className="mini-line w-sm" />
            </div>
          </>
        )}
        {pageId === "pomodoro" && (
          <>
            <div className="mini-lines">
              <span className="mini-line w-sm" />
              <span className="mini-line w-xs" />
            </div>
            <div className="mini-bars">
              <span style={{ backgroundColor: accent }} />
              <span />
              <span />
              <span />
            </div>
          </>
        )}
        {pageId === "shelf" && (
          <div className="mini-slots">
            <span style={{ borderColor: accent }} />
            <span />
            <span />
            <span />
          </div>
        )}
        {pageId === "water" && (
          <>
            <span className="mini-ring" style={{ borderColor: accent }} />
            <div className="mini-lines">
              <span className="mini-line w-md" />
              <span className="mini-line w-sm" />
            </div>
          </>
        )}
        {pageId === "weather" && (
          <>
            <span className="mini-sun" style={{ backgroundColor: accent }} />
            <div className="mini-lines">
              <span className="mini-line w-md" />
              <span className="mini-line w-sm" />
            </div>
          </>
        )}
        {pageId === "calendar" && (
          <div className="mini-cal">
            <span className="mini-cal-header" style={{ backgroundColor: accent }} />
            <div className="mini-cal-grid">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        {pageId === "ai" && (
          <div className="mini-ai">
            <Sparkles size={11} style={{ color: accent }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsWindow() {
  const { settings, updateSettings } = useAppSettings();
  const { pinned, togglePinned, recenterNotch, quitApp } = useNotchWindow();
  const aiCtrl = useAiAssistant();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(() =>
    resolveTabFromQuery()
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;

    invoke<string | null>("take_pending_settings_tab")
      .then((pendingTab) => {
        if (pendingTab && VALID_SETTINGS_TABS.includes(pendingTab as SettingsTabId)) {
          setActiveTab(pendingTab as SettingsTabId);
        }
      })
      .catch(() => {});

    listen<string>("settings:navigate", (event) => {
      const next = event.payload as SettingsTabId;
      if (VALID_SETTINGS_TABS.includes(next)) {
        setActiveTab(next);
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
  }, []);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<NotchPageId | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [editingKey, setEditingKey] = useState(false);

  const [shortcutStatus, setShortcutStatus] = useState<AskShortcutStatus>({
    enabled: settings.askShortcutEnabled,
    registered: settings.askShortcutEnabled,
    shortcut: "Ctrl + Alt + Space",
    error: null,
  });

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;

    invoke<AskShortcutStatus>("get_ask_shortcut_status")
      .then((status) => setShortcutStatus(status))
      .catch(() => {});

    listen<AskShortcutStatus>("shortcut:status", (event) => {
      setShortcutStatus(event.payload);
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
  }, []);

  const flashNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((curr) => (curr === msg ? null : curr));
    }, 2200);
  };

  const handleCloseWindow = () => {
    if (isTauriRuntime()) {
      getCurrentWindow().close().catch(() => {});
    } else {
      window.close();
    }
  };

  const enabledSet = new Set(settings.enabledPages);
  const activePages = settings.pagesOrder.filter((id) => enabledSet.has(id));
  const hiddenPages = settings.pagesOrder.filter((id) => !enabledSet.has(id));

  const togglePageEnabled = (pageId: NotchPageId, enable: boolean) => {
    if (!enable && activePages.length <= 1) {
      flashNotice("Cần giữ lại ít nhất 1 trang hiển thị trong Notch");
      return;
    }
    const nextEnabled = enable
      ? [...settings.enabledPages, pageId]
      : settings.enabledPages.filter((id) => id !== pageId);
    updateSettings({ enabledPages: nextEnabled });
  };

  const moveActivePage = (pageId: NotchPageId, delta: number) => {
    const idx = activePages.indexOf(pageId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= activePages.length) return;

    const reorderedActive = [...activePages];
    const [moved] = reorderedActive.splice(idx, 1);
    reorderedActive.splice(targetIdx, 0, moved);

    updateSettings({ pagesOrder: [...reorderedActive, ...hiddenPages] });
  };

  const handlePageDrop = (event: DragEvent<HTMLDivElement>, targetPageId: NotchPageId) => {
    event.preventDefault();
    if (!draggingPageId || draggingPageId === targetPageId) {
      setDraggingPageId(null);
      return;
    }
    const fromIdx = activePages.indexOf(draggingPageId);
    const toIdx = activePages.indexOf(targetPageId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingPageId(null);
      return;
    }
    const reorderedActive = [...activePages];
    const [moved] = reorderedActive.splice(fromIdx, 1);
    reorderedActive.splice(toIdx, 0, moved);
    updateSettings({ pagesOrder: [...reorderedActive, ...hiddenPages] });
    setDraggingPageId(null);
  };

  const handleSaveAiKey = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await aiCtrl.saveApiKey(keyDraft);
      setKeyDraft("");
      setEditingKey(false);
      flashNotice("Đã lưu Gemini API key an toàn tại Rust");
    } catch (err) {
      flashNotice(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Lưu API key thất bại"
      );
    }
  };

  const handlePasteKey = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim().length > 0) {
        await aiCtrl.saveApiKey(clip.trim());
        setEditingKey(false);
        flashNotice("Đã dán và lưu Gemini API key");
        return;
      }
    } catch {
      // Fallback to inline text box if clipboard read is blocked
    }
    setEditingKey(true);
  };

  const handleClearShelfNow = () => {
    if (!isTauriRuntime()) {
      flashNotice("Đã dọn sạch Shelf");
      return;
    }
    invoke("clear_shelf")
      .then(() => flashNotice("Đã xóa toàn bộ file trên Shelf"))
      .catch(() => flashNotice("Không thể dọn Shelf"));
  };

  const selectedAiModel =
    AI_MODEL_OPTIONS.find((item) => item.id === aiCtrl.config.model) ??
    AI_MODEL_OPTIONS[0];
  const availableThinkingLevels = THINKING_LEVEL_OPTIONS.filter(
    (lvl) => lvl.id !== "xhigh" || selectedAiModel.supportsXHigh
  );

  return (
    <div className="settings-window">
      <aside className="settings-sidebar">
        <div className="settings-window-controls" data-tauri-drag-region>
          <button
            type="button"
            className="settings-close-dot"
            title="Close Settings"
            aria-label="Close Settings"
            onClick={handleCloseWindow}
          />
        </div>

        <nav className="settings-nav-list" aria-label="Settings sections">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item ${isActive ? "is-active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span
                  className="settings-nav-icon"
                  style={{ backgroundColor: item.bg }}
                >
                  <Icon color="#FFFFFF" size={14} strokeWidth={2.2} />
                </span>
                <span className="settings-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-sidebar-footer">
          <button
            type="button"
            className={`settings-nav-item ${activeTab === "about" ? "is-active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            <span
              className="settings-nav-icon"
              style={{ backgroundColor: "#52525B" }}
            >
              <Info color="#FFFFFF" size={14} strokeWidth={2.2} />
            </span>
            <span className="settings-nav-label">About</span>
            <span className="settings-about-dot" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="settings-content">
        <header className="settings-content-header" data-tauri-drag-region>
          <h1 className="settings-page-heading" data-tauri-drag-region>
            {activeTab === "about"
              ? "About"
              : SIDEBAR_ITEMS.find((item) => item.id === activeTab)?.label ?? "Settings"}
          </h1>
          {statusNotice && <div className="settings-notice-pill">{statusNotice}</div>}
        </header>

        <div className="settings-scroll-body">
          {activeTab === "general" && (
            <>
              <section className="settings-section">
                <div className="settings-section-title">Startup</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Start with Windows</div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Start with Windows"
                      checked={settings.startWithWindows}
                      onChange={(checked) => updateSettings({ startWithWindows: checked })}
                    />
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Notch</div>
                <div className="settings-card">
                  <div className="settings-row settings-row-column">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Size</div>
                      <div className="settings-row-sub">
                        Adjust visual scale of the floating notch
                      </div>
                    </div>
                    <div className="settings-segmented settings-segmented-full">
                      {SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`settings-seg-btn ${
                            settings.notchScale === opt.id ? "is-active" : ""
                          }`}
                          onClick={() => updateSettings({ notchScale: opt.id })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Minimal notch</div>
                      <div className="settings-row-sub">
                        Collapse into a slim top edge bar when idle
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Minimal notch"
                      checked={settings.minimalNotch}
                      onChange={(checked) => updateSettings({ minimalNotch: checked })}
                    />
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Nusa mascot</div>
                      <div className="settings-row-sub">
                        A little friend that lives in the notch
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Nusa mascot"
                      checked={settings.showMascot}
                      onChange={(checked) => updateSettings({ showMascot: checked })}
                    />
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Date &amp; time</div>
                      <div className="settings-row-sub">
                        The clock and date beside the status ring
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Date and time"
                      checked={settings.showDateTime}
                      onChange={(checked) => updateSettings({ showDateTime: checked })}
                    />
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Sounds</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Reminder sounds</div>
                      <div className="settings-row-sub">
                        Chimes for Pomodoro, Calendar and Water
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Reminder sounds"
                      checked={settings.reminderSounds}
                      onChange={(checked) => updateSettings({ reminderSounds: checked })}
                    />
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Full screen</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Hide in full screen</div>
                      <div className="settings-row-sub">
                        Games, videos and slides that fill the screen
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Hide in full screen"
                      checked={settings.hideInFullscreen}
                      onChange={(checked) => updateSettings({ hideInFullscreen: checked })}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "display" && (
            <section className="settings-section">
              <div className="settings-section-title">Position &amp; Window</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Pin notch open</div>
                    <div className="settings-row-sub">
                      Keep the notch expanded on top of your screen
                    </div>
                  </div>
                  <ToggleSwitch
                    ariaLabel="Pin notch open"
                    checked={pinned}
                    onChange={() => togglePinned()}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Recenter on primary display</div>
                    <div className="settings-row-sub">
                      Re-align the notch after changing screen resolution or DPI
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={() => {
                      recenterNotch();
                      flashNotice("Đã căn giữa lại thanh Notch");
                    }}
                  >
                    <RotateCcw size={13} strokeWidth={2.2} />
                    <span>Recenter</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "pages" && (
            <>
              <div className="settings-intro-note">
                Your notch shows these pages in order. Drag or use arrows to rearrange.
              </div>

              <section className="settings-section">
                <div className="settings-section-title">IN YOUR NOTCH</div>
                <div className="settings-card">
                  {activePages.map((pageId, index) => (
                    <div
                      key={pageId}
                      className={`settings-page-row ${
                        draggingPageId === pageId ? "is-dragging" : ""
                      }`}
                      draggable
                      onDragStart={() => setDraggingPageId(pageId)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handlePageDrop(e, pageId)}
                      onDragEnd={() => setDraggingPageId(null)}
                    >
                      <span className="page-order-num">{index + 1}</span>
                      <PageMiniPreview pageId={pageId} />
                      <span className="page-row-name">{PAGE_META[pageId].label}</span>

                      <div className="page-row-controls">
                        <div className="page-reorder-btns">
                          <button
                            type="button"
                            className="page-reorder-btn"
                            disabled={index === 0}
                            aria-label={`Move ${PAGE_META[pageId].label} up`}
                            onClick={() => moveActivePage(pageId, -1)}
                          >
                            <ChevronUp size={12} strokeWidth={2.4} />
                          </button>
                          <button
                            type="button"
                            className="page-reorder-btn"
                            disabled={index === activePages.length - 1}
                            aria-label={`Move ${PAGE_META[pageId].label} down`}
                            onClick={() => moveActivePage(pageId, 1)}
                          >
                            <ChevronDown size={12} strokeWidth={2.4} />
                          </button>
                        </div>

                        <ToggleSwitch
                          ariaLabel={`Toggle ${PAGE_META[pageId].label}`}
                          checked={true}
                          onChange={(checked) => togglePageEnabled(pageId, checked)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {hiddenPages.length > 0 && (
                <section className="settings-section">
                  <div className="settings-section-title">HIDDEN</div>
                  <div className="settings-card">
                    {hiddenPages.map((pageId) => (
                      <div key={pageId} className="settings-page-row is-hidden-page">
                        <span className="page-order-num" />
                        <PageMiniPreview pageId={pageId} />
                        <span className="page-row-name">{PAGE_META[pageId].label}</span>
                        <div className="page-row-controls">
                          <ToggleSwitch
                            ariaLabel={`Enable ${PAGE_META[pageId].label}`}
                            checked={false}
                            onChange={(checked) => togglePageEnabled(pageId, checked)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === "appearance" && (
            <>
              <section className="settings-section">
                <div className="settings-section-title">Notch style</div>
                <div className="settings-card">
                  <div className="appearance-style-grid">
                    <button
                      type="button"
                      className={`style-choice-card ${
                        settings.notchStyle === "classic" ? "is-selected" : ""
                      }`}
                      onClick={() => updateSettings({ notchStyle: "classic" })}
                    >
                      <div className="style-preview-box">
                        <div className="style-preview-notch is-classic">
                          <span className="preview-ring" />
                          <span>10:08</span>
                        </div>
                      </div>
                      <div className="style-choice-head">
                        <span>Classic</span>
                        {settings.notchStyle === "classic" && (
                          <span className="style-check-badge">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="style-choice-sub">Joined to the top edge</div>
                    </button>

                    <button
                      type="button"
                      className={`style-choice-card ${
                        settings.notchStyle === "floating" ? "is-selected" : ""
                      }`}
                      onClick={() => updateSettings({ notchStyle: "floating" })}
                    >
                      <div className="style-preview-box">
                        <div className="style-preview-notch is-floating">
                          <span className="preview-ring" />
                          <span>10:08</span>
                        </div>
                      </div>
                      <div className="style-choice-head">
                        <span>Floating</span>
                        {settings.notchStyle === "floating" && (
                          <span className="style-check-badge">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="style-choice-sub">Floats just below the top edge</div>
                    </button>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Glass</div>
                      <div className="settings-row-sub">
                        Frosted glass surface behind the open notch
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Glass effect"
                      checked={settings.glassEffect}
                      onChange={(checked) => updateSettings({ glassEffect: checked })}
                    />
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Glass tint</div>
                    </div>
                    <div className="settings-stepper">
                      <button
                        type="button"
                        className="stepper-btn"
                        disabled={!settings.glassEffect || settings.glassTint <= 10}
                        aria-label="Decrease glass tint"
                        onClick={() =>
                          updateSettings({ glassTint: Math.max(10, settings.glassTint - 10) })
                        }
                      >
                        <Minus size={12} strokeWidth={2.4} />
                      </button>
                      <span className="stepper-value">{settings.glassTint}%</span>
                      <button
                        type="button"
                        className="stepper-btn"
                        disabled={!settings.glassEffect || settings.glassTint >= 90}
                        aria-label="Increase glass tint"
                        onClick={() =>
                          updateSettings({ glassTint: Math.min(90, settings.glassTint + 10) })
                        }
                      >
                        <Plus size={12} strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Notch</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Open the notch</div>
                    </div>
                    <div className="settings-segmented">
                      {(["hover", "click"] as OpenTriggerOption[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`settings-seg-btn ${
                            settings.openTrigger === mode ? "is-active" : ""
                          }`}
                          onClick={() => updateSettings({ openTrigger: mode })}
                        >
                          {mode === "hover" ? "Hover" : "Click"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Page icons</div>
                      <div className="settings-row-sub">
                        Show page icons when you hover the page dots
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Page icons on hover"
                      checked={settings.showPageIconsOnHover}
                      onChange={(checked) =>
                        updateSettings({ showPageIconsOnHover: checked })
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Motion</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Animation speed</div>
                    </div>
                    <div className="settings-segmented">
                      {(["normal", "fast"] as AnimationSpeedOption[]).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          className={`settings-seg-btn ${
                            settings.animationSpeed === spd ? "is-active" : ""
                          }`}
                          onClick={() => updateSettings({ animationSpeed: spd })}
                        >
                          {spd === "normal" ? "Normal" : "Fast"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "music" && (
            <section className="settings-section">
              <div className="settings-section-title">Lyrics</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Show lyrics</div>
                    <div className="settings-row-sub">
                      From LRCLIB, a community-contributed lyrics database
                    </div>
                  </div>
                  <ToggleSwitch
                    ariaLabel="Show lyrics"
                    checked={settings.showLyrics}
                    onChange={(checked) => updateSettings({ showLyrics: checked })}
                  />
                </div>

                <div className="settings-row settings-row-column">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Show lyrics earlier</div>
                    <div className="settings-row-sub">
                      Helps when lyrics feel a little late
                    </div>
                  </div>
                  <div className="settings-segmented settings-segmented-full">
                    {LYRICS_OFFSET_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`settings-seg-btn ${
                          settings.lyricsOffsetMs === opt.value ? "is-active" : ""
                        }`}
                        onClick={() => updateSettings({ lyricsOffsetMs: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "notifications" && (
            <section className="settings-section">
              <div className="settings-section-title">In the notch</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Show notifications</div>
                    <div className="settings-row-sub">
                      A short pill when something arrives
                    </div>
                  </div>
                  <ToggleSwitch
                    ariaLabel="Show notifications"
                    checked={settings.showNotifications}
                    onChange={(checked) => updateSettings({ showNotifications: checked })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Show message preview</div>
                    <div className="settings-row-sub">Off keeps messages private</div>
                  </div>
                  <ToggleSwitch
                    ariaLabel="Show message preview"
                    checked={settings.showMessagePreview}
                    onChange={(checked) =>
                      updateSettings({ showMessagePreview: checked })
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {activeTab === "ask-nusa" && (
            <>
              <section className="settings-section">
                <div className="settings-section-title">Gemini</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Gemini API key</div>
                      <div className="settings-row-sub">
                        {aiCtrl.config.hasApiKey
                          ? `Saved locally: ${aiCtrl.config.maskedKey ?? "••••••••"}`
                          : "Not set"}
                      </div>
                    </div>

                    <div className="settings-inline-actions">
                      {aiCtrl.config.hasApiKey && (
                        <button
                          type="button"
                          className="settings-action-btn is-danger"
                          disabled={aiCtrl.savingKey}
                          onClick={() => {
                            aiCtrl
                              .clearApiKey()
                              .then(() => flashNotice("Đã xóa Gemini API key"))
                              .catch(() => {});
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        className="settings-primary-pill"
                        disabled={aiCtrl.savingKey}
                        onClick={() => {
                          void handlePasteKey();
                        }}
                      >
                        Paste key
                      </button>
                    </div>
                  </div>

                  {editingKey && (
                    <form className="settings-key-form" onSubmit={handleSaveAiKey}>
                      <input
                        type="password"
                        className="settings-text-input"
                        placeholder="Paste Gemini API key (AIza...)"
                        value={keyDraft}
                        autoFocus
                        onChange={(e) => setKeyDraft(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="settings-primary-pill"
                        disabled={aiCtrl.savingKey || keyDraft.trim().length === 0}
                      >
                        Save
                      </button>
                    </form>
                  )}

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Model</div>
                      <div className="settings-row-sub">
                        Free key: aistudio.google.com &rsaquo; Get API key
                      </div>
                    </div>
                    <select
                      className="settings-select"
                      value={aiCtrl.config.model}
                      aria-label="Gemini model"
                      onChange={(e) => {
                        aiCtrl
                          .updateSettings(
                            e.target.value as AiModelId,
                            aiCtrl.config.thinkingLevel,
                            aiCtrl.config.webSearch
                          )
                          .catch(() => {});
                      }}
                    >
                      {AI_MODEL_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label} ({opt.tierNote})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Thinking level</div>
                    </div>
                    <div className="settings-segmented">
                      {availableThinkingLevels.map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          className={`settings-seg-btn ${
                            aiCtrl.config.thinkingLevel === lvl.id ? "is-active" : ""
                          }`}
                          onClick={() => {
                            aiCtrl
                              .updateSettings(
                                aiCtrl.config.model,
                                lvl.id as ThinkingLevel,
                                aiCtrl.config.webSearch
                              )
                              .catch(() => {});
                          }}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Free web search</div>
                      <div className="settings-row-sub">
                        Search live web results via Rust without using paid grounding quota
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Free web search"
                      checked={aiCtrl.config.webSearch}
                      onChange={(checked) => {
                        aiCtrl
                          .updateSettings(
                            aiCtrl.config.model,
                            aiCtrl.config.thinkingLevel,
                            checked
                          )
                          .catch(() => {});
                      }}
                    />
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title">Ask</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Global shortcut</div>
                      <div className="settings-row-sub">
                        Open Ask Nusa from anywhere, even in full screen
                      </div>
                    </div>
                    <ToggleSwitch
                      ariaLabel="Enable global shortcut"
                      checked={settings.askShortcutEnabled}
                      onChange={(checked) =>
                        updateSettings({ askShortcutEnabled: checked })
                      }
                    />
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Shortcut</div>
                      <div className="settings-row-sub">
                        Press again or hit Esc to dismiss
                      </div>
                    </div>
                    <span className="settings-kbd-badge">
                      {shortcutStatus.shortcut}
                    </span>
                  </div>

                  {shortcutStatus.error && (
                    <div className="settings-row">
                      <div className="settings-shortcut-warn">
                        {shortcutStatus.error}
                      </div>
                    </div>
                  )}

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <div className="settings-row-title">Privacy</div>
                      <div className="settings-row-sub">
                        Sent straight to Google from Rust. API key stays local in AppData.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "calendar" && (
            <section className="settings-section">
              <div className="settings-section-title">Calendar options</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Week starts on</div>
                  </div>
                  <div className="settings-segmented">
                    {(["sunday", "monday"] as WeekStartOption[]).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={`settings-seg-btn ${
                          settings.weekStartsOn === day ? "is-active" : ""
                        }`}
                        onClick={() => updateSettings({ weekStartsOn: day })}
                      >
                        {day === "sunday" ? "Sunday" : "Monday"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "pomodoro" && (
            <section className="settings-section">
              <div className="settings-section-title">Session length</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Focus duration</div>
                    <div className="settings-row-sub">Minutes per focus session</div>
                  </div>
                  <div className="settings-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          pomodoroFocusMin: Math.max(5, settings.pomodoroFocusMin - 5),
                        })
                      }
                    >
                      <Minus size={12} strokeWidth={2.4} />
                    </button>
                    <span className="stepper-value">{settings.pomodoroFocusMin} min</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          pomodoroFocusMin: Math.min(90, settings.pomodoroFocusMin + 5),
                        })
                      }
                    >
                      <Plus size={12} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Short break</div>
                    <div className="settings-row-sub">Minutes between focus rounds</div>
                  </div>
                  <div className="settings-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          pomodoroBreakMin: Math.max(1, settings.pomodoroBreakMin - 1),
                        })
                      }
                    >
                      <Minus size={12} strokeWidth={2.4} />
                    </button>
                    <span className="stepper-value">{settings.pomodoroBreakMin} min</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          pomodoroBreakMin: Math.min(30, settings.pomodoroBreakMin + 1),
                        })
                      }
                    >
                      <Plus size={12} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "water" && (
            <section className="settings-section">
              <div className="settings-section-title">Hydration</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Daily water goal</div>
                    <div className="settings-row-sub">Target intake per day</div>
                  </div>
                  <div className="settings-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          waterGoalMl: Math.max(500, settings.waterGoalMl - 250),
                        })
                      }
                    >
                      <Minus size={12} strokeWidth={2.4} />
                    </button>
                    <span className="stepper-value">{settings.waterGoalMl} ml</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() =>
                        updateSettings({
                          waterGoalMl: Math.min(6000, settings.waterGoalMl + 250),
                        })
                      }
                    >
                      <Plus size={12} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "shelf" && (
            <section className="settings-section">
              <div className="settings-section-title">Shelf</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Start with an empty Shelf</div>
                    <div className="settings-row-sub">
                      Files from your last session are cleared when Nusa starts
                    </div>
                  </div>
                  <ToggleSwitch
                    ariaLabel="Start with an empty Shelf"
                    checked={settings.shelfStartEmpty}
                    onChange={(checked) => updateSettings({ shelfStartEmpty: checked })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Clear current Shelf</div>
                    <div className="settings-row-sub">
                      Remove all stored shortcuts from the notch shelf now
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-action-btn is-danger"
                    onClick={handleClearShelfNow}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                    <span>Clear now</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "about" && (
            <section className="settings-section">
              <div className="settings-card settings-about-card">
                <div className="about-hero">
                  <NusaMascot size={54} />
                  <div>
                    <div className="about-title">Nusa</div>
                    <div className="about-version">Version 2.1.0 · Tauri v2 + React + Rust</div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-title">Quit Nusa</div>
                    <div className="settings-row-sub">
                      Close both the floating notch and background tray icon
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-action-btn is-danger"
                    onClick={quitApp}
                  >
                    <Power size={13} strokeWidth={2.2} />
                    <span>Quit Nusa</span>
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
