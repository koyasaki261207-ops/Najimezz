import {
  ArrowDown,
  ArrowUp,
  Clock,
  Cpu,
  ExternalLink,
  HardDrive,
  MemoryStick,
} from "lucide-react";
import { useSystemMonitor } from "../hooks/useSystemMonitor";

export interface SystemPageProps {
  onNotify?: (message: string) => void;
}

function formatGiB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 100) return `${Math.round(gib)}`;
  return gib.toFixed(1);
}

function formatClock(mhz: number): string {
  if (!Number.isFinite(mhz) || mhz <= 0) return "";
  return `${(mhz / 1000).toFixed(1)} GHz`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 KB/s";
  const kb = bytesPerSec / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB/s`;
  }
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB/s`;
}

function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "0m";
  const totalMin = Math.floor(secs / 60);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function resolveLoadTone(percent: number, warnAt = 75, highAt = 90): string {
  if (percent >= highAt) return "is-high";
  if (percent >= warnAt) return "is-warn";
  return "is-normal";
}

export function SystemPage({ onNotify }: SystemPageProps) {
  const { stats, loading, error, openTaskManager } = useSystemMonitor();

  const cpuPct = Math.round(stats?.cpuUsagePercent ?? 0);
  const ramPct = Math.round(stats?.ramUsagePercent ?? 0);
  const diskPct = Math.round(stats?.diskUsagePercent ?? 0);

  const cpuSub = stats
    ? [
        stats.cpuCores > 0 ? `${stats.cpuCores} cores` : null,
        formatClock(stats.cpuFrequencyMhz) || null,
      ]
        .filter(Boolean)
        .join(" · ") || "Windows CPU"
    : "Đang đọc...";

  const ramSub = stats
    ? `${formatGiB(stats.ramUsedBytes)} / ${formatGiB(stats.ramTotalBytes)} GB`
    : "Đang đọc...";

  const diskSub = stats
    ? `${formatGiB(stats.diskFreeBytes)} GB trống`
    : "Đang đọc...";

  const handleOpenTaskMgr = () => {
    openTaskManager().catch(() => {
      onNotify?.("Không mở được Task Manager");
    });
  };

  if (error && !stats) {
    return (
      <div className="system-page is-error-state">
        <span className="system-error-text">{error}</span>
      </div>
    );
  }

  return (
    <div className={`system-page ${loading ? "is-loading" : ""}`}>
      <div className="system-metrics-grid">
        <div
          className={`system-card is-cpu ${resolveLoadTone(cpuPct, 75, 90)}`}
          title={stats?.cpuBrand || "CPU"}
        >
          <div className="system-card-head">
            <span className="system-card-label">
              <Cpu size={12} strokeWidth={2.2} />
              <span>CPU</span>
            </span>
            <span className="system-card-value">{cpuPct}%</span>
          </div>

          <div className="system-bar-track" aria-hidden="true">
            <div
              className="system-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, cpuPct))}%` }}
            />
          </div>

          <div className="system-card-sub">{cpuSub}</div>
        </div>

        <div
          className={`system-card is-ram ${resolveLoadTone(ramPct, 80, 92)}`}
          title={`RAM: ${ramSub}`}
        >
          <div className="system-card-head">
            <span className="system-card-label">
              <MemoryStick size={12} strokeWidth={2.2} />
              <span>RAM</span>
            </span>
            <span className="system-card-value">{ramPct}%</span>
          </div>

          <div className="system-bar-track" aria-hidden="true">
            <div
              className="system-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, ramPct))}%` }}
            />
          </div>

          <div className="system-card-sub">{ramSub}</div>
        </div>

        <div
          className={`system-card is-disk ${resolveLoadTone(diskPct, 85, 93)}`}
          title={
            stats
              ? `Ổ ${stats.diskName}: đã dùng ${formatGiB(stats.diskUsedBytes)} / ${formatGiB(stats.diskTotalBytes)} GB`
              : "Ổ đĩa chính"
          }
        >
          <div className="system-card-head">
            <span className="system-card-label">
              <HardDrive size={12} strokeWidth={2.2} />
              <span>{stats?.diskName ?? "C:"}</span>
            </span>
            <span className="system-card-value">{diskPct}%</span>
          </div>

          <div className="system-bar-track" aria-hidden="true">
            <div
              className="system-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, diskPct))}%` }}
            />
          </div>

          <div className="system-card-sub">{diskSub}</div>
        </div>
      </div>

      <div className="system-footer-bar">
        <div className="system-net-group" title="Tốc độ mạng hiện tại">
          <span className="system-net-item is-down">
            <ArrowDown size={11} strokeWidth={2.4} />
            <span>{formatSpeed(stats?.netRxBytesPerSec ?? 0)}</span>
          </span>
          <span className="system-net-item is-up">
            <ArrowUp size={11} strokeWidth={2.4} />
            <span>{formatSpeed(stats?.netTxBytesPerSec ?? 0)}</span>
          </span>
        </div>

        <div className="system-footer-right">
          <span className="system-uptime" title="Thời gian máy đã chạy">
            <Clock size={10} strokeWidth={2.2} />
            <span>{formatUptime(stats?.uptimeSecs ?? 0)}</span>
          </span>

          <button
            type="button"
            className="system-taskmgr-btn"
            title="Mở Windows Task Manager"
            onClick={handleOpenTaskMgr}
          >
            <span>Task Mgr</span>
            <ExternalLink size={10} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
