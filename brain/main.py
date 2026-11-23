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
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import config
from commands import Commands
from memory import Memory
from reply import Replier
from research import Research
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
memory = Memory()


async def push_memory() -> None:
    await hub.emit("memory.updated", memory.snapshot())


replier = Replier(
    settings.llm_provider,
    settings.model,
    anthropic_key=settings.anthropic_key,
    groq_key=settings.groq_key,
    openai_key=settings.openai_key,
    openai_base=settings.openai_base,
    memory=memory,
    on_memory=push_memory,
)
commands = Commands()
state: dict[str, Any] = {"greeted": False, "capabilities": {}, "action": None}


RESEARCH_CMD = re.compile(r"^(?:please\s+)?(?:research|look\s+up|search\s+(?:for|the\s+web\s+for)|find\s+out\s+(?:about)?|google)\s+(.+)", re.I)


async def ui_action(action: str | None) -> str | None:
    """Apply UI actions right away; return anything that must wait until after speaking."""
    if action in ("work", "normal"):
        await hub.emit("ui.mode", {"mode": action})
        return None
    if action == "help":
        await hub.emit("ui.help", {"show": True})
        return None
    if action == "clear":
        memory.clear_history()
        await push_memory()
        return None
    if action and action.startswith("bg:"):
        await hub.emit("ui.background", {"cmd": action[3:]})
        return None
    return action


async def run_research(query: str) -> str:
    await hub.emit("ui.mode", {"mode": "work"})
    agent = Research(hub.emit, replier.complete if replier.online else None)
    result = await agent.run(query)
    lines = [f"Summary: {result['summary']}"] + [f"- {f}" for f in result["findings"]]
    return "\n".join(lines)


async def think(text: str) -> str:
    """Built-in commands first (instant, offline), then the LLM."""
    hit = commands.handle(text)
    if hit:
        out, action = hit
        state["action"] = await ui_action(action)
        log.info("command: %r -> %s", text, action or "reply")
        return out
    m = RESEARCH_CMD.match(text.strip())
    if m:  # "research X" goes straight to the agent: faster, and works without tool-calling
        await hub.emit("voice.state", {"state": "thinking"})
        result = await run_research(m.group(1).strip(" .?!"))
        return result.split("\n", 1)[0].removeprefix("Summary: ")
    return await replier.reply(text)


async def tool_shutdown(args: dict[str, Any]) -> str:
    if args.get("now"):
        state["action"] = "shutdown"
        return "Shutdown scheduled: the app closes right after your reply. Say a very short goodbye."
    return f"Not shut down yet. Ask exactly this and nothing else: {commands.ask_shutdown()}"


async def tool_switch_screen(args: dict[str, Any]) -> str:
    screen = str(args.get("screen", "")).lower()
    if screen not in ("work", "normal"):
        return "Error: screen must be 'work' or 'normal'."
    await hub.emit("ui.mode", {"mode": screen})
    return f"Switched to the {screen} screen."


async def tool_set_background(args: dict[str, Any]) -> str:
    name = str(args.get("background", "")).lower()
    if name not in ("next", "sea", "nebula", "custom", "off", "on"):
        return "Error: background must be one of next, sea, nebula, custom, off, on."
    await hub.emit("ui.background", {"cmd": name})
    return f"Background: {name}."


async def tool_show_commands(args: dict[str, Any]) -> str:
    await hub.emit("ui.help", {"show": bool(args.get("show", True))})
    return "The commands card is on his screen. Just say one line about it."


async def tool_clear_conversation(args: dict[str, Any]) -> str:
    memory.clear_history()
    await push_memory()
    return "Recent conversation cleared (long-term facts kept)."


async def tool_research(args: dict[str, Any]) -> str:
    query = str(args.get("query", "")).strip()
    if not query:
        return "Error: empty query."
    return await run_research(query)


