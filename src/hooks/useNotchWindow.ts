import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NotchStatePayload } from "../types/notch";

interface NotchPreferencesPayload {
  hideInFullscreen: boolean;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface UseNotchWindowResult {
  expanded: boolean;
  pinned: boolean;
  hideInFullscreen: boolean;
  isTauri: boolean;
  togglePinned: () => void;
  toggleHideInFullscreen: () => void;
  recenterNotch: () => void;
  quitApp: () => void;
  setBrowserHover: (hovering: boolean) => void;
}

export function useNotchWindow(): UseNotchWindowResult {
  const tauri = isTauriRuntime();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hideInFullscreen, setHideInFullscreen] = useState(true);

  useEffect(() => {
    if (!tauri) return;

    let unlistenState: (() => void) | undefined;
    let unlistenPrefs: (() => void) | undefined;

    invoke<NotchStatePayload>("get_notch_state")
      .then((payload) => {
        setExpanded(payload.expanded);
        setPinned(payload.pinned);
      })
      .catch(() => {});

    invoke<NotchPreferencesPayload>("get_notch_preferences")
      .then((prefs) => {
        setHideInFullscreen(prefs.hideInFullscreen);
      })
      .catch(() => {});

    listen<NotchStatePayload>("notch:state", (event) => {
      setExpanded(event.payload.expanded);
      setPinned(event.payload.pinned);
    })
      .then((fn) => {
        unlistenState = fn;
      })
      .catch(() => {});

    listen<NotchPreferencesPayload>("notch:preferences", (event) => {
      setHideInFullscreen(event.payload.hideInFullscreen);
    })
      .then((fn) => {
        unlistenPrefs = fn;
      })
      .catch(() => {});

    return () => {
      if (unlistenState) {
        unlistenState();
      }
      if (unlistenPrefs) {
        unlistenPrefs();
      }
    };
  }, [tauri]);

  const togglePinned = useCallback(() => {
    const nextPinned = !pinned;
    if (tauri) {
      invoke<NotchStatePayload>("set_notch_pinned", { pinned: nextPinned })
        .then((payload) => {
          setExpanded(payload.expanded);
          setPinned(payload.pinned);
        })
        .catch(() => {});
    } else {
      setPinned(nextPinned);
      if (nextPinned) {
        setExpanded(true);
      }
    }
  }, [pinned, tauri]);

  const toggleHideInFullscreen = useCallback(() => {
    const nextEnabled = !hideInFullscreen;
    if (tauri) {
      invoke<NotchPreferencesPayload>("set_hide_in_fullscreen", {
        enabled: nextEnabled,
      })
        .then((prefs) => {
          setHideInFullscreen(prefs.hideInFullscreen);
        })
        .catch(() => {});
    } else {
      setHideInFullscreen(nextEnabled);
    }
  }, [hideInFullscreen, tauri]);

  const recenterNotch = useCallback(() => {
    if (!tauri) return;
    invoke("recenter_notch").catch(() => {});
  }, [tauri]);

  const quitApp = useCallback(() => {
    if (!tauri) return;
    invoke("quit_app").catch(() => {});
  }, [tauri]);

  const setBrowserHover = useCallback(
    (hovering: boolean) => {
      if (tauri || pinned) return;
      setExpanded(hovering);
    },
    [pinned, tauri]
  );

  return {
    expanded,
    pinned,
    hideInFullscreen,
    isTauri: tauri,
    togglePinned,
    toggleHideInFullscreen,
    recenterNotch,
    quitApp,
    setBrowserHover,
  };
}
