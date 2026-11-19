export interface MediaTrackState {
  hasSession: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  sourceApp: string;
  thumbnail: string | null;
  positionMs: number;
  durationMs: number;
  sampledAtMs: number;
}

export interface VolumeState {
  level: number;
  muted: boolean;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsResult {
  found: boolean;
  instrumental: boolean;
  synced: boolean;
  lines: LyricLine[];
  plainLines: string[];
  source: string;
}
