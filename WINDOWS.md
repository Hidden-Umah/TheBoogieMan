# The Boogeyman on Windows

How to set up and run the Boogeyman on **Windows 10 or 11 (64-bit)**. For everything else (keys, commands, how it works), see the main [README](README.md).

> **Status: early.** The app is built and tested on Ubuntu. Windows support is new, so expect rough edges and please report anything that breaks (see [Report a problem](#report-a-problem)).
>
> Use **native Windows**, not WSL. WSL has no reliable microphone or speaker access.

---

## Contents

- [1. Install the tools](#1-install-the-tools)
- [2. Get the code](#2-get-the-code)
- [3. Set up the project](#3-set-up-the-project)
- [4. Add your keys](#4-add-your-keys)
- [5. Run it](#5-run-it)
- [Manual commands (without the script)](#manual-commands-without-the-script)
- [Where things live on Windows](#where-things-live-on-windows)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

---

## 1. Install the tools

You need five things. Open **PowerShell** and install them with `winget` (it comes with Windows 10/11):

```powershell
# C++ build tools (Rust needs the MSVC linker and the Windows SDK)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# Rust
winget install Rustlang.Rustup

# Node.js (LTS, 20 or newer)
winget install OpenJS.NodeJS.LTS

# Python 3.10 or newer
winget install Python.Python.3.12

# Git
winget install Git.Git
```

Then **close PowerShell and open a new one**, so the new tools are on your PATH. Finish Rust with:

```powershell
rustup default stable-msvc
```

**WebView2** (the engine that draws the UI) is built into Windows 11 and up-to-date Windows 10. If it's missing, install the "Evergreen Bootstrapper" from Microsoft's WebView2 page.

Prefer installers over winget? Use these and keep the defaults:

| Tool | Get it from | Note |
|------|-------------|------|
| Build Tools for Visual Studio 2022 | visualstudio.microsoft.com → Downloads → Tools | Tick **"Desktop development with C++"** |
| Rust | rustup.rs (`rustup-init.exe`) | Pick the default (MSVC) option |
| Node.js LTS | nodejs.org | |
| Python 3.12 | python.org | Tick **"Add python.exe to PATH"** |
| Git | git-scm.com | |

---

## 2. Get the code

```powershell
git clone https://github.com/Hidden-Umah/TheBoogieMan.git
cd TheBoogieMan
```

The repo is private, so your GitHub account must be added as a collaborator first.

---

## 3. Set up the project

Windows has no `make`, so the repo includes **`win.ps1`**, which does the same jobs.

Allow local scripts to run (one time):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Check your tools, then set up:

```powershell
.\win.ps1 check     # shows what's installed and what's missing
.\win.ps1 setup     # npm install + Python virtualenv with the brain's packages
```

---

## 4. Add your keys

```powershell
.\win.ps1 env       # creates .env from .env.example
notepad .env        # paste your keys, save
```

At minimum you need:

- `ELEVENLABS_API_KEY`: his voice and hearing (free plan works). It needs the **Text to Speech**, **Speech to Text** and **Voices (Read)** permissions.
- `GROQ_API_KEY`: his brain (free).

Step-by-step instructions for getting each key are inside `.env.example` and in the main [README](README.md#3-get-your-api-keys). `.env` is gitignored, so never commit it.

---

## 5. Run it

```powershell
.\win.ps1 dev
```

The first run compiles Rust and can take **5 to 15 minutes**. After that it starts in seconds. The window opens, the Python brain starts in the background, and he greets you out loud. Say "hello". Say "what can you do?" (or press `Ctrl+H`) to see every command.

Run the tests:

```powershell
.\win.ps1 test
```

---

## Manual commands (without the script)

If you'd rather not use `win.ps1`, these are the same steps:

```powershell
# setup
cd app
npm install
cd ..\brain
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
cd ..

# keys
Copy-Item .env.example .env
notepad .env

# run
cd app
npm run tauri dev
```

---

## Where things live on Windows

| What | Where |
|------|-------|
| Your keys | `.env` in the project folder (gitignored) |
| Memory (facts + recent chat) | `%APPDATA%\boogeyman\memory.json`. Delete it to wipe his memory. |
| Python for the brain | `brain\.venv\Scripts\python.exe` (the app finds it automatically) |
| Logs | The PowerShell window running `.\win.ps1 dev` |

The same settings as on Linux can go in `.env` (`BOOGEYMAN_MIC`, `BOOGEYMAN_BARGE_LEVEL`, …). To use a different Python, set `BOOGEYMAN_PYTHON` to its full path before running.

---

## Troubleshooting

Look at the PowerShell window running `.\win.ps1 dev` first. Every turn logs `heard:`, `command:`, `tool:` and `reply:` lines, and background videos log `[bg]` lines.

| Problem | Fix |
|---------|-----|
| "running scripts is disabled on this system" | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run `powershell -ExecutionPolicy Bypass -File .\win.ps1 setup` |
| Typing `python` opens the Microsoft Store | Settings → Apps → Advanced app settings → **App execution aliases**: turn off `python.exe` and `python3.exe`. Then reinstall Python from python.org or winget. |
| `link.exe not found` or `cannot find the Windows SDK` while building | The C++ build tools are missing. Install them (step 1) with **"Desktop development with C++"**, then reopen PowerShell. |
| `cargo` / `npm` / `py` not recognised | Close and reopen PowerShell after installing, so PATH is refreshed. Check with `.\win.ps1 check`. |
| VOICE OFFLINE / he can't hear you | Settings → Privacy & security → **Microphone**: turn on "Let desktop apps access your microphone". Check the right input device is the default in Sound settings, or pick one with `BOOGEYMAN_MIC` (list them: `brain\.venv\Scripts\python.exe -m sounddevice`). Also check `ELEVENLABS_API_KEY`. |
| He only says canned lines | No brain key. Set `GROQ_API_KEY` in `.env` and restart. |
| He cuts himself off while talking | He hears his own voice from the speakers. Use headphones, or set `BOOGEYMAN_BARGE_LEVEL=1.5` (or `BOOGEYMAN_BARGE_IN=0`) in `.env`. |
| Blank window | Update or reinstall WebView2 (Evergreen runtime). |
| A `python.exe` keeps running after the app crashed | On Windows the brain isn't killed automatically if the app crashes (a normal close is fine). End it in Task Manager, or run `Get-Process python \| Stop-Process`. |
| `pip install` fails building a package | Upgrade pip (`.\win.ps1 setup` does this) and use Python 3.10–3.12. Very new Python versions sometimes lack prebuilt packages for a while. |
| Firewall prompt on first run | The brain only listens on `127.0.0.1` (your own machine). Allowing it on private networks is enough. |

---

## Known limitations

- **Untested on real Windows hardware so far.** The code paths are in place (Windows Python location, no extra console window, UTF-8 output, `%APPDATA%` memory), but expect rough edges.
- **Crash cleanup:** if the app crashes (not a normal close), the Python brain can keep running in the background. On Linux it's killed automatically.
- **No installer yet:** `npm run tauri build` makes a Windows installer for the app, but it doesn't bundle the Python brain yet. That's coming with the packaging work. For now, run from source with `.\win.ps1 dev`.
- **`make` doesn't work here:** use `.\win.ps1` instead.

## Report a problem

Open a GitHub issue with:

1. Your Windows version (`winver`).
2. The output of `.\win.ps1 check`.
3. The last ~30 lines from the PowerShell window running `.\win.ps1 dev`.

**Remove any API keys from what you paste.**
