import { useState } from "react";
import { CloudSun, Droplet, Inbox, Music, Settings, Timer } from "lucide-react";
import type { NotchPageDefinition, NotchPageId } from "../types/notch";

interface NotchDockProps {
  pages: NotchPageDefinition[];
  activePageId: NotchPageId;
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
  }
}

export function NotchDock({
  pages,
  activePageId,
  onSelectPage,
  onOpenSettings,
}: NotchDockProps) {
  const [dockVisible, setDockVisible] = useState(false);

  return (
    <div
      className="notch-footer-zone"
      onMouseEnter={() => setDockVisible(true)}
      onMouseLeave={() => setDockVisible(false)}
    >
      <div className={`notch-dots ${dockVisible ? "is-hidden" : ""}`}>
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
      </div>

      <div className={`notch-dock-pill ${dockVisible ? "is-visible" : ""}`}>
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
          className="dock-icon-btn"
          title="Settings (Phase 2)"
          aria-label="Open Settings"
          onClick={onOpenSettings}
        >
          <Settings size={14} strokeWidth={2.1} />
        </button>
      </div>
    </div>
  );
}
