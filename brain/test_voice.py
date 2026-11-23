"""Voice pipeline tests with fake mic, speaker, STT and TTS (no hardware, no network)."""

import asyncio

import httpx
import numpy as np

from audio import FRAME, Segmenter
from elevenlabs import ElevenLabs
from reply import fallback
from voice import VoiceLoop

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

    r = Replier("auto", None, groq_key="gsk_test", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
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
