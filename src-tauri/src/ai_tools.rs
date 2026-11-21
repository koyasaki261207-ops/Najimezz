use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const MAX_CMD_OUTPUT_CHARS: usize = 6000;
const POWERSHELL_TIMEOUT_SECS: u64 = 20;

#[derive(Clone, Debug)]
pub struct ScreenCaptureResult {
    pub width: u32,
    pub height: u32,
    pub jpeg_base64: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NusaActionEvent {
    pub target: String,
    pub action: String,
    pub payload: Value,
}

pub fn get_local_datetime_info() -> Value {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::SystemInformation::GetLocalTime;
        let st = unsafe { GetLocalTime() };
        let weekday = match st.wDayOfWeek {
            0 => "Chủ Nhật",
            1 => "Thứ Hai",
            2 => "Thứ Ba",
            3 => "Thứ Tư",
            4 => "Thứ Năm",
            5 => "Thứ Sáu",
            6 => "Thứ Bảy",
            _ => "",
        };
        let date = format!("{:04}-{:02}-{:02}", st.wYear, st.wMonth, st.wDay);
        let time = format!("{:02}:{:02}:{:02}", st.wHour, st.wMinute, st.wSecond);
        json!({
            "date": date,
            "time": time,
            "weekday": weekday,
            "formatted": format!("{weekday}, {date} {time}")
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        json!({
            "date": "",
            "time": "",
            "weekday": "",
            "formatted": "Unavailable"
        })
    }
}

pub fn encode_powershell_utf16le(script: &str) -> String {
    let utf16_bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(utf16_bytes)
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let collected: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{collected}\n...(đã cắt bớt do quá dài)")
    } else {
        collected
    }
}

#[cfg(target_os = "windows")]
fn run_encoded_powershell(script: &str, timeout_secs: u64) -> Result<(i32, String, String), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let encoded = encode_powershell_utf16le(script);

    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            &encoded,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Không khởi chạy được PowerShell: {e}"))?;

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let stdout_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stdout_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let stderr_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stderr_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let mut timed_out = false;
    let exit_code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code().unwrap_or(-1),
            Ok(None) => {
                if Instant::now() >= deadline {
                    timed_out = true;
                    let _ = child.kill();
                    let _ = child.wait();
                    break -1;
                }
                thread::sleep(Duration::from_millis(40));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Lỗi theo dõi tiến trình PowerShell: {e}"));
            }
        }
    };

    let stdout_str = stdout_handle.join().unwrap_or_default();
    let stderr_str = stderr_handle.join().unwrap_or_default();

    if timed_out {
        return Err(format!(
            "Lệnh PowerShell đã quá thời gian chờ ({timeout_secs} giây) và bị dừng."
        ));
    }

    Ok((exit_code, stdout_str, stderr_str))
}

#[cfg(not(target_os = "windows"))]
fn run_encoded_powershell(
    _script: &str,
    _timeout_secs: u64,
) -> Result<(i32, String, String), String> {
    Err("Chỉ hỗ trợ PowerShell trên Windows".to_string())
}

pub fn run_user_confirmed_powershell(command: &str) -> Result<Value, String> {
    let wrapped = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n{command}"
    );
    let (exit_code, stdout, stderr) = run_encoded_powershell(&wrapped, POWERSHELL_TIMEOUT_SECS)?;
    Ok(json!({
        "approved": true,
        "exitCode": exit_code,
        "stdout": truncate_chars(stdout.trim(), MAX_CMD_OUTPUT_CHARS),
        "stderr": truncate_chars(stderr.trim(), MAX_CMD_OUTPUT_CHARS)
    }))
}

