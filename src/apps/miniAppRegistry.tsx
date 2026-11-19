import { Calendar, Sparkles } from "lucide-react";
import type { MiniAppDefinition } from "../types/apps";
import { AiApp } from "./AiApp";
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
  {
    id: "ai",
    name: "AI",
    description: "Trợ lý Gemini 4 tích hợp tìm kiếm web Google Search",
    accentColor: "#38BDF8",
    icon: Sparkles,
    status: "ready",
    supportsTall: true,
    supportsMega: true,
    component: AiApp,
  },
];

export function getMiniAppById(id: string | null): MiniAppDefinition | null {
  if (!id) return null;
  return MINI_APPS.find((app) => app.id === id) ?? null;
}
