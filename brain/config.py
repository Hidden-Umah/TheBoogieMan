"""Settings for the brain, read from the environment or brain/.env (never committed)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))


@dataclass(frozen=True)
class Settings:
    anthropic_key: str | None
    model: str
    elevenlabs_key: str | None
    voice_id: str
    tts_model: str
    stt_model: str
    mic_device: str | None
    voice_enabled: bool


def load() -> Settings:
    return Settings(
        anthropic_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        model=os.environ.get("BOOGEYMAN_MODEL", "claude-haiku-5-5"),
        elevenlabs_key=os.environ.get("ELEVENLABS_API_KEY") or None,
        # Brian: deep, resonant premade voice. Swap for any voice id in your ElevenLabs account.
        voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "nPczCjzI2devNBz1zQrb"),
        tts_model=os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5"),
        stt_model=os.environ.get("ELEVENLABS_STT_MODEL", "scribe_v2"),
        mic_device=os.environ.get("BOOGEYMAN_MIC") or None,
        voice_enabled=os.environ.get("BOOGEYMAN_VOICE", "1") != "0",
    )