#[cfg(target_os = "windows")]
fn capture_primary_screen_gdi() -> Result<ScreenCaptureResult, String> {
    use std::ffi::c_void;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, GetDeviceCaps, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        DESKTOPHORZRES, DESKTOPVERTRES, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    let (src_w, src_h, bgra) = unsafe {
        let hdc_screen = GetDC(HWND::default());
        if hdc_screen.is_invalid() {
            return Err("Không lấy được Device Context của màn hình chính".to_string());
        }

        let mut width = GetDeviceCaps(hdc_screen, DESKTOPHORZRES);
        let mut height = GetDeviceCaps(hdc_screen, DESKTOPVERTRES);
        if width <= 0 || height <= 0 {
            width = GetSystemMetrics(SM_CXSCREEN);
            height = GetSystemMetrics(SM_CYSCREEN);
        }
        if width <= 0 || height <= 0 {
            let _ = ReleaseDC(HWND::default(), hdc_screen);
            return Err("Không xác định được độ phân giải màn hình".to_string());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_invalid() {
            let _ = ReleaseDC(HWND::default(), hdc_screen);
            return Err("Không khởi tạo được bộ đệm GDI tương thích".to_string());
        }

        let hbmp = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbmp.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND::default(), hdc_screen);
            return Err("Không khởi tạo được bitmap chụp màn hình".to_string());
        }

        let old_obj = SelectObject(hdc_mem, HGDIOBJ(hbmp.0));
        let blt_result = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);

        let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
        let dib_lines = if blt_result.is_ok() {
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: 0,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [Default::default()],
            };
            GetDIBits(
                hdc_mem,
                hbmp,
                0,
                height as u32,
                Some(pixels.as_mut_ptr() as *mut c_void),
                &mut bmi,
                DIB_RGB_COLORS,
            )
        } else {
            0
        };

        let _ = SelectObject(hdc_mem, old_obj);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND::default(), hdc_screen);

        if let Err(err) = blt_result {
            return Err(format!("BitBlt chụp màn hình thất bại: {err}"));
        }
        if dib_lines == 0 {
            return Err("GetDIBits không đọc được dữ liệu điểm ảnh màn hình".to_string());
        }

        (width as usize, height as usize, pixels)
    };

    const MAX_TARGET_WIDTH: usize = 1280;
    let (dst_w, dst_h) = if src_w > MAX_TARGET_WIDTH {
        let scaled_h = ((src_h as f64) * (MAX_TARGET_WIDTH as f64) / (src_w as f64))
            .round()
            .max(1.0) as usize;
        (MAX_TARGET_WIDTH, scaled_h)
    } else {
        (src_w, src_h)
    };

    let mut rgb = Vec::with_capacity(dst_w * dst_h * 3);
    if dst_w == src_w && dst_h == src_h {
        for chunk in bgra.chunks_exact(4) {
            rgb.push(chunk[2]);
            rgb.push(chunk[1]);
            rgb.push(chunk[0]);
        }
    } else {
        let x_ratio = (src_w as f64) / (dst_w as f64);
        let y_ratio = (src_h as f64) / (dst_h as f64);

        for y in 0..dst_h {
            let sy_f = (y as f64) * y_ratio;
            let sy0 = (sy_f.floor() as usize).min(src_h - 1);
            let sy1 = (sy0 + 1).min(src_h - 1);
            let fy = sy_f - (sy0 as f64);
            let row0 = sy0 * src_w;
            let row1 = sy1 * src_w;

            for x in 0..dst_w {
                let sx_f = (x as f64) * x_ratio;
                let sx0 = (sx_f.floor() as usize).min(src_w - 1);
                let sx1 = (sx0 + 1).min(src_w - 1);
                let fx = sx_f - (sx0 as f64);

                let i00 = (row0 + sx0) * 4;
                let i10 = (row0 + sx1) * 4;
                let i01 = (row1 + sx0) * 4;
                let i11 = (row1 + sx1) * 4;

                let w00 = (1.0 - fx) * (1.0 - fy);
                let w10 = fx * (1.0 - fy);
                let w01 = (1.0 - fx) * fy;
                let w11 = fx * fy;

                let r = (bgra[i00 + 2] as f64) * w00
                    + (bgra[i10 + 2] as f64) * w10
                    + (bgra[i01 + 2] as f64) * w01
                    + (bgra[i11 + 2] as f64) * w11;
                let g = (bgra[i00 + 1] as f64) * w00
                    + (bgra[i10 + 1] as f64) * w10
                    + (bgra[i01 + 1] as f64) * w01
                    + (bgra[i11 + 1] as f64) * w11;
                let b = (bgra[i00] as f64) * w00
                    + (bgra[i10] as f64) * w10
                    + (bgra[i01] as f64) * w01
                    + (bgra[i11] as f64) * w11;

                rgb.push(r.round().clamp(0.0, 255.0) as u8);
                rgb.push(g.round().clamp(0.0, 255.0) as u8);
                rgb.push(b.round().clamp(0.0, 255.0) as u8);
            }
        }
    }

    let mut jpeg_bytes = Vec::with_capacity(128 * 1024);
    let encoder = jpeg_encoder::Encoder::new(&mut jpeg_bytes, 78);
    encoder
        .encode(
            &rgb,
            dst_w as u16,
            dst_h as u16,
            jpeg_encoder::ColorType::Rgb,
        )
        .map_err(|e| format!("Lỗi nén ảnh JPEG chụp màn hình: {e}"))?;

    let jpeg_base64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);

    Ok(ScreenCaptureResult {
        width: dst_w as u32,
        height: dst_h as u32,
        jpeg_base64,
    })
}

