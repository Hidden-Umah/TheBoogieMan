# The Boogeyman: Windows helper (the Makefile equivalent).
#
#   .\win.ps1 check    see what's installed / missing
#   .\win.ps1 setup    npm install + Python venv with the brain's packages
#   .\win.ps1 env      create .env from .env.example (then paste your keys)
#   .\win.ps1 dev      open the app
#   .\win.ps1 test     Python tests, Rust clippy, TypeScript build
#
# If PowerShell says running scripts is disabled, run once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# or call it like this:  powershell -ExecutionPolicy Bypass -File .\win.ps1 setup

param([string]$Task = "help")

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$VenvPy = Join-Path $Root "brain\.venv\Scripts\python.exe"

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Need($cmd, $hint) {
    if (-not (Has $cmd)) {
        Write-Host "Missing: $cmd  ->  $hint" -ForegroundColor Red
        exit 1
    }
}

# Real Python, not the Microsoft Store alias.
function Find-Python {
    # (The leading comma keeps a one-item array an array; PowerShell would unroll it otherwise.)
    if (Has "py") { return ,@("py", "-3") }
    if (Has "python") {
        try { $v = & python --version 2>&1 } catch { $v = "" }
        if ("$v" -match "Python 3") { return ,@("python") }
    }
    Write-Host "Missing: Python 3.10+  ->  winget install Python.Python.3.12  (then reopen the terminal)" -ForegroundColor Red
    exit 1
}

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed ($LASTEXITCODE)" }
}

switch ($Task) {
    "check" {
        $checks = @(
            @("git", "winget install Git.Git"),
            @("node", "winget install OpenJS.NodeJS.LTS"),
            @("npm", "comes with Node.js"),
            @("cargo", "winget install Rustlang.Rustup, then: rustup default stable-msvc"),
            @("py", "winget install Python.Python.3.12")
        )
        foreach ($c in $checks) {
            if (Has $c[0]) { Write-Host ("ok       " + $c[0]) -ForegroundColor Green }
            else { Write-Host ("missing  " + $c[0] + "  ->  " + $c[1]) -ForegroundColor Yellow }
        }
        if (Has "node") { Write-Host ("node     " + (& node --version)) }
        if (Has "rustc") { Write-Host ("rustc    " + (& rustc --version)) }
        $wv = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
        if ($wv) { Write-Host ("webview2 " + $wv.pv) -ForegroundColor Green }
        else { Write-Host "webview2 not found in the usual place (Windows 11 has it built in; otherwise install the Evergreen runtime)" -ForegroundColor Yellow }
        if (Test-Path $VenvPy) { Write-Host "ok       brain\.venv" -ForegroundColor Green } else { Write-Host "missing  brain\.venv  ->  .\win.ps1 setup" -ForegroundColor Yellow }
        if (Test-Path (Join-Path $Root ".env")) { Write-Host "ok       .env" -ForegroundColor Green } else { Write-Host "missing  .env  ->  .\win.ps1 env" -ForegroundColor Yellow }
    }
    "setup" {
        Need "npm" "winget install OpenJS.NodeJS.LTS"
        Need "cargo" "winget install Rustlang.Rustup"
        $py = Find-Python
        Push-Location (Join-Path $Root "app")
        try { Run "npm" @("install") } finally { Pop-Location }
        Push-Location (Join-Path $Root "brain")
        try {
            $exe = $py[0]; $pre = @($py | Select-Object -Skip 1)
            Run $exe ($pre + @("-m", "venv", ".venv"))
            Run $VenvPy @("-m", "pip", "install", "--upgrade", "pip")
            Run $VenvPy @("-m", "pip", "install", "-r", "requirements-dev.txt")
        } finally { Pop-Location }
        Write-Host "Setup done. Next: .\win.ps1 env, paste your keys into .env, then .\win.ps1 dev" -ForegroundColor Green
    }
    "env" {
        $envFile = Join-Path $Root ".env"
        if (Test-Path $envFile) { Write-Host ".env already exists; edit it directly." }
        else {
            Copy-Item (Join-Path $Root ".env.example") $envFile
            Write-Host "Created .env. Open it and paste your keys:  notepad .env" -ForegroundColor Green
        }
    }
    "dev" {
        if (-not (Test-Path $VenvPy)) { Write-Host "Run .\win.ps1 setup first." -ForegroundColor Red; exit 1 }
        Push-Location (Join-Path $Root "app")
        try { Run "npm" @("run", "tauri", "dev") } finally { Pop-Location }
    }
    "test" {
        Push-Location (Join-Path $Root "brain")
        try { Run $VenvPy @("-m", "pytest", "-q") } finally { Pop-Location }
        Push-Location (Join-Path $Root "app\src-tauri")
        try { Run "cargo" @("clippy", "--", "-D", "warnings") } finally { Pop-Location }
        Push-Location (Join-Path $Root "app")
        try { Run "npm" @("run", "build") } finally { Pop-Location }
    }
    default {
        Write-Host "Usage: .\win.ps1 check | setup | env | dev | test"
    }
}
