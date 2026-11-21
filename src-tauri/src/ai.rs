use crate::ai_tools::{
    capture_primary_screen, dispatch_nusa_action, execute_media_action, execute_volume_action,
    get_local_datetime_info, open_app_or_url, read_clipboard_text, run_user_confirmed_powershell,
    write_clipboard_text,
};
use crate::notch_window::NotchState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const AI_CONFIG_FILENAME: &str = "ai_config.json";
const AI_CONFIG_VERSION: u8 = 2;
const DEFAULT_MODEL: &str = "auto";
const DEFAULT_THINKING_LEVEL: &str = "off";
const MAX_OUTPUT_TOKENS: u32 = 8192;
const MAX_HISTORY_MESSAGES: usize = 20;
const MAX_WEB_RESULTS: usize = 5;
const MAX_AGENT_STEPS: usize = 6;
const REQUEST_TIMEOUT_SECS: u64 = 90;
const SEARCH_TIMEOUT_SECS: u64 = 10;
const MODEL_PROBE_TIMEOUT_SECS: u64 = 12;

const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const NAJIMEZ_PRIORITY_MODELS: &[&str] = &[
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-pro-latest",
    "gemini-4-hydrogen",
];

const NEED_SCREEN_MARKER: &str = "[[NEED_SCREEN]]";

const FAST_CHAT_SYSTEM_PROMPT: &str = "Bạn là Nusa — trợ lý ảo thân thiện, thông minh và lanh lợi tích hợp trên thanh nổi máy tính Windows. Hãy trò chuyện tự nhiên, gần gũi, trả lời nhanh, rõ ràng và đi thẳng vào trọng tâm bằng tiếng Việt (hoặc theo ngôn ngữ người dùng sử dụng).";

const FAST_CHAT_WITH_SCREEN_RECOVERY_PROMPT: &str = "Bạn là Nusa — trợ lý ảo thân thiện, thông minh và lanh lợi tích hợp trên thanh nổi máy tính Windows. Hãy trò chuyện tự nhiên, gần gũi, trả lời nhanh, rõ ràng và đi thẳng vào trọng tâm bằng tiếng Việt (hoặc theo ngôn ngữ người dùng sử dụng).\n\
QUY TẮC TỰ CHỤP MÀN HÌNH: Nếu người dùng hỏi một nội dung nhưng KHÔNG dán đề bài/văn bản vào tin nhắn (ví dụ: hỏi đáp án câu hỏi/trắc nghiệm, giải bài tập, sửa lỗi, dịch/tóm tắt, hỏi về cái đang mở hoặc so sánh A/B/C/D), TUYỆT ĐỐI KHÔNG bảo họ chụp ảnh hay copy đề bài — hãy trả về DUY NHẤT đúng chuỗi `[[NEED_SCREEN]]` (không thêm bất kỳ chữ hay dấu câu nào khác) để hệ thống tự động chụp màn hình cho bạn xem.";

const VISION_SYSTEM_PROMPT: &str = "Bạn là Nusa — trợ lý ảo đa phương thức thân thiện và lanh lợi tích hợp trên thanh nổi Windows. Ảnh chụp màn hình hiện tại của máy tính người dùng ĐÃ được đính kèm trực tiếp trong tin nhắn này. Hãy quan sát thật kỹ chữ, câu hỏi, đáp án, mã lỗi hoặc hình ảnh trên màn hình và trả lời chính xác, rõ ràng, đi thẳng vào trọng tâm bằng tiếng Việt (hoặc theo ngôn ngữ người dùng sử dụng). Với câu hỏi trắc nghiệm, hãy nêu rõ đáp án đúng kèm giải thích ngắn gọn.";

const WEB_SYSTEM_PROMPT: &str = "Bạn là Nusa — trợ lý ảo thân thiện và lanh lợi tích hợp trên thanh nổi Windows. Kết quả tìm kiếm web trực tiếp tại thời điểm hiện tại ĐÃ được đính kèm trong tin nhắn của người dùng. Hãy ưu tiên tuyệt đối thông tin mới nhất từ các kết quả web đính kèm này (không trả lời theo phiên bản hoặc số liệu cũ trong trí nhớ huấn luyện). Nếu kết quả web chưa đủ rõ ràng, hãy nói thẳng và tóm tắt những gì tìm thấy một cách ngắn gọn, chính xác bằng tiếng Việt (hoặc theo ngôn ngữ người dùng sử dụng).";

const AGENT_SYSTEM_PROMPT: &str = "Bạn là Nusa — trợ lý ảo đa phương thức thông minh, nhanh nhạy và thân thiện tích hợp ngay trên thanh nổi máy tính Windows của người dùng.\n\
Nguyên tắc ứng xử:\n\
1. Tìm kiếm web thông minh: Chỉ gọi tool `web_search` khi cần tra cứu tin tức mới, thời sự, giá cả, tỷ giá, thời tiết hoặc sự kiện thực tế.\n\
2. Mắt thần thị giác đa phương thức: Khi người dùng hỏi về thứ đang hiển thị trên màn hình (đề thi, bài tập, lỗi code, hóa đơn, ảnh chuyển khoản, từ vựng, đoạn văn đang mở), hãy chủ động gọi `capture_screen` để xem ảnh màn hình trước khi phân tích.\n\
3. Thao tác máy tính & Nusa: Chủ động dùng các tool chuyên dụng (`open_app_or_url`, `control_volume`, `control_media`, `read_clipboard`, `write_clipboard`, `nusa_action`). Chỉ dùng `run_powershell_command` cho tác vụ hệ thống/file/mạng nâng cao (luôn hiện để người dùng duyệt trước khi chạy).\n\
4. Trả lời rõ ràng, ngắn gọn, đi thẳng vào trọng tâm; khi giải bài tập hoặc giải thích chuyên sâu hãy trình bày đầy đủ.";

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAiConfig {
    #[serde(default)]
    config_version: u8,
    api_key: String,
    model: String,
    thinking_level: String,
    web_search: bool,
    #[serde(default = "default_true")]
    allow_screen_capture: bool,
    #[serde(default = "default_true")]
    allow_pc_control: bool,
}

impl Default for StoredAiConfig {
    fn default() -> Self {
        Self {
            config_version: AI_CONFIG_VERSION,
            api_key: String::new(),
            model: DEFAULT_MODEL.to_string(),
            thinking_level: DEFAULT_THINKING_LEVEL.to_string(),
            web_search: true,
            allow_screen_capture: true,
            allow_pc_control: true,
        }
    }
}

#[derive(Clone, Debug, Default)]
struct ModelDiscoveryCache {
    key_fingerprint: String,
    ranked_models: Vec<String>,
    resolved_model: Option<String>,
    dead_models: HashSet<String>,
    no_thinking_models: HashSet<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigView {
    pub has_api_key: bool,
    pub masked_key: Option<String>,
    pub model: String,
    pub resolved_model: Option<String>,
    pub available_models: Vec<String>,
    pub thinking_level: String,
    pub web_search: bool,
    pub allow_screen_capture: bool,
    pub allow_pc_control: bool,
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
pub struct PendingCommandView {
    pub id: String,
    pub command: String,
    pub explanation: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReplyPayload {
    pub text: String,
    pub sources: Vec<AiSourceLink>,
    pub search_queries: Vec<String>,
    pub actions_taken: Vec<String>,
    pub pending_command: Option<PendingCommandView>,
    pub model: String,
    pub thinking_level: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamDeltaPayload {
    delta: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamStatusPayload {
    label: String,
}

#[derive(Clone, Debug)]
struct WebSearchHit {
    title: String,
    uri: String,
    snippet: String,
}

#[derive(Clone)]
struct PendingCommandSession {
    id: String,
    command: String,
    explanation: String,
    prior_response_parts: Vec<Value>,
    remaining_calls: Vec<(String, Value)>,
    working_contents: Vec<Value>,
    system_text: String,
    model: String,
    thinking_level: String,
    tool_declarations: Vec<Value>,
    sources: Vec<AiSourceLink>,
    search_queries: Vec<String>,
    actions_taken: Vec<String>,
}

#[derive(Clone)]
pub struct AiState {
    config: Arc<Mutex<StoredAiConfig>>,
    discovery: Arc<Mutex<ModelDiscoveryCache>>,
    pending_session: Arc<Mutex<Option<PendingCommandSession>>>,
    api_client: reqwest::Client,
    search_client: reqwest::Client,
}

impl Default for AiState {
    fn default() -> Self {
        let api_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(30))
            .user_agent("NusaClone/2.1.0")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let search_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(SEARCH_TIMEOUT_SECS))
            .pool_idle_timeout(Duration::from_secs(60))
            .tcp_keepalive(Duration::from_secs(30))
            .user_agent(BROWSER_USER_AGENT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            config: Arc::new(Mutex::new(StoredAiConfig::default())),
            discovery: Arc::new(Mutex::new(ModelDiscoveryCache::default())),
            pending_session: Arc::new(Mutex::new(None)),
            api_client,
            search_client,
        }
    }
}

struct AiBusyGuard {
    flag: Arc<AtomicBool>,
}

impl AiBusyGuard {
    fn acquire(notch_state: &NotchState) -> Self {
        notch_state.ai_busy.store(true, Ordering::Relaxed);
        Self {
            flag: notch_state.ai_busy.clone(),
        }
    }
}

impl Drop for AiBusyGuard {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::Relaxed);
    }
}

#[derive(Clone, Copy)]
enum ThinkingMode<'a> {
    Level(&'a str),
    Budget(u32),
    Omit,
}

#[allow(dead_code)]
enum StreamOutcome {
    Success {
        reply_text: String,
        calls: Vec<(String, Value)>,
        raw_model_parts: Vec<Value>,
        emitted_any_text: bool,
    },
    HttpError(reqwest::StatusCode, Value),
}

fn normalize_model(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
        return "auto".to_string();
    }
    let clean = trimmed.strip_prefix("models/").unwrap_or(trimmed);
    if clean.starts_with("gemini-")
        && clean
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
    {
        return clean.to_string();
    }
    DEFAULT_MODEL.to_string()
}

