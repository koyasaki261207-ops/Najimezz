mod ai;
mod fullscreen;
mod lyrics;
mod media;
mod notch_window;
mod settings;
mod shelf;
mod shortcut;
mod tray;
mod weather;

use ai::{
    ai_send_message, clear_ai_api_key, get_ai_config, load_initial_ai_config, open_external_url,
    save_ai_api_key, update_ai_settings, AiState,
};
use lyrics::{fetch_lyrics, LyricsCache};
use media::{
    get_media_state, get_system_volume, media_next, media_previous, media_seek, media_toggle_play,
    set_system_volume, start_media_watcher, toggle_system_mute, MediaState,
};
use notch_window::{
    clear_ask_open_on_blur, dismiss_ask_nusa, focus_notch_window, get_notch_preferences,
    get_notch_state, position_notch_top_center, quit_app, recenter_notch, set_ask_open,
    set_dragging_active, set_hide_in_fullscreen, set_notch_collapsed_wide, set_notch_expanded,
    set_notch_input_lock, set_notch_mega, set_notch_pinned, set_notch_tall, start_hover_tracker,
    NotchState,
};
use settings::{
    get_app_settings, load_app_settings, open_settings_window, take_pending_settings_tab,
    update_app_settings, SettingsState,
};
use shelf::{
    add_paths_internal, add_shelf_paths, clear_shelf, copy_shelf_files, get_shelf_items,
    load_initial_items, open_shelf_item, pick_shelf_files, remove_shelf_item, reveal_shelf_item,
    ShelfDragPayload, ShelfState,
};
use shortcut::{
    apply_ask_shortcut_enabled, build_shortcut_plugin, get_ask_shortcut_status,
    ShortcutStatusState,
};
use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};
use tray::{setup_tray, TrayHandles};
use weather::{fetch_weather, WeatherCache};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let notch_state = NotchState::default();
    let settings_state = SettingsState::default();
    let tray_handles = TrayHandles::default();
    let shortcut_status = ShortcutStatusState::default();
    let media_state = MediaState::default();
    let lyrics_cache = LyricsCache::default();
    let weather_cache = WeatherCache::default();
    let shelf_state = ShelfState::default();
    let ai_state = AiState::default();

    tauri::Builder::default()
        .plugin(build_shortcut_plugin())
        .manage(notch_state.clone())
        .manage(settings_state.clone())
        .manage(tray_handles.clone())
        .manage(shortcut_status.clone())
        .manage(media_state.clone())
        .manage(lyrics_cache)
        .manage(weather_cache)
        .manage(shelf_state.clone())
        .manage(ai_state.clone())
        .setup(move |app| {
            let loaded_settings = load_app_settings(app.handle(), &settings_state, &notch_state);
            load_initial_items(app.handle(), &shelf_state, loaded_settings.shelf_start_empty);
            load_initial_ai_config(app.handle(), &ai_state);
            setup_tray(app, notch_state.clone(), tray_handles.clone())?;
            apply_ask_shortcut_enabled(
                app.handle(),
                &shortcut_status,
                loaded_settings.ask_shortcut_enabled,
            );
            if let Some(window) = app.get_webview_window("notch") {
                position_notch_top_center(&window);
                let _ = window.set_ignore_cursor_events(true);
            }
            start_hover_tracker(app.handle().clone(), notch_state.clone());
            start_media_watcher(app.handle().clone(), media_state.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "notch" {
                return;
            }
            match event {
                WindowEvent::Focused(false) => {
                    let app = window.app_handle();
                    let notch_state = app.state::<NotchState>();
                    clear_ask_open_on_blur(&notch_state);
                }
                WindowEvent::DragDrop(drag_event) => {
                    let app = window.app_handle();
                    let notch_state = app.state::<NotchState>();
                    let shelf_state = app.state::<ShelfState>();

                    match drag_event {
                        DragDropEvent::Enter { paths, .. } => {
                            set_dragging_active(app, &notch_state, true);
                            let _ = app.emit(
                                "shelf:drag-hover",
                                ShelfDragPayload {
                                    hovering: true,
                                    count: paths.len(),
                                },
                            );
                        }
                        DragDropEvent::Over { .. } => {
                            set_dragging_active(app, &notch_state, true);
                        }
                        DragDropEvent::Drop { paths, .. } => {
                            set_dragging_active(app, &notch_state, false);
                            add_paths_internal(app, &shelf_state, paths.clone());
                            let _ = app.emit(
                                "shelf:drag-hover",
                                ShelfDragPayload {
                                    hovering: false,
                                    count: 0,
                                },
                            );
                        }
                        DragDropEvent::Leave => {
                            set_dragging_active(app, &notch_state, false);
                            let _ = app.emit(
                                "shelf:drag-hover",
                                ShelfDragPayload {
                                    hovering: false,
                                    count: 0,
                                },
                            );
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_notch_state,
            set_notch_expanded,
            dismiss_ask_nusa,
            set_ask_open,
            set_notch_pinned,
            get_notch_preferences,
            set_hide_in_fullscreen,
            set_notch_tall,
            set_notch_mega,
            set_notch_collapsed_wide,
            set_notch_input_lock,
            focus_notch_window,
            recenter_notch,
            quit_app,
            get_app_settings,
            update_app_settings,
            open_settings_window,
            take_pending_settings_tab,
            get_ask_shortcut_status,
            get_media_state,
            media_toggle_play,
            media_next,
            media_previous,
            media_seek,
            get_system_volume,
            set_system_volume,
            toggle_system_mute,
            fetch_lyrics,
            fetch_weather,
            get_shelf_items,
            add_shelf_paths,
            pick_shelf_files,
            remove_shelf_item,
            clear_shelf,
            open_shelf_item,
            reveal_shelf_item,
            copy_shelf_files,
            get_ai_config,
            save_ai_api_key,
            clear_ai_api_key,
            update_ai_settings,
            ai_send_message,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nusa application");
}
