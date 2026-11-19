import { Component, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NotchShell } from "./components/NotchShell";
import { SettingsWindow } from "./components/SettingsWindow";
import "./styles/settings.css";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSettingsWindow(): boolean {
  if (typeof window === "undefined") return false;

  if (isTauriRuntime()) {
    try {
      if (getCurrentWindow().label === "settings") {
        return true;
      }
    } catch {
      // Fallback to query check below
    }
  }

  return new URLSearchParams(window.location.search).get("window") === "settings";
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  errorMessage: string | null;
}

class SettingsErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      errorMessage: error?.message || "Unexpected settings render error",
    };
  }

  private handleClose = () => {
    if (isTauriRuntime()) {
      getCurrentWindow().close().catch(() => {});
    } else {
      window.close();
    }
  };

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="settings-error-box">
          <div className="settings-error-title">Không thể hiển thị Cài đặt</div>
          <pre className="settings-error-detail">{this.state.errorMessage}</pre>
          <button
            type="button"
            className="settings-primary-pill"
            onClick={this.handleClose}
          >
            Đóng cửa sổ
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function App() {
  if (isSettingsWindow()) {
    return (
      <SettingsErrorBoundary>
        <SettingsWindow />
      </SettingsErrorBoundary>
    );
  }
  return <NotchShell />;
}

export default App;