pub fn capture_primary_screen(app: &AppHandle) -> Result<ScreenCaptureResult, String> {
    let notch_win = app.get_webview_window("notch");
    let was_visible = notch_win
        .as_ref()
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if was_visible {
        if let Some(ref w) = notch_win {
            let _ = w.hide();
        }
        thread::sleep(Duration::from_millis(110));
    }

    #[cfg(target_os = "windows")]
    let capture_res = capture_primary_screen_gdi();

    #[cfg(not(target_os = "windows"))]
    let capture_res: Result<ScreenCaptureResult, String> =
        Err("Chụp màn hình chỉ hỗ trợ trên Windows".to_string());

    if was_visible {
        if let Some(ref w) = notch_win {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }

    capture_res
}

pub fn read_clipboard_text() -> Result<String, String> {
    let script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $v = Get-Clipboard -Raw; if ($null -ne $v) { Write-Output $v }";
    let (exit_code, stdout, stderr) = run_encoded_powershell(script, 6)?;
    if exit_code != 0 {
        return Err(format!("Không đọc được Clipboard: {}", stderr.trim()));
    }
    Ok(truncate_chars(stdout.trim(), MAX_CMD_OUTPUT_CHARS))
}

pub fn write_clipboard_text(text: &str) -> Result<(), String> {
    let b64 = base64::engine::general_purpose::STANDARD.encode(text.as_bytes());
    let script = format!(
        "$bytes = [Convert]::FromBase64String('{b64}'); $txt = [System.Text.Encoding]::UTF8.GetString($bytes); Set-Clipboard -Value $txt"
    );
    let (exit_code, _stdout, stderr) = run_encoded_powershell(&script, 6)?;
    if exit_code != 0 {
        return Err(format!("Không ghi được vào Clipboard: {}", stderr.trim()));
    }
    Ok(())
}

pub fn open_app_or_url(raw_target: &str) -> Result<String, String> {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() {
        return Err("Thiếu tên ứng dụng hoặc đường dẫn cần mở".to_string());
    }

    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let lower = trimmed.to_lowercase();

    let resolved = match lower.as_str() {
        "chrome" | "google chrome" => "chrome.exe".to_string(),
        "edge" | "microsoft edge" => "msedge.exe".to_string(),
        "notepad" | "ghi chú" => "notepad.exe".to_string(),
        "calc" | "calculator" | "máy tính" => "calc.exe".to_string(),
        "explorer" | "file explorer" | "thư mục" => "explorer.exe".to_string(),
        "cmd" | "command prompt" => "cmd.exe".to_string(),
        "powershell" | "terminal" => "powershell.exe".to_string(),
        "vscode" | "vs code" | "visual studio code" | "code" => "code".to_string(),
        "paint" | "mspaint" => "mspaint.exe".to_string(),
        "taskmgr" | "task manager" => "taskmgr.exe".to_string(),
        "settings" | "cài đặt windows" | "windows settings" => "ms-settings:".to_string(),
        "snipping" | "snippingtool" | "snipping tool" => "snippingtool.exe".to_string(),
        "spotify" => "spotify:".to_string(),
        "discord" => "discord:".to_string(),
        "youtube" => "https://www.youtube.com".to_string(),
        "google" => "https://www.google.com".to_string(),
        "facebook" => "https://www.facebook.com".to_string(),
        "gmail" => "https://mail.google.com".to_string(),
        "github" => "https://github.com".to_string(),
        "downloads" | "tải xuống" if !user_profile.is_empty() => {
            format!(r"{user_profile}\Downloads")
        }
        "desktop" | "màn hình chính" if !user_profile.is_empty() => {
            format!(r"{user_profile}\Desktop")
        }
        "documents" | "tài liệu" if !user_profile.is_empty() => {
            format!(r"{user_profile}\Documents")
        }
        _ => trimmed.to_string(),
    };

    #[cfg(target_os = "windows")]
    {
        use windows::core::{w, HSTRING, PCWSTR};
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let target_h = HSTRING::from(resolved.as_str());
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                w!("open"),
                &target_h,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res.0 as isize) <= 32 {
            return Err(format!(
                "Không thể mở \"{resolved}\" (mã Windows {})",
                res.0 as isize
            ));
        }
    }

    Ok(resolved)
}

pub fn execute_media_action(action: &str) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
            VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
        };

        let vk = match action.trim().to_lowercase().as_str() {
            "toggle_play" | "play" | "pause" => VK_MEDIA_PLAY_PAUSE,
            "next" => VK_MEDIA_NEXT_TRACK,
            "previous" | "prev" => VK_MEDIA_PREV_TRACK,
            other => return Err(format!("Hành động media không hỗ trợ: {other}")),
        };

        let inputs = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(vk.0),
                        ..Default::default()
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(vk.0),
                        dwFlags: KEYEVENTF_KEYUP,
                        ..Default::default()
                    },
                },
            },
        ];

        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent != 2 {
            return Err("Không gửi được tín hiệu điều khiển media".to_string());
        }
        Ok(json!({ "status": "ok", "action": action }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(format!("Không hỗ trợ điều khiển media ({action}) trên hệ điều hành này"))
    }
}

