# The Boogeyman

A personal desktop AI assistant. "Welcome, boss."

Three languages, one app:

| Layer | Folder | Language | Job |
|-------|--------|----------|-----|
| Face  | `app/src` | React + TypeScript | The UI |
| Body  | `app/src-tauri` | Rust (Tauri v2) | Window, OS integration, spawns and talks to the brain |
| Brain | `brain/` | Python (FastAPI) | Agent logic, AI, automation |

```
React --invoke--> Rust --WebSocket--> Python
```

Every message uses one shape, `{ id, type, payload }`. See [`shared/messages.md`](shared/messages.md).

**New here? Read [`docs/OVERVIEW.md`](docs/OVERVIEW.md)**: what we are building, why three languages, and how they connect.

## Setup (Ubuntu 22.04 / 24.04)

**1. System packages for Tauri**

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  python3 python3-venv libportaudio2
```

**2. Rust**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**3. Node.js 20+** (e.g. via [nvm](https://github.com/nvm-sh/nvm))

**4. Project deps**

```bash
make setup
```

**5. Keys (for voice)**

```bash
cp brain/.env.example brain/.env
# then open brain/.env and paste your keys
```

- `ELEVENLABS_API_KEY`: lets him hear you and talk back. Required for voice.
- His brain, at least one of:
  - `GROQ_API_KEY`: free tier at console.groq.com, fast. The default.
  - `ANTHROPIC_API_KEY`: Claude. Used first if it's set.
  - Any OpenAI-compatible API: `LLM_PROVIDER=openai` with `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`.

  With no brain key he only has a few built-in lines. The terminal prints which brain he's using (`brain: groq:openai/gpt-oss-120b`).

`brain/.env` is gitignored, and keys never reach the frontend.

## Make him yours

- **Personality**: edit `brain/persona.md` (tone, languages, what he's good at). Changes apply on the next reply, no restart needed.
- **Who you are**: copy `brain/boss.example.md` to `brain/boss.md` (gitignored) and write about yourself.
- **Memory**: just talk. "Remember that I ..." saves a fact, "forget that ..." removes it, and he also saves important things on his own. It's stored in `~/.local/share/boogeyman/memory.json` together with your recent conversation, so it survives restarts. Delete that file to wipe his memory.

## Run

```bash
make dev
```

The window opens, Rust starts the Python brain, and after the boot screen he greets you out loud. Then just talk: say "hello" and he answers.

- `Ctrl+M`: mute / unmute the mic
- `Ctrl+B`: next background
- `Ctrl+D`: devil mode
- `Ctrl+H`: the commands card (everything you can say). Esc closes it.

**Voice commands** (instant, work even without a brain key):
- "Shut down" / "Shut it down" / "Go to sleep": he asks to confirm. "Yes" and he's gone, "no" and he stays.
- "Shut down **now**" / "right now" / "immediately": no questions, he shuts down.
- "Let's get to work": the core slides away and the workspace opens. "Back to the normal screen" / "exit work mode" / "go home" returns.
- "What can you do?" / "show me the commands": opens the commands card.
- "Clear our conversation": wipes chat history (saved facts stay). Do this once if he ever insists he "can't" do something he can.
- "Change / switch / next background", "sea background", "space background", "background off".
- "Research ...", "look up ...", "search for ...": he researches the web live in the workspace. Asking naturally works too ("what's the latest news in Ghana?").

The model also has these as **tools** (`shutdown`, `switch_screen`, `set_background`, `show_commands`, `clear_conversation`, `research`), so any phrasing works, e.g. "abeg close yourself" or "take me back home". The terminal logs `heard:`, `command:` and `tool:` lines for every turn, which is the first place to look if something doesn't fire.

**Backgrounds**: `nebula` (an original loop from `tools/gen_background.py`) and `sea` (the underwater shipwreck). Drop `custom.mp4` or `custom.webm` into `app/public/bg/` and it joins the list. `.mp4` playback on Ubuntu needs `sudo apt install gstreamer1.0-libav` (the sea also ships as `.webm`, which plays without it).

**Research** uses DuckDuckGo (free, no key) through the `ddgs` package; run `make setup` once to install it.

The status under the core tells you what he's doing: LISTENING, HEARING YOU, THINKING, SPEAKING. If it says VOICE OFFLINE, the reason is shown next to it (usually a missing key or no microphone).

The first run compiles Rust and takes a few minutes. After that it's quick.

## Test

```bash
make test
```

## How the pieces fit

- `app/src-tauri/src/sidecar.rs`: finds `brain/.venv/bin/python` and starts `brain/main.py` on a free port. On Linux the brain is tied to the app's lifetime, so it dies even if the app crashes.
- `app/src-tauri/src/brain.rs`: keeps a WebSocket open to the brain, reconnects if it drops, and matches replies to requests by `id`.
- `app/src-tauri/src/lib.rs`: Tauri commands `send_to_brain` and `brain_status`, plus the `brain-status` / `brain-message` events.
- `app/src/lib/brain.ts`: typed React wrappers for the above.
- `brain/main.py`: `/health` and `/ws`. `handle()` is where the agent loop goes in Phase 1.

Env overrides: `BOOGEYMAN_BRAIN_DIR`, `BOOGEYMAN_PYTHON`.

## Roadmap

Tracked in the issues: Skeleton → Agent loop → Voice → Hands → Presence → Memory → Crazy stuff.
