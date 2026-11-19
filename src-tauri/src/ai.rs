use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const AI_CONFIG_FILENAME: &str = "ai_config.json";
const DEFAULT_MODEL: &str = "gemini-4-hydrogen";
const DEFAULT_THINKING_LEVEL: &str = "low";
const MAX_HISTORY_MESSAGES: usize = 20;
const REQUEST_TIMEOUT_SECS: u64 = 90;

const SYSTEM_PROMPT: &str = "Bạn là trợ lý AI tích hợp trong thanh nổi Nusa trên máy tính Windows. Trả lời ngắn gọn, rõ ràng, đi thẳng vào trọng tâm bằng tiếng Việt (hoặc theo ngôn ngữ người dùng hỏi). Khi có dữ liệu từ tìm kiếm web, hãy tổng hợp thông tin chính xác và cập nhật.";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAiConfig {
    api_key: String,
    model: String,
    thinking_level: String,
    web_search: bool,
}

impl Default for StoredAiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: DEFAULT_MODEL.to_string(),
            thinking_level: DEFAULT_THINKING_LEVEL.to_string(),
            web_search: true,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigView {
    pub has_api_key: bool,
    pub masked_key: Option<String>,
    pub model: String,
    pub thinking_level: String,
    pub web_search: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessageInput {
    pub role: String,
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSourceLink {
    pub title: String,
    pub uri: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReplyPayload {
    pub text: String,
    pub sources: Vec<AiSourceLink>,
    pub search_queries: Vec<String>,
    pub model: String,
    pub thinking_level: String,
}

#[derive(Clone, Default)]
pub struct AiState {
    config: Arc<Mutex<StoredAiConfig>>,
}

fn normalize_model(raw: &str) -> String {
    match raw.trim() {
        "gemini-4-hydrogen" => "gemini-4-hydrogen".to_string(),
        "gemini-4-neon" => "gemini-4-neon".to_string(),
        "gemini-4-carbon" => "gemini-4-carbon".to_string(),
        "gemini-4-argon" => "gemini-4-argon".to_string(),
        _ => DEFAULT_MODEL.to_string(),
    }
}

fn normalize_thinking_level(model: &str, raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "low" => "low".to_string(),
        "medium" => "medium".to_string(),
        "high" => "high".to_string(),
        "xhigh" => {
            if model == "gemini-4-hydrogen" {
                "xhigh".to_string()
            } else {
                "high".to_string()
            }
        }
        _ => DEFAULT_THINKING_LEVEL.to_string(),
    }
}

fn mask_api_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return Some("••••••••".to_string());
    }
    let prefix: String = chars[..4].iter().collect();
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    Some(format!("{prefix}••••{suffix}"))
}

fn to_config_view(cfg: &StoredAiConfig) -> AiConfigView {
    let model = normalize_model(&cfg.model);
    let thinking_level = normalize_thinking_level(&model, &cfg.thinking_level);
    AiConfigView {
        has_api_key: !cfg.api_key.trim().is_empty(),
        masked_key: mask_api_key(&cfg.api_key),
        model,
        thinking_level,
        web_search: cfg.web_search,
    }
}

fn config_file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join(AI_CONFIG_FILENAME))
}

fn persist_config(app: &AppHandle, cfg: &StoredAiConfig) -> Result<(), String> {
    let Some(path) = config_file_path(app) else {
        return Err("Cannot resolve app data directory".to_string());
    };
    let serialized = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| format!("Failed to save AI config: {e}"))
}

pub fn load_initial_ai_config(app: &AppHandle, state: &AiState) {
    let Some(path) = config_file_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };
    let Ok(mut parsed) = serde_json::from_str::<StoredAiConfig>(&raw) else {
        return;
    };

    parsed.model = normalize_model(&parsed.model);
    parsed.thinking_level = normalize_thinking_level(&parsed.model, &parsed.thinking_level);

    if let Ok(mut guard) = state.config.lock() {
        *guard = parsed;
    }
}

#[tauri::command]
pub fn get_ai_config(state: State<'_, AiState>) -> AiConfigView {
    let cfg = state
        .config
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    to_config_view(&cfg)
}

#[tauri::command]
pub fn save_ai_api_key(
    app: AppHandle,
    state: State<'_, AiState>,
    api_key: String,
) -> Result<AiConfigView, String> {
    let cleaned = api_key.trim().to_string();
    if cleaned.is_empty() {
        return Err("API key không được để trống".to_string());
    }

    let updated = {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "Failed to lock AI config".to_string())?;
        guard.api_key = cleaned;
        guard.clone()
    };

    persist_config(&app, &updated)?;
    Ok(to_config_view(&updated))
}

#[tauri::command]
pub fn clear_ai_api_key(
    app: AppHandle,
    state: State<'_, AiState>,
) -> Result<AiConfigView, String> {
    let updated = {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "Failed to lock AI config".to_string())?;
        guard.api_key.clear();
        guard.clone()
    };

    persist_config(&app, &updated)?;
    Ok(to_config_view(&updated))
}