fn normalize_thinking_level(model: &str, raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "off" | "minimal" | "none" => "off".to_string(),
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

fn build_config_view(cfg: &StoredAiConfig, cache: &ModelDiscoveryCache) -> AiConfigView {
    let model = normalize_model(&cfg.model);
    let thinking_level = normalize_thinking_level(&model, &cfg.thinking_level);
    let resolved_model = if model == "auto" {
        cache
            .resolved_model
            .clone()
            .or_else(|| cache.ranked_models.first().cloned())
    } else {
        Some(model.clone())
    };

    AiConfigView {
        has_api_key: !cfg.api_key.trim().is_empty(),
        masked_key: mask_api_key(&cfg.api_key),
        model,
        resolved_model,
        available_models: cache.ranked_models.clone(),
        thinking_level,
        web_search: cfg.web_search,
        allow_screen_capture: cfg.allow_screen_capture,
        allow_pc_control: cfg.allow_pc_control,
    }
}

fn current_config_view(state: &AiState) -> AiConfigView {
    let cfg = state
        .config
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let cache = state
        .discovery
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    build_config_view(&cfg, &cache)
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

fn is_suitable_chat_model(id: &str) -> bool {
    let lower = id.to_lowercase();
    if !lower.starts_with("gemini-") {
        return false;
    }
    const BLOCKED_KEYWORDS: &[&str] = &[
        "embedding",
        "aqa",
        "imagen",
        "veo",
        "tts",
        "audio",
        "live",
        "robotics",
        "computer-use",
        "deep-research",
        "image-generation",
        "image-preview",
        "nano",
    ];
    !BLOCKED_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

fn rank_discovered_models(raw_ids: Vec<String>) -> Vec<String> {
    let eligible: Vec<String> = raw_ids
        .into_iter()
        .filter(|id| is_suitable_chat_model(id))
        .collect();
    let eligible_set: HashSet<String> = eligible.iter().cloned().collect();

    let mut ranked: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for &preferred in NAJIMEZ_PRIORITY_MODELS {
        if eligible_set.contains(preferred) && seen.insert(preferred.to_string()) {
            ranked.push(preferred.to_string());
        }
    }

    let mut extra_lite: Vec<String> = eligible
        .iter()
        .filter(|id| id.contains("flash-lite") && !seen.contains(*id))
        .cloned()
        .collect();
    extra_lite.sort();
    extra_lite.reverse();
    for id in extra_lite {
        if seen.insert(id.clone()) {
            ranked.push(id);
        }
    }

    let mut extra_flash: Vec<String> = eligible
        .iter()
        .filter(|id| id.contains("flash") && !seen.contains(*id))
        .cloned()
        .collect();
    extra_flash.sort();
    extra_flash.reverse();
    for id in extra_flash {
        if seen.insert(id.clone()) {
            ranked.push(id);
        }
    }

    let mut extra_pro: Vec<String> = eligible
        .iter()
        .filter(|id| id.contains("pro") && !seen.contains(*id))
        .cloned()
        .collect();
    extra_pro.sort();
    extra_pro.reverse();
    for id in extra_pro {
        if seen.insert(id.clone()) {
            ranked.push(id);
        }
    }

    for id in eligible {
        if seen.insert(id.clone()) {
            ranked.push(id);
        }
    }

    ranked
}

async fn fetch_account_models(client: &reqwest::Client, api_key: &str) -> Result<Vec<String>, String> {
    let resp = client
        .get("https://generativelanguage.googleapis.com/v1beta/models")
        .query(&[("pageSize", "100")])
        .header("x-goog-api-key", api_key)
        .timeout(Duration::from_secs(MODEL_PROBE_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("Không dò được danh sách model từ Google AI Studio: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Google AI Studio trả mã {} khi dò model",
            resp.status().as_u16()
        ));
    }

    let payload: Value = resp
        .json()
        .await
        .map_err(|e| format!("Dữ liệu danh sách model không hợp lệ: {e}"))?;

    let mut raw_ids = Vec::new();
    if let Some(models) = payload.get("models").and_then(Value::as_array) {
        for item in models {
            let supports_generate = item
                .get("supportedGenerationMethods")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .any(|v| v.as_str() == Some("generateContent"))
                })
                .unwrap_or(false);

            if !supports_generate {
                continue;
            }

            if let Some(name) = item.get("name").and_then(Value::as_str) {
                let id = name.strip_prefix("models/").unwrap_or(name).trim();
                if !id.is_empty() {
                    raw_ids.push(id.to_string());
                }
            }
        }
    }

    Ok(rank_discovered_models(raw_ids))
}

async fn ensure_models_discovered(
    app: &AppHandle,
    state: &AiState,
    api_key: &str,
    force: bool,
) -> Vec<String> {
    let trimmed_key = api_key.trim();
    if trimmed_key.is_empty() {
        return Vec::new();
    }

    if !force {
        if let Ok(guard) = state.discovery.lock() {
            if guard.key_fingerprint == trimmed_key && !guard.ranked_models.is_empty() {
                return guard.ranked_models.clone();
            }
        }
    }

    let discovered = match fetch_account_models(&state.api_client, trimmed_key).await {
        Ok(list) if !list.is_empty() => list,
        _ => NAJIMEZ_PRIORITY_MODELS
            .iter()
            .map(|s| s.to_string())
            .collect(),
    };

    if let Ok(mut guard) = state.discovery.lock() {
        if force {
            guard.dead_models.clear();
            guard.no_thinking_models.clear();
        }
        let still_valid_resolved = guard
            .resolved_model
            .as_ref()
            .filter(|m| discovered.contains(*m) && !guard.dead_models.contains(*m))
            .cloned();
        guard.key_fingerprint = trimmed_key.to_string();
        guard.resolved_model = still_valid_resolved.or_else(|| discovered.first().cloned());
        guard.ranked_models = discovered.clone();
    }

    let view = current_config_view(state);
    let _ = app.emit("ai:config-updated", view);
    discovered
}

fn spawn_background_model_probe(app: AppHandle, state: AiState, api_key: String) {
    if api_key.trim().is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _ = ensure_models_discovered(&app, &state, &api_key, true).await;
    });
}

fn remember_working_model(app: &AppHandle, state: &AiState, api_key: &str, working_model: &str) {
    let changed = if let Ok(mut guard) = state.discovery.lock() {
        guard.dead_models.remove(working_model);
        let prev = guard.resolved_model.as_deref();
        if prev != Some(working_model) {
            guard.key_fingerprint = api_key.trim().to_string();
            guard.resolved_model = Some(working_model.to_string());
            true
        } else {
            false
        }
    } else {
        false
    };

    if changed {
        let view = current_config_view(state);
        let _ = app.emit("ai:config-updated", view);
    }
}

fn mark_model_dead(state: &AiState, model: &str) {
    if let Ok(mut guard) = state.discovery.lock() {
        guard.dead_models.insert(model.to_string());
        if guard.resolved_model.as_deref() == Some(model) {
            guard.resolved_model = guard
                .ranked_models
                .iter()
                .find(|m| !guard.dead_models.contains(*m))
                .cloned();
        }
    }
}

fn mark_model_no_thinking(state: &AiState, model: &str) {
    if let Ok(mut guard) = state.discovery.lock() {
        guard.no_thinking_models.insert(model.to_string());
    }
}

fn model_skips_thinking(state: &AiState, model: &str) -> bool {
    state
        .discovery
        .lock()
        .map(|g| g.no_thinking_models.contains(model))
        .unwrap_or(false)
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

    if parsed.config_version < AI_CONFIG_VERSION {
        parsed.config_version = AI_CONFIG_VERSION;
        parsed.model = DEFAULT_MODEL.to_string();
        parsed.thinking_level = DEFAULT_THINKING_LEVEL.to_string();
        let _ = persist_config(app, &parsed);
    } else {
        parsed.model = normalize_model(&parsed.model);
        parsed.thinking_level = normalize_thinking_level(&parsed.model, &parsed.thinking_level);
    }

    let saved_key = parsed.api_key.clone();

    if let Ok(mut guard) = state.config.lock() {
        *guard = parsed;
    }

    if !saved_key.trim().is_empty() {
        spawn_background_model_probe(app.clone(), state.clone(), saved_key);
    }
}

fn generate_pending_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("cmd-{nanos}")
}

