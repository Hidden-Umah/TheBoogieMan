"""Mic capture, speech detection and playback.

Mic frames are 30 ms of 16 kHz mono int16. `Segmenter` turns that stream into
utterances using an energy threshold calibrated against room noise.
"""

from __future__ import annotations

import asyncio
import io
import wave
from collections import deque
from dataclasses import dataclass, field

import numpy as np

MIC_RATE = 16000
FRAME_MS = 30
FRAME = MIC_RATE * FRAME_MS // 1000  # samples per frame


def rms(pcm: np.ndarray) -> float:
    """0..1 loudness of int16 samples."""
    if pcm.size == 0:
        return 0.0
    x = pcm.astype(np.float32) / 32768.0
    return float(np.sqrt(np.mean(x * x)))


def to_wav(pcm: np.ndarray, rate: int = MIC_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.astype(np.int16).tobytes())
    return buf.getvalue()


@dataclass
class Segmenter:
    """Energy VAD. Feed frames; returns a finished utterance (int16 array) or None."""

    calibrate_frames: int = 33  # ~1 s of room noise
    start_frames: int = 3  # ~90 ms above threshold to start
    end_ms: int = 800  # silence that ends an utterance
    min_ms: int = 350
    max_ms: int = 15000
    preroll_frames: int = 10  # keep ~300 ms before speech starts

    noise: float = 0.0
    seen: int = 0
    speaking: bool = False
    above: int = 0
    silent: int = 0
    frames: list[np.ndarray] = field(default_factory=list)
    preroll: deque = field(default_factory=lambda: deque(maxlen=10))

    @property
    def threshold(self) -> float:
        return max(self.noise * 3.0, 0.012)

    def feed(self, frame: np.ndarray) -> np.ndarray | None:
        level = rms(frame)
        if self.seen < self.calibrate_frames:
            # Running average of room noise.
            self.seen += 1
            self.noise += (level - self.noise) / self.seen
            return None

        loud = level > self.threshold
        if not self.speaking:
            self.preroll.append(frame)
            self.above = self.above + 1 if loud else 0
            if not loud:
                # Slowly track changing room noise while idle.
                self.noise = self.noise * 0.995 + level * 0.005
            if self.above >= self.start_frames:
                self.speaking = True
                self.frames = list(self.preroll)
                self.silent = 0
            return None

        self.frames.append(frame)
        self.silent = 0 if loud else self.silent + 1
        dur = len(self.frames) * FRAME_MS
        if self.silent * FRAME_MS >= self.end_ms or dur >= self.max_ms:
            out = np.concatenate(self.frames)
            self.reset()
            if dur - self.end_ms < self.min_ms:
                return None  # a click or a cough, not speech
            return out
        return None

    def reset(self) -> None:
        self.speaking = False
        self.above = 0
        self.silent = 0
        self.frames = []
        self.preroll.clear()


class Mic:
    """sounddevice input stream → asyncio queue of frames."""

    def __init__(self, device: str | None = None):
        import sounddevice as sd

        self.queue: asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=200)
        loop = asyncio.get_running_loop()

        def callback(indata, frames, time, status):  # runs on the audio thread
            frame = indata[:, 0].copy()
            loop.call_soon_threadsafe(self._put, frame)

        self.stream = sd.InputStream(
            samplerate=MIC_RATE, channels=1, dtype="int16", blocksize=FRAME, device=device, callback=callback
        )
        self.stream.start()

    def _put(self, frame: np.ndarray) -> None:
        if self.queue.full():
            self.queue.get_nowait()
        self.queue.put_nowait(frame)

    async def read(self) -> np.ndarray:
        return await self.queue.get()

    def drain(self) -> None:
        while not self.queue.empty():
            self.queue.get_nowait()

    def close(self) -> None:
        self.stream.stop()
        self.stream.close()


class Speaker:
    """Plays PCM16 mono through the default output device."""

    def __init__(self, rate: int):
        import sounddevice as sd

        self.stream = sd.OutputStream(samplerate=rate, channels=1, dtype="int16")
        self.stream.start()

    def write(self, pcm: np.ndarray) -> None:
        self.stream.write(pcm.reshape(-1, 1))  # blocks at real-time pace

    def close(self) -> None:
        self.stream.stop()
        self.stream.close()
