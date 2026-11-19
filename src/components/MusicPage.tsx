import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  FastForward,
  MessageSquareQuote,
  Music,
  Pause,
  Play,
  Rewind,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { UseLyricsResult } from "../hooks/useLyrics";
import type { UseMediaResult } from "../hooks/useMedia";

interface MusicPageProps {
  mediaCtrl: UseMediaResult;
  lyricsCtrl: UseLyricsResult;
  showLyrics: boolean;
  onToggleLyrics: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function MusicPage({
  mediaCtrl,
  lyricsCtrl,
  showLyrics,
  onToggleLyrics,
}: MusicPageProps) {
  const {
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
  } = mediaCtrl;
  const { lyrics, loading, activeLineIndex } = lyricsCtrl;

  const [volumeOpen, setVolumeOpen] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showLyrics || activeLineIndex < 0) return;
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [showLyrics, activeLineIndex]);

  const durationMs = media.durationMs;
  const clampedPos = durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs;
  const remainingMs = durationMs > 0 ? Math.max(0, durationMs - clampedPos) : 0;
  const progressPercent = durationMs > 0 ? (clampedPos / durationMs) * 100 : 0;

  const currentLyricPreview =
    lyrics.synced && activeLineIndex >= 0
      ? (lyrics.lines[activeLineIndex]?.text ?? "")
      : "";

  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!media.hasSession || durationMs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );
    seekTo(ratio * durationMs);
  };

  const renderVolumeIcon = () => {
    if (volume.muted || volume.level <= 0.01) {
      return <VolumeX size={15} strokeWidth={2} />;
    }
    if (volume.level < 0.5) {
      return <Volume1 size={15} strokeWidth={2} />;
    }
    return <Volume2 size={15} strokeWidth={2} />;
  };

  return (
    <div className={`music-page ${showLyrics ? "is-lyrics-open" : ""}`}>
      <div className="music-top-row">
        <div className={`music-artwork ${media.isPlaying ? "is-playing" : ""}`}>
          {media.thumbnail ? (
            <img src={media.thumbnail} alt={media.title || "Album art"} />
          ) : (
            <Music size={24} strokeWidth={1.8} />
          )}
        </div>

        <div className="music-info">
          <div className="music-title" title={media.title || "Not Playing"}>
            {media.hasSession ? media.title : "Not Playing"}
          </div>
          {media.hasSession && (
            <div
              className="music-artist"
              title={media.artist || media.album}
            >
              {media.artist || media.album || "Unknown Artist"}
            </div>
          )}
          {!showLyrics && currentLyricPreview && (
            <div
              className="music-inline-lyric"
              title={currentLyricPreview}
            >
              {currentLyricPreview}
            </div>
          )}
        </div>

        {media.hasSession && media.isPlaying && (
          <div className="music-eq" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {showLyrics && (
        <div
          className="music-lyrics-panel"
          onWheel={(e) => {
            e.stopPropagation();
          }}
        >
          {!media.hasSession ? (
            <div className="lyrics-empty">Play a song to view live lyrics</div>
          ) : loading ? (
            <div className="lyrics-empty">Fetching lyrics...</div>
          ) : lyrics.instrumental ? (
            <div className="lyrics-empty">Instrumental track</div>
          ) : lyrics.synced && lyrics.lines.length > 0 ? (
            <div className="lyrics-scroll">
              {lyrics.lines.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                const isPast =
                  activeLineIndex >= 0 && idx < activeLineIndex;
                return (
                  <button
                    key={`${line.timeMs}-${idx}`}
                    ref={isActive ? activeLineRef : null}
                    type="button"
                    className={`lyric-line ${isActive ? "is-active" : ""} ${isPast ? "is-past" : ""}`}
                    onClick={() => seekTo(line.timeMs)}
                  >
                    {line.text}
                  </button>
                );
              })}
            </div>
          ) : lyrics.plainLines.length > 0 ? (
            <div className="lyrics-scroll lyrics-scroll-plain">
              {lyrics.plainLines.map((line, idx) => (
                <div key={idx} className="lyric-line lyric-line-plain">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="lyrics-empty">
              No lyrics found for this track
            </div>
          )}
        </div>
      )}

      <div className="music-progress-row">
        <span className="music-time">{formatTime(clampedPos)}</span>
        <div
          className={`music-progress-track ${media.hasSession && durationMs > 0 ? "is-seekable" : ""}`}
          onClick={handleProgressClick}
          role="slider"
          aria-label="Track progress"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={clampedPos}
        >
          <div
            className="music-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="music-time">-{formatTime(remainingMs)}</span>
      </div>

      <div className="music-controls-row">
        <button
          type="button"
          className={`music-icon-btn ${showLyrics ? "is-active" : ""}`}
          title={showLyrics ? "Hide lyrics" : "Show live lyrics"}
          aria-label={showLyrics ? "Hide lyrics" : "Show live lyrics"}
          onClick={onToggleLyrics}
        >
          <MessageSquareQuote size={15} strokeWidth={2} />
        </button>

        <div className="music-transport">
          <button
            type="button"
            className="music-transport-btn"
            disabled={!media.hasSession}
            aria-label="Previous track"
            onClick={prevTrack}
          >
            <Rewind size={17} strokeWidth={1.5} fill="currentColor" />
          </button>

          <button
            type="button"
            className="music-transport-btn music-play-btn"
            disabled={!media.hasSession}
            aria-label={media.isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {media.isPlaying ? (
              <Pause size={19} strokeWidth={1.5} fill="currentColor" />
            ) : (
              <Play size={19} strokeWidth={1.5} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            className="music-transport-btn"
            disabled={!media.hasSession}
            aria-label="Next track"
            onClick={nextTrack}
          >
            <FastForward size={17} strokeWidth={1.5} fill="currentColor" />
          </button>
        </div>

        <div
          className="music-volume-wrap"
          onMouseEnter={() => {
            refreshVolume();
            setVolumeOpen(true);
          }}
          onMouseLeave={() => setVolumeOpen(false)}
        >
          {volumeOpen && (
            <div className="music-volume-popover">
              <input
                type="range"
                min={0}
                max={100}
                value={
                  volume.muted ? 0 : Math.round(volume.level * 100)
                }
                aria-label="System volume"
                onChange={(e) =>
                  setVolumeLevel(Number(e.target.value) / 100)
                }
              />
            </div>
          )}
          <button
            type="button"
            className="music-icon-btn"
            title={`Volume ${Math.round(volume.level * 100)}% (click to mute)`}
            aria-label="Toggle mute"
            onClick={toggleMute}
          >
            {renderVolumeIcon()}
          </button>
        </div>
      </div>
    </div>
  );
}
