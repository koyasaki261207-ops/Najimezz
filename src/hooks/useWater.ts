import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playWaterChime } from "../utils/chime";

const WATER_STORAGE_KEY = "nusa.waterLog.v1";
const REMINDER_CYCLE: (number | null)[] = [null, 45, 60, 90];

interface StoredWaterState {
  dateKey: string;
  entries: number[];
  reminderIntervalMin: number | null;
}

function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadWaterState(): StoredWaterState {
  const today = getTodayDateKey();
  try {
    const raw = window.localStorage.getItem(WATER_STORAGE_KEY);
    if (!raw) {
      return { dateKey: today, entries: [], reminderIntervalMin: null };
    }
    const parsed = JSON.parse(raw) as Partial<StoredWaterState>;
    const reminder =
      typeof parsed.reminderIntervalMin === "number" &&
      REMINDER_CYCLE.includes(parsed.reminderIntervalMin)
        ? parsed.reminderIntervalMin
        : null;

    if (parsed.dateKey !== today) {
      return { dateKey: today, entries: [], reminderIntervalMin: reminder };
    }

    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter((n): n is number => typeof n === "number" && n > 0)
      : [];

    return { dateKey: today, entries, reminderIntervalMin: reminder };
  } catch {
    return { dateKey: today, entries: [], reminderIntervalMin: null };
  }
}

function persistWaterState(state: StoredWaterState): void {
  try {
    window.localStorage.setItem(WATER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export interface UseWaterOptions {
  goalMl: number;
  reminderSounds: boolean;
  onNotify: (message: string) => void;
}

export interface UseWaterResult {
  intakeMl: number;
  goalMl: number;
  remainingMl: number;
  progressRatio: number;
  percent: number;
  entriesCount: number;
  goalReached: boolean;
  reminderIntervalMin: number | null;
  addWater: (amountMl: number) => void;
  undoLast: () => void;
  resetToday: () => void;
  cycleReminder: () => void;
}

export function useWater({
  goalMl,
  reminderSounds,
  onNotify,
}: UseWaterOptions): UseWaterResult {
  const [state, setState] = useState<StoredWaterState>(() => loadWaterState());
  const reminderSoundsRef = useRef(reminderSounds);
  const onNotifyRef = useRef(onNotify);
  const lastLogAtRef = useRef<number>(Date.now());

  useEffect(() => {
    reminderSoundsRef.current = reminderSounds;
  }, [reminderSounds]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const intakeMl = useMemo(
    () => state.entries.reduce((sum, val) => sum + val, 0),
    [state.entries]
  );

  const safeGoal = Math.max(500, goalMl);
  const remainingMl = Math.max(0, safeGoal - intakeMl);
  const progressRatio = Math.min(1, intakeMl / safeGoal);
  const percent = Math.round((intakeMl / safeGoal) * 100);
  const goalReached = intakeMl >= safeGoal;

  // Roll over to a fresh log automatically at midnight
  useEffect(() => {
    const checkDate = () => {
      const today = getTodayDateKey();
      setState((prev) => {
        if (prev.dateKey === today) return prev;
        const next: StoredWaterState = {
          dateKey: today,
          entries: [],
          reminderIntervalMin: prev.reminderIntervalMin,
        };
        persistWaterState(next);
        return next;
      });
    };

    const intervalId = window.setInterval(checkDate, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Periodic hydration reminder when enabled and daily goal is not yet reached
  useEffect(() => {
    if (state.reminderIntervalMin === null || goalReached) return;
    const intervalMs = state.reminderIntervalMin * 60_000;

    const timerId = window.setInterval(() => {
      if (Date.now() - lastLogAtRef.current < intervalMs - 10_000) {
        return;
      }
      lastLogAtRef.current = Date.now();
      if (reminderSoundsRef.current) {
        playWaterChime("reminder");
      }
      onNotifyRef.current("Đến giờ uống thêm một ly nước rồi!");
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, [state.reminderIntervalMin, goalReached]);

  const addWater = useCallback(
    (amountMl: number) => {
      if (amountMl <= 0) return;
      const today = getTodayDateKey();
      const prevTotal = state.dateKey === today ? intakeMl : 0;
      const nextTotal = prevTotal + amountMl;
      const justReachedGoal = prevTotal < safeGoal && nextTotal >= safeGoal;

      lastLogAtRef.current = Date.now();

      setState((prev) => {
        const baseEntries = prev.dateKey === today ? prev.entries : [];
        const next: StoredWaterState = {
          dateKey: today,
          entries: [...baseEntries, amountMl],
          reminderIntervalMin: prev.reminderIntervalMin,
        };
        persistWaterState(next);
        return next;
      });

      if (reminderSoundsRef.current) {
        playWaterChime(justReachedGoal ? "goal" : "log");
      }

      if (justReachedGoal) {
        onNotifyRef.current(`Đạt mục tiêu ${safeGoal.toLocaleString()} ml hôm nay!`);
      }
    },
    [intakeMl, safeGoal, state.dateKey]
  );

  const undoLast = useCallback(() => {
    setState((prev) => {
      if (prev.entries.length === 0) return prev;
      const next: StoredWaterState = {
        ...prev,
        entries: prev.entries.slice(0, -1),
      };
      persistWaterState(next);
      return next;
    });
  }, []);

  const resetToday = useCallback(() => {
    const today = getTodayDateKey();
    setState((prev) => {
      const next: StoredWaterState = {
        dateKey: today,
        entries: [],
        reminderIntervalMin: prev.reminderIntervalMin,
      };
      persistWaterState(next);
      return next;
    });
    onNotifyRef.current("Đã đặt lại lượng nước uống hôm nay");
  }, []);

  const cycleReminder = useCallback(() => {
    setState((prev) => {
      const idx = REMINDER_CYCLE.indexOf(prev.reminderIntervalMin);
      const nextReminder = REMINDER_CYCLE[(idx + 1) % REMINDER_CYCLE.length];
      const next: StoredWaterState = {
        ...prev,
        reminderIntervalMin: nextReminder,
      };
      persistWaterState(next);
      lastLogAtRef.current = Date.now();
      onNotifyRef.current(
        nextReminder === null
          ? "Đã tắt nhắc uống nước định kỳ"
          : `Nhắc uống nước mỗi ${nextReminder} phút`
      );
      return next;
    });
  }, []);

  return {
    intakeMl,
    goalMl: safeGoal,
    remainingMl,
    progressRatio,
    percent,
    entriesCount: state.entries.length,
    goalReached,
    reminderIntervalMin: state.reminderIntervalMin,
    addWater,
    undoLast,
    resetToday,
    cycleReminder,
  };
}
