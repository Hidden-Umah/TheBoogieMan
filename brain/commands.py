"""Built-in commands, handled before the LLM: instant, deterministic, and they work offline.

Shutdown (the Boogeyman itself, not the computer):
  "shut down" / "can you shut down?"  -> asks to confirm
     "yes" -> farewell, then quit          "no" -> stays
  "shut down now" / "right now" / "immediately" -> farewell, then quit, no question
"""

from __future__ import annotations

import random
import re
import time

SHUT = re.compile(
    r"\b(shut\s*(yourself\s*)?down|shutdown|turn\s*(yourself\s*)?off|switch\s*(yourself\s*)?off|"
    r"power\s*(yourself\s*)?(off|down)|go\s*offline|quit|exit\s*yourself|off\s*yourself)\b"
)
NOW = re.compile(r"\b(now|right\s*now|immediately|asap|right\s*away|this\s*instant)\b")
COMPUTER = re.compile(r"\b(computer|laptop|pc|machine|system|ubuntu)\b")
YES = re.compile(
    r"^(yes|yeah|yea|yep|yup|ya|sure|do\s*it|go\s*ahead|confirm(ed)?|affirmative|of\s*course|"
    r"please|ok(ay)?|shut\s*(it\s*)?down|i'?m\s*sure|very\s*sure)\b"
)
NO = re.compile(r"^(no|nah|nope|cancel|stop|wait|don'?t|never\s*mind|stay|abort|not\s*now)\b")

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


def normalize(text: str) -> str:
    return re.sub(r"[^\w\s']", " ", text.lower()).strip()


class Commands:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.pending_since: float | None = None

    def handle(self, text: str) -> tuple[str, str | None] | None:
        """Returns (what to say, action or None), or None if this isn't a command."""
        t = normalize(text)
        if self.pending_since is not None:
            fresh = self.clock() - self.pending_since < CONFIRM_WINDOW
            self.pending_since = None
            if fresh and YES.search(t):
                return random.choice(BYE), "shutdown"
            if fresh and NO.search(t):
                return random.choice(STAY), None
            # Anything else: drop the question and treat it as a normal message.
        # Only short, direct commands count ("shut down", "can you shut down now"), or ones
        # aimed at him ("turn yourself off..."), not sentences that merely mention shutdowns.
        if not SHUT.search(t) or (len(t.split()) > 7 and "yourself" not in t):
            return None
        if COMPUTER.search(t):
            return NOT_COMPUTER, None
        if NOW.search(t):
            return random.choice(BYE_NOW), "shutdown"
        self.pending_since = self.clock()
        return random.choice(ASK), None
