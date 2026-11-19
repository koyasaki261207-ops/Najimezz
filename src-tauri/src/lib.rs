mod notch_window;

use notch_window::{
    get_notch_state, position_notch_top_center, recenter_notch, set_notch_pinned,
    start_hover_tracker, NotchState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let notch_state = NotchState::default();

    tauri::Builder::default()
        .manage(notch_state.clone())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("notch") {
                position_notch_top_center(&window);
                let _ = window.set_ignore_cursor_events(true);
            }
            start_hover_tracker(app.handle().clone(), notch_state.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notch_state,
            set_notch_pinned,
            recenter_notch
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nusa application");
}
