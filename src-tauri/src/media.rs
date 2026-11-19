use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const MEDIA_POLL_INTERVAL_MS: u64 = 500;

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrackState {
    pub has_session: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_app: String,
    pub thumbnail: Option<String>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub sampled_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeState {
    pub level: f32,
    pub muted: bool,
}

impl Default for VolumeState {
    fn default() -> Self {
        Self {
            level: 0.75,
            muted: false,
        }
    }
}

#[derive(Clone, Default)]
pub struct MediaState {
    pub current: Arc<Mutex<MediaTrackState>>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn start_media_watcher(app: AppHandle, state: MediaState) {
    thread::spawn(move || {
        #[cfg(target_os = "windows")]
        win_impl::init_com_mta();

        let mut cached_thumb_key = String::new();
        let mut cached_thumb_data: Option<String> = None;
        let mut last_emitted: Option<MediaTrackState> = None;

        loop {
            let snapshot = poll_media_snapshot(&mut cached_thumb_key, &mut cached_thumb_data);

            if let Ok(mut guard) = state.current.lock() {
                *guard = snapshot.clone();
            }

            let should_emit = match &last_emitted {
                None => true,
                Some(prev) => {
                    prev.has_session != snapshot.has_session
                        || prev.is_playing != snapshot.is_playing
                        || prev.title != snapshot.title
                        || prev.artist != snapshot.artist
                        || prev.album != snapshot.album
                        || prev.thumbnail != snapshot.thumbnail
                        || prev.duration_ms != snapshot.duration_ms
                        || prev.position_ms.abs_diff(snapshot.position_ms) >= 450
                }
            };

            if should_emit {
                let _ = app.emit("media:update", snapshot.clone());
                last_emitted = Some(snapshot);
            }

            thread::sleep(Duration::from_millis(MEDIA_POLL_INTERVAL_MS));
        }
    });
}

#[tauri::command]
pub fn get_media_state(state: State<'_, MediaState>) -> MediaTrackState {
    state
        .current
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn media_toggle_play() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::control_toggle_play()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn media_next() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::control_next()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn media_previous() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::control_previous()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn media_seek(position_ms: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::control_seek(position_ms)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = position_ms;
        Ok(())
    }
}

#[tauri::command]
pub fn get_system_volume() -> Result<VolumeState, String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_volume()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(VolumeState::default())
    }
}

#[tauri::command]
pub fn set_system_volume(level: f32) -> Result<VolumeState, String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::set_volume(level)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(VolumeState {
            level: level.clamp(0.0, 1.0),
            muted: false,
        })
    }
}

#[tauri::command]
pub fn toggle_system_mute() -> Result<VolumeState, String> {
    #[cfg(target_os = "windows")]
    {
        win_impl::toggle_mute()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(VolumeState::default())
    }
}

fn poll_media_snapshot(
    cached_thumb_key: &mut String,
    cached_thumb_data: &mut Option<String>,
) -> MediaTrackState {
    #[cfg(target_os = "windows")]
    {
        win_impl::read_snapshot(cached_thumb_key, cached_thumb_data)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (cached_thumb_key, cached_thumb_data);
        MediaTrackState {
            sampled_at_ms: now_unix_ms(),
            ..Default::default()
        }
    }
}

#[cfg(target_os = "windows")]
mod win_impl {
    use super::{now_unix_ms, MediaTrackState, VolumeState};
    use base64::Engine;
    use std::time::{SystemTime, UNIX_EPOCH};
    use windows::{
        Media::Control::{
            GlobalSystemMediaTransportControlsSession,
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        },
        Storage::Streams::{DataReader, IRandomAccessStreamReference},
        Win32::{
            Foundation::BOOL,
            Media::Audio::{
                eConsole, eRender,
                Endpoints::IAudioEndpointVolume,
                IMMDeviceEnumerator, MMDeviceEnumerator,
            },
            System::Com::{
                CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
            },
        },
    };

