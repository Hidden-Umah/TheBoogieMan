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

#[tauri::command]
fn brain_status(brain: State<'_, Brain>) -> bool {
    brain.is_connected()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .invoke_handler(tauri::generate_handler![send_to_brain, brain_status, stats::system_stats])
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
