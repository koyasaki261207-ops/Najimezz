import { useEffect, useState } from "react";

export interface ClockData {
  dateText: string;
  timeText: string;
  period: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatClock(now: Date): ClockData {
  const weekday = WEEKDAYS[now.getDay()];
  const day = now.getDate();
  const month = MONTHS[now.getMonth()];
  const year = now.getFullYear();

  const rawHours = now.getHours();
  const period = rawHours >= 12 ? "PM" : "AM";
  const hours12 = rawHours % 12 === 0 ? 12 : rawHours % 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return {
    dateText: `${weekday} ${day} ${month} ${year}`,
    timeText: `${hours12}:${minutes}`,
    period,
  };
}

export function useClock(): ClockData {
  const [clock, setClock] = useState<ClockData>(() => formatClock(new Date()));

  useEffect(() => {
    const update = () => setClock(formatClock(new Date()));
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return clock;
}
