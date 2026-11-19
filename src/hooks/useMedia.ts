import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MediaTrackState, VolumeState } from "../types/media";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const EMPTY_MEDIA: MediaTrackState = {
  hasSession: false,
  isPlaying: false,
  title: "",
  artist: "",
  album: "",
  sourceApp: "",
  thumbnail: null,
  positionMs: 0,
  durationMs: 0,
  sampledAtMs: 0,
};

const DEFAULT_VOLUME: VolumeState = {
  level: 0.75,
  muted: false,
};

export interface UseMediaResult {
  media: MediaTrackState;
  positionMs: number;
  volume: VolumeState;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (targetMs: number) => void;
  setVolumeLevel: (level: number) => void;
  toggleMute: () => void;
  refreshVolume: () => void;
}

export function useMedia(): UseMediaResult {
  const tauri = isTauriRuntime();
  const [media, setMedia] = useState<MediaTrackState>(EMPTY_MEDIA);
  const [positionMs, setPositionMs] = useState(0);
  const [volume, setVolume] = useState<VolumeState>(DEFAULT_VOLUME);

  const applySnapshot = useCallback((snapshot: MediaTrackState) => {
    setMedia(snapshot);
    setPositionMs(snapshot.positionMs);
  }, []);

  const refreshVolume = useCallback(() => {
    if (!tauri) return;
    invoke<VolumeState>("get_system_volume")
      .then((vol) => setVolume(vol))
      .catch(() => {});
  }, [tauri]);

  useEffect(() => {
    if (!tauri) return;

    let unlisten: (() => void) | undefined;

    invoke<MediaTrackState>("get_media_state")
      .then(applySnapshot)
      .catch(() => {});

    refreshVolume();

    listen<MediaTrackState>("media:update", (event) => {
      applySnapshot(event.payload);
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
  }, [applySnapshot, refreshVolume, tauri]);

  // Smooth position interpolation
  useEffect(() => {
    if (!media.hasSession || !media.isPlaying) {
      setPositionMs(media.positionMs);
      return;
    }

    const anchorTime = Date.now();
    const anchorPosition = media.positionMs;

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - anchorTime;
      const next = anchorPosition + elapsed;
      setPositionMs(
        media.durationMs > 0 ? Math.min(next, media.durationMs) : next
      );
    }, 200);

    return () => window.clearInterval(timer);
  }, [
    media.hasSession,
    media.isPlaying,
    media.positionMs,
    media.durationMs,
    media.sampledAtMs,
  ]);

  const togglePlay = useCallback(() => {
    if (!tauri) return;
    setMedia((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    invoke("media_toggle_play").catch(() => {});
  }, [tauri]);

  const nextTrack = useCallback(() => {
    if (!tauri) return;
    invoke("media_next").catch(() => {});
  }, [tauri]);

  const prevTrack = useCallback(() => {
    if (!tauri) return;
    invoke("media_previous").catch(() => {});
  }, [tauri]);

  const seekTo = useCallback(
    (targetMs: number) => {
      const clamped = Math.max(
        0,
        media.durationMs > 0 ? Math.min(targetMs, media.durationMs) : targetMs
      );
      setPositionMs(clamped);
      setMedia((prev) => ({
        ...prev,
        positionMs: clamped,
        sampledAtMs: Date.now(),
      }));
      if (!tauri) return;
      invoke("media_seek", { positionMs: Math.round(clamped) }).catch(() => {});
    },
    [media.durationMs, tauri]
  );

  const setVolumeLevel = useCallback(
    (level: number) => {
      const clamped = Math.max(0, Math.min(1, level));
      setVolume({ level: clamped, muted: clamped === 0 });
      if (!tauri) return;
      invoke<VolumeState>("set_system_volume", { level: clamped })
        .then((vol) => setVolume(vol))
        .catch(() => {});
    },
    [tauri]
  );

  const toggleMute = useCallback(() => {
    if (!tauri) {
      setVolume((prev) => ({ ...prev, muted: !prev.muted }));
      return;
    }
    invoke<VolumeState>("toggle_system_mute")
      .then((vol) => setVolume(vol))
      .catch(() => {});
  }, [tauri]);

  return {
    media,
    positionMs,
    volume,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolumeLevel,
    toggleMute,
    refreshVolume,
  };
}
