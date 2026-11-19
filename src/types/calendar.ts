export interface CalendarEvent {
  id: string;
  dateKey: string;
  title: string;
  time: string;
  note: string;
  color: string;
  createdAtMs: number;
}

export type CalendarEventMap = Record<string, CalendarEvent[]>;
