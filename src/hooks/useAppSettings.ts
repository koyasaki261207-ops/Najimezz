import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/settings";
import type { NotchPageId } from "../types/notch";

const BROWSER_SETTINGS_KEY = "nusa.appSettings.v1";

const ALL_KNOWN_PAGES: NotchPageId[] = [
  "music",
  "pomodoro",
  "water",
  "weather",
  "shelf",
  "calendar",
  "system",
  "ai",
];

function mergeMissingPages(
  savedOrder: NotchPageId[],
  savedEnabled: NotchPageId[]
): { pagesOrder: NotchPageId[]; enabledPages: NotchPageId[] } {
  const validSet = new Set<NotchPageId>(ALL_KNOWN_PAGES);
  const nextOrder: NotchPageId[] = [];
  for (const id of savedOrder) {
    if (validSet.has(id) && !nextOrder.includes(id)) {
      nextOrder.push(id);
    }
  }

  const nextEnabled: NotchPageId[] = [];
  for (const id of savedEnabled) {
    if (validSet.has(id) && !nextEnabled.includes(id)) {
      nextEnabled.push(id);
    }
  }

  for (const pageId of ALL_KNOWN_PAGES) {
    if (!nextOrder.includes(pageId)) {
      nextOrder.push(pageId);
      if (!nextEnabled.includes(pageId)) {
        nextEnabled.push(pageId);
      }
    }
  }

  if (nextEnabled.length === 0) {
    nextEnabled.push(nextOrder[0] ?? "music");
  }

  return { pagesOrder: nextOrder, enabledPages: nextEnabled };
}

function normalizeSettings(raw: AppSettings): AppSettings {
  const { pagesOrder, enabledPages } = mergeMissingPages(
    raw.pagesOrder ?? [],
    raw.enabledPages ?? []
  );
  return {
    ...raw,
    pagesOrder,
    enabledPages,
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadBrowserSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(BROWSER_SETTINGS_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return normalizeSettings({ ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) });
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export interface UseAppSettingsResult {
  settings: AppSettings;
  loaded: boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export function useAppSettings(): UseAppSettingsResult {
  const tauri = isTauriRuntime();
  const [settings, setSettings] = useState<AppSettings>(() =>
    tauri ? DEFAULT_APP_SETTINGS : loadBrowserSettings()
  );
  const [loaded, setLoaded] = useState(!tauri);
  const latestRef = useRef<AppSettings>(settings);

  useEffect(() => {
    latestRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!tauri) return;

    let unlisten: (() => void) | undefined;

    invoke<AppSettings>("get_app_settings")
      .then((initial) => {
        const normalized = normalizeSettings(initial);
        latestRef.current = normalized;
        setSettings(normalized);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });

    listen<AppSettings>("settings:updated", (event) => {
      const normalized = normalizeSettings(event.payload);
      latestRef.current = normalized;
      setSettings(normalized);
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
  }, [tauri]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const merged: AppSettings = normalizeSettings({ ...latestRef.current, ...patch });
      latestRef.current = merged;
      setSettings(merged);

      if (!tauri) {
        try {
          window.localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(merged));
        } catch {
          // Ignore storage errors
        }
        return;
      }

      invoke<AppSettings>("update_app_settings", { settings: merged })
        .then((saved) => {
          const normalized = normalizeSettings(saved);
          latestRef.current = normalized;
          setSettings(normalized);
        })
        .catch(() => {});
    },
    [tauri]
  );

  return {
    settings,
    loaded,
    updateSettings,
  };
}
