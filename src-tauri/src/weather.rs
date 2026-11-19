use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::State;

const CACHE_TTL_SECS: u64 = 600;
const FALLBACK_CITY: &str = "Ho Chi Minh City";
const FALLBACK_COUNTRY: &str = "Vietnam";
const FALLBACK_LAT: f64 = 10.8231;
const FALLBACK_LON: f64 = 106.6297;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherData {
    pub city: String,
    pub country: String,
    pub temperature_c: f64,
    pub apparent_temp_c: f64,
    pub temp_max_c: f64,
    pub temp_min_c: f64,
    pub humidity: u8,
    pub wind_speed_kmh: f64,
    pub weather_code: u16,
    pub condition: String,
    pub is_day: bool,
    pub updated_at_ms: u64,
}

struct CachedWeather {
    query_key: String,
    fetched_at: Instant,
    data: WeatherData,
}

#[derive(Clone, Default)]
pub struct WeatherCache {
    entry: Arc<Mutex<Option<CachedWeather>>>,
}

struct ResolvedLocation {
    city: String,
    country: String,
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct IpWhoResponse {
    success: Option<bool>,
    city: Option<String>,
    country: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

#[derive(Deserialize)]
struct GeoJsResponse {
    city: Option<String>,
    country: Option<String>,
    latitude: Option<String>,
    longitude: Option<String>,
}

#[derive(Deserialize)]
struct GeocodingResponse {
    results: Option<Vec<GeocodingItem>>,
}

#[derive(Deserialize)]
struct GeocodingItem {
    name: String,
    country: Option<String>,
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct OpenMeteoResponse {
    current: Option<OpenMeteoCurrent>,
    daily: Option<OpenMeteoDaily>,
}

#[derive(Deserialize)]
struct OpenMeteoCurrent {
    temperature_2m: Option<f64>,
    relative_humidity_2m: Option<f64>,
    apparent_temperature: Option<f64>,
    is_day: Option<u8>,
    weather_code: Option<u16>,
    wind_speed_10m: Option<f64>,
}

#[derive(Deserialize)]
struct OpenMeteoDaily {
    temperature_2m_max: Option<Vec<f64>>,
    temperature_2m_min: Option<Vec<f64>>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn describe_wmo_code(code: u16) -> &'static str {
    match code {
        0 => "Clear Sky",
        1 => "Mainly Clear",
        2 => "Partly Cloudy",
        3 => "Overcast",
        45 | 48 => "Foggy",
        51 | 53 | 55 => "Drizzle",
        56 | 57 => "Freezing Drizzle",
        61 => "Light Rain",
        63 => "Rain",
        65 => "Heavy Rain",
        66 | 67 => "Freezing Rain",
        71 | 73 | 75 | 77 => "Snow",
        80 | 81 | 82 => "Rain Showers",
        85 | 86 => "Snow Showers",
        95 => "Thunderstorm",
        96 | 99 => "Thunderstorm Hail",
        _ => "Cloudy",
    }
}

async fn resolve_location_by_city(
    client: &reqwest::Client,
    city: &str,
) -> Result<ResolvedLocation, String> {
    let resp = client
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[
            ("name", city),
            ("count", "1"),
            ("language", "en"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(|e| format!("Geocoding request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Geocoding returned HTTP {}", resp.status()));
    }

    let parsed: GeocodingResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid geocoding payload: {e}"))?;

    let first = parsed
        .results
        .and_then(|mut list| if list.is_empty() { None } else { Some(list.remove(0)) })
        .ok_or_else(|| format!("City not found: {city}"))?;

    Ok(ResolvedLocation {
        city: first.name,
        country: first.country.unwrap_or_default(),
        latitude: first.latitude,
        longitude: first.longitude,
    })
}

async fn resolve_location_by_ip(client: &reqwest::Client) -> ResolvedLocation {
    if let Ok(resp) = client.get("https://ipwho.is/").send().await {
        if resp.status().is_success() {
            if let Ok(parsed) = resp.json::<IpWhoResponse>().await {
                if parsed.success.unwrap_or(false) {
                    if let (Some(lat), Some(lon)) = (parsed.latitude, parsed.longitude) {
                        return ResolvedLocation {
                            city: parsed
                                .city
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or_else(|| FALLBACK_CITY.to_string()),
                            country: parsed.country.unwrap_or_default(),
                            latitude: lat,
                            longitude: lon,
                        };
                    }
                }
            }
        }
    }

    if let Ok(resp) = client.get("https://get.geojs.io/v1/ip/geo.json").send().await {
        if resp.status().is_success() {
            if let Ok(parsed) = resp.json::<GeoJsResponse>().await {
                let lat = parsed.latitude.as_deref().and_then(|v| v.parse::<f64>().ok());
                let lon = parsed.longitude.as_deref().and_then(|v| v.parse::<f64>().ok());
                if let (Some(lat), Some(lon)) = (lat, lon) {
                    return ResolvedLocation {
                        city: parsed
                            .city
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or_else(|| FALLBACK_CITY.to_string()),
                        country: parsed.country.unwrap_or_default(),
                        latitude: lat,
                        longitude: lon,
                    };
                }
            }
        }
    }

    ResolvedLocation {
        city: FALLBACK_CITY.to_string(),
        country: FALLBACK_COUNTRY.to_string(),
        latitude: FALLBACK_LAT,
        longitude: FALLBACK_LON,
    }
}

#[tauri::command]
pub async fn fetch_weather(
    cache: State<'_, WeatherCache>,
    city: Option<String>,
    force_refresh: Option<bool>,
) -> Result<WeatherData, String> {
    let trimmed_city = city
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let query_key = trimmed_city
        .as_deref()
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "__auto__".to_string());
    let force = force_refresh.unwrap_or(false);

    if !force {
        let cached_hit = {
            cache
                .entry
                .lock()
                .ok()
                .and_then(|guard| {
                    guard.as_ref().and_then(|item| {
                        if item.query_key == query_key
                            && item.fetched_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS)
                        {
                            Some(item.data.clone())
                        } else {
                            None
                        }
                    })
                })
        };
        if let Some(hit) = cached_hit {
            return Ok(hit);
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("NusaClone/2.1.0 (https://github.com/koyasaki261207-ops/najimezz)")
        .build()
        .map_err(|e| e.to_string())?;

    let location = match trimmed_city {
        Some(ref name) => resolve_location_by_city(&client, name).await?,
        None => resolve_location_by_ip(&client).await,
    };

    let lat_str = format!("{:.4}", location.latitude);
    let lon_str = format!("{:.4}", location.longitude);

    let resp = client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[
            ("latitude", lat_str.as_str()),
            ("longitude", lon_str.as_str()),
            (
                "current",
                "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
            ),
            ("daily", "temperature_2m_max,temperature_2m_min"),
            ("timezone", "auto"),
            ("forecast_days", "1"),
        ])
        .send()
        .await
        .map_err(|e| format!("Weather request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Weather API returned HTTP {}", resp.status()));
    }

    let payload: OpenMeteoResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid weather payload: {e}"))?;

    let current = payload
        .current
        .ok_or_else(|| "Missing current weather block".to_string())?;

    let temp_c = current.temperature_2m.unwrap_or(0.0);
    let apparent_c = current.apparent_temperature.unwrap_or(temp_c);
    let humidity = current
        .relative_humidity_2m
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, 100.0) as u8;
    let wind_kmh = current.wind_speed_10m.unwrap_or(0.0);
    let code = current.weather_code.unwrap_or(0);
    let is_day = current.is_day.unwrap_or(1) != 0;

    let temp_max_c = payload
        .daily
        .as_ref()
        .and_then(|d| d.temperature_2m_max.as_ref())
        .and_then(|v| v.first().copied())
        .unwrap_or(temp_c);
    let temp_min_c = payload
        .daily
        .as_ref()
        .and_then(|d| d.temperature_2m_min.as_ref())
        .and_then(|v| v.first().copied())
        .unwrap_or(temp_c);

    let result = WeatherData {
        city: location.city,
        country: location.country,
        temperature_c: temp_c,
        apparent_temp_c: apparent_c,
        temp_max_c,
        temp_min_c,
        humidity,
        wind_speed_kmh: wind_kmh,
        weather_code: code,
        condition: describe_wmo_code(code).to_string(),
        is_day,
        updated_at_ms: now_unix_ms(),
    };

    if let Ok(mut guard) = cache.entry.lock() {
        *guard = Some(CachedWeather {
            query_key,
            fetched_at: Instant::now(),
            data: result.clone(),
        });
    }

    Ok(result)
}