fn emit_stream_status(app: &AppHandle, label: &str) {
    let _ = app.emit(
        "ai:stream-status",
        StreamStatusPayload {
            label: label.to_string(),
        },
    );
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn has_numbered_item_ref(lower: &str) -> bool {
    if lower.chars().count() > 140 {
        return false;
    }
    const PREFIXES: &[&str] = &[
        "câu ",
        "cau ",
        "câu số ",
        "cau so ",
        "bài ",
        "bai ",
        "bài số ",
        "bai so ",
        "đề ",
        "de ",
        "mục ",
        "muc ",
        "ý ",
        "question ",
        "problem ",
        "exercise ",
        "ex ",
    ];
    for prefix in PREFIXES {
        let mut search_from = 0;
        while let Some(rel) = lower[search_from..].find(prefix) {
            let after_idx = search_from + rel + prefix.len();
            if let Some(first_ch) = lower[after_idx..].chars().next() {
                if first_ch.is_ascii_digit() {
                    return true;
                }
            }
            search_from = after_idx;
        }
    }
    false
}

fn reply_asks_for_missing_screen_context(reply_text: &str) -> bool {
    let lower = reply_text.to_lowercase();
    const MISSING_CONTEXT_PATTERNS: &[&str] = &[
        "chưa gửi đề",
        "chưa cung cấp đề",
        "chưa gửi câu hỏi",
        "chưa thấy đề",
        "chưa thấy câu hỏi",
        "chưa thấy nội dung",
        "chưa gửi nội dung",
        "chưa có đề bài",
        "chưa đính kèm",
        "chưa tải ảnh",
        "chưa gửi ảnh",
        "không thấy màn hình",
        "không thể nhìn thấy màn hình",
        "không thể nhìn trực tiếp",
        "không nhìn thấy màn hình",
        "không xem được màn hình",
        "không thấy nội dung",
        "bạn chụp ảnh màn hình",
        "hãy chụp ảnh màn hình",
        "gửi ảnh chụp màn hình",
        "copy nội dung",
        "dán nội dung",
        "gửi đề bài",
        "gõ đề bài",
        "nhập đề bài",
        "gõ nội dung",
        "gõ câu ",
        "gửi câu ",
        "please provide the",
        "haven't provided",
        "cannot see your screen",
        "can't see your screen",
        "share a screenshot",
        "paste the text",
    ];
    contains_any(&lower, MISSING_CONTEXT_PATTERNS)
}

fn detect_tool_needs(
    latest_user_prompt: &str,
    web_enabled: bool,
    screen_enabled: bool,
    pc_enabled: bool,
) -> (bool, bool, bool) {
    let trimmed = latest_user_prompt.trim();
    if trimmed.starts_with('/') || trimmed.starts_with('!') {
        return (web_enabled, screen_enabled, pc_enabled);
    }

    let lower = trimmed.to_lowercase();

    const SCREEN_CUES: &[&str] = &[
        "màn hình",
        "man hinh",
        "hình nền",
        "hinh nen",
        "ảnh nền",
        "anh nen",
        "wallpaper",
        "desktop",
        "screen",
        "screenshot",
        "chụp ảnh",
        "chup anh",
        "chụp lại",
        "chup lai",
        "đọc màn hình",
        "doc man hinh",
        "đang mở",
        "dang mo",
        "đang hiện",
        "dang hien",
        "đang xem",
        "dang xem",
        "đang thấy",
        "dang thay",
        "nhìn thấy",
        "nhin thay",
        "nhìn xem",
        "nhin xem",
        "nhìn giúp",
        "nhin giup",
        "nhìn vào",
        "nhin vao",
        "có thấy",
        "co thay",
        "thấy gì",
        "thay gi",
        "cửa sổ",
        "cua so",
        "trên máy",
        "tren may",
        "lỗi này",
        "loi nay",
        "sửa lỗi",
        "sua loi",
        "fix lỗi",
        "fix loi",
        "sai ở đâu",
        "sai o dau",
        "bài này",
        "bai nay",
        "đề này",
        "de nay",
        "câu này",
        "cau nay",
        "câu trên",
        "cau tren",
        "câu hỏi",
        "cau hoi",
        "trắc nghiệm",
        "trac nghiem",
        "đáp án",
        "dap an",
        "chọn đáp án",
        "chon dap an",
        "chọn câu",
        "chon cau",
        "giải câu",
        "giai cau",
        "giải bài",
        "giai bai",
        "giải đề",
        "giai de",
        "giải giúp",
        "giai giup",
        "giải hộ",
        "giai ho",
        "làm câu",
        "lam cau",
        "làm giúp",
        "lam giup",
        "làm hộ",
        "lam ho",
        "đoạn này",
        "doan nay",
        "chữ này",
        "chu nay",
        "code này",
        "code nay",
        "dòng này",
        "dong nay",
        "chỗ này",
        "cho nay",
        "phần này",
        "phan nay",
        "trang này",
        "trang nay",
        "tab này",
        "tab nay",
        "ảnh này",
        "anh nay",
        "hình này",
        "hinh nay",
        "bảng này",
        "bang nay",
        "biểu đồ",
        "bieu do",
        "cái này",
        "cai nay",
        "đây là gì",
        "day la gi",
        "xem giúp",
        "xem giup",
        "xem hộ",
        "xem ho",
        "đọc giúp",
        "doc giup",
        "dịch đoạn",
        "dich doan",
        "dịch trang",
        "dich trang",
        "dịch giúp",
        "dich giup",
        "tóm tắt trang",
        "tom tat trang",
        "trên đây",
        "tren day",
        "this error",
        "on my screen",
    ];

    const WEB_CUES: &[&str] = &[
        "tìm kiếm",
        "tim kiem",
        "tra cứu",
        "tra cuu",
        "search",
        "google",
        "tin tức",
        "tin tuc",
        "thời sự",
        "thoi su",
        "mới nhất",
        "moi nhat",
        "mới ra",
        "moi ra",
        "hôm nay",
        "hom nay",
        "hiện tại",
        "hien tai",
        "hiện nay",
        "hien nay",
        "bây giờ",
        "bay gio",
        "phiên bản",
        "phien ban",
        "version",
        "bản mấy",
        "ban may",
        "bản bao nhiêu",
        "ban bao nhieu",
        "bản mới",
        "ban moi",
        "cập nhật",
        "cap nhat",
        "update",
        "patch",
        "banner",
        "ra mắt",
        "ra mat",
        "phát hành",
        "phat hanh",
        "release",
        "đang ở bản",
        "dang o ban",
        "giá vàng",
        "gia vang",
        "giá xăng",
        "giá ",
        "tỷ giá",
        "ty gia",
        "bitcoin",
        "btc",
        "chứng khoán",
        "thời tiết",
        "thoi tiet",
        "nhiệt độ",
        "nhiet do",
        "tỉ số",
        "ti so",
        "kết quả",
        "ket qua",
        "bóng đá",
        "bong da",
        "lịch thi đấu",
        "lich thi dau",
        "tổng thống",
        "tong thong",
        "thủ tướng",
        "thu tuong",
        "latest",
        "news",
        "weather",
        "price",
        "today",
        "current ",
        "2025",
        "2026",
        "2027",
        "http://",
        "https://",
        "trang web",
        "website",
    ];

    const PC_CUES: &[&str] = &[
        "mở ",
        "mo ",
        "bật ",
        "bat ",
        "tắt ",
        "tat ",
        "chạy ",
        "chay ",
        "khởi động",
        "khoi dong",
        "open ",
        "launch ",
        "âm lượng",
        "am luong",
        "volume",
        "mute",
        "tắt tiếng",
        "tat tieng",
        "bật tiếng",
        "bat tieng",
        "to tiếng",
        "nhỏ tiếng",
        "nhạc",
        "nhac",
        "bài hát",
        "bai hat",
        "chuyển bài",
        "chuyen bai",
        "qua bài",
        "dừng nhạc",
        "phát nhạc",
        "pause",
        "next track",
        "prev track",
        "clipboard",
        "sao chép",
        "sao chep",
        "vừa chép",
        "vua chep",
        "vừa copy",
        "lịch",
        "lich",
        "nhắc mình",
        "nhac minh",
        "nhắc tôi",
        "nhac toi",
        "sự kiện",
        "su kien",
        "calendar",
        "pomodoro",
        "tập trung",
        "tap trung",
        "uống nước",
        "uong nuoc",
        "thêm nước",
        "them nuoc",
        "cộng nước",
        "cong nuoc",
        "ml nước",
        "ml nuoc",
        "water",
        "powershell",
        "terminal",
        "dòng lệnh",
        "dong lenh",
        "chạy lệnh",
        "chay lenh",
        "command",
        "thư mục",
        "thu muc",
        "folder",
        "tạo file",
        "tao file",
        "xóa file",
        "xoa file",
        "tìm file",
        "tim file",
        "kiểm tra mạng",
        "ipconfig",
        "ping ",
        "chrome",
        "edge",
        "youtube",
        "vscode",
        "vs code",
        "notepad",
        "calculator",
        "máy tính",
        "may tinh",
        "spotify",
        "discord",
        "explorer",
        "task manager",
        "github",
        "gmail",
        "facebook",
        "downloads",
        "documents",
        "chuyển trang",
        "switch page",
        "shelf",
        "notch",
        "dung lượng",
        "dung luong",
        "ổ đĩa",
        "o dia",
        "cpu",
        "ram",
        "tiến trình",
        "process",
    ];

    let needs_screen =
        screen_enabled && (contains_any(&lower, SCREEN_CUES) || has_numbered_item_ref(&lower));
    let needs_web = web_enabled && contains_any(&lower, WEB_CUES);
    let needs_pc = pc_enabled && contains_any(&lower, PC_CUES);

    (needs_web, needs_screen, needs_pc)
}

fn decode_html_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;

    while let Some(amp_idx) = rest.find('&') {
        out.push_str(&rest[..amp_idx]);
        let after_amp = &rest[amp_idx + 1..];
        if let Some(semi_idx) = after_amp.find(';') {
            if semi_idx > 0 && semi_idx <= 12 {
                let entity = &after_amp[..semi_idx];
                let decoded = match entity {
                    "amp" => Some("&".to_string()),
                    "lt" => Some("<".to_string()),
                    "gt" => Some(">".to_string()),
                    "quot" => Some("\"".to_string()),
                    "apos" => Some("'".to_string()),
                    "nbsp" => Some(" ".to_string()),
                    _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                        u32::from_str_radix(&entity[2..], 16)
                            .ok()
                            .and_then(char::from_u32)
                            .map(|c| c.to_string())
                    }
                    _ if entity.starts_with('#') => entity[1..]
                        .parse::<u32>()
                        .ok()
                        .and_then(char::from_u32)
                        .map(|c| c.to_string()),
                    _ => None,
                };
                if let Some(ch) = decoded {
                    out.push_str(&ch);
                    rest = &after_amp[semi_idx + 1..];
                    continue;
                }
            }
        }
        out.push('&');
        rest = after_amp;
    }

    out.push_str(rest);
    out
}

fn strip_html_tags(input: &str) -> String {
    let mut stripped = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                stripped.push(' ');
            }
            _ if !in_tag => stripped.push(ch),
            _ => {}
        }
    }
    let decoded = decode_html_entities(&stripped);
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(h), Some(l)) = (hi, lo) {
                    out.push(((h << 4) | l) as u8);
                    i += 3;
                } else {
                    out.push(b'%');
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).to_string()
}

fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let double_pat = format!("{attr_name}=\"");
    if let Some(idx) = tag.find(&double_pat) {
        let after = &tag[idx + double_pat.len()..];
        if let Some(end) = after.find('"') {
            return Some(decode_html_entities(&after[..end]));
        }
    }
    let single_pat = format!("{attr_name}='");
    if let Some(idx) = tag.find(&single_pat) {
        let after = &tag[idx + single_pat.len()..];
        if let Some(end) = after.find('\'') {
            return Some(decode_html_entities(&after[..end]));
        }
    }
    None
}

fn extract_ddg_real_url(raw_href: &str) -> Option<String> {
    let trimmed = raw_href.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = if let Some(idx) = trimmed.find("uddg=") {
        let after = &trimmed[idx + 5..];
        let encoded = match after.find('&') {
            Some(amp) => &after[..amp],
            None => after,
        };
        percent_decode(encoded)
    } else if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else {
        trimmed.to_string()
    };

    if !(candidate.starts_with("http://") || candidate.starts_with("https://")) {
        return None;
    }
    if candidate.contains("duckduckgo.com/y.js") || candidate.contains("ad_domain=") {
        return None;
    }

    Some(candidate)
}

