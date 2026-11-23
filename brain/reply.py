"""What the Boogeyman says back. Claude when a key is set, a small built-in fallback otherwise.
Phase 1 (#2) grows this into the full agent loop with tools."""

from __future__ import annotations

import random

SYSTEM = """You are the Boogeyman: the boss's personal AI, living on his Linux desktop.
You speak out loud, so:
- Reply in 1 to 3 short, natural spoken sentences. No markdown, lists, emojis or URLs.
- Call him "boss" now and then, not every time.
- Calm, sharp, a little dark and witty. Never cheesy.
- If you can't do something yet (search the web, control the computer), say so plainly in one line."""

FALLBACK_GREETINGS = ["Hello, boss.", "I'm here, boss.", "Hey, boss. I'm listening."]


class Replier:
    def __init__(self, api_key: str | None, model: str):
        self.model = model
        self.history: list[dict[str, str]] = []
        self.client = None
        if api_key:
            from anthropic import AsyncAnthropic

            self.client = AsyncAnthropic(api_key=api_key)

    @property
    def online(self) -> bool:
        return self.client is not None

    async def reply(self, text: str) -> str:
        if not self.client:
            return fallback(text)
        self.history.append({"role": "user", "content": text})
        self.history = self.history[-20:]
        msg = await self.client.messages.create(
            model=self.model,
            max_tokens=300,
            system=SYSTEM,
            messages=self.history,
        )
        out = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        self.history.append({"role": "assistant", "content": out})
        return out or "I'm here, boss."


def fallback(text: str) -> str:
    t = text.lower().strip(" .!?")
    if any(w in t for w in ("hello", "hi", "hey", "yo", "good morning", "good evening")):
        return random.choice(FALLBACK_GREETINGS)
    if "how are you" in t:
        return "Running clean, boss. All systems up."
    if "your name" in t or "who are you" in t:
        return "I'm the Boogeyman. Your personal intelligence."
    return f"I heard you say: {text}. Give me my Claude key and I'll do more than repeat you."
