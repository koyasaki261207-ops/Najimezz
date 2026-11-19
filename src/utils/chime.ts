let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

interface ToneSpec {
  freq: number;
  startOffsetSec: number;
  durationSec: number;
  gain: number;
  type?: OscillatorType;
}

function playSequence(tones: ToneSpec[]): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const baseTime = ctx.currentTime + 0.02;

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();

      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, baseTime + tone.startOffsetSec);

      const t0 = baseTime + tone.startOffsetSec;
      const tEnd = t0 + tone.durationSec;

      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.018);
      amp.gain.exponentialRampToValueAtTime(0.0001, tEnd);

      osc.connect(amp);
      amp.connect(ctx.destination);

      osc.start(t0);
      osc.stop(tEnd + 0.02);
    }
  } catch {
    // Ignore audio playback errors when audio device is unavailable
  }
}

export function playPomodoroChime(kind: "focus-done" | "break-done"): void {
  if (kind === "focus-done") {
    playSequence([
      { freq: 523.25, startOffsetSec: 0, durationSec: 0.24, gain: 0.14, type: "sine" },
      { freq: 659.25, startOffsetSec: 0.16, durationSec: 0.26, gain: 0.14, type: "sine" },
      { freq: 783.99, startOffsetSec: 0.32, durationSec: 0.42, gain: 0.16, type: "triangle" },
    ]);
    return;
  }

  playSequence([
    { freq: 659.25, startOffsetSec: 0, durationSec: 0.2, gain: 0.12, type: "sine" },
    { freq: 880.0, startOffsetSec: 0.15, durationSec: 0.32, gain: 0.14, type: "sine" },
  ]);
}

export function playWaterChime(kind: "log" | "goal" | "reminder"): void {
  if (kind === "log") {
    playSequence([
      { freq: 587.33, startOffsetSec: 0, durationSec: 0.1, gain: 0.08, type: "sine" },
      { freq: 880.0, startOffsetSec: 0.06, durationSec: 0.14, gain: 0.09, type: "sine" },
    ]);
    return;
  }

  if (kind === "goal") {
    playSequence([
      { freq: 523.25, startOffsetSec: 0, durationSec: 0.18, gain: 0.12, type: "sine" },
      { freq: 659.25, startOffsetSec: 0.12, durationSec: 0.18, gain: 0.12, type: "sine" },
      { freq: 783.99, startOffsetSec: 0.24, durationSec: 0.22, gain: 0.13, type: "sine" },
      { freq: 1046.5, startOffsetSec: 0.36, durationSec: 0.4, gain: 0.15, type: "triangle" },
    ]);
    return;
  }

  playSequence([
    { freq: 440.0, startOffsetSec: 0, durationSec: 0.22, gain: 0.11, type: "sine" },
    { freq: 554.37, startOffsetSec: 0.2, durationSec: 0.28, gain: 0.11, type: "sine" },
  ]);
}
