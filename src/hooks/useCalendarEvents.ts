import { useCallback, useState } from "react";
import type { CalendarEvent, CalendarEventMap } from "../types/calendar";

const STORAGE_KEY = "nusa.calendarEvents.v1";

export const EVENT_COLORS = [
  "#EF4444",
  "#38BDF8",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aHasTime = a.time.trim().length > 0;
    const bHasTime = b.time.trim().length > 0;
    if (aHasTime && bHasTime) {
      const cmp = a.time.localeCompare(b.time);
      if (cmp !== 0) return cmp;
    } else if (aHasTime !== bHasTime) {
      return aHasTime ? -1 : 1;
    }
    return a.createdAtMs - b.createdAtMs;
  });
}

function loadStoredEvents(): CalendarEventMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CalendarEventMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveStoredEvents(map: CalendarEventMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota or access errors
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface AddEventInput {
  dateKey: string;
  title: string;
  time: string;
  note: string;
  color?: string;
}

export function useCalendarEvents() {
  const [eventsByDate, setEventsByDate] = useState<CalendarEventMap>(() =>
    loadStoredEvents()
  );

  const addEvent = useCallback((input: AddEventInput): CalendarEvent | null => {
    const title = input.title.trim();
    if (!title) return null;

    const newEvent: CalendarEvent = {
      id: generateId(),
      dateKey: input.dateKey,
      title,
      time: input.time.trim(),
      note: input.note.trim(),
      color: input.color || EVENT_COLORS[0],
      createdAtMs: Date.now(),
    };

    setEventsByDate((prev) => {
      const current = prev[input.dateKey] ?? [];
      const nextMap: CalendarEventMap = {
        ...prev,
        [input.dateKey]: sortDayEvents([...current, newEvent]),
      };
      saveStoredEvents(nextMap);
      return nextMap;
    });

    return newEvent;
  }, []);

  const deleteEvent = useCallback((dateKey: string, eventId: string) => {
    setEventsByDate((prev) => {
      const current = prev[dateKey];
      if (!current) return prev;
      const filtered = current.filter((item) => item.id !== eventId);
      const nextMap: CalendarEventMap = { ...prev };
      if (filtered.length === 0) {
        delete nextMap[dateKey];
      } else {
        nextMap[dateKey] = filtered;
      }
      saveStoredEvents(nextMap);
      return nextMap;
    });
  }, []);

  const getEventsForDate = useCallback(
    (dateKey: string): CalendarEvent[] => eventsByDate[dateKey] ?? [],
    [eventsByDate]
  );

  return {
    eventsByDate,
    addEvent,
    deleteEvent,
    getEventsForDate,
  };
}
