"""The research agent: plan queries -> search the web -> read sources -> synthesize.

Every stage is pushed to the UI as task.* events so work mode can show it live:
  task.start   {id, kind, title}
  task.step    {id, key, label, status: running|done|failed, progress 0..1, detail?}
  task.queries {id, queries}
  task.source  {id, n, title, url, domain, snippet, date?}
  task.reading {id, url, domain, chars}
  task.metric  {id, name, value}
  task.finding {id, n, text}
  task.done    {id, summary, findings, sources, seconds}

Search uses DuckDuckGo via `ddgs` (free, no key). The LLM is whatever Replier is set up with;
without one it still searches and reads back the top results.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger("brain.research")

Emit = Callable[[str, dict[str, Any]], Awaitable[None]]
Complete = Callable[[str, str], Awaitable[str]]  # (system, prompt) -> text
Search = Callable[[str, bool], list[dict[str, Any]]]  # (query, news) -> results (sync, runs in a thread)
Extract = Callable[[str], str]  # url -> plain text (sync, runs in a thread)

STEPS = [("plan", "PLANNING QUERIES"), ("search", "SEARCHING THE WEB"), ("read", "READING SOURCES"), ("analyze", "ANALYZING")]
MAX_SOURCES = 12
READ_TOP = 4
READ_CHARS = 1400


def ddg_search(query: str, news: bool) -> list[dict[str, Any]]:
    from ddgs import DDGS

    d = DDGS(timeout=10)
    if news:
        rows = d.news(query, max_results=8)
        return [{"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("body", ""), "date": r.get("date", ""), "source": r.get("source", "")} for r in rows]
    rows = d.text(query, max_results=8)
    return [{"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")} for r in rows]


def ddg_extract(url: str) -> str:
    from ddgs import DDGS

    content = DDGS(timeout=8).extract(url, fmt="text_plain").get("content", "")
    return content.decode("utf-8", "ignore") if isinstance(content, bytes) else str(content)


def parse_json(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model reply (tolerates code fences and chatter)."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


def domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


class Research:
    def __init__(self, emit: Emit, complete: Complete | None, search: Search = ddg_search, extract: Extract = ddg_extract, pace: float = 0.25):
        self.emit = emit
        self.complete = complete
        self.search = search
        self.extract = extract
        self.pace = pace  # small delays so the UI can show things arriving

    async def run(self, query: str) -> dict[str, Any]:
        tid = uuid.uuid4().hex[:8]
        t0 = time.monotonic()
        await self.emit("task.start", {"id": tid, "kind": "research", "title": query})

        async def step(i: int, status: str, detail: str = "") -> None:
            key, label = STEPS[i]
            progress = (i + (1 if status == "done" else 0.35)) / len(STEPS)
            await self.emit("task.step", {"id": tid, "key": key, "label": label, "status": status, "progress": round(progress, 3), "detail": detail})

        # 1. Plan
        await step(0, "running", "Breaking the question down")
        queries, news = [query], bool(re.search(r"\b(news|latest|today|this week|current|headlines|happening)\b", query, re.I))
        if self.complete:
            try:
                plan = parse_json(
                    await self.complete(
                        "You plan web research. Reply with JSON only.",
                        f'Request: "{query}"\nGive 2 to 3 short, distinct web search queries that together answer it, '
                        f'and whether it is about recent news.\n{{"queries": ["..."], "news": true|false}}',
                    )
                )
                qs = [str(q).strip() for q in plan.get("queries", []) if str(q).strip()]
                if qs:
                    queries = qs[:3]
                news = bool(plan.get("news", news))
            except Exception as e:  # planning is optional; fall back to the raw request
                log.warning("plan failed: %s", e)
        await self.emit("task.queries", {"id": tid, "queries": queries})
        await step(0, "done", f"{len(queries)} queries")

        # 2. Search
        await step(1, "running", queries[0])
        sources: list[dict[str, Any]] = []
        seen: set[str] = set()
        for q in queries:
            await self.emit("task.step", {"id": tid, "key": "search", "label": STEPS[1][1], "status": "running", "progress": 0.3, "detail": q})
            try:
                rows = await asyncio.to_thread(self.search, q, news)
            except Exception as e:
                log.warning("search failed for %r: %s", q, e)
                rows = []
            for r in rows:
                url = r.get("url", "")
                if not url or url in seen or len(sources) >= MAX_SOURCES:
                    continue
                seen.add(url)
                src = {"n": len(sources) + 1, "title": r.get("title", "")[:140], "url": url, "domain": domain(url), "snippet": r.get("snippet", "")[:300], "date": r.get("date", "")}
                sources.append(src)
                await self.emit("task.source", {"id": tid, **src})
                await self.emit("task.metric", {"id": tid, "name": "sources", "value": len(sources)})
                await self.emit("task.metric", {"id": tid, "name": "domains", "value": len({s["domain"] for s in sources})})
                await asyncio.sleep(self.pace * 0.4)
        if not sources:
            await step(1, "failed", "No results (offline?)")
            summary = "I couldn't reach the web just now, boss. Check the internet and try again."
            await self.emit("task.done", {"id": tid, "summary": summary, "findings": [], "sources": 0, "seconds": round(time.monotonic() - t0, 1)})
            return {"summary": summary, "findings": [], "sources": []}
        await step(1, "done", f"{len(sources)} sources")

        # 3. Read the top pages, one per domain
        await step(2, "running", "Opening pages")
        picked, domains = [], set()
        for s in sources:
            if s["domain"] not in domains:
                picked.append(s)
                domains.add(s["domain"])
            if len(picked) >= READ_TOP:
                break
        texts: dict[int, str] = {}
        for s in picked:
            await self.emit("task.step", {"id": tid, "key": "read", "label": STEPS[2][1], "status": "running", "progress": 0.55, "detail": s["domain"]})
            try:
                txt = await asyncio.wait_for(asyncio.to_thread(self.extract, s["url"]), timeout=10)
                txt = re.sub(r"\s+", " ", txt).strip()[:READ_CHARS]
            except Exception as e:
                log.info("read failed %s: %s", s["url"], e)
                txt = ""
            texts[s["n"]] = txt
            await self.emit("task.reading", {"id": tid, "url": s["url"], "domain": s["domain"], "chars": len(txt)})
            await self.emit("task.metric", {"id": tid, "name": "read", "value": sum(1 for v in texts.values() if v)})
        await step(2, "done", f"{sum(1 for v in texts.values() if v)} pages read")

        # 4. Analyze
        await step(3, "running", "Connecting the dots")
        findings: list[str] = []
        summary = ""
        confidence = 0
        if self.complete:
            lines = []
            for s in sources[:10]:
                body = texts.get(s["n"]) or s["snippet"]
                lines.append(f"[{s['n']}] {s['title']} ({s['domain']}{', ' + s['date'][:10] if s.get('date') else ''})\n{body}")
            try:
                out = parse_json(
                    await self.complete(
                        "You are the Boogeyman's research analyst. Use only the sources. Reply with JSON only.",
                        f'Request: "{query}"\n\nSources:\n' + "\n\n".join(lines) + "\n\n"
                        'Return {"findings": ["up to 6 short factual bullets, each ending with [n] citations"], '
                        '"summary": "2 to 4 spoken sentences for the boss, no citations, no lists", '
                        '"confidence": 0-100}',
                    )
                )
                findings = [str(f).strip() for f in out.get("findings", []) if str(f).strip()][:6]
                summary = str(out.get("summary", "")).strip()
                confidence = int(out.get("confidence", 0) or 0)
            except Exception as e:
                log.warning("analyze failed: %s", e)
        if not findings:  # no LLM, or it failed: read back the top results
            findings = [f"{s['title']} [{s['n']}]" for s in sources[:5]]
            summary = summary or "Here's what I found, boss. The top results are on your screen."
            confidence = confidence or 40
        for i, f in enumerate(findings):
            await self.emit("task.finding", {"id": tid, "n": i + 1, "text": f})
            await asyncio.sleep(self.pace)
        await self.emit("task.metric", {"id": tid, "name": "confidence", "value": max(0, min(100, confidence))})
        await step(3, "done", "Report ready")
        seconds = round(time.monotonic() - t0, 1)
        await self.emit("task.done", {"id": tid, "summary": summary, "findings": findings, "sources": len(sources), "seconds": seconds})
        return {"summary": summary, "findings": findings, "sources": [{"n": s["n"], "title": s["title"], "url": s["url"]} for s in sources]}
