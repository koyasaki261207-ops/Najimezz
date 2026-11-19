import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/settings";

const BROWSER_SETTINGS_KEY = "nusa.appSettings.v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadBrowserSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(BROWSER_SETTINGS_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
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
        latestRef.current = initial;
        setSettings(initial);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });

    listen<AppSettings>("settings:updated", (event) => {
      latestRef.current = event.payload;
      setSettings(event.payload);
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
      const merged: AppSettings = { ...latestRef.current, ...patch };
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
          latestRef.current = saved;
          setSettings(saved);
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
