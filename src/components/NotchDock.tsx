import { useState } from "react";
import {
  Calendar,
  CloudSun,
  Cpu,
  Droplet,
  Inbox,
  Music,
  Settings,
  Sparkles,
  Timer,
} from "lucide-react";
import type { NotchPageDefinition, NotchPageId } from "../types/notch";

interface NotchDockProps {
  pages: NotchPageDefinition[];
  activePageId: NotchPageId;
  enableHoverIcons?: boolean;
  onSelectPage: (pageId: NotchPageId) => void;
  onOpenSettings: () => void;
}

function renderPageIcon(pageId: NotchPageId) {
  switch (pageId) {
    case "music":
      return <Music size={14} strokeWidth={2.1} />;
    case "pomodoro":
      return <Timer size={14} strokeWidth={2.1} />;
    case "water":
      return <Droplet size={14} strokeWidth={2.1} />;
    case "weather":
      return <CloudSun size={14} strokeWidth={2.1} />;
    case "shelf":
      return <Inbox size={14} strokeWidth={2.1} />;
    case "calendar":
      return <Calendar size={14} strokeWidth={2.1} />;
    case "system":
      return <Cpu size={14} strokeWidth={2.1} />;
    case "ai":
      return <Sparkles size={14} strokeWidth={2.1} />;
  }
}

export function NotchDock({
  pages,
  activePageId,
  enableHoverIcons = true,
  onSelectPage,
  onOpenSettings,
}: NotchDockProps) {
  const [dockHovered, setDockHovered] = useState(false);
  const showDockPill = enableHoverIcons && dockHovered;

  return (
    <div
      className="notch-footer-zone"
      onMouseEnter={() => setDockHovered(true)}
      onMouseLeave={() => setDockHovered(false)}
    >
      <div className={`notch-dots ${showDockPill ? "is-hidden" : ""}`}>
        {pages.map((page) => {
          const isActive = page.id === activePageId;
          return (
            <button
              key={page.id}
              type="button"
              className={`notch-dot ${isActive ? "is-active" : ""}`}
              aria-label={`Switch to ${page.label}`}
              onClick={() => onSelectPage(page.id)}
            />
          );
        })}

        {!enableHoverIcons && (
          <button
            type="button"
            className="notch-dot-settings-btn"
            title="Open Settings"
            aria-label="Open Settings"
            onClick={onOpenSettings}
          >
            <Settings size={11} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {enableHoverIcons && (
        <div className={`notch-dock-pill ${showDockPill ? "is-visible" : ""}`}>
          {pages.map((page) => {
            const isActive = page.id === activePageId;
            return (
              <button
                key={page.id}
                type="button"
                className={`dock-icon-btn ${isActive ? "is-active" : ""}`}
                style={isActive ? { color: page.accentColor } : undefined}
                title={page.label}
                aria-label={page.label}
                onClick={() => onSelectPage(page.id)}
              >
                {renderPageIcon(page.id)}
              </button>
            );
          })}

          <span className="dock-divider" aria-hidden="true" />

          <button
            type="button"
            className="dock-icon-btn dock-settings-btn"
            title="Open Settings"
            aria-label="Open Settings"
            onClick={onOpenSettings}
          >
            <Settings size={13} strokeWidth={2.1} />
          </button>
        </div>
      )}
    </div>
  );
}