#[tauri::command]
pub fn update_ai_settings(
    app: AppHandle,
    state: State<'_, AiState>,
    model: String,
    thinking_level: String,
    web_search: bool,
) -> Result<AiConfigView, String> {
    let safe_model = normalize_model(&model);
    let safe_level = normalize_thinking_level(&safe_model, &thinking_level);

    let updated = {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "Failed to lock AI config".to_string())?;
        guard.model = safe_model;
        guard.thinking_level = safe_level;
        guard.web_search = web_search;
        guard.clone()
    };

    persist_config(&app, &updated)?;
    Ok(to_config_view(&updated))
}

#[tauri::command]
pub async fn ai_send_message(
    state: State<'_, AiState>,
    messages: Vec<AiChatMessageInput>,
    model: Option<String>,
    thinking_level: Option<String>,
    web_search: Option<bool>,
) -> Result<AiReplyPayload, String> {
    let stored = state
        .config
        .lock()
        .map(|g| g.clone())
        .map_err(|_| "Failed to read AI configuration".to_string())?;

    let api_key = stored.api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("Chưa cấu hình Gemini API key. Hãy nhập key trước khi hỏi AI.".to_string());
    }

    let effective_model = normalize_model(model.as_deref().unwrap_or(&stored.model));
    let effective_level = normalize_thinking_level(
        &effective_model,
        thinking_level.as_deref().unwrap_or(&stored.thinking_level),
    );
    let effective_web_search = web_search.unwrap_or(stored.web_search);

    let trimmed_messages: Vec<AiChatMessageInput> = messages
        .into_iter()
        .filter(|m| !m.text.trim().is_empty())
        .collect();

    if trimmed_messages.is_empty() {
        return Err("Nội dung câu hỏi đang trống".to_string());
    }

    let start_idx = trimmed_messages.len().saturating_sub(MAX_HISTORY_MESSAGES);
    let contents: Vec<Value> = trimmed_messages[start_idx..]
        .iter()
        .map(|m| {
            let role = if m.role == "model" { "model" } else { "user" };
            json!({
                "role": role,
                "parts": [{ "text": m.text.trim() }]
            })
        })
        .collect();

    let mut body = json!({
        "systemInstruction": {
            "parts": [{ "text": SYSTEM_PROMPT }]
        },
        "contents": contents,
        "generationConfig": {
            "thinkingConfig": {
                "thinkingLevel": effective_level
            }
        }
    });

    if effective_web_search {
        if let Some(obj) = body.as_object_mut() {
            obj.insert("tools".to_string(), json!([{ "google_search": {} }]));
        }
    }

    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{effective_model}:generateContent"
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("NusaClone/2.1.0")
        .build()
        .map_err(|e| format!("Không khởi tạo được HTTP client: {e}"))?;

    let resp = client
        .post(&endpoint)
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Gemini API: {e}"))?;

    let status = resp.status();
    let payload: Value = resp
        .json()
        .await
        .map_err(|e| format!("Phản hồi không hợp lệ từ Gemini API: {e}"))?;

    if !status.is_success() {
        let api_msg = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Yêu cầu thất bại");
        return Err(format!("Gemini API ({}): {api_msg}", status.as_u16()));
    }

    let candidate = payload
        .pointer("/candidates/0")
        .ok_or_else(|| "Gemini không trả về phản hồi (có thể bị bộ lọc an toàn chặn)".to_string())?;

    let mut reply_parts: Vec<String> = Vec::new();
    if let Some(parts) = candidate.pointer("/content/parts").and_then(Value::as_array) {
        for part in parts {
            if part.get("thought").and_then(Value::as_bool).unwrap_or(false) {
                continue;
            }
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                if !text.is_empty() {
                    reply_parts.push(text.to_string());
                }
            }
        }
    }

    let reply_text = reply_parts.join("").trim().to_string();
    if reply_text.is_empty() {
        return Err("Mô hình trả về nội dung rỗng".to_string());
    }

    let mut sources: Vec<AiSourceLink> = Vec::new();
    let mut seen_uris: HashSet<String> = HashSet::new();
    if let Some(chunks) = candidate
        .pointer("/groundingMetadata/groundingChunks")
        .and_then(Value::as_array)
    {
        for chunk in chunks {
            if let Some(web) = chunk.get("web") {
                let uri = web
                    .get("uri")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if uri.is_empty() || !seen_uris.insert(uri.to_string()) {
                    continue;
                }
                let title = web
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|t| !t.is_empty())
                    .unwrap_or(uri);
                sources.push(AiSourceLink {
                    title: title.to_string(),
                    uri: uri.to_string(),
                });
            }
        }
    }

    let search_queries: Vec<String> = candidate
        .pointer("/groundingMetadata/webSearchQueries")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    Ok(AiReplyPayload {
        text: reply_text,
        sources,
        search_queries,
        model: effective_model,
        thinking_level: effective_level,
    })
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Chỉ hỗ trợ mở liên kết http/https".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use windows::core::{w, HSTRING, PCWSTR};
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let target = HSTRING::from(trimmed);
        let res = unsafe {
            ShellExecuteW(
                HWND::default(),
                w!("open"),
                &target,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res.0 as isize) <= 32 {
            return Err(format!("Không mở được trình duyệt (mã {})", res.0 as isize));
        }
    }

    Ok(())
}