    const WINDOWS_TO_UNIX_EPOCH_SECS: i64 = 11_644_473_600;
    const MAX_THUMBNAIL_BYTES: usize = 4 * 1024 * 1024;

    pub fn init_com_mta() {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    fn now_filetime_100ns() -> i64 {
        let dur = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        (dur.as_secs() as i64 + WINDOWS_TO_UNIX_EPOCH_SECS) * 10_000_000
            + (dur.subsec_nanos() as i64 / 100)
    }

    fn pick_best_session(
        manager: &GlobalSystemMediaTransportControlsSessionManager,
    ) -> Option<GlobalSystemMediaTransportControlsSession> {
        if let Ok(sessions) = manager.GetSessions() {
            if let Ok(count) = sessions.Size() {
                for idx in 0..count {
                    if let Ok(session) = sessions.GetAt(idx) {
                        if let Ok(info) = session.GetPlaybackInfo() {
                            if let Ok(status) = info.PlaybackStatus() {
                                if status
                                    == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                                {
                                    return Some(session);
                                }
                            }
                        }
                    }
                }
            }
        }
        manager.GetCurrentSession().ok()
    }

    fn detect_mime(bytes: &[u8]) -> &'static str {
        if bytes.len() >= 8 && bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            "image/png"
        } else if bytes.len() >= 3 && bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "image/jpeg"
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            "image/webp"
        } else {
            "image/png"
        }
    }

    fn read_thumbnail_data_url(thumb_ref: &IRandomAccessStreamReference) -> Option<String> {
        let stream = thumb_ref.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as usize;
        if size == 0 || size > MAX_THUMBNAIL_BYTES {
            return None;
        }
        let input = stream.GetInputStreamAt(0).ok()?;
        let reader = DataReader::CreateDataReader(&input).ok()?;
        let loaded = reader.LoadAsync(size as u32).ok()?.get().ok()? as usize;
        if loaded == 0 {
            return None;
        }
        let mut bytes = vec![0u8; loaded];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = detect_mime(&bytes);
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Some(format!("data:{mime};base64,{encoded}"))
    }

    pub fn read_snapshot(
        cached_thumb_key: &mut String,
        cached_thumb_data: &mut Option<String>,
    ) -> MediaTrackState {
        let sampled_at_ms = now_unix_ms();

        let Ok(manager_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        else {
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        };
        let Ok(manager) = manager_op.get() else {
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        };

        let Some(session) = pick_best_session(&manager) else {
            cached_thumb_key.clear();
            *cached_thumb_data = None;
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        };

        let source_app = session
            .SourceAppUserModelId()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();

        let is_playing = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .map(|status| {
                status
                    == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
            })
            .unwrap_or(false);

        let Ok(props_op) = session.TryGetMediaPropertiesAsync() else {
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        };
        let Ok(props) = props_op.get() else {
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        };

        let title = props
            .Title()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist = props
            .Artist()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default()
            .trim()
            .to_string();
        let album = props
            .AlbumTitle()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default()
            .trim()
            .to_string();

        if title.is_empty() && artist.is_empty() {
            cached_thumb_key.clear();
            *cached_thumb_data = None;
            return MediaTrackState {
                sampled_at_ms,
                ..Default::default()
            };
        }

        let thumb_key = format!("{source_app}|{title}|{artist}|{album}");
        if *cached_thumb_key != thumb_key || cached_thumb_data.is_none() {
            let loaded_thumb = props
                .Thumbnail()
                .ok()
                .and_then(|thumb_ref| read_thumbnail_data_url(&thumb_ref));
            *cached_thumb_key = thumb_key;
            *cached_thumb_data = loaded_thumb;
        }

        let (position_ms, duration_ms) = if let Ok(timeline) = session.GetTimelineProperties() {
            let start_100ns = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
            let end_100ns = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
            let raw_pos_100ns = timeline.Position().map(|t| t.Duration).unwrap_or(0);
            let last_updated_100ns = timeline
                .LastUpdatedTime()
                .map(|dt| dt.UniversalTime)
                .unwrap_or(0);

            let dur_ms = ((end_100ns - start_100ns).max(0) / 10_000) as u64;
            let mut pos_ms = ((raw_pos_100ns - start_100ns).max(0) / 10_000) as u64;

            if is_playing && last_updated_100ns > 0 {
                let now_ft = now_filetime_100ns();
                let delta_ms = ((now_ft - last_updated_100ns).max(0) / 10_000) as u64;
                if dur_ms == 0 || delta_ms <= dur_ms.saturating_add(15_000) {
                    pos_ms = pos_ms.saturating_add(delta_ms);
                }
            }

            if dur_ms > 0 {
                pos_ms = pos_ms.min(dur_ms);
            }

            (pos_ms, dur_ms)
        } else {
            (0, 0)
        };

        MediaTrackState {
            has_session: true,
            is_playing,
            title,
            artist,
            album,
            source_app,
            thumbnail: cached_thumb_data.clone(),
            position_ms,
            duration_ms,
            sampled_at_ms,
        }
    }

    fn with_active_session<F>(action: F) -> Result<(), String>
    where
        F: FnOnce(&GlobalSystemMediaTransportControlsSession) -> Result<(), String>,
    {
        init_com_mta();
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let Some(session) = pick_best_session(&manager) else {
            return Err("No active media session".to_string());
        };
        action(&session)
    }

    pub fn control_toggle_play() -> Result<(), String> {
        with_active_session(|session| {
            let _ = session
                .TryTogglePlayPauseAsync()
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(())
        })
    }

    pub fn control_next() -> Result<(), String> {
        with_active_session(|session| {
            let _ = session
                .TrySkipNextAsync()
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(())
        })
    }

    pub fn control_previous() -> Result<(), String> {
        with_active_session(|session| {
            let _ = session
                .TrySkipPreviousAsync()
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(())
        })
    }

    pub fn control_seek(position_ms: u64) -> Result<(), String> {
        with_active_session(|session| {
            let start_100ns = session
                .GetTimelineProperties()
                .and_then(|t| t.StartTime())
                .map(|t| t.Duration)
                .unwrap_or(0);
            let target_100ns =
                start_100ns.saturating_add((position_ms as i64).saturating_mul(10_000));
            let _ = session
                .TryChangePlaybackPositionAsync(target_100ns)
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(())
        })
    }

    fn get_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
        init_com_mta();
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| e.to_string())?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| e.to_string())?;
            device
                .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
                .map_err(|e| e.to_string())
        }
    }

    pub fn get_volume() -> Result<VolumeState, String> {
        let ep = get_endpoint_volume()?;
        unsafe {
            let level = ep.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
            let muted = ep.GetMute().map_err(|e| e.to_string())?.as_bool();
            Ok(VolumeState { level, muted })
        }
    }

    pub fn set_volume(level: f32) -> Result<VolumeState, String> {
        let ep = get_endpoint_volume()?;
        let clamped = level.clamp(0.0, 1.0);
        unsafe {
            ep.SetMasterVolumeLevelScalar(clamped, std::ptr::null())
                .map_err(|e| e.to_string())?;
            if clamped > 0.0 {
                let _ = ep.SetMute(BOOL::from(false), std::ptr::null());
            }
            let muted = ep.GetMute().map_err(|e| e.to_string())?.as_bool();
            Ok(VolumeState {
                level: clamped,
                muted,
            })
        }
    }

    pub fn toggle_mute() -> Result<VolumeState, String> {
        let ep = get_endpoint_volume()?;
        unsafe {
            let currently_muted = ep.GetMute().map_err(|e| e.to_string())?.as_bool();
            let next_muted = !currently_muted;
            ep.SetMute(BOOL::from(next_muted), std::ptr::null())
                .map_err(|e| e.to_string())?;
            let level = ep.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
            Ok(VolumeState {
                level,
                muted: next_muted,
            })
        }
    }
}
