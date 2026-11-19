mod lyrics;
mod media;
mod notch_window;

use lyrics::{fetch_lyrics, LyricsCache};
use media::{
    get_media_state, get_system_volume, media_next, media_previous, media_seek,
    media_toggle_play, set_system_volume, start_media_watcher, toggle_system_mute, MediaState,
};
use notch_window::{
    get_notch_state, position_notch_top_center, recenter_notch, set_notch_pinned,
    set_notch_tall, start_hover_tracker, NotchState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let notch_state = NotchState::default();
    let media_state = MediaState::default();
    let lyrics_cache = LyricsCache::default();

    tauri::Builder::default()
        .manage(notch_state.clone())
        .manage(media_state.clone())
        .manage(lyrics_cache)
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("notch") {
                position_notch_top_center(&window);
                let _ = window.set_ignore_cursor_events(true);
            }
            start_hover_tracker(app.handle().clone(), notch_state.clone());
            start_media_watcher(app.handle().clone(), media_state.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notch_state,
            set_notch_pinned,
            set_notch_tall,
            recenter_notch,
            get_media_state,
            media_toggle_play,
            media_next,
            media_previous,
            media_seek,
            get_system_volume,
            set_system_volume,
            toggle_system_mute,
            fetch_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nusa application");
}
