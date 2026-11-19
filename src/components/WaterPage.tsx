import { Bell, BellOff, Droplet, RotateCcw, Undo2 } from "lucide-react";
import type { UseWaterResult } from "../hooks/useWater";

interface WaterPageProps {
  waterCtrl: UseWaterResult;
}

const QUICK_ADD_AMOUNTS = [150, 250, 500];

export function WaterPage({ waterCtrl }: WaterPageProps) {
  const {
    intakeMl,
    goalMl,
    remainingMl,
    progressRatio,
    percent,
    entriesCount,
    goalReached,
    reminderIntervalMin,
    addWater,
    undoLast,
    resetToday,
    cycleReminder,
  } = waterCtrl;

  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressRatio);
  const ringColor = goalReached ? "#22C55E" : "#38BDF8";

  return (
    <div className={`water-page ${goalReached ? "is-goal-reached" : ""}`}>
      <section className="water-left-col">
        <div className="water-ring-wrap" aria-label={`Hydration ${percent}%`}>
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle
              cx="30"
              cy="30"
              r={ringRadius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="5"
            />
            <circle
              cx="30"
              cy="30"
              r={ringRadius}
              fill="none"
              stroke={ringColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 30 30)"
              className="water-ring-progress"
            />
          </svg>
          <div className="water-ring-center">
            <Droplet
              size={12}
              strokeWidth={2.2}
              color={ringColor}
              fill={goalReached ? ringColor : "none"}
            />
            <span>{Math.min(percent, 999)}%</span>
          </div>
        </div>

        <div className="water-stats">
          <div className="water-intake-row">
            <span className="water-intake-val">{intakeMl.toLocaleString()}</span>
            <span className="water-goal-val">/ {goalMl.toLocaleString()} ml</span>
          </div>
          <div className="water-sub-status">
            {goalReached
              ? "Goal reached today"
              : `${remainingMl.toLocaleString()} ml left`}
          </div>
        </div>
      </section>

      <div className="water-divider" aria-hidden="true" />

      <section className="water-right-col">
        <div className="water-right-top">
          <span className="water-logs-count">
            {entriesCount} {entriesCount === 1 ? "cup" : "cups"}
          </span>

          <div className="water-mini-actions">
            <button
              type="button"
              className={`water-reminder-pill ${
                reminderIntervalMin !== null ? "is-active" : ""
              }`}
              title="Toggle periodic water reminder"
              onClick={cycleReminder}
            >
              {reminderIntervalMin !== null ? (
                <Bell size={10} strokeWidth={2.3} />
              ) : (
                <BellOff size={10} strokeWidth={2.2} />
              )}
              <span>
                {reminderIntervalMin !== null ? `${reminderIntervalMin}m` : "Off"}
              </span>
            </button>

            <button
              type="button"
              className="water-icon-btn"
              disabled={entriesCount === 0}
              title="Undo last entry"
              aria-label="Undo last water entry"
              onClick={undoLast}
            >
              <Undo2 size={11} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              className="water-icon-btn"
              disabled={entriesCount === 0}
              title="Reset today"
              aria-label="Reset today's water intake"
              onClick={resetToday}
            >
              <RotateCcw size={11} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="water-add-row">
          {QUICK_ADD_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              className="water-add-btn"
              onClick={() => addWater(amount)}
            >
              <span>+{amount}</span>
              <small>ml</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