fn parse_ddg_html_results(html: &str, max_items: usize) -> Vec<WebSearchHit> {
    let mut hits = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = 0usize;

    while hits.len() < max_items && cursor < html.len() {
        let Some(rel_pos) = html[cursor..].find("result__a") else {
            break;
        };
        let marker_pos = cursor + rel_pos;
        cursor = marker_pos + "result__a".len();

        let Some(tag_start) = html[..marker_pos].rfind("<a") else {
            continue;
        };
        let Some(tag_end_rel) = html[marker_pos..].find('>') else {
            continue;
        };
        let tag_end = marker_pos + tag_end_rel;
        let open_tag = &html[tag_start..=tag_end];

        let Some(raw_href) = extract_attr(open_tag, "href") else {
            continue;
        };
        let Some(uri) = extract_ddg_real_url(&raw_href) else {
            continue;
        };
        if !seen.insert(uri.clone()) {
            continue;
        }

        let Some(close_a_rel) = html[tag_end + 1..].find("</a>") else {
            continue;
        };
        let title_end = tag_end + 1 + close_a_rel;
        let title = strip_html_tags(&html[tag_end + 1..title_end]);
        if title.is_empty() {
            continue;
        }

        let lookahead_end = html[title_end..]
            .find("result__a")
            .map(|offset| title_end + offset)
            .unwrap_or(html.len());
        let block = &html[title_end..lookahead_end];

        let snippet = if let Some(snip_pos) = block.find("result__snippet") {
            if let Some(snip_open_rel) = block[snip_pos..].find('>') {
                let snip_content_start = snip_pos + snip_open_rel + 1;
                let snip_rest = &block[snip_content_start..];
                let snip_close = snip_rest
                    .find("</a>")
                    .or_else(|| snip_rest.find("</div>"))
                    .unwrap_or(snip_rest.len());
                strip_html_tags(&snip_rest[..snip_close])
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        hits.push(WebSearchHit {
            title,
            uri,
            snippet,
        });
    }

    hits
}

fn parse_ddg_lite_results(html: &str, max_items: usize) -> Vec<WebSearchHit> {
    let mut hits = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = 0usize;

    while hits.len() < max_items && cursor < html.len() {
        let Some(rel_pos) = html[cursor..].find("result-link") else {
            break;
        };
        let marker_pos = cursor + rel_pos;
        cursor = marker_pos + "result-link".len();

        let Some(tag_start) = html[..marker_pos].rfind("<a") else {
            continue;
        };
        let Some(tag_end_rel) = html[marker_pos..].find('>') else {
            continue;
        };
        let tag_end = marker_pos + tag_end_rel;
        let open_tag = &html[tag_start..=tag_end];

        let Some(raw_href) = extract_attr(open_tag, "href") else {
            continue;
        };
        let Some(uri) = extract_ddg_real_url(&raw_href) else {
            continue;
        };
        if !seen.insert(uri.clone()) {
            continue;
        }

        let Some(close_a_rel) = html[tag_end + 1..].find("</a>") else {
            continue;
        };
        let title_end = tag_end + 1 + close_a_rel;
        let title = strip_html_tags(&html[tag_end + 1..title_end]);
        if title.is_empty() {
            continue;
        }

        let lookahead_end = html[title_end..]
            .find("result-link")
            .map(|offset| title_end + offset)
            .unwrap_or(html.len());
        let block = &html[title_end..lookahead_end];

        let snippet = if let Some(snip_pos) = block.find("result-snippet") {
            if let Some(snip_open_rel) = block[snip_pos..].find('>') {
                let snip_content_start = snip_pos + snip_open_rel + 1;
                let snip_rest = &block[snip_content_start..];
                let snip_close = snip_rest.find("</td>").unwrap_or(snip_rest.len());
                strip_html_tags(&snip_rest[..snip_close])
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        hits.push(WebSearchHit {
            title,
            uri,
            snippet,
        });
    }

    hits
}

async fn search_ddg_instant_answer(
    client: &reqwest::Client,
    query: &str,
    max_items: usize,
) -> Vec<WebSearchHit> {
    let mut hits = Vec::new();
    let mut seen = HashSet::new();

    let Ok(resp) = client
        .get("https://api.duckduckgo.com/")
        .query(&[
            ("q", query),
            ("format", "json"),
            ("no_html", "1"),
            ("skip_disambig", "1"),
        ])
        .send()
        .await
    else {
        return hits;
    };

    if !resp.status().is_success() {
        return hits;
    }

    let Ok(json_val) = resp.json::<Value>().await else {
        return hits;
    };

    if let (Some(abstract_text), Some(abstract_url)) = (
        json_val.get("AbstractText").and_then(Value::as_str),
        json_val.get("AbstractURL").and_then(Value::as_str),
    ) {
        let text = abstract_text.trim();
        let uri = abstract_url.trim();
        if !text.is_empty() && !uri.is_empty() && seen.insert(uri.to_string()) {
            let title = json_val
                .get("Heading")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(uri)
                .to_string();
            hits.push(WebSearchHit {
                title,
                uri: uri.to_string(),
                snippet: text.to_string(),
            });
        }
    }

    if let Some(topics) = json_val.get("RelatedTopics").and_then(Value::as_array) {
        for topic in topics {
            if hits.len() >= max_items {
                break;
            }
            if let (Some(text), Some(uri)) = (
                topic.get("Text").and_then(Value::as_str),
                topic.get("FirstURL").and_then(Value::as_str),
            ) {
                let cleaned_text = text.trim();
                let cleaned_uri = uri.trim();
                if !cleaned_text.is_empty()
                    && !cleaned_uri.is_empty()
                    && seen.insert(cleaned_uri.to_string())
                {
                    let title = cleaned_text
                        .split(" - ")
                        .next()
                        .unwrap_or(cleaned_text)
                        .chars()
                        .take(72)
                        .collect::<String>();
                    hits.push(WebSearchHit {
                        title,
                        uri: cleaned_uri.to_string(),
                        snippet: cleaned_text.to_string(),
                    });
                }
            }
        }
    }

    hits
}

fn build_presearch_query(prompt: &str) -> String {
    let cleaned = prompt
        .trim()
        .trim_start_matches(|c: char| matches!(c, '/' | '!'))
        .trim_end_matches(|c: char| matches!(c, '?' | '!' | '.' | ',' | ';'))
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    cleaned.chars().take(160).collect()
}

fn format_presearch_context(query: &str, now_formatted: &str, hits: &[WebSearchHit]) -> String {
    let mut context = format!(
        "[Kết quả tìm kiếm web trực tiếp cho \"{query}\" — Thời gian hiện tại: {now_formatted}]\n"
    );
    for (idx, hit) in hits.iter().enumerate() {
        context.push_str(&format!("{}. {} ({})\n", idx + 1, hit.title, hit.uri));
        if !hit.snippet.is_empty() {
            context.push_str(&format!("   {}\n", hit.snippet));
        }
    }
    context.push_str(
        "Hãy ưu tiên tuyệt đối dữ liệu mới nhất từ các kết quả web trên để trả lời câu hỏi của người dùng.",
    );
    context
}

async fn search_web_free(client: &reqwest::Client, query: &str) -> Vec<WebSearchHit> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if let Ok(resp) = client
        .get("https://html.duckduckgo.com/html/")
        .header("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7")
        .query(&[("q", trimmed), ("kl", "wt-wt")])
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(body) = resp.text().await {
                let parsed = parse_ddg_html_results(&body, MAX_WEB_RESULTS);
                if !parsed.is_empty() {
                    return parsed;
                }
            }
        }
    }

    if let Ok(resp) = client
        .get("https://lite.duckduckgo.com/lite/")
        .header("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7")
        .query(&[("q", trimmed), ("kl", "wt-wt")])
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(body) = resp.text().await {
                let parsed = parse_ddg_lite_results(&body, MAX_WEB_RESULTS);
                if !parsed.is_empty() {
                    return parsed;
                }
            }
        }
    }

    search_ddg_instant_answer(client, trimmed, MAX_WEB_RESULTS).await
}

fn build_tool_declarations(
    web_search: bool,
    allow_screen_capture: bool,
    allow_pc_control: bool,
) -> Vec<Value> {
    let mut decls = Vec::new();

    if web_search {
        decls.push(json!({
            "name": "web_search",
            "description": "Tìm kiếm thông tin mới nhất trên Internet (tin tức, thời sự, giá cả, thời tiết, tài liệu).",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "query": {
                        "type": "STRING",
                        "description": "Từ khóa tìm kiếm rõ ràng, ngắn gọn."
                    }
                },
                "required": ["query"]
            }
        }));
    }

    if allow_screen_capture {
        decls.push(json!({
            "name": "capture_screen",
            "description": "Chụp ảnh màn hình hiện tại của máy tính người dùng để xem đề thi, bài tập, lỗi code, hóa đơn, ảnh chuyển khoản, từ vựng hoặc nội dung đang mở.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "Lý do ngắn gọn cần xem màn hình."
                    }
                },
                "required": ["reason"]
            }
        }));
    }

    if allow_pc_control {
        decls.push(json!({
            "name": "open_app_or_url",
            "description": "Mở ứng dụng Windows (chrome, edge, notepad, calculator, explorer, vscode, cmd, powershell, settings, taskmgr, paint, spotify, discord...), thư mục (downloads, desktop, documents) hoặc URL website.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "target": {
                        "type": "STRING",
                        "description": "Tên ứng dụng, bí danh thư mục hoặc đường dẫn URL/file cần mở."
                    }
                },
                "required": ["target"]
            }
        }));

        decls.push(json!({
            "name": "control_volume",
            "description": "Xem hoặc điều chỉnh âm lượng loa hệ thống Windows.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "action": {
                        "type": "STRING",
                        "description": "Một trong các giá trị: get, set, up, down, mute, unmute, toggle_mute."
                    },
                    "level": {
                        "type": "INTEGER",
                        "description": "Mức phần trăm (0-100) cho action=set, hoặc bước tăng/giảm cho up/down (mặc định 10)."
                    }
                },
                "required": ["action"]
            }
        }));

        decls.push(json!({
            "name": "control_media",
            "description": "Điều khiển trình phát nhạc/video đang chạy trên máy tính.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "action": {
                        "type": "STRING",
                        "description": "Một trong các giá trị: toggle_play, next, previous."
                    }
                },
                "required": ["action"]
            }
        }));

        decls.push(json!({
            "name": "read_clipboard",
            "description": "Đọc nội dung văn bản người dùng vừa sao chép (Ctrl+C) trong Clipboard.",
            "parameters": {
                "type": "OBJECT",
                "properties": {}
            }
        }));

        decls.push(json!({
            "name": "write_clipboard",
            "description": "Sao chép văn bản vào Clipboard Windows để người dùng dán (Ctrl+V) ngay.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "text": {
                        "type": "STRING",
                        "description": "Nội dung văn bản cần chép vào Clipboard."
                    }
                },
                "required": ["text"]
            }
        }));

        decls.push(json!({
            "name": "nusa_action",
            "description": "Điều khiển tiện ích bên trong Nusa: thêm lịch (calendar/add_event), Pomodoro (pomodoro/start|pause|reset|skip), nước uống (water/add|reset), hoặc chuyển trang Notch (notch/switch_page).",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "target": {
                        "type": "STRING",
                        "description": "Một trong: calendar, pomodoro, water, notch."
                    },
                    "action": {
                        "type": "STRING",
                        "description": "calendar -> add_event; pomodoro -> start|pause|toggle|reset|skip; water -> add|reset; notch -> switch_page."
                    },
                    "title": {
                        "type": "STRING",
                        "description": "Tên sự kiện (cho calendar/add_event)."
                    },
                    "date": {
                        "type": "STRING",
                        "description": "Ngày định dạng YYYY-MM-DD (mặc định hôm nay)."
                    },
                    "time": {
                        "type": "STRING",
                        "description": "Giờ sự kiện ví dụ 09:30."
                    },
                    "note": {
                        "type": "STRING",
                        "description": "Ghi chú thêm."
                    },
                    "amountMl": {
                        "type": "INTEGER",
                        "description": "Lượng nước ml cần cộng (cho water/add)."
                    },
                    "page": {
                        "type": "STRING",
                        "description": "Trang đích: music, pomodoro, water, weather, shelf, calendar, system, ai."
                    }
                },
                "required": ["target", "action"]
            }
        }));

        decls.push(json!({
            "name": "run_powershell_command",
            "description": "Đề xuất chạy một lệnh PowerShell trên Windows cho tác vụ file, thư mục, tiến trình, mạng hoặc hệ thống nâng cao. Lệnh luôn được hiển thị để người dùng duyệt trước khi chạy.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "command": {
                        "type": "STRING",
                        "description": "Lệnh PowerShell ngắn gọn, rõ ràng và an toàn."
                    },
                    "explanation": {
                        "type": "STRING",
                        "description": "Giải thích ngắn gọn bằng tiếng Việt lệnh này làm gì."
                    }
                },
                "required": ["command", "explanation"]
            }
        }));
    }

    decls
}

