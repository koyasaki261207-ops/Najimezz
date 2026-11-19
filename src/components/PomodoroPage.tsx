import { RotateCcw, SkipForward } from "lucide-react";
import type { UsePomodoroResult } from "../hooks/usePomodoro";

interface PomodoroPageProps {
  pomodoroCtrl: UsePomodoroResult;
}

function formatCountdown(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatTotalDuration(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export function PomodoroPage({ pomodoroCtrl }: PomodoroPageProps) {
  const {
    steps,
    stepIndex,
    currentStep,
    remainingSec,
    status,
    progressRatio,
    totalRoundMinutes,
    totalSessions,
    toggleStartPause,
    resetTimer,
    skipStep,
    selectStep,
  } = pomodoroCtrl;

  const isBreak = currentStep.kind !== "focus";
  const stepMinutes = Math.round(currentStep.durationSec / 60);
  const statusLabel =
    status === "running"
      ? isBreak
        ? "Resting"
        : "Focusing"
      : status === "paused"
        ? "Paused"
        : "Ready";

  const actionButtonLabel =
    status === "running"
      ? "Pause"
      : status === "paused"
        ? "Resume"
        : "Start";

  return (
    <div className={`pomo-page ${isBreak ? "is-break" : "is-focus"}`}>
      <section className="pomo-left-col">
        <div className="pomo-phase-label">{currentStep.label}</div>

        <div className="pomo-clock">{formatCountdown(remainingSec)}</div>

        <div className="pomo-meta-row">
          <span className="pomo-duration-text">{stepMinutes} min</span>
          <span className={`pomo-status-text is-${status}`}>{statusLabel}</span>
        </div>

        <div className="pomo-progress-track" aria-hidden="true">
          <div
            className="pomo-progress-fill"
            style={{ width: `${Math.round(progressRatio * 100)}%` }}
          />
        </div>
      </section>

      <div className="pomo-divider" aria-hidden="true" />

      <section className="pomo-right-col">
        <div className="pomo-controls-top">
          <span className="pomo-round-heading">This round</span>

          <div className="pomo-btn-group">
            <button
              type="button"
              className={`pomo-primary-btn ${status === "running" ? "is-running" : ""}`}
              onClick={toggleStartPause}
            >
              {actionButtonLabel}
            </button>

            <button
              type="button"
              className="pomo-circle-btn"
              title="Skip to next phase"
              aria-label="Skip to next phase"
              onClick={skipStep}
            >
              <SkipForward size={12} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              className="pomo-circle-btn"
              title={
                status === "ready" && stepIndex !== 0
                  ? "Reset full round to session 1"
                  : "Reset current timer"
              }
              aria-label="Reset timer"
              onClick={resetTimer}
            >
              <RotateCcw size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="pomo-timeline" role="list" aria-label="Pomodoro round steps">
          {steps.map((step) => {
            const isCompleted = step.index < stepIndex;
            const isActive = step.index === stepIndex;

            if (step.kind === "short-break") {
              return (
                <button
                  key={step.index}
                  type="button"
                  className={`pomo-step-dot ${
                    isCompleted ? "is-done" : isActive ? "is-active" : ""
                  }`}
                  title={step.label}
                  aria-label={step.label}
                  onClick={() => selectStep(step.index)}
                />
              );
            }

            const barFillPct = isCompleted
              ? 100
              : isActive
                ? Math.max(status === "running" ? 10 : 0, Math.round(progressRatio * 100))
                : 0;

            return (
              <button
                key={step.index}
                type="button"
                className={`pomo-step-seg ${
                  step.kind === "long-break" ? "is-long" : ""
                } ${isCompleted ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                title={step.label}
                aria-label={step.label}
                onClick={() => selectStep(step.index)}
              >
                <span className="pomo-seg-bar">
                  <span
                    className="pomo-seg-fill"
                    style={{ width: `${barFillPct}%` }}
                  />
                </span>
                <span className="pomo-seg-caption">
                  {step.kind === "long-break" ? "Long" : step.sessionNumber}
                </span>
              </button>
            );
          })}
        </div>

        <div className="pomo-round-summary">
          {formatTotalDuration(totalRoundMinutes)} · {totalSessions} sessions
        </div>
      </section>
    </div>
  );
}