replier.add_tool(
    {
        "name": "shutdown",
        "description": "Shut yourself down: closes the Boogeyman app completely (not the computer). "
        "You CAN do this. Use it whenever the boss wants you off, gone, asleep, closed or offline, however he says it. "
        "now=true when he says now/immediately or has already confirmed; now=false asks him to confirm first.",
        "parameters": {
            "type": "object",
            "properties": {"now": {"type": "boolean", "description": "true = close right after this reply; false = ask to confirm"}},
            "required": ["now"],
        },
    },
    tool_shutdown,
)
replier.add_tool(
    {
        "name": "switch_screen",
        "description": "Switch the boss's screen. 'work' opens the workspace (for tasks and research); "
        "'normal' returns to the main screen with the core. Use for 'let's work', 'back to normal', 'main screen', "
        "'leave the workspace', and similar.",
        "parameters": {
            "type": "object",
            "properties": {"screen": {"type": "string", "enum": ["work", "normal"]}},
            "required": ["screen"],
        },
    },
    tool_switch_screen,
)
replier.add_tool(
    {
        "name": "set_background",
        "description": "Change the moving background video. 'sea' = underwater shipwreck, 'nebula' = dark space smoke, "
        "'custom' = his own clip, 'next' = cycle, 'off' / 'on' = hide / show.",
        "parameters": {
            "type": "object",
            "properties": {"background": {"type": "string", "enum": ["next", "sea", "nebula", "custom", "off", "on"]}},
            "required": ["background"],
        },
    },
    tool_set_background,
)
replier.add_tool(
    {
        "name": "show_commands",
        "description": "Show (or hide) the card listing everything the boss can say and do. "
        "Use when he asks what you can do, for help, or for the commands.",
        "parameters": {"type": "object", "properties": {"show": {"type": "boolean"}}, "required": []},
    },
    tool_show_commands,
)
replier.add_tool(
    {
        "name": "clear_conversation",
        "description": "Wipe the recent conversation history (long-term memory facts stay). "
        "Use when he asks to clear or reset the chat, or wants a fresh start.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    tool_clear_conversation,
)
replier.add_tool(
    {
        "name": "research",
        "description": "Search the web and read sources to answer something current or factual "
        "(news, prices, events, people, anything to look up). Shows the work live on the boss's screen. "
        "Returns a summary and findings with [n] citations.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "What to research, in plain words."}},
            "required": ["query"],
        },
    },
    tool_research,
)


async def after_turn() -> None:
    """Runs after a reply has been spoken."""
    action, state["action"] = state["action"], None
    if action == "shutdown":
        await hub.emit("app.shutdown", {})


voice = VoiceLoop(hub.emit, None, None, None, None, think, after_turn=after_turn)
tasks: set[asyncio.Task] = set()


def spawn(coro) -> None:
    t = asyncio.create_task(coro)
    tasks.add(t)
    t.add_done_callback(tasks.discard)


def setup_voice() -> dict[str, Any]:
    """Wire up whatever voice pieces are available. Missing pieces degrade gracefully."""
    caps: dict[str, Any] = {"brain": replier.label, "claude": replier.online, "elevenlabs": False, "mic": False, "speaker": False, "notes": []}
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
        caps["notes"].append("no LLM key (GROQ_API_KEY / ANTHROPIC_API_KEY): using built-in replies")
    else:
        log.info("brain: %s", replier.label)
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
        out = await think(text) if text else "Welcome, boss. I'm listening."

        async def speak_then_act() -> None:
            await voice.say(out)
            await after_turn()

        spawn(speak_then_act())
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
            greeting = "Welcome back, boss. I'm listening."
            await hub.emit("voice.reply", {"text": greeting})
            spawn(voice.say(greeting))
        return make_message(
            msg_id, "voice.ack", {"spoken": first, "capabilities": state["capabilities"], "memory": memory.snapshot()}
        )

    if msg_type == "voice.mute":
        await voice.set_muted(bool(payload.get("muted")))
        return make_message(msg_id, "voice.ack", {"muted": voice.muted})

    if msg_type == "memory.get":
        return make_message(msg_id, "memory.updated", memory.snapshot())

    if msg_type == "memory.forget":
        memory.forget(str(payload.get("id", "")))
        await push_memory()
        return make_message(msg_id, "memory.updated", memory.snapshot())

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
