use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_SHELF_ITEMS: usize = 30;
const MAX_THUMBNAIL_BYTES: u64 = 2 * 1024 * 1024;
const SHELF_STORAGE_FILENAME: &str = "shelf.json";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: String,
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub exists: bool,
    pub thumbnail: Option<String>,
    pub added_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfDragPayload {
    pub hovering: bool,
    pub count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PersistedEntry {
    path: String,
    added_at_ms: u64,
}

#[derive(Clone, Default)]
pub struct ShelfState {
    items: Arc<Mutex<Vec<ShelfItem>>>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_path_string(raw: &Path) -> String {
    let s = raw.to_string_lossy().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        s
    }
}

fn path_key(path_str: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        path_str.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        path_str.to_string()
    }
}

fn image_mime_from_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

fn read_image_thumbnail(path: &Path, ext: &str, size_bytes: u64) -> Option<String> {
    let mime = image_mime_from_ext(ext)?;
    if size_bytes == 0 || size_bytes > MAX_THUMBNAIL_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

fn build_shelf_item(path: &Path, added_at_ms: u64) -> ShelfItem {
    let clean_path = normalize_path_string(path);
    let clean_ref = Path::new(&clean_path);

    let name = clean_ref
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| clean_path.clone());

    let metadata = fs::metadata(clean_ref).ok();
    let exists = metadata.is_some();
    let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
    let size_bytes = metadata
        .as_ref()
        .map(|m| if m.is_dir() { 0 } else { m.len() })
        .unwrap_or(0);

    let extension = if is_dir {
        String::new()
    } else {
        clean_ref
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };

    let thumbnail = if exists && !is_dir {
        read_image_thumbnail(clean_ref, &extension, size_bytes)
    } else {
        None
    };

    ShelfItem {
        id: path_key(&clean_path),
        path: clean_path,
        name,
        extension,
        size_bytes,
        is_dir,
        exists,
        thumbnail,
        added_at_ms,
    }
}

fn storage_file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join(SHELF_STORAGE_FILENAME))
}

fn persist_items(app: &AppHandle, items: &[ShelfItem]) {
    let Some(file_path) = storage_file_path(app) else {
        return;
    };
    let entries: Vec<PersistedEntry> = items
        .iter()
        .map(|item| PersistedEntry {
            path: item.path.clone(),
            added_at_ms: item.added_at_ms,
        })
        .collect();
    if let Ok(json) = serde_json::to_string_pretty(&entries) {
        let _ = fs::write(file_path, json);
    }
}

pub fn load_initial_items(app: &AppHandle, state: &ShelfState) {
    let Some(file_path) = storage_file_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(file_path) else {
        return;
    };
    let Ok(entries) = serde_json::from_str::<Vec<PersistedEntry>>(&raw) else {
        return;
    };

    let mut loaded = Vec::new();
    for entry in entries.into_iter().take(MAX_SHELF_ITEMS) {
        let item = build_shelf_item(Path::new(&entry.path), entry.added_at_ms);
        if item.exists {
            loaded.push(item);
        }
    }

    if let Ok(mut guard) = state.items.lock() {
        *guard = loaded;
    }
}

pub fn add_paths_internal(
    app: &AppHandle,
    state: &ShelfState,
    paths: Vec<PathBuf>,
) -> Vec<ShelfItem> {
    let now = now_unix_ms();
    let mut new_items = Vec::new();

    for path in paths {
        let item = build_shelf_item(&path, now);
        if item.exists {
            new_items.push(item);
        }
    }

    let snapshot = if let Ok(mut guard) = state.items.lock() {
        for item in new_items.into_iter().rev() {
            guard.retain(|existing| existing.id != item.id);
            guard.insert(0, item);
        }
        if guard.len() > MAX_SHELF_ITEMS {
            guard.truncate(MAX_SHELF_ITEMS);
        }
        guard.clone()
    } else {
        Vec::new()
    };

    persist_items(app, &snapshot);
    let _ = app.emit("shelf:update", snapshot.clone());
    snapshot
}

