import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NotchStatePayload } from "../types/notch";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface UseNotchWindowResult {
  expanded: boolean;
  pinned: boolean;
  isTauri: boolean;
  togglePinned: () => void;
  setBrowserHover: (hovering: boolean) => void;
}

export function useNotchWindow(): UseNotchWindowResult {
  const tauri = isTauriRuntime();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!tauri) return;

    let unlisten: (() => void) | undefined;

    invoke<NotchStatePayload>("get_notch_state")
      .then((payload) => {
        setExpanded(payload.expanded);
        setPinned(payload.pinned);
      })
      .catch(() => {});

    listen<NotchStatePayload>("notch:state", (event) => {
      setExpanded(event.payload.expanded);
      setPinned(event.payload.pinned);
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
    isTauri: tauri,
    togglePinned,
    setBrowserHover,
  };
}
