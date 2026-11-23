//! Live machine stats for the HUD. Rust is the right place for this: it's cheap,
//! native, and doesn't need the Python brain to be up.

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

pub struct Stats(Mutex<System>);

impl Stats {
    pub fn new() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
                .with_memory(MemoryRefreshKind::nothing().with_ram()),
        );
        Self(Mutex::new(sys))
    }
}

#[derive(Serialize)]
pub struct Snapshot {
    cpu: f32,
    cores: Vec<f32>,
    mem_used: u64,
    mem_total: u64,
    uptime: u64,
    host: String,
    os: String,
}

#[tauri::command]
pub fn system_stats(stats: tauri::State<'_, Stats>) -> Snapshot {
    let mut sys = stats.0.lock().unwrap();
    // CPU usage is the delta since the previous refresh; the HUD polls every ~1.5s.
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    Snapshot {
        cpu: sys.global_cpu_usage(),
        cores: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
        uptime: System::uptime(),
        host: System::host_name().unwrap_or_else(|| "unknown".into()),
        os: System::long_os_version().unwrap_or_else(|| "Linux".into()),
    }
}
