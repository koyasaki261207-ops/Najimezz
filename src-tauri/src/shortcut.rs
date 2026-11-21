use crate::notch_window::{toggle_ask_nusa, NotchState};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, State, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const ASK_SHORTCUT_LABEL: &str = "Ctrl + Space";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AskShortcutStatus {
    pub enabled: bool,
    pub registered: bool,
    pub shortcut: String,
    pub error: Option<String>,
}

impl Default for AskShortcutStatus {
    fn default() -> Self {
        Self {
            enabled: true,
            registered: false,
            shortcut: ASK_SHORTCUT_LABEL.to_string(),
            error: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct ShortcutStatusState {
    inner: Arc<Mutex<AskShortcutStatus>>,
}

pub fn ask_nusa_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::Space)
}

pub fn build_shortcut_plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed
                && shortcut.id() == ask_nusa_shortcut().id()
            {
                let notch_state = app.state::<NotchState>();
                toggle_ask_nusa(app, &notch_state);
            }
        })
        .build()
}

pub fn apply_ask_shortcut_enabled(
    app: &AppHandle,
    status_state: &ShortcutStatusState,
    enabled: bool,
) -> AskShortcutStatus {
    let target = ask_nusa_shortcut();
    let manager = app.global_shortcut();

    let (registered, error) = if enabled {
        if manager.is_registered(target) {
            (true, None)
        } else {
            match manager.register(target) {
                Ok(()) => (true, None),
                Err(err) => (
                    false,
                    Some(format!(
                        "Không đăng ký được {ASK_SHORTCUT_LABEL} (có thể đang bị ứng dụng khác sử dụng): {err}"
                    )),
                ),
            }
        }
    } else {
        if manager.is_registered(target) {
            let _ = manager.unregister(target);
        }
        (false, None)
    };

    let snapshot = AskShortcutStatus {
        enabled,
        registered,
        shortcut: ASK_SHORTCUT_LABEL.to_string(),
        error,
    };

    if let Ok(mut guard) = status_state.inner.lock() {
        *guard = snapshot.clone();
    }

    let _ = app.emit("shortcut:status", snapshot.clone());
    snapshot
}

#[tauri::command]
pub fn get_ask_shortcut_status(state: State<'_, ShortcutStatusState>) -> AskShortcutStatus {
    state
        .inner
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}