fn build_generate_body(
    system_text: &str,
    contents: &[Value],
    tool_declarations: &[Value],
    thinking_mode: ThinkingMode<'_>,
) -> Value {
    let mut gen_cfg = serde_json::Map::new();
    gen_cfg.insert("maxOutputTokens".to_string(), json!(MAX_OUTPUT_TOKENS));

    match thinking_mode {
        ThinkingMode::Level(lvl) => {
            gen_cfg.insert(
                "thinkingConfig".to_string(),
                json!({ "thinkingLevel": lvl }),
            );
        }
        ThinkingMode::Budget(budget) => {
            gen_cfg.insert(
                "thinkingConfig".to_string(),
                json!({ "thinkingBudget": budget }),
            );
        }
        ThinkingMode::Omit => {}
    }

    let mut body = json!({
        "systemInstruction": {
            "parts": [{ "text": system_text }]
        },
        "contents": contents,
        "generationConfig": Value::Object(gen_cfg)
    });

    if !tool_declarations.is_empty() {
        if let Some(obj) = body.as_object_mut() {
            obj.insert(
                "tools".to_string(),
                json!([{ "functionDeclarations": tool_declarations }]),
            );
        }
    }

    body
}

fn primary_thinking_mode<'a>(state: &AiState, model: &str, level: &'a str) -> ThinkingMode<'a> {
    if model_skips_thinking(state, model) {
        return ThinkingMode::Omit;
    }

    if model.starts_with("gemini-1.5-") || model.starts_with("gemini-2.0-") {
        return ThinkingMode::Omit;
    }

    if model.contains("flash-lite") {
        if level == "off" {
            return ThinkingMode::Omit;
        }
        let budget = match level {
            "low" => 1024,
            "medium" => 4096,
            _ => 8192,
        };
        return ThinkingMode::Budget(budget);
    }

    if model.starts_with("gemini-2.5-pro") {
        let budget = match level {
            "off" | "low" => 1024,
            "medium" => 4096,
            _ => 8192,
        };
        return ThinkingMode::Budget(budget);
    }

    if model.starts_with("gemini-2.5-")
        || model == "gemini-flash-latest"
        || model == "gemini-pro-latest"
    {
        let budget = match level {
            "off" => 0,
            "low" => 1024,
            "medium" => 4096,
            _ => 8192,
        };
        return ThinkingMode::Budget(budget);
    }

    if model.starts_with("gemini-4-") || model.starts_with("gemini-3") {
        return if level == "off" {
            ThinkingMode::Level("minimal")
        } else {
            ThinkingMode::Level(level)
        };
    }

    ThinkingMode::Omit
}

fn is_pure_text_part(part: &Value) -> bool {
    let Some(obj) = part.as_object() else {
        return false;
    };
    obj.len() == 1 && obj.get("text").and_then(Value::as_str).is_some()
}

fn push_raw_part(raw_model_parts: &mut Vec<Value>, part: Value) {
    if is_pure_text_part(&part) {
        if let (Some(prev), Some(next_txt)) = (
            raw_model_parts.last_mut(),
            part.get("text").and_then(Value::as_str),
        ) {
            if is_pure_text_part(prev) {
                if let Some(prev_obj) = prev.as_object_mut() {
                    if let Some(Value::String(existing)) = prev_obj.get_mut("text") {
                        existing.push_str(next_txt);
                        return;
                    }
                }
            }
        }
    }
    raw_model_parts.push(part);
}

struct StreamTextFilter {
    decided: bool,
    pending: String,
}

impl StreamTextFilter {
    fn new(watch_marker: bool) -> Self {
        Self {
            decided: !watch_marker,
            pending: String::new(),
        }
    }

    fn push(&mut self, app: &AppHandle, text: &str) {
        if self.decided {
            let _ = app.emit(
                "ai:stream-delta",
                StreamDeltaPayload {
                    delta: text.to_string(),
                },
            );
            return;
        }

        self.pending.push_str(text);
        let trimmed_start = self.pending.trim_start();
        if trimmed_start.is_empty() {
            return;
        }

        if NEED_SCREEN_MARKER.starts_with(trimmed_start)
            || trimmed_start.starts_with(NEED_SCREEN_MARKER)
        {
            return;
        }

        self.decided = true;
        let buffered = std::mem::take(&mut self.pending);
        let _ = app.emit("ai:stream-delta", StreamDeltaPayload { delta: buffered });
    }

    fn finish(&mut self, app: &AppHandle) {
        if !self.decided && !self.pending.is_empty() {
            let trimmed = self.pending.trim();
            if !trimmed.starts_with(NEED_SCREEN_MARKER) {
                let buffered = std::mem::take(&mut self.pending);
                let _ = app.emit("ai:stream-delta", StreamDeltaPayload { delta: buffered });
            } else {
                self.pending.clear();
            }
        }
    }
}

fn process_sse_line(
    app: &AppHandle,
    line: &str,
    filter: &mut StreamTextFilter,
    reply_text: &mut String,
    calls: &mut Vec<(String, Value)>,
    raw_model_parts: &mut Vec<Value>,
    emitted_any_text: &mut bool,
) {
    let trimmed = line.trim();
    let Some(data_raw) = trimmed.strip_prefix("data:") else {
        return;
    };
    let json_str = data_raw.trim();
    if json_str.is_empty() || json_str == "[DONE]" {
        return;
    }

    let Ok(chunk_val) = serde_json::from_str::<Value>(json_str) else {
        return;
    };

    let Some(parts) = chunk_val
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
    else {
        return;
    };

    for part in parts {
        push_raw_part(raw_model_parts, part.clone());

        if part.get("thought").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }

        if let Some(text) = part.get("text").and_then(Value::as_str) {
            if !text.is_empty() {
                *emitted_any_text = true;
                reply_text.push_str(text);
                filter.push(app, text);
            }
        }

        if let Some(fc) = part.get("functionCall") {
            if let Some(name) = fc.get("name").and_then(Value::as_str) {
                let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                calls.push((name.to_string(), args));
            }
        }
    }
}

async fn post_gemini_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    body: &Value,
    watch_screen_marker: bool,
) -> Result<StreamOutcome, String> {
    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
    );

    let mut resp = client
        .post(&endpoint)
        .header("x-goog-api-key", api_key)
        .header("Accept", "text/event-stream")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Gemini API: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        let err_payload = serde_json::from_str::<Value>(&err_text).unwrap_or_else(|_| {
            json!({
                "error": { "message": err_text }
            })
        });
        return Ok(StreamOutcome::HttpError(status, err_payload));
    }

    let mut line_buf: Vec<u8> = Vec::with_capacity(4096);
    let mut filter = StreamTextFilter::new(watch_screen_marker);
    let mut reply_text = String::new();
    let mut calls: Vec<(String, Value)> = Vec::new();
    let mut raw_model_parts: Vec<Value> = Vec::new();
    let mut emitted_any_text = false;

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Lỗi đọc luồng phản hồi từ Gemini API: {e}"))?
    {
        line_buf.extend_from_slice(&chunk);

        while let Some(newline_pos) = line_buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = line_buf.drain(..=newline_pos).collect();
            let line_str = String::from_utf8_lossy(&line_bytes);
            process_sse_line(
                app,
                &line_str,
                &mut filter,
                &mut reply_text,
                &mut calls,
                &mut raw_model_parts,
                &mut emitted_any_text,
            );
        }
    }

    if !line_buf.is_empty() {
        let line_str = String::from_utf8_lossy(&line_buf);
        process_sse_line(
            app,
            &line_str,
            &mut filter,
            &mut reply_text,
            &mut calls,
            &mut raw_model_parts,
            &mut emitted_any_text,
        );
    }

    filter.finish(app);

    Ok(StreamOutcome::Success {
        reply_text: reply_text.trim().to_string(),
        calls,
        raw_model_parts,
        emitted_any_text,
    })
}

fn is_thinking_param_error(payload: &Value) -> bool {
    let msg_lower = payload
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    msg_lower.contains("thinking") || msg_lower.contains("minimal")
}

fn is_permanent_model_unavailable(status: reqwest::StatusCode, payload: &Value) -> bool {
    let code = status.as_u16();
    if code == 404 {
        return true;
    }
    if code == 400 || code == 403 {
        let msg = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();
        if msg.contains("model")
            && (msg.contains("not found")
                || msg.contains("no longer available")
                || msg.contains("not supported")
                || msg.contains("deprecated"))
        {
            return true;
        }
    }
    false
}

fn should_try_next_model(status: reqwest::StatusCode, payload: &Value) -> bool {
    matches!(status.as_u16(), 404 | 429 | 500 | 503)
        || is_permanent_model_unavailable(status, payload)
}

