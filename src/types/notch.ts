import type { ComponentType } from "react";

export type NotchPageId = "music" | "pomodoro" | "water" | "weather" | "shelf" | "apps";

export interface NotchPageDefinition {
  id: NotchPageId;
  label: string;
  showHeaderTitle: boolean;
  accentColor: string;
  component: ComponentType;
}

export interface BatteryStatus {
  level: number;
  charging: boolean;
  supported: boolean;
}

export interface NotchStatePayload {
  expanded: boolean;
  pinned: boolean;
}
