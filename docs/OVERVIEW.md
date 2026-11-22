# The Boogeyman: what we're building and how it works

## The idea

The Boogeyman is a personal desktop AI assistant: a Jarvis built for one boss. You open it, it greets you ("Welcome, boss"), and you tell it what to do: "give me the top 10 news in Ghana", "open my LinknRun repo", "what's on my screen?". Later you talk to it by voice, and it can act on your computer for you.

It's a long-term project, built in phases over months. Linux (Ubuntu) comes first; other distros and architectures come later.

---

## Why three languages

Each language does the job it's best at.

| Part | Language | Nickname | Why this language |
|------|----------|----------|-------------------|
| The UI | React + TypeScript | **the face** | Fast to build nice interfaces, with a huge ecosystem |
| The desktop shell | Rust (Tauri) | **the body** | Native window, low memory, OS access, and reliable for always-on work like hotkeys, mic and wake word |
| The intelligence | Python | **the brain** | The best ecosystem for AI agents (Claude SDK), automation (mouse, keyboard, screenshots) and voice |

### Why Tauri and not Electron?

Electron ships a whole Chromium browser and runs Node.js underneath. Tauri uses the webview your OS already has, and puts **Rust** underneath instead of Node. That makes the app much smaller and lighter, and Rust is where we wanted the core anyway. React works exactly the same in both.

### What Rust is (and isn't) for

Rust doesn't make the AI faster. A Claude call takes seconds whatever language calls it. Rust is for the parts that must be **always on, light and reliable**:

- The window, system tray and global hotkey
- Starting the Python brain, watching it, and killing it when the app closes
- Later: mic capture, wake-word detection, fast local file search

---

## How the three talk to each other

```
┌──────────────────────┐   invoke('send_to_brain')    ┌──────────────────────┐   WebSocket    ┌──────────────────────┐
│  React (the face)    │ ───────────────────────────► │  Rust (the body)     │ ─────────────► │  Python (the brain)  │
│  app/src             │ ◄─────────────────────────── │  app/src-tauri       │ ◄───────────── │  brain/              │
└──────────────────────┘   reply + events             └──────────────────────┘  127.0.0.1:port└──────────────────────┘
```

1. **React ↔ Rust**: Tauri's built-in bridge. React calls a Rust function with `invoke(...)`, and Rust pushes updates to React with **events**.
2. **Rust ↔ Python**: When the app starts, Rust launches `brain/main.py` as a child process on a free local port, then opens a **WebSocket** to it. If the connection drops, Rust reconnects automatically.

React never talks to Python directly. Everything goes through Rust, so Rust stays in control: it can check, block, or log anything the brain tries to do.

### One message shape everywhere

All three layers speak the same JSON:

```json
{ "id": "a-unique-id", "type": "user.message", "payload": { "text": "hello" } }
```

- `id` links a reply to its request: the reply comes back with the same `id`.
- `type` says what kind of message it is.
- `payload` carries the data.

The full list of types is in [`shared/messages.md`](../shared/messages.md).

### Example: what happens when you hit Send

1. You type "Scan the news in Ghana" and press **Send**.
2. React calls `sendToBrain('user.message', { text })` (in `app/src/lib/brain.ts`), which runs the Rust command `send_to_brain`.
3. Rust gives the message an `id`, sends it over the WebSocket, and waits for the reply with that `id` (in `app/src-tauri/src/brain.rs`).
4. Python's `handle()` (in `brain/main.py`) builds a reply: `"Welcome, boss. You said: …"`.
5. Rust matches the reply to the waiting request and returns it to React.
6. React shows the reply in the chat.

Right now step 4 just echoes. In Phase 1, `handle()` becomes the Claude agent loop, and the same pipe carries real answers.

---

## Folder tour

```
TheBoogieMan/
├── app/                      # The desktop app (Tauri)
│   ├── src/                  # React + TypeScript UI (the face)
│   │   ├── App.tsx           #   chat screen + brain status pill
│   │   └── lib/brain.ts      #   typed functions to talk to Rust
│   └── src-tauri/            # Rust core (the body)
│       ├── src/lib.rs        #   app startup, commands React can call
│       ├── src/sidecar.rs    #   starts/stops the Python brain
│       ├── src/brain.rs      #   WebSocket link to the brain
│       ├── src/message.rs    #   the { id, type, payload } struct
│       └── tauri.conf.json   #   window, app id, bundling
├── brain/                    # Python (the brain)
│   ├── main.py               #   FastAPI: /health + /ws, handle()
│   ├── test_main.py          #   tests
│   └── requirements*.txt
├── shared/messages.md        # The message protocol
├── docs/OVERVIEW.md          # This file
├── Makefile                  # setup / dev / test / build
└── README.md                 # Install + run instructions
```

---

## Running it

See the [README](../README.md) for the Ubuntu packages to install. Then:

```bash
make setup   # once: npm install + Python venv
make dev     # opens the app
make test    # Python tests, Rust lint, frontend build
```

When you run `make dev`:
- Vite serves the React UI on port 1420.
- Rust compiles (slow the first time, quick after) and opens the window.
- Rust starts the Python brain, connects, and the pill turns green: **Brain connected**.

If the pill stays red, check the terminal. The brain's output is printed there with a `[brain]` prefix.

---

## Safety rules we're building in from day one

- **API keys never go in the frontend.** The brain reads them from the environment or the OS keychain.
- **The brain can't outlive the app.** On Linux the kernel kills it if the app dies, even on a crash.
- **Confirmation gate (Phase 3):** anything that deletes, sends, pays, or types into another app asks "Yes, boss?" first.

---

## Roadmap

Each phase is a GitHub issue.

| # | Phase | You'll be able to… |
|---|-------|--------------------|
| 1 | **Skeleton** (done) | Run one app where React, Rust and Python talk |
| 2 | Agent loop | Ask "top 10 news in Ghana" and get a streamed, sourced answer from Claude |
| 3 | Voice | Talk to it and hear "Welcome, boss" (ElevenLabs) |
| 4 | Hands | Have it open apps and files, and control mouse and keyboard, with confirmations |
| 5 | Presence | Say "Hey Boogeyman" or press a hotkey from anywhere; tray; `.deb` / AppImage |
| 6 | Memory | Have it remember your preferences and past conversations (SQLite) |
| 7 | Crazy stuff | Morning briefings, screen awareness, multi-step workflows |

---

## How to add things

- **A new message type:** add it to `shared/messages.md`, handle it in `brain/main.py` → `handle()`, and send it from React with `sendToBrain('your.type', {...})`. No Rust changes needed; Rust just forwards messages.
- **A new Rust command** (for OS-level work): write a `#[tauri::command]` function in `app/src-tauri/src/lib.rs`, add it to `generate_handler![...]`, and call it from React with `invoke('name')`.
- **A UI feature:** it's plain React in `app/src`.
