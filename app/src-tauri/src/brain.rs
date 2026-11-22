//! WebSocket link between the Rust core and the Python brain.
//!
//! A background task keeps one connection open (reconnecting if it drops).
//! `request()` sends a message and waits for the reply with the same id.
//! Messages from the brain that nobody is waiting for are emitted to React
//! as the `brain-message` event; connection changes are emitted as `brain-status`.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

use crate::message::Message;

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Message>>>>;

#[derive(Clone)]
pub struct Brain {
    outbox: mpsc::UnboundedSender<Message>,
    pending: Pending,
    connected: Arc<AtomicBool>,
}

#[derive(Clone, serde::Serialize)]
struct Status {
    connected: bool,
}

impl Brain {
    pub fn start(app: AppHandle, port: u16) -> Self {
        let (outbox, inbox) = mpsc::unbounded_channel::<Message>();
        let brain = Self {
            outbox,
            pending: Arc::default(),
            connected: Arc::default(),
        };
        tauri::async_runtime::spawn(run(app, port, inbox, brain.pending.clone(), brain.connected.clone()));
        brain
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub async fn request(&self, mut msg: Message, timeout: Duration) -> Result<Message, String> {
        if !self.is_connected() {
            return Err("The brain is not connected yet.".into());
        }
        if msg.id.is_empty() {
            msg.id = uuid::Uuid::new_v4().to_string();
        }
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(msg.id.clone(), tx);
        let id = msg.id.clone();
        if self.outbox.send(msg).is_err() {
            self.pending.lock().await.remove(&id);
            return Err("Brain link is closed.".into());
        }
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(reply)) => Ok(reply),
            Ok(Err(_)) => Err("Brain disconnected before replying.".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("Brain took too long to reply.".into())
            }
        }
    }
}

fn set_status(app: &AppHandle, connected: &AtomicBool, value: bool) {
    if connected.swap(value, Ordering::SeqCst) != value {
        log::info!("brain {}", if value { "connected" } else { "disconnected" });
        let _ = app.emit("brain-status", Status { connected: value });
    }
}

async fn run(
    app: AppHandle,
    port: u16,
    mut inbox: mpsc::UnboundedReceiver<Message>,
    pending: Pending,
    connected: Arc<AtomicBool>,
) {
    let url = format!("ws://127.0.0.1:{port}/ws");
    loop {
        let stream = match connect_async(&url).await {
            Ok((stream, _)) => stream,
            Err(_) => {
                // Python is probably still starting up. Try again shortly.
                tokio::time::sleep(Duration::from_millis(300)).await;
                continue;
            }
        };
        set_status(&app, &connected, true);
        let (mut write, mut read) = stream.split();

        loop {
            tokio::select! {
                Some(msg) = inbox.recv() => {
                    let text = serde_json::to_string(&msg).expect("message serialises");
                    if write.send(WsMessage::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(WsMessage::Text(text))) => match serde_json::from_str::<Message>(&text) {
                            Ok(msg) => {
                                let waiter = pending.lock().await.remove(&msg.id);
                                match waiter {
                                    Some(tx) => { let _ = tx.send(msg); }
                                    None => { let _ = app.emit("brain-message", msg); }
                                }
                            }
                            Err(e) => log::warn!("bad message from brain: {e}"),
                        },
                        Some(Ok(WsMessage::Close(_))) | Some(Err(_)) | None => break,
                        Some(Ok(_)) => {}
                    }
                }
            }
        }

        set_status(&app, &connected, false);
        // Fail anyone still waiting so the UI doesn't hang.
        pending.lock().await.clear();
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}
