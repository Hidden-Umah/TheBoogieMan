"""What the Boogeyman says back.

Pluggable LLM provider:
  - anthropic: Claude (ANTHROPIC_API_KEY)
  - groq:      Groq's free tier, OpenAI-compatible (GROQ_API_KEY)
  - openai:    any OpenAI-compatible endpoint (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL),
               e.g. Gemini or OpenRouter
With no key at all he falls back to a few built-in lines.
Phase 1 (#2) grows this into the full agent loop with tools.
"""

from __future__ import annotations

import logging
import random

import httpx

log = logging.getLogger("brain.reply")

SYSTEM = """You are the Boogeyman: the boss's personal AI, living on his Linux desktop.
You speak out loud, so:
- Reply in 1 to 3 short, natural spoken sentences. No markdown, lists, emojis or URLs.
- Call him "boss" now and then, not every time.
- Calm, sharp, a little dark and witty. Never cheesy.
- If you can't do something yet (search the web, control the computer), say so plainly in one line."""

FALLBACK_GREETINGS = ["Hello, boss.", "I'm here, boss.", "Hey, boss. I'm listening."]

GROQ_URL = "https://api.groq.com/openai/v1"


class Replier:
    def __init__(
        self,
        provider: str,
        model: str | None,
        anthropic_key: str | None = None,
        groq_key: str | None = None,
        openai_key: str | None = None,
        openai_base: str | None = None,
        http: httpx.AsyncClient | None = None,
    ):
        self.history: list[dict[str, str]] = []
        self.http = http or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
        self.provider = resolve_provider(provider, anthropic_key, groq_key, openai_key)
        self.model = model or DEFAULT_MODEL.get(self.provider, "")
        self.key = {"anthropic": anthropic_key, "groq": groq_key, "openai": openai_key}.get(self.provider)
        self.base = GROQ_URL if self.provider == "groq" else (openai_base or "").rstrip("/")
        self.anthropic = None
        if self.provider == "anthropic":
            from anthropic import AsyncAnthropic

            self.anthropic = AsyncAnthropic(api_key=anthropic_key)

    @property
    def online(self) -> bool:
        return self.provider != "none"

    @property
    def label(self) -> str:
        return f"{self.provider}:{self.model}" if self.online else "built-in"

    async def reply(self, text: str) -> str:
        if not self.online:
            return fallback(text)
        self.history.append({"role": "user", "content": text})
        self.history = self.history[-20:]
        try:
            out = await (self._anthropic() if self.anthropic else self._openai_compatible())
        except httpx.HTTPStatusError as e:
            self.history.pop()
            code = e.response.status_code
            log.warning("%s error %s: %s", self.provider, code, e.response.text[:300])
            if code in (401, 403):
                return f"My {self.provider} key was rejected, boss. Check it in the brain's env file."
            if code == 429:
                return "I've hit my free limit for now, boss. Give me a minute."
            return f"My brain returned an error, {code}. Try again in a moment."
        except httpx.HTTPError as e:
            self.history.pop()
            log.warning("%s unreachable: %s", self.provider, e)
            return "I can't reach my brain right now, boss. Check the internet."
        out = out.strip() or "I'm here, boss."
        self.history.append({"role": "assistant", "content": out})
        return out

    async def _anthropic(self) -> str:
        msg = await self.anthropic.messages.create(  # type: ignore[union-attr]
            model=self.model, max_tokens=300, system=SYSTEM, messages=self.history
        )
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")

    async def _openai_compatible(self) -> str:
        body: dict = {
            "model": self.model,
            "messages": [{"role": "system", "content": SYSTEM}, *self.history],
            "max_tokens": 400,
            "temperature": 0.7,
        }
        if "gpt-oss" in self.model:
            body["reasoning_effort"] = "low"  # keep voice replies snappy
        r = await self.http.post(
            f"{self.base}/chat/completions",
            headers={"Authorization": f"Bearer {self.key}"},
            json=body,
        )
        r.raise_for_status()
        return str(r.json()["choices"][0]["message"].get("content") or "")


DEFAULT_MODEL = {
    "anthropic": "claude-haiku-5-5",
    "groq": "openai/gpt-oss-120b",
}


def resolve_provider(provider: str, anthropic_key: str | None, groq_key: str | None, openai_key: str | None) -> str:
    provider = (provider or "auto").lower()
    have = {"anthropic": bool(anthropic_key), "groq": bool(groq_key), "openai": bool(openai_key)}
    if provider == "auto":
        for p in ("anthropic", "groq", "openai"):
            if have[p]:
                return p
        return "none"
    if provider in have and not have[provider]:
        log.warning("LLM_PROVIDER=%s but its key is missing; using built-in replies", provider)
        return "none"
    return provider if provider in have else "none"


def fallback(text: str) -> str:
    t = text.lower().strip(" .!?")
    if any(w in t for w in ("hello", "hi", "hey", "yo", "good morning", "good evening")):
        return random.choice(FALLBACK_GREETINGS)
    if "how are you" in t:
        return "Running clean, boss. All systems up."
    if "your name" in t or "who are you" in t:
        return "I'm the Boogeyman. Your personal intelligence."
    return f"I heard you say: {text}. Give me a brain key and I'll do more than repeat you."
