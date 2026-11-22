"""The Boogeyman's brain.

Spawned by the Rust core on app start. Rust tells us which port to use via the
BOOGEYMAN_BRAIN_PORT env var and connects to ws://127.0.0.1:<port>/ws.

Every message, in both directions, has the same shape (see shared/messages.md):
    {"id": "<uuid>", "type": "<kind>", "payload": {...}}
A reply reuses the id of the request it answers.
"""

from __future__ import annotations

import os
import platform
import sys
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI(title="Boogeyman brain")


def make_message(msg_id: str, msg_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": msg_id, "type": msg_type, "payload": payload}


def handle(message: dict[str, Any]) -> dict[str, Any]:
    """Turn one incoming message into one reply. Phase 1 replaces this with the agent loop."""
    msg_id = str(message.get("id", ""))
    msg_type = message.get("type")
    payload = message.get("payload") or {}

    if msg_type == "ping":
        return make_message(msg_id, "pong", {})

    if msg_type == "user.message":
        text = str(payload.get("text", "")).strip()
        return make_message(
            msg_id,
            "brain.reply",
            {
                "text": f"Welcome, boss. You said: {text}" if text else "Welcome, boss. I'm listening.",
                "chars": len(text),
                "python": platform.python_version(),
                "at": datetime.now(timezone.utc).isoformat(),
            },
        )

    return make_message(msg_id, "error", {"message": f"Unknown message type: {msg_type!r}"})


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "python": platform.python_version(), "pid": os.getpid()}


@app.websocket("/ws")
async def ws(socket: WebSocket) -> None:
    await socket.accept()
    try:
        while True:
            try:
                message = await socket.receive_json()
            except ValueError:
                await socket.send_json(make_message("", "error", {"message": "Message was not valid JSON"}))
                continue
            if not isinstance(message, dict):
                await socket.send_json(make_message("", "error", {"message": "Message must be a JSON object"}))
                continue
            await socket.send_json(handle(message))
    except WebSocketDisconnect:
        pass


def main() -> None:
    import uvicorn

    port = int(os.environ.get("BOOGEYMAN_BRAIN_PORT", "8765"))
    print(f"[brain] Python {platform.python_version()} listening on 127.0.0.1:{port}", file=sys.stderr, flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
