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
- `ANTHROPIC_API_KEY`: his brain (Claude). Without it, he only has a few built-in lines.

`brain/.env` is gitignored, and keys never reach the frontend.

## Run

```bash
make dev
```

The window opens, Rust starts the Python brain, and after the boot screen he greets you out loud. Then just talk: say "hello" and he answers.

- `Ctrl+M`: mute / unmute the mic
- `Ctrl+D`: devil mode

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
