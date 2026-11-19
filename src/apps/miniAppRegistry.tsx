import { Calendar } from "lucide-react";
import type { MiniAppDefinition, MiniAppProps } from "../types/apps";

function createComingSoonApp(title: string, description: string, accentColor: string) {
  return function ComingSoonMiniApp({ onClose }: MiniAppProps) {
    return (
      <div className="mini-app-placeholder">
        <div
          className="mini-app-placeholder-badge"
          style={{
            color: accentColor,
            borderColor: `${accentColor}44`,
            backgroundColor: `${accentColor}1a`,
          }}
        >
          Sắp ra mắt
        </div>
        <div className="mini-app-placeholder-title">{title}</div>
        <div className="mini-app-placeholder-desc">{description}</div>
        <button
          type="button"
          className="mini-app-placeholder-btn"
          onClick={onClose}
        >
          Quay lại ngăn ứng dụng
        </button>
      </div>
    );
  };
}

const CalendarPlaceholderApp = createComingSoonApp(
  "Lịch",
  "Slot đã sẵn sàng — sẽ tích hợp lịch tháng & sự kiện ở bước tiếp theo",
  "#EF4444"
);

export const MINI_APPS: MiniAppDefinition[] = [
  {
    id: "calendar",
    name: "Lịch",
    description: "Xem lịch tháng, ngày lễ và ghi chú nhanh",
    accentColor: "#EF4444",
    icon: Calendar,
    status: "coming-soon",
    supportsTall: true,
    component: CalendarPlaceholderApp,
  },
];

export function getMiniAppById(id: string | null): MiniAppDefinition | null {
  if (!id) return null;
  return MINI_APPS.find((app) => app.id === id) ?? null;
}
