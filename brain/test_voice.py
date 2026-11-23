"""Voice pipeline tests with fake mic, speaker, STT and TTS (no hardware, no network)."""

import os
import tempfile

os.environ["BOOGEYMAN_VOICE"] = "0"
for _k in ("ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "GROQ_API_KEY", "GROK_API_KEY", "LLM_API_KEY"):
    os.environ[_k] = ""
os.environ.setdefault("BOOGEYMAN_DATA", tempfile.mkdtemp())

import asyncio

import httpx
import numpy as np

from audio import FRAME, Segmenter
from elevenlabs import ElevenLabs
from reply import fallback
from voice import VoiceLoop


def tmp_memory():
    import tempfile
    from pathlib import Path

    from pathlib import Path
    from memory import Memory

    return Memory(Path(tempfile.mkdtemp()) / "memory.json")

rng = np.random.default_rng(0)


def silence(n):
    return [(rng.normal(0, 30, FRAME)).astype(np.int16) for _ in range(n)]


def speech(n):
    t = np.arange(FRAME)
    return [(np.sin(t * 0.2 + i) * 6000 + rng.normal(0, 500, FRAME)).astype(np.int16) for i in range(n)]


def test_segmenter_finds_one_utterance():
    seg = Segmenter()
    frames = silence(40) + speech(30) + silence(40)
    outs = [o for f in frames if (o := seg.feed(f)) is not None]
    assert len(outs) == 1
    # ~900 ms of speech + preroll + trailing silence
    assert 0.9 < len(outs[0]) / 16000 < 2.5


def test_segmenter_ignores_clicks():
    seg = Segmenter()
    frames = silence(40) + speech(4) + silence(40)
    assert all(seg.feed(f) is None for f in frames)


def test_fallback_greets():
    assert "boss" in fallback("Hello").lower()


class FakeMic:
    def __init__(self, frames):
        self.frames = list(frames)

    async def read(self):
        if not self.frames:
            await asyncio.sleep(3600)
        await asyncio.sleep(0)
        return self.frames.pop(0)

    def drain(self):
        pass


class FakeSpeaker:
    def __init__(self):
        self.samples = 0

    def write(self, pcm):
        self.samples += len(pcm)


def test_voice_loop_hello_turn():
    events = []

    async def emit(t, p):
        events.append((t, p))

    async def transcribe(wav: bytes) -> str:
        assert wav[:4] == b"RIFF"
        return "Hello."

    async def tts(text: str):
        for _ in range(5):
            yield (np.sin(np.arange(2400) * 0.05) * 8000).astype(np.int16).tobytes()

    async def reply(text: str) -> str:
        return fallback(text)

    speaker = FakeSpeaker()
    loop = VoiceLoop(emit, FakeMic(silence(40) + speech(30) + silence(40)), speaker, transcribe, tts, reply)

    async def go():
        task = asyncio.create_task(loop.run())
        for _ in range(400):
            await asyncio.sleep(0.01)
            if any(t == "voice.reply" for t, _ in events) and events[-1] == ("voice.state", {"state": "listening"}):
                break
        task.cancel()

    asyncio.run(go())

    states = [p["state"] for t, p in events if t == "voice.state"]
    assert states[:2] == ["listening", "hearing"]
    assert ["transcribing", "thinking", "speaking", "listening"] == states[2:6]
    assert ("voice.transcript", {"text": "Hello."}) in events
    assert any(t == "voice.reply" and "boss" in p["text"].lower() for t, p in events)
    assert speaker.samples == 5 * 2400
    voice_levels = [p["level"] for t, p in events if t == "voice.level" and p["source"] == "voice"]
    assert max(voice_levels) > 0.3 and voice_levels[-1] == 0.0


def test_elevenlabs_requests():
    seen = {}

    def handler(request: httpx.Request):
        seen[request.url.path] = request
        if request.url.path == "/v1/speech-to-text":
            return httpx.Response(200, json={"text": " Hello there. "})
        return httpx.Response(200, content=b"\x01\x00" * 3000)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    el = ElevenLabs("k", "voice123", "eleven_flash_v2_5", "scribe_v2", client=client)

    async def go():
        text = await el.transcribe(b"RIFF....")
        audio = b"".join([c async for c in el.speak("hi")])
        return text, audio

    text, audio = asyncio.run(go())
    assert text == "Hello there."
    assert len(audio) == 6000
    stt = seen["/v1/speech-to-text"]
    assert stt.headers["xi-api-key"] == "k"
    assert b"scribe_v2" in stt.content
    tts = seen["/v1/text-to-speech/voice123/stream"]
    assert tts.url.params["output_format"] == "pcm_24000"


def test_groq_reply_and_errors():
    import json

    from reply import Replier

    calls = []

    def handler(request: httpx.Request):
        calls.append(request)
        body = json.loads(request.content)
        if body["messages"][-1]["content"] == "limit":
            return httpx.Response(429, json={"error": "rate"})
        return httpx.Response(200, json={"choices": [{"message": {"content": " Hey, boss. "}}]})

    r = Replier(
        "auto", None, groq_key="gsk_test", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)), memory=tmp_memory()
    )
    assert r.provider == "groq" and r.model == "openai/gpt-oss-120b"
    assert asyncio.run(r.reply("hello")) == "Hey, boss."
    req = calls[0]
    assert str(req.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer gsk_test"
    body = json.loads(req.content)
    assert body["messages"][0]["role"] == "system" and body["reasoning_effort"] == "low"
    # Rate limit gives a spoken message and doesn't poison history.
    assert "limit" in asyncio.run(r.reply("limit")).lower()
    assert len(r.history) == 2


def test_provider_resolution():
    from reply import resolve_provider

    assert resolve_provider("auto", None, None, None) == "none"
    assert resolve_provider("auto", "a", "g", None) == "anthropic"
    assert resolve_provider("auto", None, "g", None) == "groq"
    assert resolve_provider("groq", None, None, None) == "none"



def test_tool_loop_remembers_and_persists():
    import json

    from pathlib import Path
    from memory import Memory
    from reply import Replier

    mem = tmp_memory()
    pushed = []

    async def on_memory():
        pushed.append(len(mem.facts))

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        assert any(t["function"]["name"] == "remember" for t in body["tools"])
        if body["messages"][-1]["role"] == "user":
            # First round: the model decides to save a fact.
            call = {"id": "c1", "type": "function", "function": {"name": "remember", "arguments": json.dumps({"fact": "The boss loves jollof."})}}
            return httpx.Response(200, json={"choices": [{"message": {"content": "", "tool_calls": [call]}}]})
        assert body["messages"][-1] == {"role": "tool", "tool_call_id": "c1", "content": body["messages"][-1]["content"]}
        return httpx.Response(200, json={"choices": [{"message": {"content": "Noted, boss."}}]})

    r = Replier("groq", None, groq_key="k", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)), memory=mem, on_memory=on_memory)
    assert asyncio.run(r.reply("Remember I love jollof")) == "Noted, boss."
    assert [f["text"] for f in mem.facts] == ["The boss loves jollof."]
    assert pushed == [1]
    # Survives a restart, and lands in the next system prompt.
    again = Memory(mem.path)
    assert again.facts[0]["text"] == "The boss loves jollof." and again.history[-1]["content"] == "Noted, boss."
    r2 = Replier("groq", None, groq_key="k", memory=again)
    assert "The boss loves jollof." in r2.system_prompt() and "Ghanaian Pidgin" in r2.system_prompt()
    assert again.forget("jollof") and not Memory(mem.path).facts


