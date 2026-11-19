import { useBattery } from "../hooks/useBattery";
import { useClock } from "../hooks/useClock";

interface StatusBarProps {
  compact?: boolean;
  showDateTime?: boolean;
}

export function StatusBar({ compact = false, showDateTime = true }: StatusBarProps) {
  const battery = useBattery();
  const clock = useClock();

  const radius = compact ? 6.5 : 8.5;
  const viewBox = compact ? 18 : 22;
  const center = viewBox / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedLevel = Math.max(0.05, Math.min(1, battery.level));
  const strokeDashoffset = circumference * (1 - clampedLevel);

  const ringColor =
    battery.charging || battery.level > 0.25 ? "#17E466" : "#FF4D4F";

  return (
    <div className={`notch-status-bar ${compact ? "is-compact" : ""}`}>
      <div
        className="battery-ring"
        title={`Battery ${Math.round(battery.level * 100)}%${battery.charging ? " (Charging)" : ""}`}
      >
        <svg width={viewBox} height={viewBox} viewBox={`0 0 ${viewBox} ${viewBox}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={compact ? 2.1 : 2.5}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={compact ? 2.1 : 2.5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
          {battery.charging && (
            <path
              d={
                compact
                  ? "M9.6 5.2L6.8 9.4H9.1L8.4 12.8L11.2 8.6H8.9L9.6 5.2Z"
                  : "M11.8 6.2L8.4 11.4H11.1L10.2 15.8L13.6 10.6H10.9L11.8 6.2Z"
              }
              fill="#FFFFFF"
            />
          )}
        </svg>
      </div>

      {showDateTime && !compact && <span className="status-date">{clock.dateText}</span>}

      {showDateTime && (
        <span className="status-time">
          <strong>{clock.timeText}</strong>
          <span className="status-period">{clock.period}</span>
        </span>
      )}
    </div>
  );
}