#[tauri::command]
pub fn get_shelf_items(state: State<'_, ShelfState>) -> Vec<ShelfItem> {
    if let Ok(mut guard) = state.items.lock() {
        for item in guard.iter_mut() {
            item.exists = Path::new(&item.path).exists();
        }
        guard.clone()
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub fn add_shelf_paths(
    app: AppHandle,
    state: State<'_, ShelfState>,
    paths: Vec<String>,
) -> Vec<ShelfItem> {
    let path_bufs: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    add_paths_internal(&app, &state, path_bufs)
}

#[tauri::command]
pub async fn pick_shelf_files(
    app: AppHandle,
    state: State<'_, ShelfState>,
) -> Result<Vec<ShelfItem>, String> {
    let picked = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Add files to Nusa Shelf")
            .pick_files()
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Some(paths) = picked {
        Ok(add_paths_internal(&app, &state, paths))
    } else {
        Ok(state.items.lock().map(|g| g.clone()).unwrap_or_default())
    }
}

#[tauri::command]
pub fn remove_shelf_item(
    app: AppHandle,
    state: State<'_, ShelfState>,
    id: String,
) -> Vec<ShelfItem> {
    let snapshot = if let Ok(mut guard) = state.items.lock() {
        guard.retain(|item| item.id != id);
        guard.clone()
    } else {
        Vec::new()
    };
    persist_items(&app, &snapshot);
    let _ = app.emit("shelf:update", snapshot.clone());
    snapshot
}

#[tauri::command]
pub fn clear_shelf(app: AppHandle, state: State<'_, ShelfState>) -> Vec<ShelfItem> {
    if let Ok(mut guard) = state.items.lock() {
        guard.clear();
    }
    let empty: Vec<ShelfItem> = Vec::new();
    persist_items(&app, &empty);
    let _ = app.emit("shelf:update", empty.clone());
    empty
}

#[tauri::command]
pub fn open_shelf_item(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("File no longer exists on disk".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        win_impl::shell_open(&path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn reveal_shelf_item(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("File no longer exists on disk".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        win_impl::reveal_in_explorer(&path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn copy_shelf_files(paths: Vec<String>) -> Result<usize, String> {
    let valid_paths: Vec<String> = paths
        .into_iter()
        .filter(|p| Path::new(p).exists())
        .collect();

    if valid_paths.is_empty() {
        return Err("No valid files available to copy".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        win_impl::copy_files_hdrop(&valid_paths)?;
    }

    Ok(valid_paths.len())
}

#[cfg(target_os = "windows")]
mod win_impl {
    use std::ffi::OsStr;
    use std::mem::size_of;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::copy_nonoverlapping;
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    const CF_HDROP_FORMAT: u32 = 15;

    #[repr(C)]
    struct DropFilesHeader {
        p_files: u32,
        pt_x: i32,
        pt_y: i32,
        f_nc: i32,
        f_wide: i32,
    }

    pub fn shell_open(path: &str) -> Result<(), String> {
        let file_h = HSTRING::from(path);
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                w!("open"),
                &file_h,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res.0 as isize) <= 32 {
            return Err(format!("Failed to open file (code {})", res.0 as isize));
        }
        Ok(())
    }

    pub fn reveal_in_explorer(path: &str) -> Result<(), String> {
        let args_h = HSTRING::from(format!("/select,\"{path}\""));
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                w!("open"),
                w!("explorer.exe"),
                &args_h,
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res.0 as isize) <= 32 {
            return Err(format!(
                "Failed to reveal in Explorer (code {})",
                res.0 as isize
            ));
        }
        Ok(())
    }

    pub fn copy_files_hdrop(paths: &[String]) -> Result<(), String> {
        let mut wide_buf: Vec<u16> = Vec::new();
        for path in paths {
            wide_buf.extend(OsStr::new(path).encode_wide());
            wide_buf.push(0);
        }
        wide_buf.push(0);

        let header = DropFilesHeader {
            p_files: size_of::<DropFilesHeader>() as u32,
            pt_x: 0,
            pt_y: 0,
            f_nc: 0,
            f_wide: 1,
        };

        let header_size = size_of::<DropFilesHeader>();
        let data_size = wide_buf.len() * size_of::<u16>();
        let total_bytes = header_size + data_size;

        unsafe {
            OpenClipboard(HWND::default()).map_err(|e| format!("OpenClipboard failed: {e}"))?;

            let result = (|| -> Result<(), String> {
                EmptyClipboard().map_err(|e| format!("EmptyClipboard failed: {e}"))?;

                let hglobal = GlobalAlloc(GMEM_MOVEABLE, total_bytes)
                    .map_err(|e| format!("GlobalAlloc failed: {e}"))?;

                let locked_ptr = GlobalLock(hglobal);
                if locked_ptr.is_null() {
                    let _ = GlobalFree(hglobal);
                    return Err("GlobalLock returned null".to_string());
                }

                copy_nonoverlapping(
                    (&header as *const DropFilesHeader) as *const u8,
                    locked_ptr as *mut u8,
                    header_size,
                );
                copy_nonoverlapping(
                    wide_buf.as_ptr() as *const u8,
                    (locked_ptr as *mut u8).add(header_size),
                    data_size,
                );

                let _ = GlobalUnlock(hglobal);

                if let Err(e) = SetClipboardData(CF_HDROP_FORMAT, HANDLE(hglobal.0)) {
                    let _ = GlobalFree(hglobal);
                    return Err(format!("SetClipboardData failed: {e}"));
                }

                Ok(())
            })();

            let _ = CloseClipboard();
            result
        }
    }
}
