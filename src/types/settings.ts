import type { NotchPageId } from "./notch";

export type NotchScaleOption = "auto" | "100" | "115" | "130" | "150";
export type NotchStyleOption = "classic" | "floating";
export type OpenTriggerOption = "hover" | "click";
export type AnimationSpeedOption = "normal" | "fast";
export type LyricsOffsetOption = 0 | 300 | 600 | 1000;
export type WeekStartOption = "monday" | "sunday";

export interface AppSettings {
  startWithWindows: boolean;
  notchScale: NotchScaleOption;
  minimalNotch: boolean;
  showMascot: boolean;
  showDateTime: boolean;
  reminderSounds: boolean;
  hideInFullscreen: boolean;
  notchStyle: NotchStyleOption;
  glassEffect: boolean;
  glassTint: number;
  openTrigger: OpenTriggerOption;
  showPageIconsOnHover: boolean;
  animationSpeed: AnimationSpeedOption;
  showLyrics: boolean;
  lyricsOffsetMs: LyricsOffsetOption;
  pagesOrder: NotchPageId[];
  enabledPages: NotchPageId[];
  showNotifications: boolean;
  showMessagePreview: boolean;
  weekStartsOn: WeekStartOption;
  pomodoroFocusMin: number;
  pomodoroBreakMin: number;
  waterGoalMl: number;
  shelfStartEmpty: boolean;
  askShortcutEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  startWithWindows: false,
  notchScale: "auto",
  minimalNotch: true,
  showMascot: true,
  showDateTime: true,
  reminderSounds: true,
  hideInFullscreen: true,
  notchStyle: "classic",
  glassEffect: false,
  glassTint: 40,
  openTrigger: "hover",
  showPageIconsOnHover: true,
  animationSpeed: "normal",
  showLyrics: false,
  lyricsOffsetMs: 0,
  pagesOrder: ["music", "pomodoro", "water", "weather", "shelf", "calendar", "ai"],
  enabledPages: ["music", "pomodoro", "water", "weather", "shelf", "calendar", "ai"],
  showNotifications: true,
  showMessagePreview: false,
  weekStartsOn: "monday",
  pomodoroFocusMin: 25,
  pomodoroBreakMin: 5,
  waterGoalMl: 2000,
  shelfStartEmpty: false,
  askShortcutEnabled: true,
};
