//! The one message shape shared by React, Rust and Python. See shared/messages.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Correlates a reply with its request. Rust fills it in if React leaves it empty.
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub payload: Value,
}