#[allow(clippy::too_many_arguments)]
async fn stream_one_model(
    app: &AppHandle,
    ai_state: &AiState,
    api_key: &str,
    system_text: &str,
    contents: &[Value],
    tool_declarations: &[Value],
    model: &str,
    level: &str,
    watch_screen_marker: bool,
) -> Result<StreamOutcome, String> {
    let primary_mode = primary_thinking_mode(ai_state, model, level);
    let body = build_generate_body(system_text, contents, tool_declarations, primary_mode);
    let outcome = post_gemini_stream(
        app,
        &ai_state.api_client,
        api_key,
        model,
        &body,
        watch_screen_marker,
    )
    .await?;

    if let StreamOutcome::HttpError(status, ref payload) = outcome {
        if status.as_u16() == 400 && is_thinking_param_error(payload) {
            mark_model_no_thinking(ai_state, model);
            let omit_body =
                build_generate_body(system_text, contents, tool_declarations, ThinkingMode::Omit);
            return post_gemini_stream(
                app,
                &ai_state.api_client,
                api_key,
                model,
                &omit_body,
                watch_screen_marker,
            )
            .await;
        }
    }

    Ok(outcome)
}

fn build_candidate_queue(
    requested_model: &str,
    discovered: &[String],
    last_working: Option<&str>,
    dead_models: &HashSet<String>,
) -> Vec<String> {
    let mut queue: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if requested_model != "auto" && seen.insert(requested_model.to_string()) {
        queue.push(requested_model.to_string());
    } else if let Some(working) = last_working {
        if !dead_models.contains(working)
            && discovered.iter().any(|m| m == working)
            && seen.insert(working.to_string())
        {
            queue.push(working.to_string());
        }
    }

    for m in discovered {
        if !dead_models.contains(m) && seen.insert(m.clone()) {
            queue.push(m.clone());
        }
    }

    for &fallback in NAJIMEZ_PRIORITY_MODELS {
        if !dead_models.contains(fallback) && seen.insert(fallback.to_string()) {
            queue.push(fallback.to_string());
        }
    }

    if queue.is_empty() {
        for &fallback in NAJIMEZ_PRIORITY_MODELS {
            queue.push(fallback.to_string());
        }
    }

    queue
}

#[allow(clippy::too_many_arguments)]
async fn call_gemini_stream_with_auto_fallback(
    app: &AppHandle,
    ai_state: &AiState,
    api_key: &str,
    system_text: &str,
    contents: &[Value],
    tool_declarations: &[Value],
    candidates: &[String],
    used_model: &mut String,
    used_level: &mut String,
    watch_screen_marker: bool,
) -> Result<(String, Vec<(String, Value)>, Vec<Value>), String> {
    let mut last_error: Option<(reqwest::StatusCode, Value, String)> = None;

    for (idx, candidate_model) in candidates.iter().enumerate() {
        let candidate_level = normalize_thinking_level(candidate_model, used_level);

        if idx > 0 {
            let _ = app.emit("ai:stream-reset", ());
            emit_stream_status(app, &format!("Đang chuyển sang {candidate_model}..."));
        }

        let outcome = stream_one_model(
            app,
            ai_state,
            api_key,
            system_text,
            contents,
            tool_declarations,
            candidate_model,
            &candidate_level,
            watch_screen_marker,
        )
        .await?;

        match outcome {
            StreamOutcome::Success {
                reply_text,
                calls,
                raw_model_parts,
                emitted_any_text: _,
            } => {
                *used_model = candidate_model.clone();
                *used_level = candidate_level;
                remember_working_model(app, ai_state, api_key, candidate_model);
                return Ok((reply_text, calls, raw_model_parts));
            }
            StreamOutcome::HttpError(status, payload) => {
                if is_permanent_model_unavailable(status, &payload) {
                    mark_model_dead(ai_state, candidate_model);
                }
                let can_retry = should_try_next_model(status, &payload);
                last_error = Some((status, payload, candidate_model.clone()));
                if !can_retry {
                    break;
                }
            }
        }
    }

    if let Some((status, payload, failed_model)) = last_error {
        let api_msg = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Yêu cầu thất bại");
        if status.as_u16() == 429 {
            return Err(format!(
                "Gemini API (429): Hết hạn mức trên tất cả model khả dụng (cuối: {failed_model}). Chi tiết: {api_msg}"
            ));
        }
        return Err(format!(
            "Gemini API ({}, {failed_model}): {api_msg}",
            status.as_u16()
        ));
    }

    Err("Không tìm thấy model Gemini khả dụng cho API key này.".to_string())
}

