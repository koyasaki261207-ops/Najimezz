import { Droplet, Inbox, Music, Timer } from "lucide-react";
import type { NotchPageDefinition } from "../types/notch";

function MusicShellPlaceholder() {
  return (
    <div className="page-placeholder page-placeholder-music">
      <div className="music-cover-stub">
        <Music size={24} strokeWidth={1.8} />
      </div>
      <div className="placeholder-meta">
        <div className="placeholder-title">Not Playing</div>
        <div className="placeholder-subtitle">Music &amp; SMTC module slot ready</div>
      </div>
    </div>
  );
}

function PomodoroShellPlaceholder() {
  return (
    <div className="page-placeholder">
      <Timer size={22} className="placeholder-icon" style={{ color: "#8B5CF6" }} />
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
      <Droplet size={22} className="placeholder-icon" style={{ color: "#38BDF8" }} />
      <div className="placeholder-meta">
        <div className="placeholder-title">Hydration Tracker</div>
        <div className="placeholder-subtitle">Water reminder module slot ready</div>
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

export const NOTCH_PAGES: NotchPageDefinition[] = [
  {
    id: "music",
    label: "Music",
    showHeaderTitle: false,
    accentColor: "#FF3B5C",
    component: MusicShellPlaceholder,
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
    id: "shelf",
    label: "Shelf",
    showHeaderTitle: true,
    accentColor: "#F59E0B",
    component: ShelfShellPlaceholder,
  },
];
