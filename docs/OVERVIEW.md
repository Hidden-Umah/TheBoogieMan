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
│   │   ├── App.tsx           #   boot → HUD, wires everything to the brain
│   │   ├── three/
│   │   │   ├── Scene.tsx       # three.js scene: eye, rings, voice ring, space, camera, bloom, devil palette
│   │   │   ├── DataArcs.tsx    # fragmented radial data rings (wireframe cells + hot orange cells)
│   │   │   ├── DotCore.tsx     # normal-mode core: 3D dot-matrix sphere that breathes / ripples / pulses
│   │   │   ├── VideoBackground.tsx # background videos behind a blur layer (nebula, sea, custom)
│   │   │   ├── HudScreens.tsx  # curved side screens: one gentle ultrawide-monitor curve, head-turn with the mouse
│   │   │   └── eyeShader.ts    # GLSL for the cyborg eyeball (iris, pupil / devil slit, sclera panels)
│   │   ├── components/
│   │   │   ├── BootScreen.tsx  # "Welcome to the Boogeyman" + loading, waits for the brain
│   │   │   ├── Cards.tsx       # dot-matrix cards: 01 Agent status, 02 System (live CPU/RAM from Rust)
│   │   │   ├── dots.tsx        # dot-matrix primitives: DotRing, DotWave, DotBars, Card
│   │   │   ├── LogPanel.tsx    # 03 System log card
│   │   │   ├── InfoPanel.tsx   # 04 result card that swipes in and types out
│   │   │   ├── Visor.tsx       # Devil mode: helmet visor, armour, contours, reticle, shutter
│   │   │   ├── WorkMode.tsx    # workspace: ask card, queries, god's eye, findings, sources, running
│   │   │   ├── WorkFrame.tsx   # the holo-blue frame around the workspace
│   │   ├── hud/
│   │   │   ├── store.ts        # state the curved screens draw from (exchanges, facts, mode)
│   │   │   └── draw.ts         # canvas drawing for each screen: voice patterns, response, memory
│   │   │   ├── CommandBar.tsx  # the >_ input
│   │   │   └── HudFrame.tsx    # corners, clock, link/latency/state
│   │   └── lib/brain.ts      #   typed functions to talk to Rust
│   └── src-tauri/            # Rust core (the body)
│       ├── src/lib.rs        #   app startup, commands React can call
│       ├── src/sidecar.rs    #   starts/stops the Python brain
│       ├── src/brain.rs      #   WebSocket link to the brain
│       ├── src/message.rs    #   the { id, type, payload } struct
│       ├── src/stats.rs      #   live CPU / RAM / uptime for the HUD (sysinfo)
│       └── tauri.conf.json   #   window, app id, bundling
├── brain/                    # Python (the brain)
│   ├── main.py               #   FastAPI: /health + /ws, handle(), broadcasts events
│   ├── voice.py              #   voice loop: listen → transcribe → reply → speak
│   ├── audio.py              #   mic capture, speech detection (VAD), playback
│   ├── elevenlabs.py         #   ElevenLabs speech-to-text + streaming text-to-speech
│   ├── reply.py              #   what he says: pluggable LLM + remember/forget tool loop
│   ├── persona.md            #   his personality (edit me)
│   ├── memory.py             #   long-term memory: facts + recent conversation on disk
│   ├── config.py             #   settings from brain/.env
│   ├── commands.py           #   built-in commands before the LLM (shutdown, work mode, backgrounds)
│   ├── research.py           #   research agent: plan -> search -> read -> analyze, streamed as task.* events
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

## Voice

You talk; he answers. No text box.

1. **Python listens on the mic** and detects when you start and stop talking (it calibrates to your room's noise first).
2. **ElevenLabs Scribe** turns what you said into text.
3. **The LLM** writes a short spoken reply: Groq (free, default), Claude, or any OpenAI-compatible API, picked by whichever key is in `brain/.env`. Built-in lines if there's no key.
4. **ElevenLabs** turns the reply into his voice (Brian by default), streamed and played as it arrives.
5. The **real audio level** is sent to the UI ~20 times a second, so the core pulses with his actual voice, and with yours while you talk.

He doesn't listen while he talks, so he can't hear himself. Captions under the core show what you said and what he's saying.

## Commands

Some things shouldn't wait for an AI. `brain/commands.py` checks every utterance first:

- **Shutdown**: "shut down" asks for confirmation (valid for 30 s); "shut down now" goes straight away. He says goodbye, the brain sends `app.shutdown`, the UI plays a CRT-style power-off, and Rust's `quit_app` closes the app (the brain dies with it). This shuts down the Boogeyman, not the computer.
- **Screens**: "let's get to work" / "back to the normal screen" (also "exit work mode", "go home", "we're done here").
- **Help**: "what can you do?" sends `ui.help` and the commands card opens (`Ctrl+H` too).
- **Clear**: "clear our conversation" wipes history, keeps facts.

Anything the regexes miss goes to the LLM, which has the same actions as tools with descriptions (`shutdown`, `switch_screen`, `set_background`, `show_commands`, `clear_conversation`, `research`), so free phrasing still works.

## Work mode and research

"Let's get to work" pans the camera so the core and curved screens slide off to the left, and the workspace opens inside a holo-blue frame over the background: **"Boss, what do you want to do?"**.

Research is a tool the model can call (or say "research ..." directly). `brain/research.py` runs four stages and streams each one to the UI as `task.*` events:

1. **Plan**: the LLM breaks the request into 2–3 search queries.
2. **Search**: DuckDuckGo (free, no key) for each query; every new source appears as it's found.
3. **Read**: opens the top pages (one per site).
4. **Analyze**: the LLM writes cited findings, a spoken summary and a confidence score.

The cards are choreographed by phase. While you talk, a **HEARING YOU** card rises in the middle with your live mic bars, shows your words, then flies up into the header. Then the stage follows the work: **plan** puts the queries centre; **search** docks them at the top and brings the god's-eye radar (every source a blip, read ones light up) centre with sources at the side; **read** swaps sources to centre; **analyze** brings the findings centre. When it's done everything settles into a dashboard. A RUNNING strip at the bottom shows live steps and progress. Positions live in `SLOTS`/`LAYOUT` in `WorkMode.tsx`; CSS transitions do the motion. Every card also sits on the curve: `lib/curve.ts` turns each one toward you by how far left or right it is and brings its outer edge closer, so the workspace (and the commands card) wraps around you like the side screens, and cards re-angle as they glide. He speaks the summary at the end. Asking for research in normal mode opens the workspace automatically.

## Personality and memory

- `brain/persona.md` sets who he is: calm, sharp, a little dark; Ghanaian Pidgin when you use it; strong with text (rewrite, translate, draft, roast).
- `brain/boss.md` (optional, gitignored) is your own description of yourself.
- **Memory** lives in `~/.local/share/boogeyman/memory.json`, outside the repo. The model has two tools, `remember` and `forget`, and calls them itself in a short loop before answering. Facts and the last 30 messages are fed back into every reply, so he knows you across restarts. New facts flash in the MEMORY card.

This is prompt and context tuning, not model fine-tuning: instant, free, and editable.

## Modes

- **Normal**: dot-matrix cards, a 3D dot-matrix core and data rings. White with an orange-red accent. No eye.
- **Devil mode** (`Ctrl+D` to toggle): for serious work. The visor slams shut, armour frames the screen, the core collapses and the eye opens with a slit pupil, everything goes blood red, and a targeting reticle follows the cursor.

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
