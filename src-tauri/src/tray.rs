use crate::notch_window::{
    apply_hide_in_fullscreen, apply_pinned_state, position_notch_top_center, toggle_ask_nusa,
    NotchState,
};
use crate::settings::spawn_open_settings_window;
use std::sync::{atomic::Ordering, Arc, Mutex};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Manager, Wry};

const TRAY_ID: &str = "nusa-tray";
const MENU_ASK_NUSA_ID: &str = "tray_ask_nusa";
const MENU_SETTINGS_ID: &str = "tray_settings";
const MENU_PIN_ID: &str = "tray_pin";
const MENU_HIDE_FULLSCREEN_ID: &str = "tray_hide_fullscreen";
const MENU_RECENTER_ID: &str = "tray_recenter";
const MENU_QUIT_ID: &str = "tray_quit";

struct TrayMenuItems {
    pin_item: CheckMenuItem<Wry>,
    hide_fs_item: CheckMenuItem<Wry>,
}

#[derive(Clone, Default)]
pub struct TrayHandles {
    inner: Arc<Mutex<Option<TrayMenuItems>>>,
}

impl TrayHandles {
    pub fn sync_pin_checked(&self, checked: bool) {
        if let Ok(guard) = self.inner.lock() {
            if let Some(items) = guard.as_ref() {
                let _ = items.pin_item.set_checked(checked);
            }
        }
    }

    pub fn sync_hide_fullscreen_checked(&self, checked: bool) {
        if let Ok(guard) = self.inner.lock() {
            if let Some(items) = guard.as_ref() {
                let _ = items.hide_fs_item.set_checked(checked);
            }
        }
    }
}

pub fn setup_tray(
    app: &App,
    notch_state: NotchState,
    tray_handles: TrayHandles,
) -> tauri::Result<()> {
    let initial_pinned = notch_state.pinned.load(Ordering::Relaxed);
    let initial_hide_fs = notch_state.hide_in_fullscreen.load(Ordering::Relaxed);

    let ask_item = MenuItem::with_id(
        app,
        MENU_ASK_NUSA_ID,
        "Ask Nusa (Ctrl+Alt+Space)",
        true,
        None::<&str>,
    )?;
    let settings_item =
        MenuItem::with_id(app, MENU_SETTINGS_ID, "Settings...", true, None::<&str>)?;
    let sep_top = PredefinedMenuItem::separator(app)?;
    let pin_item = CheckMenuItem::with_id(
        app,
        MENU_PIN_ID,
        "Pin Notch Open",
        true,
        initial_pinned,
        None::<&str>,
    )?;
    let hide_fs_item = CheckMenuItem::with_id(
        app,
        MENU_HIDE_FULLSCREEN_ID,
        "Hide in Full Screen",
        true,
        initial_hide_fs,
        None::<&str>,
    )?;
    let recenter_item =
        MenuItem::with_id(app, MENU_RECENTER_ID, "Recenter Notch", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, MENU_QUIT_ID, "Quit Nusa", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &ask_item,
            &settings_item,
            &sep_top,
            &pin_item,
            &hide_fs_item,
            &recenter_item,
            &separator,
            &quit_item,
        ],
    )?;

    if let Ok(mut guard) = tray_handles.inner.lock() {
        *guard = Some(TrayMenuItems {
            pin_item,
            hide_fs_item,
        });
    }

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Nusa")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_ASK_NUSA_ID => {
                let notch_state = app.state::<NotchState>();
                toggle_ask_nusa(app, &notch_state);
            }
            MENU_SETTINGS_ID => {
                spawn_open_settings_window(app.clone(), None);
            }
            MENU_PIN_ID => {
                let notch_state = app.state::<NotchState>();
                let tray_handles = app.state::<TrayHandles>();
                let next_pinned = !notch_state.pinned.load(Ordering::Relaxed);
                let _ = apply_pinned_state(app, &notch_state, &tray_handles, next_pinned);
            }
            MENU_HIDE_FULLSCREEN_ID => {
                let notch_state = app.state::<NotchState>();
                let tray_handles = app.state::<TrayHandles>();
                let next_hide = !notch_state.hide_in_fullscreen.load(Ordering::Relaxed);
                let _ = apply_hide_in_fullscreen(app, &notch_state, &tray_handles, next_hide);
            }
            MENU_RECENTER_ID => {
                let notch_state = app.state::<NotchState>();
                if let Some(window) = app.get_webview_window("notch") {
                    position_notch_top_center(&window);
                    if !notch_state.fullscreen_hidden.load(Ordering::Relaxed) {
                        let _ = window.show();
                    }
                }
            }
            MENU_QUIT_ID => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let notch_state = app.state::<NotchState>();
                let tray_handles = app.state::<TrayHandles>();
                let next_pinned = !notch_state.pinned.load(Ordering::Relaxed);
                let _ = apply_pinned_state(app, &notch_state, &tray_handles, next_pinned);
                if next_pinned {
                    if let Some(window) = app.get_webview_window("notch") {
                        position_notch_top_center(&window);
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
