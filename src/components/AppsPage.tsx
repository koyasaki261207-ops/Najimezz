import { useRef, type WheelEvent } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { getMiniAppById, MINI_APPS } from "../apps/miniAppRegistry";
import type { MiniAppId } from "../types/apps";

interface AppsPageProps {
  activeAppId: MiniAppId | null;
  isMega: boolean;
  onOpenApp: (appId: MiniAppId) => void;
  onCloseApp: () => void;
  onSetMega: (mega: boolean) => void;
  onNotify: (message: string) => void;
}

export function AppsPage({
  activeAppId,
  isMega,
  onOpenApp,
  onCloseApp,
  onSetMega,
  onNotify,
}: AppsPageProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeApp = getMiniAppById(activeAppId);

  const handleGridWheel = (event: WheelEvent<HTMLDivElement>) => {
    const el = gridRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      event.stopPropagation();
    }
  };

  if (activeApp) {
    const ActiveIcon = activeApp.icon;
    const ActiveAppComponent = activeApp.component;
    const activeSizeClass = isMega
      ? "is-mega"
      : activeApp.supportsTall
        ? "is-tall"
        : "";

    return (
      <div
        className={`apps-active-view ${activeSizeClass}`}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="apps-subbar">
          <button
            type="button"
            className="apps-back-btn"
            aria-label="Quay lại danh sách ứng dụng"
            onClick={onCloseApp}
          >
            <ArrowLeft size={12} strokeWidth={2.4} />
            <span>Apps</span>
          </button>

          <div className="apps-active-identity">
            <ActiveIcon color={activeApp.accentColor} size={12} strokeWidth={2.2} />
            <span>{activeApp.name}</span>
          </div>

          <div className="apps-subbar-spacer" aria-hidden="true" />
        </div>

        <div className="apps-active-stage">
          <ActiveAppComponent
            isMega={isMega}
            onClose={onCloseApp}
            onNotify={onNotify}
            onSetMega={onSetMega}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="apps-page">
      <div ref={gridRef} className="apps-grid" onWheel={handleGridWheel}>
        {MINI_APPS.map((app) => {
          const IconComponent = app.icon;
          return (
            <button
              key={app.id}
              type="button"
              className="app-tile"
              title={app.description}
              onClick={() => onOpenApp(app.id)}
            >
              <div
                className="app-tile-icon"
                style={{
                  color: app.accentColor,
                  backgroundColor: `${app.accentColor}1c`,
                  borderColor: `${app.accentColor}38`,
                }}
              >
                <IconComponent size={20} strokeWidth={2} />
                {app.status === "coming-soon" && (
                  <span className="app-tile-dot" title="Sắp ra mắt" />
                )}
              </div>
              <span className="app-tile-label">{app.name}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="app-tile app-tile-slot"
          title="Khu vực mở rộng cho các ứng dụng bạn yêu cầu tiếp theo"
          onClick={() =>
            onNotify("Ngăn ứng dụng sẵn sàng tích hợp thêm mini-app mới")
          }
        >
          <div className="app-tile-icon app-tile-icon-dashed">
            <Plus size={18} strokeWidth={2} />
          </div>
          <span className="app-tile-label">Thêm sau</span>
        </button>
      </div>
    </div>
  );
}
