use crate::notch_window::NotchState;
use serde::Serialize;
use std::sync::{
    atomic::Ordering,
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const MASCOT_POLL_MS: u64 = 350;
const STARTUP_WAVE_DELAY_MS: u64 = 850;
const WAVE_DURATION_MS: u64 = 2_800;
const HAPPY_DURATION_MS: u64 = 2_800;
const PREVIEW_IDLE_DURATION_MS: u64 = 3_400;
const AWAKE_IDLE_THRESHOLD_MS: u64 = 10_000;
const SLEEPY_IDLE_THRESHOLD_MS: u64 = 35_000;
const SLEEPING_IDLE_THRESHOLD_MS: u64 = 65_000;
const RETURN_ACTIVE_THRESHOLD_MS: u64 = 2_500;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MascotPayload {
    pub mood: String,
    pub peeking: bool,
}

impl Default for MascotPayload {
    fn default() -> Self {
        Self {
            mood: "hidden".to_string(),
            peeking: false,
        }
    }
}

struct MascotInner {
    current: MascotPayload,
    override_mood: Option<(String, Instant)>,
}

impl Default for MascotInner {
    fn default() -> Self {
        Self {
            current: MascotPayload::default(),
            override_mood: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct MascotState {
    inner: Arc<Mutex<MascotInner>>,
}

fn idle_duration_ms() -> u64 {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_idle_ms()
    }
    #[cfg(not(target_os = "windows"))]
    {
        0
    }
}

#[cfg(target_os = "windows")]
mod win_impl {
    use std::mem::size_of;
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn get_idle_ms() -> u64 {
        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut info).as_bool() {
                let now = GetTickCount();
                now.wrapping_sub(info.dwTime) as u64
            } else {
                0
            }
        }
    }
}

fn normalize_reaction_mood(raw: &str) -> (&'static str, u64) {
    match raw.trim().to_lowercase().as_str() {
        "happy" => ("happy", HAPPY_DURATION_MS),
        "awake" => ("awake", PREVIEW_IDLE_DURATION_MS),
        "sleepy" => ("sleepy", PREVIEW_IDLE_DURATION_MS),
        "sleeping" => ("sleeping", PREVIEW_IDLE_DURATION_MS),
        _ => ("wave", WAVE_DURATION_MS),
    }
}

pub fn set_override_reaction(
    app: &AppHandle,
    notch_state: &NotchState,
    mascot_state: &MascotState,
    raw_mood: &str,
) -> MascotPayload {
    if !notch_state.show_mascot.load(Ordering::Relaxed)
        || notch_state.fullscreen_hidden.load(Ordering::Relaxed)
    {
        notch_state.mascot_peek.store(false, Ordering::Relaxed);
        return MascotPayload::default();
    }

    let (mood, duration_ms) = normalize_reaction_mood(raw_mood);
    let expanded = notch_state.expanded.load(Ordering::Relaxed);
    let payload = MascotPayload {
        mood: mood.to_string(),
        peeking: !expanded,
    };

    if let Ok(mut guard) = mascot_state.inner.lock() {
        guard.override_mood = Some((
            mood.to_string(),
            Instant::now() + Duration::from_millis(duration_ms),
        ));
        guard.current = payload.clone();
    }

    notch_state
        .mascot_peek
        .store(payload.peeking, Ordering::Relaxed);
    let _ = app.emit("mascot:state", payload.clone());
    payload
}

pub fn start_mascot_watcher(app: AppHandle, notch_state: NotchState, mascot_state: MascotState) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(STARTUP_WAVE_DELAY_MS));

        if notch_state.show_mascot.load(Ordering::Relaxed)
            && !notch_state.fullscreen_hidden.load(Ordering::Relaxed)
        {
            set_override_reaction(&app, &notch_state, &mascot_state, "wave");
        }

        let mut was_resting = false;
        let mut last_emitted = MascotPayload::default();

        if let Ok(guard) = mascot_state.inner.lock() {
            last_emitted = guard.current.clone();
        }

        loop {
            thread::sleep(Duration::from_millis(MASCOT_POLL_MS));

            let show_mascot = notch_state.show_mascot.load(Ordering::Relaxed);
            let fullscreen_hidden = notch_state.fullscreen_hidden.load(Ordering::Relaxed);
            let expanded = notch_state.expanded.load(Ordering::Relaxed);

            if !show_mascot || fullscreen_hidden {
                was_resting = false;
                let hidden = MascotPayload::default();
                if let Ok(mut guard) = mascot_state.inner.lock() {
                    guard.override_mood = None;
                    guard.current = hidden.clone();
                }
                notch_state.mascot_peek.store(false, Ordering::Relaxed);
                if last_emitted != hidden {
                    let _ = app.emit("mascot:state", hidden.clone());
                    last_emitted = hidden;
                }
                continue;
            }

            let idle_ms = idle_duration_ms();
            if idle_ms >= SLEEPY_IDLE_THRESHOLD_MS {
                was_resting = true;
            }

            let now = Instant::now();
            let mut next_payload = MascotPayload::default();

            if let Ok(mut guard) = mascot_state.inner.lock() {
                if was_resting && idle_ms < RETURN_ACTIVE_THRESHOLD_MS {
                    was_resting = false;
                    guard.override_mood = Some((
                        "wave".to_string(),
                        now + Duration::from_millis(WAVE_DURATION_MS),
                    ));
                }

                let active_override = match &guard.override_mood {
                    Some((mood, until)) if now < *until => Some(mood.clone()),
                    _ => {
                        guard.override_mood = None;
                        None
                    }
                };

                next_payload = if let Some(override_mood) = active_override {
                    MascotPayload {
                        mood: override_mood,
                        peeking: !expanded,
                    }
                } else if idle_ms >= SLEEPING_IDLE_THRESHOLD_MS {
                    MascotPayload {
                        mood: "sleeping".to_string(),
                        peeking: false,
                    }
                } else if idle_ms >= SLEEPY_IDLE_THRESHOLD_MS {
                    MascotPayload {
                        mood: "sleepy".to_string(),
                        peeking: false,
                    }
                } else if idle_ms >= AWAKE_IDLE_THRESHOLD_MS {
                    MascotPayload {
                        mood: "awake".to_string(),
                        peeking: false,
                    }
                } else {
                    MascotPayload::default()
                };

                guard.current = next_payload.clone();
            }

            notch_state
                .mascot_peek
                .store(next_payload.peeking && !expanded, Ordering::Relaxed);

            if last_emitted != next_payload {
                let _ = app.emit("mascot:state", next_payload.clone());
                last_emitted = next_payload;
            }
        }
    });
}

#[tauri::command]
pub fn get_mascot_state(state: State<'_, MascotState>) -> MascotPayload {
    state
        .inner
        .lock()
        .map(|g| g.current.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn trigger_mascot_reaction(
    app: AppHandle,
    notch_state: State<'_, NotchState>,
    mascot_state: State<'_, MascotState>,
    mood: String,
) -> MascotPayload {
    set_override_reaction(&app, &notch_state, &mascot_state, &mood)
}