def test_spectrum_finds_the_tone():
    from audio import spectrum

    t = np.arange(1024) / 24000
    bands = spectrum((np.sin(2 * np.pi * 1000 * t) * 12000).astype(np.int16), 24000)
    assert len(bands) == 24 and max(bands) > 0.6
    peak = bands.index(max(bands))
    assert bands[0] < 0.3 and 8 < peak < 20  # 1 kHz sits in the middle of an 80 Hz..8 kHz log scale


def test_shutdown_commands():
    from commands import Commands

    now = [0.0]
    c = Commands(clock=lambda: now[0])
    # Plain request asks first; yes confirms.
    ask, action = c.handle("Shut down.")
    assert action is None and "?" in ask
    say, action = c.handle("Yes")
    assert action == "shutdown" and "care" in say.lower()
    # "now" skips the question.
    assert c.handle("Shut down now")[1] == "shutdown"
    assert c.handle("Boogeyman, turn yourself off immediately!")[1] == "shutdown"
    # "no" cancels.
    c.handle("Can you shut down?")
    assert c.handle("No, stay")[1] is None and c.pending_since is None
    # A late yes doesn't count.
    c.handle("shutdown")
    now[0] += 31
    assert c.handle("yes") is None
    # The computer isn't ours to switch off (yet).
    say, action = c.handle("shut down the computer")
    assert action is None and "computer" in say.lower()
    # Ordinary talk isn't a command.
    assert c.handle("what was the shutdown rate of factories in Ghana last year") is None
    assert c.handle("tell me a joke") is None
    assert c.pending_since is None


