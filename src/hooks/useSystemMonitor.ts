import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemStats } from "../types/system";

const POLL_INTERVAL_MS = 1200;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const PREVIEW_STATS: SystemStats = {
  cpuUsagePercent: 24,
  cpuCores: 12,
  cpuFrequencyMhz: 3400,
  cpuBrand: "Preview CPU",
  ramUsedBytes: 9.4 * 1024 * 1024 * 1024,
  ramTotalBytes: 16 * 1024 * 1024 * 1024,
  ramUsagePercent: 58.8,
  diskName: "C:",
  diskUsedBytes: 218 * 1024 * 1024 * 1024,
  diskTotalBytes: 476 * 1024 * 1024 * 1024,
  diskFreeBytes: 258 * 1024 * 1024 * 1024,
  diskUsagePercent: 45.8,
  netRxBytesPerSec: 185 * 1024,
  netTxBytesPerSec: 42 * 1024,
  uptimeSecs: 12480,
};

export interface UseSystemMonitorResult {
  stats: SystemStats | null;
  loading: boolean;
  error: string | null;
  openTaskManager: () => Promise<void>;
}

export function useSystemMonitor(): UseSystemMonitorResult {
  const tauri = isTauriRuntime();
  const [stats, setStats] = useState<SystemStats | null>(
    tauri ? null : PREVIEW_STATS
  );
  const [loading, setLoading] = useState<boolean>(tauri);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tauri) return;

    let cancelled = false;
    let inFlight = false;

    const fetchOnce = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const next = await invoke<SystemStats>("get_system_stats");
        if (!cancelled) {
          setStats(next);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Không đọc được thông số hệ thống"
          );
          setLoading(false);
        }
      } finally {
        inFlight = false;
      }
    };

    void fetchOnce();
    const timer = window.setInterval(() => {
      void fetchOnce();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tauri]);

  const openTaskManager = useCallback(async () => {
    if (!tauri) return;
    await invoke("open_task_manager");
  }, [tauri]);

  return {
    stats,
    loading,
    error,
    openTaskManager,
  };
}
