import { CloudSun, Droplet, Inbox, LayoutGrid, Music, Timer } from "lucide-react";
import type { NotchPageDefinition } from "../types/notch";

function MusicFallbackSlot() {
  return (
    <div className="page-placeholder page-placeholder-music">
      <div className="music-cover-stub">
        <Music size={24} strokeWidth={1.8} />
      </div>
      <div className="placeholder-meta">
        <div className="placeholder-title">Not Playing</div>
        <div className="placeholder-subtitle">Music &amp; SMTC module</div>
      </div>
    </div>
  );
}

function PomodoroShellPlaceholder() {
  return (
    <div className="page-placeholder">
      <Timer
        size={22}
        className="placeholder-icon"
        style={{ color: "#8B5CF6" }}
      />
      <div className="placeholder-meta">
        <div className="placeholder-title">25:00 · Ready</div>
        <div className="placeholder-subtitle">Pomodoro timer module slot ready</div>
      </div>
    </div>
  );
}

function WaterShellPlaceholder() {
  return (
    <div className="page-placeholder">
      <Droplet
        size={22}
        className="placeholder-icon"
        style={{ color: "#38BDF8" }}
      />
      <div className="placeholder-meta">
        <div className="placeholder-title">Hydration Tracker</div>
        <div className="placeholder-subtitle">Water reminder module slot ready</div>
      </div>
    </div>
  );
}

function WeatherFallbackSlot() {
  return (
    <div className="page-placeholder">
      <CloudSun
        size={22}
        className="placeholder-icon"
        style={{ color: "#FBBF24" }}
      />
      <div className="placeholder-meta">
        <div className="placeholder-title">Date &amp; Weather</div>
        <div className="placeholder-subtitle">Live calendar &amp; forecast</div>
      </div>
    </div>
  );
}

function ShelfShellPlaceholder() {
  return (
    <div className="page-placeholder page-placeholder-shelf">
      <Inbox className="placeholder-icon" size={22} />
      <div className="placeholder-title">Drop files here</div>
      <div className="placeholder-subtitle">File shelf module slot ready</div>
    </div>
  );
}

function AppsFallbackSlot() {
  return (
    <div className="page-placeholder">
      <LayoutGrid
        size={22}
        className="placeholder-icon"
        style={{ color: "#6366F1" }}
      />
      <div className="placeholder-meta">
        <div className="placeholder-title">Apps</div>
        <div className="placeholder-subtitle">Mini-apps launcher</div>
      </div>
    </div>
  );
}

export const NOTCH_PAGES: NotchPageDefinition[] = [
  {
    id: "music",
    label: "Music",
    showHeaderTitle: false,
    accentColor: "#FF3B5C",
    component: MusicFallbackSlot,
  },
  {
    id: "pomodoro",
    label: "Pomodoro",
    showHeaderTitle: true,
    accentColor: "#8B5CF6",
    component: PomodoroShellPlaceholder,
  },
  {
    id: "water",
    label: "Water",
    showHeaderTitle: true,
    accentColor: "#38BDF8",
    component: WaterShellPlaceholder,
  },
  {
    id: "weather",
    label: "Weather",
    showHeaderTitle: true,
    accentColor: "#FBBF24",
    component: WeatherFallbackSlot,
  },
  {
    id: "shelf",
    label: "Shelf",
    showHeaderTitle: true,
    accentColor: "#F59E0B",
    component: ShelfShellPlaceholder,
  },
  {
    id: "apps",
    label: "Apps",
    showHeaderTitle: true,
    accentColor: "#6366F1",
    component: AppsFallbackSlot,
  },
];
