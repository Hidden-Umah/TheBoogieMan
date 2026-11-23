mod brain;
mod message;
mod sidecar;
mod stats;

use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, State};
use tokio::process::Child;

use brain::Brain;
use message::Message;

/// Holds the Python process so we can kill it when the app exits.
struct Sidecar(Mutex<Option<Child>>);

/// React → Rust → Python → Rust → React.
#[tauri::command]
async fn send_to_brain(brain: State<'_, Brain>, message: Message) -> Result<Message, String> {
    brain.request(message, Duration::from_secs(30)).await
}

/// Closes the app. The exit handler (and PR_SET_PDEATHSIG) takes the brain down with it.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    log::info!("shutdown requested by the boss");
    app.exit(0);
}

/// Lets the UI print diagnostics to the terminal you ran `make dev` from.
#[tauri::command]
fn ui_log(line: String) {
    log::info!("[ui] {line}");
}

/// Background videos are drawn into a canvas every frame. Hardware video decoders
/// (VA-API / NVDEC) hand WebKit GPU frames that often can't be read back, so the
/// video shows black or a frozen frame. A 960x540 clip is nothing for the CPU, so
/// prefer software decoding unless you've set GST_PLUGIN_FEATURE_RANK yourself.
fn prefer_software_video() {
    if std::env::var_os("GST_PLUGIN_FEATURE_RANK").is_none() {
        let hw = [
            "vah264dec", "vavp9dec", "vavp8dec", "vaav1dec", "vaapih264dec", "vaapivp9dec", "vaapivp8dec",
            "vaapidecodebin", "nvh264dec", "nvvp9dec", "nvvp8dec", "nvav1dec", "v4l2h264dec", "v4l2vp9dec",
        ];
        let ranks: Vec<String> = hw.iter().map(|d| format!("{d}:NONE")).collect();
        // SAFETY: called at startup, before any other threads exist.
        unsafe { std::env::set_var("GST_PLUGIN_FEATURE_RANK", ranks.join(",")) };
    }
}

#[tauri::command]
fn brain_status(brain: State<'_, Brain>) -> bool {
    brain.is_connected()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    prefer_software_video();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let port = sidecar::free_port()?;
            let child = sidecar::spawn(port)
                .map_err(|e| format!("could not start the Python brain: {e}"))?;
            app.manage(Sidecar(Mutex::new(Some(child))));
            app.manage(Brain::start(app.handle().clone(), port));
            app.manage(stats::Stats::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![send_to_brain, brain_status, quit_app, ui_log, stats::system_stats])
        .build(tauri::generate_context!())
        .expect("error while building the Boogeyman")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(mut child) = app.state::<Sidecar>().0.lock().unwrap().take()
            {
                let _ = child.start_kill();
            }
        });
}
