import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playPomodoroChime } from "../utils/chime";

export type PomodoroPhaseKind = "focus" | "short-break" | "long-break";
export type PomodoroRunStatus = "ready" | "running" | "paused";

export interface PomodoroStepDef {
  index: number;
  kind: PomodoroPhaseKind;
  sessionNumber: number;
  durationSec: number;
  label: string;
}

const LONG_BREAK_MINUTES = 15;
const TOTAL_SESSIONS = 4;

function buildSteps(focusMin: number, shortBreakMin: number): PomodoroStepDef[] {
  const focusSec = Math.max(1, focusMin) * 60;
  const breakSec = Math.max(1, shortBreakMin) * 60;
  const longSec = LONG_BREAK_MINUTES * 60;

  return [
    { index: 0, kind: "focus", sessionNumber: 1, durationSec: focusSec, label: "Focus · 1 of 4" },
    { index: 1, kind: "short-break", sessionNumber: 1, durationSec: breakSec, label: "Short break · 1 of 4" },
    { index: 2, kind: "focus", sessionNumber: 2, durationSec: focusSec, label: "Focus · 2 of 4" },
    { index: 3, kind: "short-break", sessionNumber: 2, durationSec: breakSec, label: "Short break · 2 of 4" },
    { index: 4, kind: "focus", sessionNumber: 3, durationSec: focusSec, label: "Focus · 3 of 4" },
    { index: 5, kind: "short-break", sessionNumber: 3, durationSec: breakSec, label: "Short break · 3 of 4" },
    { index: 6, kind: "focus", sessionNumber: 4, durationSec: focusSec, label: "Focus · 4 of 4" },
    { index: 7, kind: "long-break", sessionNumber: 4, durationSec: longSec, label: "Long break" },
  ];
}

export interface UsePomodoroOptions {
  focusMinutes: number;
  shortBreakMinutes: number;
  reminderSounds: boolean;
  onNotify: (message: string) => void;
}

export interface UsePomodoroResult {
  steps: PomodoroStepDef[];
  stepIndex: number;
  currentStep: PomodoroStepDef;
  remainingSec: number;
  status: PomodoroRunStatus;
  progressRatio: number;
  totalRoundMinutes: number;
  totalSessions: number;
  toggleStartPause: () => void;
  resetTimer: () => void;
  skipStep: () => void;
  selectStep: (index: number) => void;
}

export function usePomodoro({
  focusMinutes,
  shortBreakMinutes,
  reminderSounds,
  onNotify,
}: UsePomodoroOptions): UsePomodoroResult {
  const steps = useMemo(
    () => buildSteps(focusMinutes, shortBreakMinutes),
    [focusMinutes, shortBreakMinutes]
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<PomodoroRunStatus>("ready");
  const [remainingSec, setRemainingSec] = useState<number>(() => steps[0].durationSec);

  const endAtMsRef = useRef<number | null>(null);
  const reminderSoundsRef = useRef(reminderSounds);
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    reminderSoundsRef.current = reminderSounds;
  }, [reminderSounds]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const currentStep = steps[stepIndex] ?? steps[0];

  // Sync duration immediately when Settings change while timer is Ready
  useEffect(() => {
    if (status === "ready") {
      setRemainingSec(currentStep.durationSec);
    }
  }, [currentStep.durationSec, status]);

  const completeCurrentStep = useCallback(
    (finishedIndex: number) => {
      const finishedStep = steps[finishedIndex] ?? steps[0];
      const nextIndex = (finishedIndex + 1) % steps.length;
      const nextStep = steps[nextIndex];

      endAtMsRef.current = null;
      setStatus("ready");
      setStepIndex(nextIndex);
      setRemainingSec(nextStep.durationSec);

      if (reminderSoundsRef.current) {
        playPomodoroChime(
          finishedStep.kind === "focus" ? "focus-done" : "break-done"
        );
      }

      if (finishedStep.kind === "focus") {
        const nextMinutes = Math.round(nextStep.durationSec / 60);
        if (nextStep.kind === "long-break") {
          onNotifyRef.current(`Xong 4 phiên Focus — Nghỉ dài ${nextMinutes} phút`);
        } else {
          onNotifyRef.current(
            `Xong Focus ${finishedStep.sessionNumber}/4 — Nghỉ ${nextMinutes} phút`
          );
        }
      } else if (finishedStep.kind === "long-break") {
        onNotifyRef.current("Hoàn tất trọn vòng Pomodoro — Sẵn sàng vòng mới");
      } else {
        onNotifyRef.current(`Hết giờ nghỉ — Bắt đầu Focus ${nextStep.sessionNumber}/4`);
      }
    },
    [steps]
  );

  useEffect(() => {
    if (status !== "running") {
      endAtMsRef.current = null;
      return;
    }

    if (endAtMsRef.current === null) {
      endAtMsRef.current = Date.now() + remainingSec * 1000;
    }

    const tick = () => {
      if (endAtMsRef.current === null) return;
      const diffMs = endAtMsRef.current - Date.now();
      if (diffMs <= 0) {
        completeCurrentStep(stepIndex);
        return;
      }
      const nextSec = Math.ceil(diffMs / 1000);
      setRemainingSec((prev) => (prev === nextSec ? prev : nextSec));
    };

    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [status, stepIndex, completeCurrentStep]);

  const toggleStartPause = useCallback(() => {
    if (status === "running") {
      if (endAtMsRef.current !== null) {
        const left = Math.max(1, Math.ceil((endAtMsRef.current - Date.now()) / 1000));
        setRemainingSec(left);
      }
      endAtMsRef.current = null;
      setStatus("paused");
      return;
    }

    const startFrom = remainingSec > 0 ? remainingSec : currentStep.durationSec;
    setRemainingSec(startFrom);
    endAtMsRef.current = Date.now() + startFrom * 1000;
    setStatus("running");
  }, [status, remainingSec, currentStep.durationSec]);

  const resetTimer = useCallback(() => {
    endAtMsRef.current = null;
    if (status === "ready" && stepIndex !== 0) {
      setStepIndex(0);
      setRemainingSec(steps[0].durationSec);
      onNotifyRef.current("Đã đặt lại vòng Pomodoro về phiên 1");
      return;
    }
    setStatus("ready");
    setRemainingSec(currentStep.durationSec);
  }, [status, stepIndex, steps, currentStep.durationSec]);

  const skipStep = useCallback(() => {
    const nextIndex = (stepIndex + 1) % steps.length;
    endAtMsRef.current = null;
    setStatus("ready");
    setStepIndex(nextIndex);
    setRemainingSec(steps[nextIndex].durationSec);
  }, [stepIndex, steps]);

  const selectStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      endAtMsRef.current = null;
      setStatus("ready");
      setStepIndex(index);
      setRemainingSec(steps[index].durationSec);
    },
    [steps]
  );

  const progressRatio =
    currentStep.durationSec > 0
      ? Math.max(
          0,
          Math.min(1, (currentStep.durationSec - remainingSec) / currentStep.durationSec)
        )
      : 0;

  const totalRoundMinutes =
    focusMinutes * TOTAL_SESSIONS +
    shortBreakMinutes * (TOTAL_SESSIONS - 1) +
    LONG_BREAK_MINUTES;

  return {
    steps,
    stepIndex,
    currentStep,
    remainingSec,
    status,
    progressRatio,
    totalRoundMinutes,
    totalSessions: TOTAL_SESSIONS,
    toggleStartPause,
    resetTimer,
    skipStep,
    selectStep,
  };
}
