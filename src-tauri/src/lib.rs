mod lyrics;
mod media;
mod notch_window;
mod shelf;
mod weather;

use lyrics::{fetch_lyrics, LyricsCache};
use media::{
    get_media_state, get_system_volume, media_next, media_previous, media_seek, media_toggle_play,
    set_system_volume, start_media_watcher, toggle_system_mute, MediaState,
};
use notch_window::{
    get_notch_state, position_notch_top_center, recenter_notch, set_dragging_active,
    set_notch_collapsed_wide, set_notch_pinned, set_notch_tall, start_hover_tracker, NotchState,
};
use shelf::{
    add_paths_internal, add_shelf_paths, clear_shelf, copy_shelf_files, get_shelf_items,
    load_initial_items, open_shelf_item, pick_shelf_files, remove_shelf_item, reveal_shelf_item,
    ShelfDragPayload, ShelfState,
};
use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};
use weather::{fetch_weather, WeatherCache};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let notch_state = NotchState::default();
    let media_state = MediaState::default();
    let lyrics_cache = LyricsCache::default();
    let weather_cache = WeatherCache::default();
    let shelf_state = ShelfState::default();

    tauri::Builder::default()
        .manage(notch_state.clone())
        .manage(media_state.clone())
        .manage(lyrics_cache)
        .manage(weather_cache)
        .manage(shelf_state.clone())
        .setup(move |app| {
            load_initial_items(app.handle(), &shelf_state);
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
            if let WindowEvent::DragDrop(drag_event) = event {
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
        })
        .invoke_handler(tauri::generate_handler![
            get_notch_state,
            set_notch_pinned,
            set_notch_tall,
            set_notch_collapsed_wide,
            recenter_notch,
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
            copy_shelf_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nusa application");
}
