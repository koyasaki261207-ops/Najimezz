use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};

pub const WINDOW_WIDTH_LOGICAL: f64 = 540.0;
const COLLAPSED_HALF_WIDTH: f64 = 122.0;
const COLLAPSED_HEIGHT: f64 = 40.0;
const EXPANDED_HALF_WIDTH: f64 = 250.0;
const EXPANDED_HEIGHT: f64 = 196.0;
const COLLAPSE_DELAY_MS: u64 = 240;
const POLL_INTERVAL_MS: u64 = 32;

#[derive(Clone)]
pub struct NotchState {
    pub expanded: Arc<AtomicBool>,
    pub pinned: Arc<AtomicBool>,
}

impl Default for NotchState {
    fn default() -> Self {
        Self {
            expanded: Arc::new(AtomicBool::new(false)),
            pinned: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct NotchStatePayload {
    pub expanded: bool,
    pub pinned: bool,
}

pub fn position_notch_top_center(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let mon_pos = monitor.position();
        let mon_size = monitor.size();
        let scale = monitor.scale_factor();
        let win_phys_width = (WINDOW_WIDTH_LOGICAL * scale).round() as i32;
        let x = mon_pos.x + ((mon_size.width as i32 - win_phys_width) / 2);
        let y = mon_pos.y;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

pub fn start_hover_tracker(app: AppHandle, state: NotchState) {
    thread::spawn(move || {
        let mut last_ignore: Option<bool> = None;
        let mut leave_started_at: Option<Instant> = None;

        loop {
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));

            let Some(window) = app.get_webview_window("notch") else {
                continue;
            };

            let Ok(cursor) = window.cursor_position() else {
                continue;
            };
            let Ok(outer_pos) = window.outer_position() else {
                continue;
            };
            let scale = window.scale_factor().unwrap_or(1.0);

            let rel_x = (cursor.x - outer_pos.x as f64) / scale;
            let rel_y = (cursor.y - outer_pos.y as f64) / scale;
            let center_x = WINDOW_WIDTH_LOGICAL / 2.0;

            let in_collapsed = rel_x >= center_x - COLLAPSED_HALF_WIDTH
                && rel_x <= center_x + COLLAPSED_HALF_WIDTH
                && rel_y >= 0.0
                && rel_y <= COLLAPSED_HEIGHT;

            let in_expanded = rel_x >= center_x - EXPANDED_HALF_WIDTH
                && rel_x <= center_x + EXPANDED_HALF_WIDTH
                && rel_y >= 0.0
                && rel_y <= EXPANDED_HEIGHT;

            let currently_expanded = state.expanded.load(Ordering::Relaxed);
            let pinned = state.pinned.load(Ordering::Relaxed);

            let next_expanded = if pinned {
                leave_started_at = None;
                true
            } else if !currently_expanded {
                leave_started_at = None;
                in_collapsed
            } else if in_expanded {
                leave_started_at = None;
                true
            } else {
                let start = leave_started_at.get_or_insert_with(Instant::now);
                start.elapsed() < Duration::from_millis(COLLAPSE_DELAY_MS)
            };

            if next_expanded != currently_expanded {
                state.expanded.store(next_expanded, Ordering::Relaxed);
                let _ = app.emit(
                    "notch:state",
                    NotchStatePayload {
                        expanded: next_expanded,
                        pinned,
                    },
                );
            }

            let cursor_on_notch = if next_expanded {
                in_expanded
            } else {
                in_collapsed
            };
            let should_ignore = !cursor_on_notch;

            if last_ignore != Some(should_ignore) {
                if window.set_ignore_cursor_events(should_ignore).is_ok() {
                    last_ignore = Some(should_ignore);
                }
            }
        }
    });
}

#[tauri::command]
pub fn get_notch_state(state: State<'_, NotchState>) -> NotchStatePayload {
    NotchStatePayload {
        expanded: state.expanded.load(Ordering::Relaxed),
        pinned: state.pinned.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub fn set_notch_pinned(
    app: AppHandle,
    state: State<'_, NotchState>,
    pinned: bool,
) -> Result<NotchStatePayload, String> {
    state.pinned.store(pinned, Ordering::Relaxed);
    if pinned {
        state.expanded.store(true, Ordering::Relaxed);
    }
    let payload = NotchStatePayload {
        expanded: state.expanded.load(Ordering::Relaxed),
        pinned,
    };
    app.emit("notch:state", payload.clone())
        .map_err(|e| e.to_string())?;
    Ok(payload)
}

#[tauri::command]
pub fn recenter_notch(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("notch") {
        position_notch_top_center(&window);
    }
    Ok(())
}
