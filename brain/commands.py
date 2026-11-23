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

Help / housekeeping:
  "what can you do" / "help" / "show commands"         -> commands card on screen
  "clear our conversation"                             -> wipes recent history (memory facts stay)

Actions returned with a reply: "shutdown", "work", "normal", "help", "clear", "bg:next|sea|nebula|off|on".
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
    r"exit\s*(yourself|the\s*app)?$|quit|off\s*yourself)\b"
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
    r"\b(back\s*to\s*(the\s*)?(normal|main|home|core|base|default)|"
    r"(normal|main|home|default)\s*(mode|screen|view|page)|"
    r"(exit|leave|close|quit)\s*(the\s*)?(work\s*(mode|space|screen)?|workspace)|stop\s*work(ing)?|"
    r"go\s*(back\s*)?home|we'?re\s*done\s*(working|here)|that'?s\s*all\s*for\s*now)\b"
)
HELP = re.compile(
    r"\b(what\s*can\s*you\s*do|what\s*can\s*i\s*say|(show|list|give)\s*(me\s*)?(the\s*)?(your\s*)?(commands|options)|"
    r"^help|help\s*me\s*out\s*with\s*commands|commands\s*list)\b"
)
CLEAR = re.compile(r"\b(clear|reset|wipe|forget)\s*(our|the|this)?\s*(conversation|chat|history)\b")
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
DEVIL_OFF = re.compile(
    r"\b((exit|leave|quit|stop|end|disable|turn\s*off|cancel|close|kill|drop)\s*(the\s*)?(devil|demon|beast)(\s*mode)?|"
    r"(devil|demon|beast)\s*mode\s*off|stand\s*down|calm\s*down|no\s*more\s*devil)\b")
DEVIL_ON = re.compile(
    r"\b((devil|demon|beast)\s*mode|go\s*devil|unleash(\s*(the\s*)?(devil|beast|yourself))?|arm\s*(up|yourself)|"
    r"wake\s*the\s*devil|show\s*(me\s*)?(your|the)\s*eye)\b")
DEVIL_ON_LINES = ["Devil mode. Let's get serious, boss.", "Visor down. I'm watching everything, boss."]
DEVIL_OFF_LINES = ["Standing down, boss.", "Devil's asleep. Back to normal."]
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

        # Devil mode before anything else ("exit devil mode" is neither a shutdown nor a screen switch).
        if short and DEVIL_OFF.search(t):
            return random.choice(DEVIL_OFF_LINES), "devil:off"
        if short and DEVIL_ON.search(t):
            return random.choice(DEVIL_ON_LINES), "devil:on"

        # Screen switches first, so "exit work mode" never reads as "exit" (shutdown).
        if short and NORMAL.search(t):
            return random.choice(NORMAL_LINES), "normal"

        # Only short, direct commands count, or ones aimed at him ("turn yourself off...").
        if SHUT.search(t) and (short or "yourself" in t):
            if COMPUTER.search(t):
                return NOT_COMPUTER, None
            if NOW.search(t):
                return random.choice(BYE_NOW), "shutdown"
            return self.ask_shutdown(), None

        if short and HELP.search(t):
            return "Here's what I can do, boss. It's on your screen.", "help"
        if short and CLEAR.search(t):
            return "Conversation cleared. Fresh start, boss.", "clear"
        if short and WORK.search(t):
            return random.choice(WORK_LINES), "work"
        if short and BG.search(t):
            for kind, rx in BG_KIND:
                if rx.search(t):
                    return BG_LINES[kind], f"bg:{kind}"
        return None
