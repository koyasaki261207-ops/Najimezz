pub fn is_fullscreen_active() -> bool {
    #[cfg(target_os = "windows")]
    {
        win_impl::detect_primary_monitor_fullscreen()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
mod win_impl {
    use std::mem::size_of;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_STYLE, WS_CAPTION, WS_THICKFRAME,
    };

    const MONITORINFOF_PRIMARY_FLAG: u32 = 1;
    const EDGE_TOLERANCE_PX: i32 = 2;

    const IGNORED_SHELL_CLASSES: &[&str] = &[
        "Progman",
        "WorkerW",
        "Shell_TrayWnd",
        "Shell_SecondaryTrayWnd",
        "Shell_InputSwitchTopLevelWindow",
        "NotifyIconOverflowWindow",
        "TopLevelWindowForOverflowXamlIsland",
        "XamlExplorerHostIslandWindow",
        "Windows.UI.Core.CoreWindow",
    ];

    pub fn detect_primary_monitor_fullscreen() -> bool {
        unsafe {
            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE {
                    return true;
                }
            }

            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return false;
            }
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                return false;
            }

            let mut fg_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
            if fg_pid == 0 || fg_pid == GetCurrentProcessId() {
                return false;
            }

            let mut class_buf = [0u16; 256];
            let class_len = GetClassNameW(hwnd, &mut class_buf);
            if class_len > 0 {
                let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
                if IGNORED_SHELL_CLASSES
                    .iter()
                    .any(|&ignored| ignored.eq_ignore_ascii_case(&class_name))
                {
                    return false;
                }
            }

            let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if hmon.0.is_null() {
                return false;
            }

            let mut mon_info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(hmon, &mut mon_info).as_bool() {
                return false;
            }

            if (mon_info.dwFlags & MONITORINFOF_PRIMARY_FLAG) == 0 {
                return false;
            }

            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return false;
            }

            let mon = mon_info.rcMonitor;
            let covers_monitor = rect.left <= mon.left + EDGE_TOLERANCE_PX
                && rect.top <= mon.top + EDGE_TOLERANCE_PX
                && rect.right >= mon.right - EDGE_TOLERANCE_PX
                && rect.bottom >= mon.bottom - EDGE_TOLERANCE_PX;

            if !covers_monitor {
                return false;
            }

            let work = mon_info.rcWork;
            let taskbar_auto_hidden = (work.left - mon.left).abs() <= EDGE_TOLERANCE_PX
                && (work.top - mon.top).abs() <= EDGE_TOLERANCE_PX
                && (work.right - mon.right).abs() <= EDGE_TOLERANCE_PX
                && (work.bottom - mon.bottom).abs() <= EDGE_TOLERANCE_PX;

            if taskbar_auto_hidden {
                let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
                let has_standard_frame =
                    (style & WS_CAPTION.0) == WS_CAPTION.0 && (style & WS_THICKFRAME.0) != 0;
                if has_standard_frame {
                    return false;
                }
            }

            true
        }
    }
}