def test_more_shutdown_phrasing_and_ui_commands():
    from commands import Commands

    c = Commands()
    for phrase in ["Shut it down", "Boogeyman, go to sleep", "close yourself", "power down", "turn yourself off", "quit"]:
        c.pending_since = None
        out = c.handle(phrase)
        assert out and out[1] is None and "?" in out[0], phrase
    c.pending_since = None
    assert c.handle("shut it down now")[1] == "shutdown"
    # Not commands:
    c.pending_since = None
    assert c.handle("turn off the lights") is None
    assert c.handle("how do I switch off my router") is None
    # Work mode and backgrounds.
    assert c.handle("Alright, let's get to work.")[1] == "work"
    assert c.handle("back to normal")[1] == "normal"
    assert c.handle("change the background")[1] == "bg:next"
    assert c.handle("put the sea background")[1] == "bg:sea"
    assert c.handle("space background please")[1] == "bg:nebula"
    assert c.handle("turn the background off")[1] == "bg:off"


def test_research_pipeline_emits_everything():
    import json

    from research import Research

    events = []

    async def emit(t, p):
        events.append((t, p))

    async def complete(system, prompt):
        if "plan" in system:
            return '```json\n{"queries": ["ghana news today", "ghana headlines"], "news": true}\n```'
        assert "[1]" in prompt and "Reading body" in prompt
        return json.dumps({"findings": ["Cedi steadies against the dollar [1]", "New rail line opens [2]"], "summary": "Two big stories today, boss.", "confidence": 82})

    def search(q, news):
        assert news is True
        return [
            {"title": f"{q} one", "url": f"https://www.example.com/{q}/1", "snippet": "s1", "date": "2026-11-23"},
            {"title": f"{q} two", "url": f"https://news.site.gh/{q}/2", "snippet": "s2"},
        ]

    def extract(url):
        return "Reading body " * 20

    r = Research(emit, complete, search, extract, pace=0)
    out = asyncio.run(r.run("top news in Ghana"))
    kinds = [t for t, _ in events]
    assert kinds[0] == "task.start" and kinds[-1] == "task.done"
    assert ("task.queries", {"id": events[0][1]["id"], "queries": ["ghana news today", "ghana headlines"]}) in events
    assert sum(1 for t in kinds if t == "task.source") == 4
    assert any(t == "task.reading" for t in kinds)
    steps = [(p["key"], p["status"]) for t, p in events if t == "task.step"]
    assert ("plan", "done") in steps and ("analyze", "done") in steps
    assert [p["text"] for t, p in events if t == "task.finding"] == ["Cedi steadies against the dollar [1]", "New rail line opens [2]"]
    assert out["summary"] == "Two big stories today, boss."
    done = events[-1][1]
    assert done["sources"] == 4 and done["findings"]


def test_research_offline_and_without_llm():
    from research import Research

    events = []

    async def emit(t, p):
        events.append((t, p))

    def dead(q, news):
        raise OSError("no network")

    out = asyncio.run(Research(emit, None, dead, lambda u: "", pace=0).run("anything"))
    assert "internet" in out["summary"] and events[-1][0] == "task.done"

    events.clear()
    out = asyncio.run(Research(emit, None, lambda q, n: [{"title": "T", "url": "https://a.com/x", "snippet": "s"}], lambda u: "body", pace=0).run("x"))
    assert out["findings"] == ["T [1]"]


