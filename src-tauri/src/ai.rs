use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const AI_CONFIG_FILENAME: &str = "ai_config.json";
const DEFAULT_MODEL: &str = "gemini-4-hydrogen";
const DEFAULT_THINKING_LEVEL: &str = "low";
const MAX_HISTORY_MESSAGES: usize = 20;
const MAX_WEB_RESULTS: usize = 5;
const REQUEST_TIMEOUT_SECS: u64 = 90;
const SEARCH_TIMEOUT_SECS: u64 = 10;

const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SYSTEM_PROMPT: &str = "Bạn là trợ lý AI tích hợp trong thanh nổi Nusa trên máy tính Windows. Trả lời ngắn gọn, rõ ràng, đi thẳng vào trọng tâm bằng tiếng Việt (hoặc theo ngôn ngữ người dùng hỏi). Khi có khối ngữ cảnh tìm kiếm web đi kèm, hãy tổng hợp thông tin chính xác từ các nguồn đó và nêu rõ nếu nguồn không đủ dữ liệu.";

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

#[derive(Clone, Debug)]
struct WebSearchHit {
    title: String,
    uri: String,
    snippet: String,
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
        "gemini-2.5-flash" => "gemini-2.5-flash".to_string(),
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

fn current_utc_date_string() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let z = secs.div_euclid(86_400) + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{year:04}-{m:02}-{d:02}")
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

async fn search_web_free(query: &str) -> Vec<WebSearchHit> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(SEARCH_TIMEOUT_SECS))
        .user_agent(BROWSER_USER_AGENT)
        .build()
    else {
        return Vec::new();
    };

    if let Ok(resp) = client
        .get("https://html.duckduckgo.com/html/")
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

    search_ddg_instant_answer(&client, trimmed, MAX_WEB_RESULTS).await
}

fn build_thinking_config(model: &str, level: &str) -> Value {
    if model.starts_with("gemini-4-") {
        json!({
            "thinkingLevel": level
        })
    } else {
        let budget: u32 = match level {
            "low" => 1024,
            "medium" => 4096,
            _ => 8192,
        };
        json!({
            "thinkingBudget": budget
        })
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
    let view = to_config_view(&updated);
    let _ = app.emit("ai:config-updated", view.clone());
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
        guard.api_key.clear();
        guard.clone()
    };

    persist_config(&app, &updated)?;
    let view = to_config_view(&updated);
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
    let view = to_config_view(&updated);
    let _ = app.emit("ai:config-updated", view.clone());
    Ok(view)
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

    let latest_user_query = trimmed_messages
        .iter()
        .rev()
        .find(|m| m.role != "model")
        .map(|m| m.text.trim().to_string())
        .unwrap_or_default();

    let mut web_hits: Vec<WebSearchHit> = Vec::new();
    let mut search_queries: Vec<String> = Vec::new();

    if effective_web_search && latest_user_query.chars().count() >= 3 {
        web_hits = search_web_free(&latest_user_query).await;
        if !web_hits.is_empty() {
            search_queries.push(latest_user_query.clone());
        }
    }

    let start_idx = trimmed_messages.len().saturating_sub(MAX_HISTORY_MESSAGES);
    let window_slice = &trimmed_messages[start_idx..];
    let last_idx = window_slice.len().saturating_sub(1);
    let today_utc = current_utc_date_string();

    let contents: Vec<Value> = window_slice
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            let role = if m.role == "model" { "model" } else { "user" };
            let mut text = m.text.trim().to_string();

            if idx == last_idx && role == "user" && !web_hits.is_empty() {
                let mut context = format!(
                    "\n\n[Kết quả tìm kiếm web miễn phí — Ngày UTC: {today_utc}]\n"
                );
                for (i, hit) in web_hits.iter().enumerate() {
                    context.push_str(&format!("{}. {} ({})\n", i + 1, hit.title, hit.uri));
                    if !hit.snippet.is_empty() {
                        context.push_str(&format!("   {}\n", hit.snippet));
                    }
                }
                context.push_str(
                    "\nDựa trên ngữ cảnh web trên (nếu liên quan), hãy trả lời câu hỏi của người dùng ngắn gọn và chính xác.",
                );
                text.push_str(&context);
            }

            json!({
                "role": role,
                "parts": [{ "text": text }]
            })
        })
        .collect();

    let body = json!({
        "systemInstruction": {
            "parts": [{ "text": format!("{SYSTEM_PROMPT} Ngày hiện tại (UTC): {today_utc}.") }]
        },
        "contents": contents,
        "generationConfig": {
            "thinkingConfig": build_thinking_config(&effective_model, &effective_level)
        }
    });

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
        if status.as_u16() == 429 {
            return Err(format!(
                "Gemini API (429): Hết hạn mức cho model {effective_model}. Hãy thử đổi sang model Gemini 2.5 Flash hoặc kiểm tra hạn mức tại https://ai.dev/rate-limit. Chi tiết: {api_msg}"
            ));
        }
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

    let sources: Vec<AiSourceLink> = web_hits
        .into_iter()
        .map(|hit| AiSourceLink {
            title: hit.title,
            uri: hit.uri,
        })
        .collect();

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
