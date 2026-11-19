use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};

pub const WINDOW_WIDTH_LOGICAL: f64 = 800.0;
const HIDDEN_BAR_HALF_WIDTH: f64 = 84.0;
const HIDDEN_BAR_HEIGHT: f64 = 12.0;
const COLLAPSED_WIDE_HALF_WIDTH: f64 = 236.0;
const COLLAPSED_LYRICS_HEIGHT: f64 = 42.0;
const EXPANDED_HALF_WIDTH: f64 = 250.0;
const EXPANDED_HEIGHT: f64 = 196.0;
const EXPANDED_TALL_HEIGHT: f64 = 286.0;
const MEGA_HALF_WIDTH: f64 = 374.0;
const MEGA_HEIGHT: f64 = 478.0;
const COLLAPSE_DELAY_MS: u64 = 240;
const DRAG_OUTSIDE_RESET_MS: u64 = 700;
const POLL_INTERVAL_MS: u64 = 32;

#[derive(Clone)]
pub struct NotchState {
    pub expanded: Arc<AtomicBool>,
    pub pinned: Arc<AtomicBool>,
    pub tall: Arc<AtomicBool>,
    pub mega: Arc<AtomicBool>,
    pub wide_collapsed: Arc<AtomicBool>,
    pub dragging: Arc<AtomicBool>,
    pub input_lock: Arc<AtomicBool>,
}

impl Default for NotchState {
    fn default() -> Self {
        Self {
            expanded: Arc::new(AtomicBool::new(false)),
            pinned: Arc::new(AtomicBool::new(false)),
            tall: Arc::new(AtomicBool::new(false)),
            mega: Arc::new(AtomicBool::new(false)),
            wide_collapsed: Arc::new(AtomicBool::new(false)),
            dragging: Arc::new(AtomicBool::new(false)),
            input_lock: Arc::new(AtomicBool::new(false)),
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

pub fn set_dragging_active(app: &AppHandle, state: &NotchState, active: bool) {
    state.dragging.store(active, Ordering::Relaxed);
    if active {
        let was_expanded = state.expanded.swap(true, Ordering::Relaxed);
        if !was_expanded {
            let _ = app.emit(
                "notch:state",
                NotchStatePayload {
                    expanded: true,
                    pinned: state.pinned.load(Ordering::Relaxed),
                },
            );
        }
        if let Some(window) = app.get_webview_window("notch") {
            let _ = window.set_ignore_cursor_events(false);
        }
    }
}

pub fn start_hover_tracker(app: AppHandle, state: NotchState) {
    thread::spawn(move || {
        let mut last_ignore: Option<bool> = None;
        let mut leave_started_at: Option<Instant> = None;
        let mut drag_outside_at: Option<Instant> = None;

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

            let is_wide_collapsed = state.wide_collapsed.load(Ordering::Relaxed);
            let (collapsed_half_width, collapsed_height) = if is_wide_collapsed {
                (COLLAPSED_WIDE_HALF_WIDTH, COLLAPSED_LYRICS_HEIGHT)
            } else {
                (HIDDEN_BAR_HALF_WIDTH, HIDDEN_BAR_HEIGHT)
            };

            let is_mega = state.mega.load(Ordering::Relaxed);
            let expanded_half_width = if is_mega {
                MEGA_HALF_WIDTH
            } else {
                EXPANDED_HALF_WIDTH
            };
            let expanded_height = if is_mega {
                MEGA_HEIGHT
            } else if state.tall.load(Ordering::Relaxed) {
                EXPANDED_TALL_HEIGHT
            } else {
                EXPANDED_HEIGHT
            };

            let in_collapsed = rel_x >= center_x - collapsed_half_width
                && rel_x <= center_x + collapsed_half_width
                && rel_y >= 0.0
                && rel_y <= collapsed_height;

            let in_expanded = rel_x >= center_x - expanded_half_width
                && rel_x <= center_x + expanded_half_width
                && rel_y >= 0.0
                && rel_y <= expanded_height;

            let in_drag_safe_zone = rel_x >= center_x - (expanded_half_width + 48.0)
                && rel_x <= center_x + (expanded_half_width + 48.0)
                && rel_y >= -20.0
                && rel_y <= expanded_height + 48.0;

            let mut dragging = state.dragging.load(Ordering::Relaxed);
            if dragging {
                if in_drag_safe_zone {
                    drag_outside_at = None;
                } else {
                    let start = drag_outside_at.get_or_insert_with(Instant::now);
                    if start.elapsed() >= Duration::from_millis(DRAG_OUTSIDE_RESET_MS) {
                        state.dragging.store(false, Ordering::Relaxed);
                        dragging = false;
                        drag_outside_at = None;
                    }
                }
            } else {
                drag_outside_at = None;
            }

            let currently_expanded = state.expanded.load(Ordering::Relaxed);
            let pinned = state.pinned.load(Ordering::Relaxed);
            let input_locked = state.input_lock.load(Ordering::Relaxed);

            let next_expanded = if pinned || dragging || input_locked {
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
                if !next_expanded {
                    state.mega.store(false, Ordering::Relaxed);
                }
                let _ = app.emit(
                    "notch:state",
                    NotchStatePayload {
                        expanded: next_expanded,
                        pinned,
                    },
                );
            }

            let cursor_on_notch = if dragging {
                true
            } else if next_expanded {
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
pub fn set_notch_tall(state: State<'_, NotchState>, tall: bool) {
    state.tall.store(tall, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_notch_mega(state: State<'_, NotchState>, mega: bool) {
    state.mega.store(mega, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_notch_collapsed_wide(state: State<'_, NotchState>, wide: bool) {
    state.wide_collapsed.store(wide, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_notch_input_lock(state: State<'_, NotchState>, locked: bool) {
    state.input_lock.store(locked, Ordering::Relaxed);
}

#[tauri::command]
pub fn focus_notch_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("notch") {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn recenter_notch(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("notch") {
        position_notch_top_center(&window);
    }
    Ok(())
}
