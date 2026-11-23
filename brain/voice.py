"""The voice loop: listen → transcribe → reply → speak, emitting state to the UI.

Everything it touches (mic, speaker, STT, TTS, replier) is injected so it can be
tested without hardware or network.

Events (pushed to the UI, no id):
  voice.state      {state: idle|listening|hearing|transcribing|thinking|speaking|muted|error, detail?}
  voice.level      {source: mic|voice, level: 0..1}
  voice.spectrum   {source: mic|voice, bands: [24 x 0..1]}  (the voice pattern)
  voice.transcript {text}
  voice.reply      {text}
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Protocol

import numpy as np

from audio import MIC_RATE, Segmenter, rms, spectrum, to_wav

log = logging.getLogger("brain.voice")

Emit = Callable[[str, dict[str, Any]], Awaitable[None]]

CHUNK = 1024  # playback block (~43 ms at 24 kHz): one level update each


class MicLike(Protocol):
    async def read(self) -> np.ndarray: ...
    def drain(self) -> None: ...


class SpeakerLike(Protocol):
    def write(self, pcm: np.ndarray) -> None: ...


def boost(level: float) -> float:
    """Map raw RMS (speech is ~0.02-0.3) onto a lively 0..1 for the visuals."""
    return float(min(1.0, (level * 6.0) ** 0.7))


class VoiceLoop:
    def __init__(
        self,
        emit: Emit,
        mic: MicLike | None,
        speaker: SpeakerLike | None,
        transcribe: Callable[[bytes], Awaitable[str]] | None,
        tts: Callable[[str], AsyncIterator[bytes]] | None,
        reply: Callable[[str], Awaitable[str]],
        tts_rate: int = 24000,
    ):
        self.tts_rate = tts_rate
        self.emit = emit
        self.mic = mic
        self.speaker = speaker
        self.transcribe = transcribe
        self.tts = tts
        self.reply = reply
        self.muted = False
        self.busy = asyncio.Lock()
        self.seg = Segmenter()

    @property
    def can_listen(self) -> bool:
        return self.mic is not None and self.transcribe is not None

    async def state(self, state: str, **extra: Any) -> None:
        await self.emit("voice.state", {"state": state, **extra})

    async def run(self) -> None:
        """Listen forever. Utterances are handled one at a time; the mic is ignored meanwhile."""
        if not self.can_listen:
            await self.state("idle", detail="mic or speech-to-text unavailable")
            return
        await self.state("listening")
        tick = 0
        while True:
            frame = await self.mic.read()  # type: ignore[union-attr]
            if self.muted or self.busy.locked():
                continue
            tick += 1
            if tick % 2 == 0:  # ~16 mic updates per second is plenty
                await self.emit("voice.level", {"source": "mic", "level": boost(rms(frame))})
                await self.emit("voice.spectrum", {"source": "mic", "bands": spectrum(frame, MIC_RATE)})
            was = self.seg.speaking
            utterance = self.seg.feed(frame)
            if self.seg.speaking and not was:
                await self.state("hearing")
            if utterance is not None:
                await self.handle_utterance(utterance)
            elif was and not self.seg.speaking:
                await self.state("listening")  # too short, discarded

    async def handle_utterance(self, pcm: np.ndarray) -> None:
        async with self.busy:
            try:
                await self.state("transcribing")
                text = (await self.transcribe(to_wav(pcm))).strip()  # type: ignore[misc]
                if len(text) < 2 or text.startswith("("):
                    return  # noise, not words
                await self.emit("voice.transcript", {"text": text})
                await self.respond(text, locked=True)
            except Exception as e:  # keep listening whatever happens
                log.exception("voice turn failed")
                await self.state("error", detail=str(e)[:160])
                await asyncio.sleep(1.5)
            finally:
                self.seg.reset()
                if self.mic:
                    self.mic.drain()  # drop anything heard while we were busy (incl. our own voice)
                await self.state("muted" if self.muted else "listening")

    async def respond(self, text: str, locked: bool = False) -> str:
        """Think of a reply to `text`, then say it."""
        if not locked:
            async with self.busy:
                return await self.respond(text, locked=True)
        await self.state("thinking")
        out = await self.reply(text)
        await self.emit("voice.reply", {"text": out})
        await self.say(out, locked=True)
        return out

    async def say(self, text: str, locked: bool = False) -> None:
        if not locked:
            async with self.busy:
                return await self.say(text, locked=True)
        if not (self.tts and self.speaker):
            return
        await self.state("speaking")
        buf = b""
        try:
            async for chunk in self.tts(text):
                buf += chunk
                usable = len(buf) - (len(buf) % (CHUNK * 2))
                for i in range(0, usable, CHUNK * 2):
                    await self.play_block(np.frombuffer(buf[i : i + CHUNK * 2], dtype=np.int16))
                buf = buf[usable:]
            if len(buf) >= 2:
                await self.play_block(np.frombuffer(buf[: len(buf) - len(buf) % 2], dtype=np.int16))
        finally:
            await self.emit("voice.level", {"source": "voice", "level": 0.0})

    async def play_block(self, pcm: np.ndarray) -> None:
        await self.emit("voice.level", {"source": "voice", "level": boost(rms(pcm))})
        await self.emit("voice.spectrum", {"source": "voice", "bands": spectrum(pcm, self.tts_rate)})
        await asyncio.to_thread(self.speaker.write, pcm)  # type: ignore[union-attr]

    async def set_muted(self, muted: bool) -> None:
        self.muted = muted
        self.seg.reset()
        if self.mic:
            self.mic.drain()
        if not self.busy.locked():
            await self.state("muted" if muted else "listening")
