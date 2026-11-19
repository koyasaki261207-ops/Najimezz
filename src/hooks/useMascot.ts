import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MascotMood, MascotStatePayload } from "../types/mascot";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const HIDDEN_MASCOT: MascotStatePayload = {
  mood: "hidden",
  peeking: false,
};

export interface UseMascotResult {
  mood: MascotMood;
  peeking: boolean;
  triggerReaction: (mood: Exclude<MascotMood, "hidden">) => void;
}

export function useMascot(enabled: boolean): UseMascotResult {
  const tauri = isTauriRuntime();
  const [state, setState] = useState<MascotStatePayload>(HIDDEN_MASCOT);
  const browserTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(HIDDEN_MASCOT);
      return;
    }

    if (!tauri) {
      setState({ mood: "wave", peeking: true });
      browserTimerRef.current = window.setTimeout(() => {
        setState({ mood: "awake", peeking: false });
      }, 2800);

      return () => {
        if (browserTimerRef.current !== null) {
          window.clearTimeout(browserTimerRef.current);
          browserTimerRef.current = null;
        }
      };
    }

    let unlisten: (() => void) | undefined;

    invoke<MascotStatePayload>("get_mascot_state")
      .then((initial) => setState(initial))
      .catch(() => {});

    listen<MascotStatePayload>("mascot:state", (event) => {
      setState(event.payload);
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
  }, [enabled, tauri]);

  const triggerReaction = useCallback(
    (mood: Exclude<MascotMood, "hidden">) => {
      if (!enabled) return;

      if (tauri) {
        invoke<MascotStatePayload>("trigger_mascot_reaction", { mood })
          .then((next) => setState(next))
          .catch(() => {});
        return;
      }

      if (browserTimerRef.current !== null) {
        window.clearTimeout(browserTimerRef.current);
      }
      setState({ mood, peeking: true });
      browserTimerRef.current = window.setTimeout(() => {
        setState({ mood: "awake", peeking: false });
        browserTimerRef.current = null;
      }, 2800);
    },
    [enabled, tauri]
  );

  return {
    mood: enabled ? state.mood : "hidden",
    peeking: enabled ? state.peeking : false,
    triggerReaction,
  };
}