async fn execute_safe_tool(
    app: &AppHandle,
    search_client: &reqwest::Client,
    name: &str,
    args: &Value,
    sources: &mut Vec<AiSourceLink>,
    search_queries: &mut Vec<String>,
    actions_taken: &mut Vec<String>,
) -> Vec<Value> {
    match name {
        "web_search" => {
            let query = args
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if query.is_empty() {
                return vec![json!({
                    "functionResponse": {
                        "name": "web_search",
                        "response": { "error": "Thiếu từ khóa tìm kiếm" }
                    }
                })];
            }

            emit_stream_status(app, &format!("Đang tìm web: {query}..."));
            let hits = search_web_free(search_client, &query).await;
            search_queries.push(query.clone());
            actions_taken.push(format!("Tìm web: {query}"));

            let mut existing_uris: HashSet<String> =
                sources.iter().map(|s| s.uri.clone()).collect();
            let results_json: Vec<Value> = hits
                .iter()
                .map(|h| {
                    if existing_uris.insert(h.uri.clone()) {
                        sources.push(AiSourceLink {
                            title: h.title.clone(),
                            uri: h.uri.clone(),
                        });
                    }
                    json!({
                        "title": h.title,
                        "url": h.uri,
                        "snippet": h.snippet
                    })
                })
                .collect();

            vec![json!({
                "functionResponse": {
                    "name": "web_search",
                    "response": {
                        "query": query,
                        "count": results_json.len(),
                        "results": results_json
                    }
                }
            })]
        }

        "capture_screen" => {
            emit_stream_status(app, "Đang chụp màn hình...");
            let app_clone = app.clone();
            let cap_res =
                tauri::async_runtime::spawn_blocking(move || capture_primary_screen(&app_clone))
                    .await
                    .map_err(|e| format!("Lỗi luồng chụp màn hình: {e}"))
                    .and_then(|r| r);

            match cap_res {
                Ok(shot) => {
                    actions_taken.push("Đã chụp màn hình".to_string());
                    emit_stream_status(app, "Đang phân tích màn hình...");
                    vec![
                        json!({
                            "functionResponse": {
                                "name": "capture_screen",
                                "response": {
                                    "status": "captured",
                                    "width": shot.width,
                                    "height": shot.height,
                                    "note": "Ảnh chụp màn hình hiện tại đã được đính kèm ngay trong lượt này."
                                }
                            }
                        }),
                        json!({
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": shot.jpeg_base64
                            }
                        }),
                    ]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "capture_screen",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "open_app_or_url" => {
            let target = args
                .get("target")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            emit_stream_status(app, &format!("Đang mở {target}..."));
            let res = tauri::async_runtime::spawn_blocking(move || open_app_or_url(&target))
                .await
                .map_err(|e| e.to_string())
                .and_then(|r| r);

            match res {
                Ok(opened) => {
                    actions_taken.push(format!("Đã mở: {opened}"));
                    vec![json!({
                        "functionResponse": {
                            "name": "open_app_or_url",
                            "response": { "status": "opened", "target": opened }
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "open_app_or_url",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "control_volume" => {
            emit_stream_status(app, "Đang chỉnh âm lượng...");
            let action = args
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or("get")
                .to_string();
            let level = args.get("level").and_then(Value::as_i64);
            let action_clone = action.clone();

            let res = tauri::async_runtime::spawn_blocking(move || {
                execute_volume_action(&action_clone, level)
            })
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);

            match res {
                Ok(val) => {
                    if let Some(pct) = val.get("volumePercent").and_then(Value::as_i64) {
                        let muted = val.get("muted").and_then(Value::as_bool).unwrap_or(false);
                        actions_taken.push(if muted {
                            "Đã tắt tiếng".to_string()
                        } else {
                            format!("Âm lượng: {pct}%")
                        });
                    }
                    vec![json!({
                        "functionResponse": {
                            "name": "control_volume",
                            "response": val
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "control_volume",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "control_media" => {
            emit_stream_status(app, "Đang điều khiển nhạc...");
            let action = args
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or("toggle_play")
                .to_string();
            let action_clone = action.clone();

            let res =
                tauri::async_runtime::spawn_blocking(move || execute_media_action(&action_clone))
                    .await
                    .map_err(|e| e.to_string())
                    .and_then(|r| r);

            match res {
                Ok(val) => {
                    actions_taken.push(format!("Media: {action}"));
                    vec![json!({
                        "functionResponse": {
                            "name": "control_media",
                            "response": val
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "control_media",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "read_clipboard" => {
            emit_stream_status(app, "Đang đọc Clipboard...");
            let res = tauri::async_runtime::spawn_blocking(read_clipboard_text)
                .await
                .map_err(|e| e.to_string())
                .and_then(|r| r);

            match res {
                Ok(text) => {
                    actions_taken.push("Đã đọc Clipboard".to_string());
                    vec![json!({
                        "functionResponse": {
                            "name": "read_clipboard",
                            "response": {
                                "empty": text.is_empty(),
                                "text": text
                            }
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "read_clipboard",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "write_clipboard" => {
            emit_stream_status(app, "Đang chép vào Clipboard...");
            let text = args
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let res =
                tauri::async_runtime::spawn_blocking(move || write_clipboard_text(&text))
                    .await
                    .map_err(|e| e.to_string())
                    .and_then(|r| r);

            match res {
                Ok(()) => {
                    actions_taken.push("Đã chép vào Clipboard".to_string());
                    vec![json!({
                        "functionResponse": {
                            "name": "write_clipboard",
                            "response": { "status": "copied" }
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "write_clipboard",
                        "response": { "error": err }
                    }
                })],
            }
        }

        "nusa_action" => {
            emit_stream_status(app, "Đang thực hiện trên Nusa...");
            let target = args
                .get("target")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            let action = args
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();

            match dispatch_nusa_action(app, target, action, args.clone()) {
                Ok(val) => {
                    let badge = match (target, action) {
                        ("calendar", "add_event") => {
                            let title = args
                                .get("title")
                                .and_then(Value::as_str)
                                .unwrap_or("Lịch trình");
                            format!("Đã thêm lịch: {title}")
                        }
                        ("water", "add") => {
                            let ml = args
                                .get("amountMl")
                                .and_then(Value::as_i64)
                                .unwrap_or(250);
                            format!("Đã cộng +{ml}ml nước")
                        }
                        ("pomodoro", act) => format!("Pomodoro: {act}"),
                        ("notch", "switch_page") => {
                            let p = args.get("page").and_then(Value::as_str).unwrap_or("");
                            format!("Chuyển trang: {p}")
                        }
                        _ => format!("Nusa: {target}/{action}"),
                    };
                    actions_taken.push(badge);
                    vec![json!({
                        "functionResponse": {
                            "name": "nusa_action",
                            "response": val
                        }
                    })]
                }
                Err(err) => vec![json!({
                    "functionResponse": {
                        "name": "nusa_action",
                        "response": { "error": err }
                    }
                })],
            }
        }

        unknown => vec![json!({
            "functionResponse": {
                "name": unknown,
                "response": { "error": format!("Tool không tồn tại: {unknown}") }
            }
        })],
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_agent_loop(
    app: &AppHandle,
    ai_state: &AiState,
    api_key: &str,
    system_text: &str,
    working_contents: &mut Vec<Value>,
    tool_declarations: &[Value],
    candidates: &[String],
    used_model: &mut String,
    used_level: &mut String,
    sources: &mut Vec<AiSourceLink>,
    search_queries: &mut Vec<String>,
    actions_taken: &mut Vec<String>,
    watch_screen_marker: bool,
) -> Result<AiReplyPayload, String> {
    let mut active_candidates: Vec<String> = candidates.to_vec();

    for step in 0..MAX_AGENT_STEPS {
        let (reply_text, calls, raw_model_parts) = call_gemini_stream_with_auto_fallback(
            app,
            ai_state,
            api_key,
            system_text,
            working_contents,
            tool_declarations,
            &active_candidates,
            used_model,
            used_level,
            watch_screen_marker && step == 0,
        )
        .await?;

        if active_candidates.first().map(String::as_str) != Some(used_model.as_str()) {
            active_candidates.retain(|m| m != used_model);
            active_candidates.insert(0, used_model.clone());
        }

        if calls.is_empty() {
            let final_text = if reply_text.is_empty() {
                if !actions_taken.is_empty() {
                    format!("Đã thực hiện xong: {}.", actions_taken.join(", "))
                } else {
                    return Err("Mô hình trả về nội dung rỗng".to_string());
                }
            } else {
                reply_text
            };

            return Ok(AiReplyPayload {
                text: final_text,
                sources: sources.clone(),
                search_queries: search_queries.clone(),
                actions_taken: actions_taken.clone(),
                pending_command: None,
                model: used_model.clone(),
                thinking_level: used_level.clone(),
            });
        }

        if !raw_model_parts.is_empty() {
            working_contents.push(json!({
                "role": "model",
                "parts": raw_model_parts
            }));
        }

        let _ = app.emit("ai:stream-reset", ());

        let mut response_parts: Vec<Value> = Vec::new();
        for (idx, (call_name, call_args)) in calls.iter().enumerate() {
            if call_name == "run_powershell_command" {
                let command = call_args
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let explanation = call_args
                    .get("explanation")
                    .and_then(Value::as_str)
                    .unwrap_or("Chạy lệnh PowerShell trên máy tính")
                    .trim()
                    .to_string();

                let pending_id = generate_pending_id();
                let remaining_calls = calls[idx + 1..].to_vec();

                let session = PendingCommandSession {
                    id: pending_id.clone(),
                    command: command.clone(),
                    explanation: explanation.clone(),
                    prior_response_parts: response_parts,
                    remaining_calls,
                    working_contents: working_contents.clone(),
                    system_text: system_text.to_string(),
                    model: used_model.clone(),
                    thinking_level: used_level.clone(),
                    tool_declarations: tool_declarations.to_vec(),
                    sources: sources.clone(),
                    search_queries: search_queries.clone(),
                    actions_taken: actions_taken.clone(),
                };

                if let Ok(mut guard) = ai_state.pending_session.lock() {
                    *guard = Some(session);
                }

                let prompt_text = if reply_text.is_empty() {
                    "Mình cần bạn duyệt lệnh PowerShell bên dưới trước khi thực thi:".to_string()
                } else {
                    reply_text
                };

                return Ok(AiReplyPayload {
                    text: prompt_text,
                    sources: sources.clone(),
                    search_queries: search_queries.clone(),
                    actions_taken: actions_taken.clone(),
                    pending_command: Some(PendingCommandView {
                        id: pending_id,
                        command,
                        explanation,
                    }),
                    model: used_model.clone(),
                    thinking_level: used_level.clone(),
                });
            }

            let mut parts = execute_safe_tool(
                app,
                &ai_state.search_client,
                call_name,
                call_args,
                sources,
                search_queries,
                actions_taken,
            )
            .await;
            response_parts.append(&mut parts);
        }

        working_contents.push(json!({
            "role": "user",
            "parts": response_parts
        }));
    }

    Ok(AiReplyPayload {
        text: if actions_taken.is_empty() {
            "Đã đạt giới hạn số bước xử lý liên tiếp.".to_string()
        } else {
            format!("Đã thực hiện: {}.", actions_taken.join(", "))
        },
        sources: sources.clone(),
        search_queries: search_queries.clone(),
        actions_taken: actions_taken.clone(),
        pending_command: None,
        model: used_model.clone(),
        thinking_level: used_level.clone(),
    })
}

#[tauri::command]
pub fn get_ai_config(state: State<'_, AiState>) -> AiConfigView {
    current_config_view(&state)
}

#[tauri::command]
pub async fn refresh_ai_models(
    app: AppHandle,
    state: State<'_, AiState>,
) -> Result<AiConfigView, String> {
    let api_key = state
        .config
        .lock()
        .map(|g| g.api_key.trim().to_string())
        .map_err(|_| "Failed to lock AI config".to_string())?;

    if api_key.is_empty() {
        return Err("Chưa có Gemini API key để dò model.".to_string());
    }

    let _ = ensure_models_discovered(&app, &state, &api_key, true).await;
    Ok(current_config_view(&state))
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
        guard.config_version = AI_CONFIG_VERSION;
        guard.api_key = cleaned.clone();
        guard.clone()
    };

    if let Ok(mut cache) = state.discovery.lock() {
        *cache = ModelDiscoveryCache::default();
    }

    persist_config(&app, &updated)?;
    let view = current_config_view(&state);
    let _ = app.emit("ai:config-updated", view.clone());
    spawn_background_model_probe(app, state.inner().clone(), cleaned);
    Ok(view)
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
        guard.config_version = AI_CONFIG_VERSION;
        guard.api_key.clear();
        guard.clone()
    };

    if let Ok(mut cache) = state.discovery.lock() {
        *cache = ModelDiscoveryCache::default();
    }

    persist_config(&app, &updated)?;
    let view = current_config_view(&state);
    let _ = app.emit("ai:config-updated", view.clone());
    Ok(view)
}

#[tauri::command]
pub fn update_ai_settings(
    app: AppHandle,
    state: State<'_, AiState>,
    model: String,
    thinking_level: String,
    web_search: bool,
    allow_screen_capture: Option<bool>,
    allow_pc_control: Option<bool>,
) -> Result<AiConfigView, String> {
    let safe_model = normalize_model(&model);
    let safe_level = normalize_thinking_level(&safe_model, &thinking_level);

    let updated = {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "Failed to lock AI config".to_string())?;
        guard.config_version = AI_CONFIG_VERSION;
        guard.model = safe_model;
        guard.thinking_level = safe_level;
        guard.web_search = web_search;
        if let Some(screen) = allow_screen_capture {
            guard.allow_screen_capture = screen;
        }
        if let Some(pc) = allow_pc_control {
            guard.allow_pc_control = pc;
        }
        guard.clone()
    };

    persist_config(&app, &updated)?;
    let view = current_config_view(&state);
    let _ = app.emit("ai:config-updated", view.clone());
    Ok(view)
}

async fn capture_and_attach_screen(
    app: &AppHandle,
    working_contents: &mut [Value],
    actions_taken: &mut Vec<String>,
    status_label: &str,
    action_badge: &str,
) -> bool {
    emit_stream_status(app, status_label);
    let app_clone = app.clone();
    let cap_res =
        tauri::async_runtime::spawn_blocking(move || capture_primary_screen(&app_clone))
            .await
            .map_err(|e| format!("Lỗi luồng chụp màn hình: {e}"))
            .and_then(|r| r);

    match cap_res {
        Ok(shot) => {
            if let Some(last_user) = working_contents
                .iter_mut()
                .rev()
                .find(|c| c.get("role").and_then(Value::as_str) == Some("user"))
            {
                if let Some(parts) = last_user.get_mut("parts").and_then(Value::as_array_mut) {
                    parts.push(json!({
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": shot.jpeg_base64
                        }
                    }));
                    actions_taken.push(action_badge.to_string());
                    emit_stream_status(app, "Đang phân tích màn hình...");
                    return true;
                }
            }
            false
        }
        Err(err) => {
            actions_taken.push(format!("Lỗi chụp màn hình: {err}"));
            false
        }
    }
}

#[tauri::command]
pub async fn ai_send_message(
    app: AppHandle,
    notch_state: State<'_, NotchState>,
    state: State<'_, AiState>,
    messages: Vec<AiChatMessageInput>,
    model: Option<String>,
    thinking_level: Option<String>,
    web_search: Option<bool>,
) -> Result<AiReplyPayload, String> {
    let _busy_guard = AiBusyGuard::acquire(&notch_state);
    let _ = app.emit("ai:stream-reset", ());

    if let Ok(mut pending) = state.pending_session.lock() {
        *pending = None;
    }

    let stored = state
        .config
        .lock()
        .map(|g| g.clone())
        .map_err(|_| "Failed to read AI configuration".to_string())?;

    let api_key = stored.api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("Chưa cấu hình Gemini API key. Hãy nhập key trong Cài đặt → Ask Nusa.".to_string());
    }

    let requested_model = normalize_model(model.as_deref().unwrap_or(&stored.model));
    let mut used_level = normalize_thinking_level(
        &requested_model,
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

    let latest_user_prompt = trimmed_messages
        .iter()
        .rev()
        .find(|m| m.role != "model")
        .map(|m| m.text.trim().to_string())
        .unwrap_or_default();

    let discovered = ensure_models_discovered(&app, &state, &api_key, false).await;
    let (last_working, dead_models) = state
        .discovery
        .lock()
        .map(|g| (g.resolved_model.clone(), g.dead_models.clone()))
        .unwrap_or_else(|_| (None, HashSet::new()));
    let candidates = build_candidate_queue(
        &requested_model,
        &discovered,
        last_working.as_deref(),
        &dead_models,
    );
    let mut used_model = candidates
        .first()
        .cloned()
        .unwrap_or_else(|| "gemini-flash-lite-latest".to_string());

    let start_idx = trimmed_messages.len().saturating_sub(MAX_HISTORY_MESSAGES);
    let mut working_contents: Vec<Value> = trimmed_messages[start_idx..]
        .iter()
        .map(|m| {
            let role = if m.role == "model" { "model" } else { "user" };
            json!({
                "role": role,
                "parts": [{ "text": m.text.trim() }]
            })
        })
        .collect();

    let (need_web, need_screen, need_pc) = detect_tool_needs(
        &latest_user_prompt,
        effective_web_search,
        stored.allow_screen_capture,
        stored.allow_pc_control,
    );

    let now_info = get_local_datetime_info();
    let now_formatted = now_info
        .get("formatted")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let current_year = now_info
        .get("date")
        .and_then(Value::as_str)
        .and_then(|d| d.get(..4))
        .unwrap_or("");

    let mut sources: Vec<AiSourceLink> = Vec::new();
    let mut search_queries: Vec<String> = Vec::new();
    let mut actions_taken: Vec<String> = Vec::new();
    let mut screen_attached = false;
    let mut web_attached = false;

    if need_screen {
        screen_attached = capture_and_attach_screen(
            &app,
            &mut working_contents,
            &mut actions_taken,
            "Đang chụp màn hình...",
            "Đã chụp màn hình",
        )
        .await;
    }

    if need_web {
        let base_query = build_presearch_query(&latest_user_prompt);
        if base_query.chars().count() >= 3 {
            emit_stream_status(&app, &format!("Đang tìm web: {base_query}..."));
            let mut active_query = base_query.clone();
            let mut hits = search_web_free(&state.search_client, &active_query).await;

            if hits.is_empty() && !current_year.is_empty() && !active_query.contains(current_year) {
                active_query = format!("{base_query} {current_year}");
                hits = search_web_free(&state.search_client, &active_query).await;
            }

            if !hits.is_empty() {
                let mut seen_uris: HashSet<String> =
                    sources.iter().map(|s| s.uri.clone()).collect();
                for hit in &hits {
                    if seen_uris.insert(hit.uri.clone()) {
                        sources.push(AiSourceLink {
                            title: hit.title.clone(),
                            uri: hit.uri.clone(),
                        });
                    }
                }

                let web_context = format_presearch_context(&active_query, &now_formatted, &hits);
                if let Some(last_user) = working_contents
                    .iter_mut()
                    .rev()
                    .find(|c| c.get("role").and_then(Value::as_str) == Some("user"))
                {
                    if let Some(parts) = last_user.get_mut("parts").and_then(Value::as_array_mut) {
                        parts.push(json!({ "text": web_context }));
                        web_attached = true;
                        search_queries.push(active_query.clone());
                        actions_taken.push(format!("Tìm web: {active_query}"));
                        emit_stream_status(&app, "Đang tổng hợp kết quả...");
                    }
                }
            }
        }
    }

    let can_auto_recover_screen = stored.allow_screen_capture && !screen_attached;

    let tool_declarations = build_tool_declarations(
        need_web && !web_attached,
        need_screen && !screen_attached,
        need_pc,
    );

    let system_text = if tool_declarations.is_empty() {
        match (screen_attached, web_attached) {
            (true, true) => format!(
                "{VISION_SYSTEM_PROMPT}\n{WEB_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}."
            ),
            (true, false) => format!(
                "{VISION_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}."
            ),
            (false, true) => format!(
                "{WEB_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}."
            ),
            (false, false) => {
                if can_auto_recover_screen {
                    FAST_CHAT_WITH_SCREEN_RECOVERY_PROMPT.to_string()
                } else {
                    FAST_CHAT_SYSTEM_PROMPT.to_string()
                }
            }
        }
    } else {
        let mut extra_notes = Vec::new();
        if screen_attached {
            extra_notes.push(
                "Ảnh chụp màn hình hiện tại ĐÃ được đính kèm sẵn trong tin nhắn cuối của người dùng, hãy quan sát trực tiếp ảnh này mà không cần gọi lại capture_screen.",
            );
        } else if can_auto_recover_screen {
            extra_notes.push(
                "Nếu câu hỏi thiếu dữ kiện vì đang nhắc tới thứ trên màn hình mà chưa có ảnh, TUYỆT ĐỐI KHÔNG bảo người dùng chụp ảnh — hãy trả về duy nhất `[[NEED_SCREEN]]`.",
            );
        }
        if web_attached {
            extra_notes.push(
                "Kết quả tìm kiếm web trực tiếp ĐÃ được đính kèm sẵn trong tin nhắn cuối của người dùng, hãy ưu tiên tuyệt đối dữ liệu mới nhất này thay vì kiến thức huấn luyện cũ.",
            );
        }
        if extra_notes.is_empty() {
            format!("{AGENT_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}.")
        } else {
            format!(
                "{AGENT_SYSTEM_PROMPT}\n{}\nThời gian hiện tại trên máy người dùng: {now_formatted}.",
                extra_notes.join("\n")
            )
        }
    };

    let base_contents_for_recovery = working_contents.clone();

    let first_reply = run_agent_loop(
        &app,
        &state,
        &api_key,
        &system_text,
        &mut working_contents,
        &tool_declarations,
        &candidates,
        &mut used_model,
        &mut used_level,
        &mut sources,
        &mut search_queries,
        &mut actions_taken,
        can_auto_recover_screen,
    )
    .await?;

    let wants_screen_recovery = can_auto_recover_screen
        && first_reply.pending_command.is_none()
        && (first_reply.text.contains(NEED_SCREEN_MARKER)
            || reply_asks_for_missing_screen_context(&first_reply.text));

    if wants_screen_recovery {
        let _ = app.emit("ai:stream-reset", ());
        let mut retry_contents = base_contents_for_recovery;
        let captured = capture_and_attach_screen(
            &app,
            &mut retry_contents,
            &mut actions_taken,
            "Thiếu ngữ cảnh · Đang tự chụp màn hình...",
            "Tự động chụp màn hình",
        )
        .await;

        if captured {
            let mut retry_candidates = candidates.clone();
            retry_candidates.retain(|m| m != &used_model);
            retry_candidates.insert(0, used_model.clone());

            let vision_system = if web_attached {
                format!(
                    "{VISION_SYSTEM_PROMPT}\n{WEB_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}."
                )
            } else {
                format!(
                    "{VISION_SYSTEM_PROMPT}\nThời gian hiện tại trên máy người dùng: {now_formatted}."
                )
            };

            return run_agent_loop(
                &app,
                &state,
                &api_key,
                &vision_system,
                &mut retry_contents,
                &[],
                &retry_candidates,
                &mut used_model,
                &mut used_level,
                &mut sources,
                &mut search_queries,
                &mut actions_taken,
                false,
            )
            .await;
        }
    }

    Ok(first_reply)
}

#[tauri::command]
pub async fn ai_resolve_pending_command(
    app: AppHandle,
    notch_state: State<'_, NotchState>,
    state: State<'_, AiState>,
    command_id: String,
    approved: bool,
) -> Result<AiReplyPayload, String> {
    let _busy_guard = AiBusyGuard::acquire(&notch_state);
    let _ = app.emit("ai:stream-reset", ());

    let session = {
        let mut guard = state
            .pending_session
            .lock()
            .map_err(|_| "Không truy cập được phiên lệnh chờ duyệt".to_string())?;
        match guard.take() {
            Some(s) if s.id == command_id => s,
            Some(other) => {
                *guard = Some(other);
                return Err("Lệnh chờ duyệt đã hết hạn hoặc không khớp.".to_string());
            }
            None => return Err("Không tìm thấy lệnh đang chờ duyệt.".to_string()),
        }
    };

    let stored = state
        .config
        .lock()
        .map(|g| g.clone())
        .map_err(|_| "Failed to read AI configuration".to_string())?;
    let api_key = stored.api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("Chưa cấu hình Gemini API key.".to_string());
    }

    let mut working_contents = session.working_contents;
    let mut response_parts = session.prior_response_parts;
    let mut sources = session.sources;
    let mut search_queries = session.search_queries;
    let mut actions_taken = session.actions_taken;
    let mut used_model = session.model;
    let mut used_level = session.thinking_level;

    if approved {
        emit_stream_status(&app, "Đang thực thi lệnh PowerShell...");
        let cmd_clone = session.command.clone();
        let exec_res = tauri::async_runtime::spawn_blocking(move || {
            run_user_confirmed_powershell(&cmd_clone)
        })
        .await
        .map_err(|e| format!("Lỗi luồng thực thi lệnh: {e}"))
        .and_then(|r| r);

        match exec_res {
            Ok(val) => {
                actions_taken.push(format!("Đã chạy lệnh: {}", session.explanation));
                response_parts.push(json!({
                    "functionResponse": {
                        "name": "run_powershell_command",
                        "response": val
                    }
                }));
            }
            Err(err) => {
                actions_taken.push("Lệnh PowerShell gặp lỗi".to_string());
                response_parts.push(json!({
                    "functionResponse": {
                        "name": "run_powershell_command",
                        "response": {
                            "approved": true,
                            "error": err
                        }
                    }
                }));
            }
        }
    } else {
        actions_taken.push("Đã từ chối chạy lệnh".to_string());
        response_parts.push(json!({
            "functionResponse": {
                "name": "run_powershell_command",
                "response": {
                    "approved": false,
                    "reason": "Người dùng đã từ chối thực thi lệnh PowerShell này."
                }
            }
        }));
    }

    for (rem_name, rem_args) in &session.remaining_calls {
        if rem_name == "run_powershell_command" {
            response_parts.push(json!({
                "functionResponse": {
                    "name": "run_powershell_command",
                    "response": {
                        "approved": false,
                        "reason": "Bỏ qua lệnh phụ trong cùng lượt."
                    }
                }
            }));
        } else {
            let mut parts = execute_safe_tool(
                &app,
                &state.search_client,
                rem_name,
                rem_args,
                &mut sources,
                &mut search_queries,
                &mut actions_taken,
            )
            .await;
            response_parts.append(&mut parts);
        }
    }

    working_contents.push(json!({
        "role": "user",
        "parts": response_parts
    }));

    let discovered = ensure_models_discovered(&app, &state, &api_key, false).await;
    let dead_models = state
        .discovery
        .lock()
        .map(|g| g.dead_models.clone())
        .unwrap_or_default();
    let candidates = build_candidate_queue(&used_model, &discovered, Some(&used_model), &dead_models);

    run_agent_loop(
        &app,
        &state,
        &api_key,
        &session.system_text,
        &mut working_contents,
        &session.tool_declarations,
        &candidates,
        &mut used_model,
        &mut used_level,
        &mut sources,
        &mut search_queries,
        &mut actions_taken,
        false,
    )
    .await
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
