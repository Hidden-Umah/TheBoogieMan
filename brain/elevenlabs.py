"""ElevenLabs: speech → text (Scribe) and text → speech (streaming raw PCM)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

API = "https://api.elevenlabs.io"
TTS_RATE = 24000  # Hz, matches output_format below
TTS_FORMAT = f"pcm_{TTS_RATE}"  # raw 16-bit little-endian mono


class ElevenLabs:
    def __init__(self, api_key: str, voice_id: str, tts_model: str, stt_model: str, client: httpx.AsyncClient | None = None):
        self.voice_id = voice_id
        self.tts_model = tts_model
        self.stt_model = stt_model
        self.http = client or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
        self.headers = {"xi-api-key": api_key}

    async def transcribe(self, wav: bytes) -> str:
        r = await self.http.post(
            f"{API}/v1/speech-to-text",
            headers=self.headers,
            data={"model_id": self.stt_model, "tag_audio_events": "false"},
            files={"file": ("speech.wav", wav, "audio/wav")},
        )
        r.raise_for_status()
        return str(r.json().get("text", "")).strip()

    async def speak(self, text: str) -> AsyncIterator[bytes]:
        """Yields raw PCM16 mono at TTS_RATE as it streams in."""
        async with self.http.stream(
            "POST",
            f"{API}/v1/text-to-speech/{self.voice_id}/stream",
            params={"output_format": TTS_FORMAT},
            headers={**self.headers, "Content-Type": "application/json"},
            json={"text": text, "model_id": self.tts_model},
        ) as r:
            if r.status_code >= 400:
                body = await r.aread()
                raise httpx.HTTPStatusError(f"TTS failed {r.status_code}: {body[:200]!r}", request=r.request, response=r)
            async for chunk in r.aiter_bytes():
                if chunk:
                    yield chunk