pub fn execute_volume_action(action: &str, level: Option<i64>) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::BOOL;
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::Media::Audio::{
            eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        };

        unsafe {
            let init_hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            let should_uninit = init_hr.is_ok();

            let result = (|| -> Result<Value, String> {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                        .map_err(|e| format!("Lỗi khởi tạo Audio COM: {e}"))?;
                let device = enumerator
                    .GetDefaultAudioEndpoint(eRender, eMultimedia)
                    .map_err(|e| format!("Không tìm thấy loa mặc định: {e}"))?;
                let endpoint: IAudioEndpointVolume = device
                    .Activate(CLSCTX_ALL, None)
                    .map_err(|e| format!("Không truy cập được âm lượng hệ thống: {e}"))?;

                let current_scalar = endpoint
                    .GetMasterVolumeLevelScalar()
                    .map_err(|e| format!("Không đọc được âm lượng: {e}"))?;
                let current_pct = (current_scalar * 100.0).round() as i64;
                let current_muted = endpoint
                    .GetMute()
                    .map_err(|e| format!("Không đọc được trạng thái tắt tiếng: {e}"))?
                    .as_bool();

                match action.trim().to_lowercase().as_str() {
                    "get" => Ok(json!({
                        "volumePercent": current_pct,
                        "muted": current_muted
                    })),
                    "set" => {
                        let target = level.unwrap_or(current_pct).clamp(0, 100);
                        endpoint
                            .SetMasterVolumeLevelScalar(target as f32 / 100.0, std::ptr::null())
                            .map_err(|e| format!("Không đặt được âm lượng: {e}"))?;
                        if target > 0 && current_muted {
                            let _ = endpoint.SetMute(BOOL(0), std::ptr::null());
                        }
                        Ok(json!({
                            "volumePercent": target,
                            "muted": false
                        }))
                    }
                    "up" => {
                        let step = level.unwrap_or(10).clamp(1, 50);
                        let target = (current_pct + step).min(100);
                        endpoint
                            .SetMasterVolumeLevelScalar(target as f32 / 100.0, std::ptr::null())
                            .map_err(|e| format!("Không tăng được âm lượng: {e}"))?;
                        if current_muted {
                            let _ = endpoint.SetMute(BOOL(0), std::ptr::null());
                        }
                        Ok(json!({
                            "volumePercent": target,
                            "muted": false
                        }))
                    }
                    "down" => {
                        let step = level.unwrap_or(10).clamp(1, 50);
                        let target = (current_pct - step).max(0);
                        endpoint
                            .SetMasterVolumeLevelScalar(target as f32 / 100.0, std::ptr::null())
                            .map_err(|e| format!("Không giảm được âm lượng: {e}"))?;
                        Ok(json!({
                            "volumePercent": target,
                            "muted": current_muted
                        }))
                    }
                    "mute" => {
                        endpoint
                            .SetMute(BOOL(1), std::ptr::null())
                            .map_err(|e| format!("Không tắt tiếng được: {e}"))?;
                        Ok(json!({
                            "volumePercent": current_pct,
                            "muted": true
                        }))
                    }
                    "unmute" => {
                        endpoint
                            .SetMute(BOOL(0), std::ptr::null())
                            .map_err(|e| format!("Không bật tiếng được: {e}"))?;
                        Ok(json!({
                            "volumePercent": current_pct,
                            "muted": false
                        }))
                    }
                    "toggle_mute" => {
                        let next = !current_muted;
                        endpoint
                            .SetMute(BOOL(if next { 1 } else { 0 }), std::ptr::null())
                            .map_err(|e| format!("Không đổi được tắt tiếng: {e}"))?;
                        Ok(json!({
                            "volumePercent": current_pct,
                            "muted": next
                        }))
                    }
                    other => Err(format!("Hành động âm lượng không hỗ trợ: {other}")),
                }
            })();

            if should_uninit {
                CoUninitialize();
            }
            result
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(format!("Không hỗ trợ chỉnh âm lượng ({action}, {level:?})"))
    }
}

pub fn dispatch_nusa_action(
    app: &AppHandle,
    target: &str,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    let evt = NusaActionEvent {
        target: target.to_string(),
        action: action.to_string(),
        payload: payload.clone(),
    };
    app.emit("ai:nusa-action", evt)
        .map_err(|e| format!("Không gửi được lệnh sang Nusa UI: {e}"))?;
    Ok(json!({
        "status": "ok",
        "target": target,
        "action": action,
        "payload": payload
    }))
}
