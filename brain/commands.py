"""Built-in commands, handled before the LLM: instant, deterministic, and they work offline.

Shutdown (the Boogeyman itself, not the computer):
  "shut down" / "can you shut down?" / "go to sleep"  -> asks to confirm
     "yes" -> farewell, then quit          "no" -> stays
  "shut down now" / "right now" / "immediately"       -> farewell, then quit, no question
Work mode:
  "let's get to work" / "work mode"                    -> workspace
  "back to normal" / "exit work mode"                  -> back to the core
Background:
  "change / switch / next background", "sea background", "space background", "background off"

Actions returned with a reply: "shutdown", "work", "normal", "bg:next|sea|nebula|off|on".
"""

from __future__ import annotations

import random
import re
import time

SHUT = re.compile(
    r"\b(shut\s*(it|yourself|urself|everything)?\s*down|shutdown|"
    r"turn\s+(yourself\s+|it\s+)?off(?!\s+(the|my|a|an|that|this)\b)|"
    r"switch\s+(yourself\s+|it\s+)?off(?!\s+(the|my|a|an|that|this)\b)|"
    r"power\s*(yourself\s*)?(off|down)|go\s*offline|go\s*to\s*sleep|sleep\s*now|"
    r"close\s*(yourself|the\s*app|down|it\s*down)|kill\s*the\s*app|stop\s*running|log\s*off|"
    r"exit\s*(yourself|the\s*app)?$|^exit|quit|off\s*yourself)\b"
)
NOW = re.compile(r"\b(now|right\s*now|immediately|asap|right\s*away|this\s*instant|at\s*once)\b")
COMPUTER = re.compile(r"\b(computer|laptop|pc|machine|ubuntu|linux)\b")
YES = re.compile(
    r"^(yes|yeah|yea|yep|yup|ya|ye|sure|do\s*it|go\s*ahead|confirm(ed)?|affirmative|of\s*course|"
    r"please|ok(ay)?|shut\s*(it\s*)?down|i'?m\s*sure|very\s*sure|i\s*said\s*yes)\b"
)
NO = re.compile(r"^(no|nah|nope|cancel|stop|wait|don'?t|never\s*mind|stay|abort|not\s*now|hold\s*on)\b")

WORK = re.compile(
    r"\b(let'?s\s*(get\s*to|go\s*to|start|get\s*down\s*to)\s*work|let'?s\s*work|time\s*to\s*work|work\s*mode|"
    r"get\s*to\s*work|start\s*working|let'?s\s*get\s*busy|let'?s\s*get\s*started|we'?re\s*about\s*to\s*work)\b"
)
NORMAL = re.compile(
    r"\b(back\s*to\s*normal|normal\s*mode|exit\s*work\s*mode|leave\s*work\s*mode|stop\s*work(ing)?|"
    r"go\s*(back\s*)?home|close\s*(the\s*)?workspace|we'?re\s*done\s*working)\b"
)
BG = re.compile(r"\b(background|wallpaper|backdrop|video)\b")
BG_KIND = [
    ("off", re.compile(r"\b(off|remove|hide|disable|no)\b")),
    ("sea", re.compile(r"\b(sea|ocean|underwater|water|ship|shipwreck|jelly\s*fish|marine)\b")),
    ("nebula", re.compile(r"\b(space|nebula|smoke|smoky|default|dark|stars?)\b")),
    ("next", re.compile(r"\b(change|switch|next|another|different|cycle|swap|new)\b")),
    ("on", re.compile(r"\b(on|show|enable|bring\s*back)\b")),
]

CONFIRM_WINDOW = 30.0  # seconds a "yes" still counts

ASK = [
    "Are you sure you want me to shut down, boss?",
    "Should I shut down, boss?",
    "You want me gone, boss? Say yes and I'm out.",
]
BYE = ["Okay boss, take care.", "Alright boss. Take care.", "Shutting down. Take care, boss."]
BYE_NOW = ["Shutting down. Take care, boss.", "Going dark now. Later, boss.", "Done. Take care, boss."]
STAY = ["Alright, I'm staying.", "Good. I wasn't going anywhere.", "Cool, I'm still here, boss."]
NOT_COMPUTER = "I can only shut myself down for now, boss. Powering off the computer comes later."
WORK_LINES = ["Boss, what do you want to do?", "Workspace is up. What are we doing, boss?"]
NORMAL_LINES = ["Back to base, boss.", "Done. I'm here when you need me."]
BG_LINES = {
    "sea": "Going under the sea.",
    "nebula": "Back to the dark.",
    "next": "New view, boss.",
    "off": "Background off.",
    "on": "Background on.",
}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s']", " ", text.lower())).strip()


class Commands:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.pending_since: float | None = None

    def ask_shutdown(self) -> str:
        self.pending_since = self.clock()
        return random.choice(ASK)

    def handle(self, text: str) -> tuple[str, str | None] | None:
        """Returns (what to say, action or None), or None if this isn't a command."""
        t = normalize(text)
        short = len(t.split()) <= 8

        if self.pending_since is not None:
            fresh = self.clock() - self.pending_since < CONFIRM_WINDOW
            self.pending_since = None
            if fresh and YES.search(t):
                return random.choice(BYE), "shutdown"
            if fresh and NO.search(t):
                return random.choice(STAY), None
            # Anything else: drop the question and treat it as a normal message.

        # Only short, direct commands count, or ones aimed at him ("turn yourself off...").
        if SHUT.search(t) and (short or "yourself" in t):
            if COMPUTER.search(t):
                return NOT_COMPUTER, None
            if NOW.search(t):
                return random.choice(BYE_NOW), "shutdown"
            return self.ask_shutdown(), None

        if short and WORK.search(t):
            return random.choice(WORK_LINES), "work"
        if short and NORMAL.search(t):
            return random.choice(NORMAL_LINES), "normal"
        if short and BG.search(t):
            for kind, rx in BG_KIND:
                if rx.search(t):
                    return BG_LINES[kind], f"bg:{kind}"
        return None
