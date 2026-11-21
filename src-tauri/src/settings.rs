use crate::notch_window::{position_notch_top_center, NotchState};
use crate::shortcut::{apply_ask_shortcut_enabled, ShortcutStatusState};
use crate::tray::TrayHandles;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{atomic::Ordering, Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

const SETTINGS_FILENAME: &str = "settings.json";
const ALL_PAGE_IDS: &[&str] = &[
    "music", "pomodoro", "water", "weather", "shelf", "calendar", "system", "ai",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub start_with_windows: bool,
    pub notch_scale: String,
    pub minimal_notch: bool,
    pub show_mascot: bool,
    pub show_date_time: bool,
    pub reminder_sounds: bool,
    pub hide_in_fullscreen: bool,
    pub notch_style: String,
    pub glass_effect: bool,
    pub glass_tint: u8,
    pub open_trigger: String,
    pub show_page_icons_on_hover: bool,
    pub animation_speed: String,
    pub show_lyrics: bool,
    pub lyrics_offset_ms: u32,
    pub pages_order: Vec<String>,
    pub enabled_pages: Vec<String>,
    pub show_notifications: bool,
    pub show_message_preview: bool,
    pub week_starts_on: String,
    pub pomodoro_focus_min: u32,
    pub pomodoro_break_min: u32,
    pub water_goal_ml: u32,
    pub shelf_start_empty: bool,
    pub ask_shortcut_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            start_with_windows: false,
            notch_scale: "auto".to_string(),
            minimal_notch: true,
            show_mascot: true,
            show_date_time: true,
            reminder_sounds: true,
            hide_in_fullscreen: true,
            notch_style: "classic".to_string(),
            glass_effect: false,
            glass_tint: 40,
            open_trigger: "hover".to_string(),
            show_page_icons_on_hover: true,
            animation_speed: "normal".to_string(),
            show_lyrics: false,
            lyrics_offset_ms: 0,
            pages_order: ALL_PAGE_IDS.iter().map(|s| s.to_string()).collect(),
            enabled_pages: ALL_PAGE_IDS.iter().map(|s| s.to_string()).collect(),
            show_notifications: true,
            show_message_preview: false,
            week_starts_on: "monday".to_string(),
            pomodoro_focus_min: 25,
            pomodoro_break_min: 5,
            water_goal_ml: 2000,
            shelf_start_empty: false,
            ask_shortcut_enabled: true,
        }
    }
}

#[derive(Clone, Default)]
pub struct SettingsState {
    inner: Arc<Mutex<AppSettings>>,
    pending_tab: Arc<Mutex<Option<String>>>,
}

fn sanitize_settings(mut cfg: AppSettings) -> AppSettings {
    cfg.notch_scale = match cfg.notch_scale.as_str() {
        "auto" | "100" | "115" | "130" | "150" => cfg.notch_scale,
        _ => "auto".to_string(),
    };
    cfg.notch_style = match cfg.notch_style.as_str() {
        "classic" | "floating" => cfg.notch_style,
        _ => "classic".to_string(),
    };
    cfg.glass_tint = cfg.glass_tint.clamp(10, 90);
    cfg.open_trigger = match cfg.open_trigger.as_str() {
        "hover" | "click" => cfg.open_trigger,
        _ => "hover".to_string(),
    };
    cfg.animation_speed = match cfg.animation_speed.as_str() {
        "normal" | "fast" => cfg.animation_speed,
        _ => "normal".to_string(),
    };
    cfg.lyrics_offset_ms = match cfg.lyrics_offset_ms {
        0 | 300 | 600 | 1000 => cfg.lyrics_offset_ms,
        _ => 0,
    };
    cfg.week_starts_on = match cfg.week_starts_on.as_str() {
        "monday" | "sunday" => cfg.week_starts_on,
        _ => "monday".to_string(),
    };
    cfg.pomodoro_focus_min = cfg.pomodoro_focus_min.clamp(5, 90);
    cfg.pomodoro_break_min = cfg.pomodoro_break_min.clamp(1, 30);
    cfg.water_goal_ml = cfg.water_goal_ml.clamp(500, 6000);

    let mut clean_order: Vec<String> = Vec::new();
    let mut newly_added_pages: Vec<String> = Vec::new();

    for id in &cfg.pages_order {
        if id == "apps" {
            for replacement in ["calendar", "ai"] {
                if !clean_order.iter().any(|existing| existing == replacement) {
                    clean_order.push(replacement.to_string());
                }
            }
            continue;
        }
        if ALL_PAGE_IDS.contains(&id.as_str()) && !clean_order.contains(id) {
            clean_order.push(id.clone());
        }
    }

    for &id in ALL_PAGE_IDS {
        if !clean_order.iter().any(|existing| existing == id) {
            clean_order.push(id.to_string());
            newly_added_pages.push(id.to_string());
        }
    }
    cfg.pages_order = clean_order;

    let mut clean_enabled: Vec<String> = Vec::new();
    for id in cfg.enabled_pages {
        if id == "apps" {
            for replacement in ["calendar", "ai"] {
                if !clean_enabled.iter().any(|existing| existing == replacement) {
                    clean_enabled.push(replacement.to_string());
                }
            }
            continue;
        }
        if ALL_PAGE_IDS.contains(&id.as_str()) && !clean_enabled.contains(&id) {
            clean_enabled.push(id);
        }
    }

    for id in newly_added_pages {
        if !clean_enabled.contains(&id) {
            clean_enabled.push(id);
        }
    }

    if clean_enabled.is_empty() {
        let fallback = cfg
            .pages_order
            .first()
            .cloned()
            .unwrap_or_else(|| "music".to_string());
        clean_enabled.push(fallback);
    }
    cfg.enabled_pages = clean_enabled;

    cfg
}

