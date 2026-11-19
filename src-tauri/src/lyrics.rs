use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub found: bool,
    pub instrumental: bool,
    pub synced: bool,
    pub lines: Vec<LyricLine>,
    pub plain_lines: Vec<String>,
    pub source: String,
}

#[derive(Clone, Default)]
pub struct LyricsCache {
    entries: Arc<Mutex<HashMap<String, LyricsResult>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrcLibRecord {
    duration: Option<f64>,
    instrumental: Option<bool>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

fn clean_track_title(raw: &str) -> String {
    let mut cleaned = raw.trim().to_string();
    for sep in [" - ", " (", " ["] {
        if let Some(idx) = cleaned.find(sep) {
            if idx >= 2 {
                cleaned = cleaned[..idx].trim().to_string();
            }
        }
    }
    cleaned
}

fn parse_timestamp_ms(tag: &str) -> Option<u64> {
    let (min_str, sec_part) = tag.split_once(':')?;
    let minutes: u64 = min_str.trim().parse().ok()?;
    let (sec_str, frac_str) = match sec_part.split_once('.') {
        Some((s, f)) => (s, f),
        None => (sec_part, "0"),
    };
    let seconds: u64 = sec_str.trim().parse().ok()?;
    let frac_digits: String = frac_str
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    let millis: u64 = match frac_digits.len() {
        0 => 0,
        1 => frac_digits.parse::<u64>().ok()? * 100,
        2 => frac_digits.parse::<u64>().ok()? * 10,
        _ => frac_digits[..3].parse::<u64>().ok()?,
    };
    Some(minutes * 60_000 + seconds * 1_000 + millis)
}

fn parse_lrc(raw_lrc: &str) -> Vec<LyricLine> {
    let mut parsed = Vec::new();

    for line in raw_lrc.lines() {
        let mut rest = line.trim();
        let mut timestamps = Vec::new();

        while rest.starts_with('[') {
            if let Some(close_idx) = rest.find(']') {
                let inside = &rest[1..close_idx];
                if let Some(ms) = parse_timestamp_ms(inside) {
                    timestamps.push(ms);
                    rest = &rest[close_idx + 1..];
                    continue;
                }
            }
            break;
        }

        if timestamps.is_empty() {
            continue;
        }

        let text = rest.trim().to_string();
        if text.is_empty() {
            continue;
        }

        for time_ms in timestamps {
            parsed.push(LyricLine {
                time_ms,
                text: text.clone(),
            });
        }
    }

    parsed.sort_by_key(|item| item.time_ms);
    parsed
}

fn record_to_result(record: LrcLibRecord) -> LyricsResult {
    if record.instrumental.unwrap_or(false) {
        return LyricsResult {
            found: true,
            instrumental: true,
            synced: false,
            lines: Vec::new(),
            plain_lines: Vec::new(),
            source: "lrclib".to_string(),
        };
    }

    let synced_lines = record
        .synced_lyrics
        .as_deref()
        .map(parse_lrc)
        .unwrap_or_default();

    let plain_lines: Vec<String> = record
        .plain_lyrics
        .as_deref()
        .map(|raw| {
            raw.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let has_synced = !synced_lines.is_empty();
    let found = has_synced || !plain_lines.is_empty();

    LyricsResult {
        found,
        instrumental: false,
        synced: has_synced,
        lines: synced_lines,
        plain_lines,
        source: "lrclib".to_string(),
    }
}

fn pick_best_record(
    records: Vec<LrcLibRecord>,
    duration_secs: Option<f64>,
) -> Option<LrcLibRecord> {
    records.into_iter().min_by_key(|rec| {
        let has_synced = rec
            .synced_lyrics
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_plain = rec
            .plain_lyrics
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let quality_penalty: u64 = if has_synced {
            0
        } else if has_plain || rec.instrumental.unwrap_or(false) {
            10_000
        } else {
            50_000
        };

        let duration_diff: u64 = match (duration_secs, rec.duration) {
            (Some(target), Some(actual)) => ((target - actual).abs() * 100.0) as u64,
            _ => 500,
        };

        quality_penalty + duration_diff
    })
}

#[tauri::command]
pub async fn fetch_lyrics(
    cache: State<'_, LyricsCache>,
    title: String,
    artist: String,
    album: Option<String>,
    duration_ms: Option<u64>,
) -> Result<LyricsResult, String> {
    let trimmed_title = title.trim().to_string();
    let trimmed_artist = artist.trim().to_string();

    if trimmed_title.is_empty() {
        return Ok(LyricsResult::default());
    }

    let cache_key = format!(
        "{}|{}",
        trimmed_title.to_lowercase(),
        trimmed_artist.to_lowercase()
    );

    if let Ok(guard) = cache.entries.lock() {
        if let Some(cached) = guard.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(7))
        .user_agent("NusaClone/2.1.0 (https://github.com/koyasaki261207-ops/najimezz)")
        .build()
        .map_err(|e| e.to_string())?;

    let duration_secs = duration_ms
        .filter(|&d| d > 0)
        .map(|d| (d as f64) / 1000.0);

    // 1. Exact lookup via /api/get
    if !trimmed_artist.is_empty() {
        let mut params: Vec<(&str, String)> = vec![
            ("track_name", trimmed_title.clone()),
            ("artist_name", trimmed_artist.clone()),
        ];
        if let Some(alb) = album.as_deref().map(str::trim).filter(|a| !a.is_empty()) {
            params.push(("album_name", alb.to_string()));
        }
        if let Some(secs) = duration_secs {
            params.push(("duration", format!("{}", secs.round() as u64)));
        }

        if let Ok(resp) = client
            .get("https://lrclib.net/api/get")
            .query(&params)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(record) = resp.json::<LrcLibRecord>().await {
                    let result = record_to_result(record);
                    if result.found {
                        if let Ok(mut guard) = cache.entries.lock() {
                            guard.insert(cache_key, result.clone());
                        }
                        return Ok(result);
                    }
                }
            }
        }
    }

    // 2. Fallback search via /api/search
    let cleaned_title = clean_track_title(&trimmed_title);
    let mut search_queries: Vec<Vec<(&str, String)>> = Vec::new();
    if !trimmed_artist.is_empty() {
        search_queries.push(vec![
            ("track_name", cleaned_title.clone()),
            ("artist_name", trimmed_artist.clone()),
        ]);
        search_queries.push(vec![(
            "q",
            format!("{trimmed_artist} {cleaned_title}"),
        )]);
    } else {
        search_queries.push(vec![("q", cleaned_title.clone())]);
    }

    let mut final_result = LyricsResult::default();

    for query in search_queries {
        if let Ok(resp) = client
            .get("https://lrclib.net/api/search")
            .query(&query)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(records) = resp.json::<Vec<LrcLibRecord>>().await {
                    if let Some(best) = pick_best_record(records, duration_secs) {
                        let candidate = record_to_result(best);
                        if candidate.found {
                            final_result = candidate;
                            break;
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = cache.entries.lock() {
        guard.insert(cache_key, final_result.clone());
    }

    Ok(final_result)
}
