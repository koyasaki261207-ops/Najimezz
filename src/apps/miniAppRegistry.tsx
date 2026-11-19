import { Calendar } from "lucide-react";
import type { MiniAppDefinition } from "../types/apps";
import { CalendarApp } from "./CalendarApp";

export const MINI_APPS: MiniAppDefinition[] = [
  {
    id: "calendar",
    name: "Lịch",
    description: "Xem lịch ngày, quản lý lịch trình và mở rộng lịch cả tháng",
    accentColor: "#EF4444",
    icon: Calendar,
    status: "ready",
    supportsTall: true,
    supportsMega: true,
    component: CalendarApp,
  },
];

export function getMiniAppById(id: string | null): MiniAppDefinition | null {
  if (!id) return null;
  return MINI_APPS.find((app) => app.id === id) ?? null;
}
