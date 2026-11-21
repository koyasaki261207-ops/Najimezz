use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, System};
use tauri::State;

const DISK_REFRESH_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatsPayload {
    pub cpu_usage_percent: f32,
    pub cpu_cores: usize,
    pub cpu_frequency_mhz: u64,
    pub cpu_brand: String,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub ram_usage_percent: f32,
    pub disk_name: String,
    pub disk_used_bytes: u64,
    pub disk_total_bytes: u64,
    pub disk_free_bytes: u64,
    pub disk_usage_percent: f32,
    pub net_rx_bytes_per_sec: u64,
    pub net_tx_bytes_per_sec: u64,
    pub uptime_secs: u64,
}

struct SystemMonitorInner {
    sys: System,
    networks: Networks,
    disks: Disks,
    last_net_sample: Instant,
    last_disk_refresh: Instant,
    initialized_net: bool,
}

impl SystemMonitorInner {
    fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_all();
        sys.refresh_memory();

        let networks = Networks::new_with_refreshed_list();
        let disks = Disks::new_with_refreshed_list();
        let now = Instant::now();

        Self {
            sys,
            networks,
            disks,
            last_net_sample: now,
            last_disk_refresh: now,
            initialized_net: false,
        }
    }

    fn collect(&mut self) -> SystemStatsPayload {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();

        let cpu_usage_percent = self.sys.global_cpu_usage().clamp(0.0, 100.0);
        let cpus = self.sys.cpus();
        let cpu_cores = cpus.len();
        let cpu_frequency_mhz = cpus.first().map(|c| c.frequency()).unwrap_or(0);
        let cpu_brand = cpus
            .first()
            .map(|c| c.brand().trim().to_string())
            .unwrap_or_default();

        let ram_total_bytes = self.sys.total_memory();
        let ram_used_bytes = self.sys.used_memory().min(ram_total_bytes);
        let ram_usage_percent = if ram_total_bytes > 0 {
            ((ram_used_bytes as f64 / ram_total_bytes as f64) * 100.0) as f32
        } else {
            0.0
        };

        let now = Instant::now();
        if now.duration_since(self.last_disk_refresh) >= DISK_REFRESH_INTERVAL {
            self.disks = Disks::new_with_refreshed_list();
            self.last_disk_refresh = now;
        }

        let primary_disk = self
            .disks
            .list()
            .iter()
            .find(|d| {
                let mp = d.mount_point().to_string_lossy();
                mp.eq_ignore_ascii_case("C:\\") || mp.eq_ignore_ascii_case("C:") || mp == "/"
            })
            .or_else(|| self.disks.list().iter().find(|d| d.total_space() > 0));

        let (disk_name, disk_total_bytes, disk_free_bytes, disk_used_bytes, disk_usage_percent) =
            if let Some(disk) = primary_disk {
                let raw_mp = disk.mount_point().to_string_lossy().to_string();
                let clean_name = raw_mp.trim_end_matches('\\').to_string();
                let name = if clean_name.is_empty() {
                    raw_mp
                } else {
                    clean_name
                };
                let total = disk.total_space();
                let free = disk.available_space().min(total);
                let used = total.saturating_sub(free);
                let pct = if total > 0 {
                    ((used as f64 / total as f64) * 100.0) as f32
                } else {
                    0.0
                };
                (name, total, free, used, pct)
            } else {
                ("C:".to_string(), 0, 0, 0, 0.0)
            };

        let elapsed = now.duration_since(self.last_net_sample).as_secs_f64();
        self.last_net_sample = now;
        self.networks.refresh();

        let (net_rx_bytes_per_sec, net_tx_bytes_per_sec) =
            if self.initialized_net && elapsed > 0.15 && elapsed < 10.0 {
                let mut total_rx: u64 = 0;
                let mut total_tx: u64 = 0;
                for (_iface, data) in &self.networks {
                    total_rx = total_rx.saturating_add(data.received());
                    total_tx = total_tx.saturating_add(data.transmitted());
                }
                (
                    (total_rx as f64 / elapsed).round() as u64,
                    (total_tx as f64 / elapsed).round() as u64,
                )
            } else {
                self.initialized_net = true;
                (0, 0)
            };

        let uptime_secs = System::uptime();

        SystemStatsPayload {
            cpu_usage_percent,
            cpu_cores,
            cpu_frequency_mhz,
            cpu_brand,
            ram_used_bytes,
            ram_total_bytes,
            ram_usage_percent,
            disk_name,
            disk_used_bytes,
            disk_total_bytes,
            disk_free_bytes,
            disk_usage_percent,
            net_rx_bytes_per_sec,
            net_tx_bytes_per_sec,
            uptime_secs,
        }
    }
}

#[derive(Clone)]
pub struct SystemMonitorState {
    inner: Arc<Mutex<SystemMonitorInner>>,
}

impl Default for SystemMonitorState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SystemMonitorInner::new())),
        }
    }
}

#[tauri::command]
pub async fn get_system_stats(
    state: State<'_, SystemMonitorState>,
) -> Result<SystemStatsPayload, String> {
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = inner
            .lock()
            .map_err(|_| "Không thể khóa trạng thái bộ giám sát hệ thống".to_string())?;
        Ok(guard.collect())
    })
    .await
    .map_err(|e| format!("Lỗi luồng đọc thông số hệ thống: {e}"))?
}

#[tauri::command]
pub fn open_task_manager() -> Result<(), String> {
    crate::ai_tools::open_app_or_url("taskmgr").map(|_| ())
}
