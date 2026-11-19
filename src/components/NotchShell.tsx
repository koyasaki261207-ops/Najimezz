import { useCallback, useState, type WheelEvent } from "react";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useNotchWindow } from "../hooks/useNotchWindow";
import { NOTCH_PAGES } from "../notch/pageRegistry";
import type { NotchPageId } from "../types/notch";
import { NotchDock } from "./NotchDock";
import { NusaMascot } from "./NusaMascot";
import { StatusBar } from "./StatusBar";

function NotchEar({ side }: { side: "left" | "right" }) {
  return (
    <svg
      className={`notch-ear notch-ear-${side}`}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      {side === "left" ? (
        <path d="M18 0H0C10 0 18 8 18 18V0Z" fill="#000000" />
      ) : (
        <path d="M0 0H18C8 0 0 8 0 18V0Z" fill="#000000" />
      )}
    </svg>
  );
}

export function NotchShell() {
  const { expanded, pinned, togglePinned, setBrowserHover } = useNotchWindow();
  const [activeIndex, setActiveIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activePage = NOTCH_PAGES[activeIndex];
  const ActivePageComponent = activePage.component;

  const stepPage = useCallback((delta: number) => {
    setActiveIndex((prev) => (prev + delta + NOTCH_PAGES.length) % NOTCH_PAGES.length);
  }, []);

  const handleSelectPage = useCallback((pageId: NotchPageId) => {
    const idx = NOTCH_PAGES.findIndex((p) => p.id === pageId);
    if (idx >= 0) {
      setActiveIndex(idx);
    }
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!expanded) return;
      if (Math.abs(event.deltaY) < 12 && Math.abs(event.deltaX) < 12) return;
      const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      stepPage(dominant > 0 ? 1 : -1);
    },
    [expanded, stepPage]
  );

  const handleOpenSettings = useCallback(() => {
    setToastMessage("Settings window will be connected in next phase");
    window.setTimeout(() => {
      setToastMessage((curr) =>
        curr === "Settings window will be connected in next phase" ? null : curr
      );
    }, 1800);
  }, []);

  return (
    <div className="notch-viewport">
      <div
        className={`notch-frame ${expanded ? "is-expanded" : "is-collapsed"}`}
        onMouseEnter={() => setBrowserHover(true)}
        onMouseLeave={() => setBrowserHover(false)}
        onWheel={handleWheel}
      >
        <NotchEar side="left" />
        <NotchEar side="right" />

        <div className="notch-surface">
          {!expanded ? (
            <div className="notch-collapsed-bar">
              <div className="collapsed-left">
                <NusaMascot size={20} />
              </div>
              <div className="collapsed-right">
                <StatusBar compact />
              </div>
            </div>
          ) : (
            <div className="notch-expanded-layout">
              <header className="notch-header">
                <div className="notch-header-left">
                  {activePage.showHeaderTitle && (
                    <span className="notch-page-title">{activePage.label}</span>
                  )}
                </div>

                <div className="notch-header-center">
                  <StatusBar />
                </div>

                <div className="notch-header-right">
                  <button
                    type="button"
                    className={`notch-pin-btn ${pinned ? "is-pinned" : ""}`}
                    title={pinned ? "Unpin notch" : "Pin notch open"}
                    aria-label={pinned ? "Unpin notch" : "Pin notch open"}
                    onClick={togglePinned}
                  >
                    <Pin size={12} strokeWidth={2.2} />
                  </button>
                </div>
              </header>

              <div className="notch-body-row">
                <button
                  type="button"
                  className="notch-nav-arrow"
                  aria-label="Previous page"
                  onClick={() => stepPage(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={2.2} />
                </button>

                <main className="notch-page-stage">
                  <ActivePageComponent />
                </main>

                <button
                  type="button"
                  className="notch-nav-arrow"
                  aria-label="Next page"
                  onClick={() => stepPage(1)}
                >
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>

              {toastMessage && <div className="notch-toast">{toastMessage}</div>}

              <NotchDock
                pages={NOTCH_PAGES}
                activePageId={activePage.id}
                onSelectPage={handleSelectPage}
                onOpenSettings={handleOpenSettings}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
