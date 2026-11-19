import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LyricsResult, MediaTrackState } from "../types/media";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const EMPTY_LYRICS: LyricsResult = {
  found: false,
  instrumental: false,
  synced: false,
  lines: [],
  plainLines: [],
  source: "",
};

export interface UseLyricsResult {
  lyrics: LyricsResult;
  loading: boolean;
  activeLineIndex: number;
  currentLineText: string;
  currentLineKey: string;
}

export function useLyrics(
  media: MediaTrackState,
  positionMs: number,
  offsetMs = 0
): UseLyricsResult {
  const tauri = isTauriRuntime();
  const [lyrics, setLyrics] = useState<LyricsResult>(EMPTY_LYRICS);
  const [loading, setLoading] = useState(false);

  const trackKey = media.hasSession ? `${media.title}:::${media.artist}` : "";

  useEffect(() => {
    if (!trackKey || !media.title) {
      setLyrics(EMPTY_LYRICS);
      setLoading(false);
      return;
    }

    if (!tauri) {
      setLyrics(EMPTY_LYRICS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    invoke<LyricsResult>("fetch_lyrics", {
      title: media.title,
      artist: media.artist,
      album: media.album || null,
      durationMs: media.durationMs > 0 ? media.durationMs : null,
    })
      .then((res) => {
        if (!cancelled) {
          setLyrics(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics(EMPTY_LYRICS);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trackKey, media.title, media.artist, media.album, media.durationMs, tauri]);

  const activeLineIndex = useMemo(() => {
    if (!lyrics.synced || lyrics.lines.length === 0) {
      return -1;
    }
    const lookaheadMs = positionMs + 250 + offsetMs;
    let lo = 0;
    let hi = lyrics.lines.length - 1;
    let match = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyrics.lines[mid].timeMs <= lookaheadMs) {
        match = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return match;
  }, [lyrics.synced, lyrics.lines, positionMs, offsetMs]);

  const { currentLineText, currentLineKey } = useMemo(() => {
    if (!media.hasSession) {
      return { currentLineText: "", currentLineKey: "idle" };
    }
    if (loading) {
      return { currentLineText: "Fetching lyrics...", currentLineKey: `loading:${trackKey}` };
    }
    if (lyrics.instrumental) {
      return { currentLineText: "♪ Instrumental", currentLineKey: `inst:${trackKey}` };
    }
    if (lyrics.synced && lyrics.lines.length > 0) {
      if (activeLineIndex >= 0) {
        return {
          currentLineText: lyrics.lines[activeLineIndex].text,
          currentLineKey: `sync:${trackKey}:${activeLineIndex}`,
        };
      }
      return {
        currentLineText: `♪ ${media.title}`,
        currentLineKey: `intro:${trackKey}`,
      };
    }
    if (lyrics.plainLines.length > 0) {
      const ratio =
        media.durationMs > 0 ? Math.max(0, Math.min(0.999, positionMs / media.durationMs)) : 0;
      const plainIdx = Math.floor(ratio * lyrics.plainLines.length);
      return {
        currentLineText: lyrics.plainLines[plainIdx] ?? "",
        currentLineKey: `plain:${trackKey}:${plainIdx}`,
      };
    }
    return {
      currentLineText: `♪ ${media.title}`,
      currentLineKey: `fallback:${trackKey}`,
    };
  }, [
    media.hasSession,
    media.title,
    media.durationMs,
    loading,
    lyrics.instrumental,
    lyrics.synced,
    lyrics.lines,
    lyrics.plainLines,
    activeLineIndex,
    positionMs,
    trackKey,
  ]);

  return {
    lyrics,
    loading,
    activeLineIndex,
    currentLineText,
    currentLineKey,
  };
}