fn settings_file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join(SETTINGS_FILENAME))
}

fn persist_settings(app: &AppHandle, settings: &AppSettings) {
    let Some(path) = settings_file_path(app) else {
        return;
    };
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, json);
    }
}

#[cfg(target_os = "windows")]
fn apply_windows_startup(enabled: bool) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

    if enabled {
        if let Ok(exe_path) = std::env::current_exe() {
            let quoted = format!("\"{}\"", exe_path.to_string_lossy());
            let _ = Command::new("reg")
                .args(["add", RUN_KEY, "/v", "Nusa", "/t", "REG_SZ", "/d", &quoted, "/f"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    } else {
        let _ = Command::new("reg")
            .args(["delete", RUN_KEY, "/v", "Nusa", "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_windows_startup(_enabled: bool) {}

pub fn sync_runtime_flags(
    app: &AppHandle,
    settings: &AppSettings,
    notch_state: &NotchState,
    tray_handles: &TrayHandles,
) {
    notch_state
        .minimal_notch
        .store(settings.minimal_notch, Ordering::Relaxed);
    notch_state
        .open_on_click
        .store(settings.open_trigger == "click", Ordering::Relaxed);
    notch_state
        .show_mascot
        .store(settings.show_mascot, Ordering::Relaxed);
    if !settings.show_mascot {
        notch_state.mascot_peek.store(false, Ordering::Relaxed);
    }
    notch_state
        .hide_in_fullscreen
        .store(settings.hide_in_fullscreen, Ordering::Relaxed);
    tray_handles.sync_hide_fullscreen_checked(settings.hide_in_fullscreen);

    if !settings.hide_in_fullscreen
        && notch_state
            .fullscreen_hidden
            .swap(false, Ordering::Relaxed)
    {
        if let Some(window) = app.get_webview_window("notch") {
            position_notch_top_center(&window);
            let _ = window.show();
        }
    }
}

pub fn load_app_settings(
    app: &AppHandle,
    settings_state: &SettingsState,
    notch_state: &NotchState,
) -> AppSettings {
    let loaded = settings_file_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<AppSettings>(&raw).ok())
        .map(sanitize_settings)
        .unwrap_or_default();

    notch_state
        .minimal_notch
        .store(loaded.minimal_notch, Ordering::Relaxed);
    notch_state
        .open_on_click
        .store(loaded.open_trigger == "click", Ordering::Relaxed);
    notch_state
        .show_mascot
        .store(loaded.show_mascot, Ordering::Relaxed);
    notch_state
        .hide_in_fullscreen
        .store(loaded.hide_in_fullscreen, Ordering::Relaxed);

    if let Ok(mut guard) = settings_state.inner.lock() {
        *guard = loaded.clone();
    }

    loaded
}

pub fn sync_hide_fullscreen_into_settings(
    app: &AppHandle,
    settings_state: &SettingsState,
    enabled: bool,
) {
    let snapshot = if let Ok(mut guard) = settings_state.inner.lock() {
        guard.hide_in_fullscreen = enabled;
        guard.clone()
    } else {
        return;
    };
    persist_settings(app, &snapshot);
    let _ = app.emit("settings:updated", snapshot);
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, SettingsState>) -> AppSettings {
    state
        .inner
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn update_app_settings(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    notch_state: State<'_, NotchState>,
    tray_handles: State<'_, TrayHandles>,
    shortcut_status: State<'_, ShortcutStatusState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let sanitized = sanitize_settings(settings);

    let (startup_changed, shortcut_changed) = {
        let mut guard = settings_state
            .inner
            .lock()
            .map_err(|_| "Failed to lock settings state".to_string())?;
        let startup = guard.start_with_windows != sanitized.start_with_windows;
        let shortcut = guard.ask_shortcut_enabled != sanitized.ask_shortcut_enabled;
        *guard = sanitized.clone();
        (startup, shortcut)
    };

    if startup_changed {
        apply_windows_startup(sanitized.start_with_windows);
    }

    if shortcut_changed {
        apply_ask_shortcut_enabled(&app, &shortcut_status, sanitized.ask_shortcut_enabled);
    }

    sync_runtime_flags(&app, &sanitized, &notch_state, &tray_handles);
    persist_settings(&app, &sanitized);

    app.emit("settings:updated", sanitized.clone())
        .map_err(|e| e.to_string())?;

    Ok(sanitized)
}

fn open_settings_window_inner(app: &AppHandle, tab: Option<String>) -> Result<(), String> {
    let clean_tab = tab
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        .map(str::to_string);

    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        if let Some(target_tab) = clean_tab {
            let _ = app.emit("settings:navigate", target_tab);
        }
        return Ok(());
    }

    if let Ok(mut guard) = app.state::<SettingsState>().pending_tab.lock() {
        *guard = clean_tab;
    }

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("Nusa Settings")
        .inner_size(780.0, 600.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .center()
        .build()
        .map_err(|e| format!("Không thể mở cửa sổ cài đặt: {e}"))?;

    Ok(())
}

pub fn spawn_open_settings_window(app: AppHandle, tab: Option<String>) {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = open_settings_window_inner(&app, tab);
    });
}

#[tauri::command]
pub async fn open_settings_window(app: AppHandle, tab: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_settings_window_inner(&app, tab))
        .await
        .map_err(|e| format!("Lỗi luồng mở cửa sổ cài đặt: {e}"))?
}

#[tauri::command]
pub fn take_pending_settings_tab(state: State<'_, SettingsState>) -> Option<String> {
    state.pending_tab.lock().ok().and_then(|mut g| g.take())
}