def test_llm_can_shut_down():
    import json

    import main

    calls = []

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        calls.append(body)
        if body["messages"][-1]["role"] == "user":
            call = {"id": "s1", "type": "function", "function": {"name": "shutdown", "arguments": json.dumps({"now": True})}}
            return httpx.Response(200, json={"choices": [{"message": {"content": "", "tool_calls": [call]}}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Later, boss."}}]})

    r = main.replier
    old = (r.provider, r.key, r.base, r.http, r.memory)
    try:
        r.provider, r.key, r.base = "groq", "k", "https://api.groq.com/openai/v1"
        r.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        r.memory = tmp_memory()
        assert asyncio.run(main.think("Boogeyman, I'm tired of you, disappear for the day")) == "Later, boss."
        assert main.state["action"] == "shutdown"
        assert any(t["function"]["name"] == "shutdown" for t in calls[0]["tools"])
    finally:
        r.provider, r.key, r.base, r.http, r.memory = old
        main.state["action"] = None


def test_screen_help_clear_phrasing():
    from commands import Commands

    c = Commands()
    for p in ["come back to the normal screen", "go back to the main screen", "leave the workspace", "exit work mode", "back to normal"]:
        assert c.handle(p)[1] == "normal", p
    for p in ["what can you do?", "show me the commands", "help"]:
        assert c.handle(p)[1] == "help", p
    assert c.handle("clear our conversation")[1] == "clear"
    ask = c.handle("Shut down yourself")
    assert ask[1] is None and "?" in ask[0]


def test_llm_tools_switch_screen_and_background():
    import json

    import main

    emitted = []

    async def capture(t, p):
        emitted.append((t, p))

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        names = {t["function"]["name"] for t in body["tools"]}
        assert {"shutdown", "switch_screen", "set_background", "show_commands", "clear_conversation", "research"} <= names
        last = body["messages"][-1]
        if last["role"] == "user":
            calls = [
                {"id": "a", "type": "function", "function": {"name": "switch_screen", "arguments": json.dumps({"screen": "normal"})}},
                {"id": "b", "type": "function", "function": {"name": "set_background", "arguments": json.dumps({"background": "sea"})}},
            ]
            return httpx.Response(200, json={"choices": [{"message": {"content": "", "tool_calls": calls}}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Done, boss."}}]})

    r = main.replier
    old = (r.provider, r.key, r.base, r.http, r.memory, main.hub.emit)
    try:
        r.provider, r.key, r.base = "groq", "k", "https://api.groq.com/openai/v1"
        r.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        r.memory = tmp_memory()
        main.hub.emit = capture
        assert asyncio.run(main.think("take me home and put the ocean on behind")) == "Done, boss."
        assert ("ui.mode", {"mode": "normal"}) in emitted and ("ui.background", {"cmd": "sea"}) in emitted
    finally:
        r.provider, r.key, r.base, r.http, r.memory, main.hub.emit = old


def test_groq_falls_back_to_next_model_on_rate_limit():
    import asyncio, httpx, tempfile
    from pathlib import Path
    from memory import Memory
    from reply import Replier

    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        model = __import__("json").loads(req.content)["model"]
        seen.append(model)
        if model == "openai/gpt-oss-120b":
            return httpx.Response(429, headers={"retry-after": "30"}, json={"error": {"message": "rate limit"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Yes boss."}}]})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    r = Replier("groq", None, groq_key="k", http=http, memory=Memory(Path(tempfile.mkdtemp()) / "m.json"))
    assert asyncio.run(r.reply("hi")) == "Yes boss."
    assert seen == ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"]
    # The limited model rests; the next turn goes straight to the fallback.
    seen.clear()
    asyncio.run(r.reply("again"))
    assert seen == ["llama-3.3-70b-versatile"]


def test_groq_all_limited_says_how_long():
    import asyncio, httpx, tempfile
    from pathlib import Path
    from memory import Memory
    from reply import Replier

    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(429, text="Please try again in 2m5s.")))
    r = Replier("groq", None, groq_key="k", http=http, memory=Memory(Path(tempfile.mkdtemp()) / "m.json"))
    out = asyncio.run(r.reply("hi"))
    assert "2 minutes" in out
