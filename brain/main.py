"""The Boogeyman's brain.

Spawned by the Rust core on app start. Rust tells us which port to use via the
BOOGEYMAN_BRAIN_PORT env var and connects to ws://127.0.0.1:<port>/ws.

Every message, in both directions, has the same shape (see shared/messages.md):
    {"id": "<uuid>", "type": "<kind>", "payload": {...}}
A reply reuses the id of the request it answers. Events the brain pushes on its
own (voice state, audio levels, captions) have an empty id.
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import config
from reply import Replier
from voice import VoiceLoop

log = logging.getLogger("brain")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", stream=sys.stderr)


def make_message(msg_id: str, msg_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": msg_id, "type": msg_type, "payload": payload}


class Hub:
    """Connected UI sockets. Events are broadcast to all of them."""

    def __init__(self) -> None:
        self.clients: dict[WebSocket, asyncio.Lock] = {}

    async def send(self, ws: WebSocket, msg: dict[str, Any]) -> None:
        lock = self.clients.get(ws)
        if lock is None:
            return
        async with lock:
            try:
                await ws.send_json(msg)
            except Exception:
                self.clients.pop(ws, None)

    async def emit(self, msg_type: str, payload: dict[str, Any]) -> None:
        for ws in list(self.clients):
            await self.send(ws, make_message("", msg_type, payload))


hub = Hub()
settings = config.load()
replier = Replier(settings.anthropic_key, settings.model)
voice = VoiceLoop(hub.emit, None, None, None, None, replier.reply)
state: dict[str, Any] = {"greeted": False, "capabilities": {}}
tasks: set[asyncio.Task] = set()


def spawn(coro) -> None:
    t = asyncio.create_task(coro)
    tasks.add(t)
    t.add_done_callback(tasks.discard)


def setup_voice() -> dict[str, Any]:
    """Wire up whatever voice pieces are available. Missing pieces degrade gracefully."""
    caps: dict[str, Any] = {"claude": replier.online, "elevenlabs": False, "mic": False, "speaker": False, "notes": []}
    if not settings.voice_enabled:
        caps["notes"].append("voice disabled (BOOGEYMAN_VOICE=0)")
        return caps
    if settings.elevenlabs_key:
        from elevenlabs import TTS_RATE, ElevenLabs

        el = ElevenLabs(settings.elevenlabs_key, settings.voice_id, settings.tts_model, settings.stt_model)
        voice.transcribe = el.transcribe
        voice.tts = el.speak
        caps["elevenlabs"] = True
        try:
            from audio import Speaker

            voice.speaker = Speaker(TTS_RATE)
            caps["speaker"] = True
        except Exception as e:
            caps["notes"].append(f"no speaker: {e}")
    else:
        caps["notes"].append("ELEVENLABS_API_KEY not set: no voice")
    try:
        from audio import Mic

        voice.mic = Mic(settings.mic_device)
        caps["mic"] = True
    except Exception as e:
        caps["notes"].append(f"no microphone: {e}")
    if not replier.online:
        caps["notes"].append("ANTHROPIC_API_KEY not set: using built-in replies")
    return caps


@asynccontextmanager
async def lifespan(_: FastAPI):
    state["capabilities"] = setup_voice()
    for note in state["capabilities"]["notes"]:
        log.warning(note)
    spawn(voice.run())
    yield
    for t in list(tasks):
        t.cancel()


app = FastAPI(title="Boogeyman brain", lifespan=lifespan)


async def handle(message: dict[str, Any]) -> dict[str, Any]:
    """Turn one incoming request into one reply."""
    msg_id = str(message.get("id", ""))
    msg_type = message.get("type")
    payload = message.get("payload") or {}

    if msg_type == "ping":
        return make_message(msg_id, "pong", {})

    if msg_type == "user.message":
        text = str(payload.get("text", "")).strip()
        out = await replier.reply(text) if text else "Welcome, boss. I'm listening."
        spawn(voice.say(out))
        return make_message(
            msg_id,
            "brain.reply",
            {
                "text": out,
                "chars": len(out),
                "python": platform.python_version(),
                "at": datetime.now(timezone.utc).isoformat(),
            },
        )

    if msg_type == "voice.greet":
        first = not state["greeted"]
        state["greeted"] = True
        if first:
            spawn(voice.say("Welcome back, boss. I'm listening."))
        return make_message(msg_id, "voice.ack", {"spoken": first, "capabilities": state["capabilities"]})

    if msg_type == "voice.mute":
        await voice.set_muted(bool(payload.get("muted")))
        return make_message(msg_id, "voice.ack", {"muted": voice.muted})

    if msg_type == "voice.status":
        return make_message(msg_id, "voice.ack", {"muted": voice.muted, "capabilities": state["capabilities"]})

    return make_message(msg_id, "error", {"message": f"Unknown message type: {msg_type!r}"})


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "python": platform.python_version(), "pid": os.getpid(), "voice": state["capabilities"]}


@app.websocket("/ws")
async def ws(socket: WebSocket) -> None:
    await socket.accept()
    hub.clients[socket] = asyncio.Lock()

    async def answer(message: dict[str, Any]) -> None:
        await hub.send(socket, await handle(message))

    try:
        while True:
            try:
                message = await socket.receive_json()
            except ValueError:
                await hub.send(socket, make_message("", "error", {"message": "Message was not valid JSON"}))
                continue
            if not isinstance(message, dict):
                await hub.send(socket, make_message("", "error", {"message": "Message must be a JSON object"}))
                continue
            # Handle concurrently so a slow request never blocks voice events or other requests.
            spawn(answer(message))
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.pop(socket, None)


def main() -> None:
    import uvicorn

    port = int(os.environ.get("BOOGEYMAN_BRAIN_PORT", "8765"))
    print(f"[brain] Python {platform.python_version()} listening on 127.0.0.1:{port}", file=sys.stderr, flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
