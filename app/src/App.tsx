import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import BootScreen from './components/BootScreen'
import Captions, { type VoiceState } from './components/Captions'
import { AgentCard, SystemCard } from './components/Cards'
import HudFrame from './components/HudFrame'
import LogPanel, { type LogLevel, type LogLine } from './components/LogPanel'
import Visor from './components/Visor'
import { setLevel, setSpectrum } from './lib/audio'
import { brainStatus, onBrainMessage, onBrainStatus, sendToBrain } from './lib/brain'
import { hud, saveBg, type Exchange, type Fact } from './hud/store'
import WorkMode from './components/WorkMode'
import { BACKGROUNDS } from './three/VideoBackground'
import HudScreens from './three/HudScreens'
import Scene from './three/Scene'
import type { EyeState, Mode } from './types'

const MAX_LOGS = 120

// Cards are parked for now: only the centrepiece shows. Later they appear when the boss calls (#19).
const SHOW_CARDS = false

type Capabilities = { claude: boolean; elevenlabs: boolean; mic: boolean; speaker: boolean; notes: string[] }

/** How each voice state shows on the core / eye. */
const EYE_FOR: Record<VoiceState, EyeState> = {
  idle: 'idle',
  listening: 'idle',
  hearing: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  muted: 'idle',
  error: 'idle',
  unavailable: 'idle',
}

function stamp() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => n.toString().padStart(2, '0')).join(':')
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [connected, setConnected] = useState(false)
  const [voice, setVoice] = useState<VoiceState>('idle')
  const [detail, setDetail] = useState<string | undefined>()
  const [muted, setMuted] = useState(false)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [facts, setFacts] = useState<Fact[]>([])
  const [fresh, setFresh] = useState<string | null>(null)
  const [spoken, setSpoken] = useState(0)
  const [shutting, setShutting] = useState(false)
  const [work, setWork] = useState(false)
  const [lastReply, setLastReply] = useState('')
  const customBg = useRef(false)
  const factIds = useRef<Set<string>>(new Set())
  const exId = useRef(0)
  const [mode, setMode] = useState<Mode>('normal')
  const [armedAt, setArmedAt] = useState(0)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [turns, setTurns] = useState(0)
  const modeRef = useRef<Mode>('normal')
  const mutedRef = useRef(false)
  const startedAt = useRef(Date.now())
  const logId = useRef(0)

  // New facts flash in the memory card.
  const applyMemory = useCallback((m: { facts?: Fact[] }) => {
    const list = m.facts ?? []
    const known = factIds.current
    const added = list.find((f) => !known.has(f.id))
    if (added && known.size > 0) {
      setFresh(added.id)
      window.setTimeout(() => setFresh((x) => (x === added.id ? null : x)), 6000)
    }
    factIds.current = new Set(list.map((f) => f.id))
    setFacts(list)
  }, [])

  // Background switching by voice: next / sea / nebula / custom / on / off.
  const applyBackground = useCallback((cmd: string) => {
    const names = BACKGROUNDS.map((b) => b.name).filter((n) => n !== 'custom' || customBg.current)
    if (cmd === 'off') hud.bg = false
    else if (cmd === 'on') hud.bg = true
    else {
      const name = cmd === 'next' ? names[(names.indexOf(hud.bgName) + 1) % names.length] : cmd
      if (names.includes(name)) {
        hud.bgName = name
        hud.bg = true
        saveBg(name)
      }
    }
  }, [])

  // Is there a custom background dropped into app/public/bg?
  useEffect(() => {
    for (const src of ['/bg/custom.webm', '/bg/custom.mp4'])
      fetch(src, { method: 'HEAD' })
        .then((r) => {
          if (r.ok && (r.headers.get('content-type') || '').startsWith('video')) customBg.current = true
        })
        .catch(() => {})
  }, [])

  const log = useCallback((level: LogLevel, text: string) => {
    setLogs((l) => [...l.slice(-(MAX_LOGS - 1)), { id: logId.current++, t: stamp(), level, text }])
  }, [])

  // Brain connection status.
  useEffect(() => {
    brainStatus().then(setConnected).catch(() => setConnected(false))
    const un = onBrainStatus((c) => {
      setConnected(c)
      log(c ? 'ok' : 'err', c ? 'Brain link established' : 'Brain link lost · retrying')
    })
    return () => {
      un.then((fn) => fn())
    }
  }, [log])

  // Events the brain pushes: voice state, live audio level, captions.
  useEffect(() => {
    const un = onBrainMessage((msg) => {
      const p = msg.payload as Record<string, unknown>
      switch (msg.type) {
        case 'voice.level':
          setLevel(Number(p.level) || 0, p.source === 'mic' ? 'mic' : 'voice')
          break
        case 'voice.spectrum':
          if (Array.isArray(p.bands)) setSpectrum(p.bands as number[], p.source === 'mic' ? 'mic' : 'voice')
          break
        case 'memory.updated':
          applyMemory(p as { facts?: Fact[] })
          break
        case 'ui.mode':
          setWork(p.mode === 'work')
          log('sys', p.mode === 'work' ? 'Workspace open' : 'Back to the core')
          break
        case 'ui.background':
          applyBackground(String(p.cmd))
          break
        case 'app.shutdown':
          // He has already said goodbye. Play the power-down, then close the app.
          setShutting(true)
          log('err', 'SHUTDOWN')
          window.setTimeout(() => invoke('quit_app').catch(() => window.close()), 2600)
          break
        case 'voice.state': {
          const s = String(p.state) as VoiceState
          setVoice(s in EYE_FOR ? s : 'idle')
          setDetail(p.detail ? String(p.detail) : undefined)
          if (s === 'error') log('err', `Voice: ${p.detail ?? 'error'}`)
          break
        }
        case 'voice.transcript':
          setExchanges((xs) => [...xs.slice(-11), { id: exId.current++, you: String(p.text), him: '', at: performance.now() }])
          setTurns((n) => n + 1)
          log('boss', String(p.text))
          break
        case 'voice.reply':
          setExchanges((xs) => {
            const last = xs[xs.length - 1]
            // Reply to a spoken turn fills it in; a greeting or typed reply gets its own entry.
            if (last && !last.him) return [...xs.slice(0, -1), { ...last, him: String(p.text), at: performance.now() }]
            return [...xs.slice(-11), { id: exId.current++, you: '', him: String(p.text), at: performance.now() }]
          })
          setSpoken((n) => n + 1)
          setLastReply(String(p.text))
          log('ai', String(p.text))
          break
      }
    })
    return () => {
      un.then((fn) => fn())
    }
  }, [log, applyMemory, applyBackground])

  // Once the HUD is up, ask him to greet the boss, and learn what voice pieces are available.
  useEffect(() => {
    if (!booted || !connected) return
    sendToBrain<{ spoken: boolean; capabilities: Capabilities; memory?: { facts: Fact[] } }>('voice.greet')
      .then((r) => {
        if (r.payload.memory) applyMemory(r.payload.memory)
        const caps = r.payload.capabilities
        if (!caps) return
        caps.notes?.forEach((n) => log('warn', n))
        if (!caps.elevenlabs) {
          setVoice('unavailable')
          setDetail('add ELEVENLABS_API_KEY to brain/.env')
        } else if (!caps.mic) {
          setVoice('unavailable')
          setDetail('no microphone found')
        }
      })
      .catch((e) => log('err', String(e)))
  }, [booted, connected, log, applyMemory])

  // Ctrl+D: devil mode. Ctrl+M: mute mic.
  useEffect(() => {
    if (!booted) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'd') {
        e.preventDefault()
        const next = modeRef.current === 'devil' ? 'normal' : 'devil'
        modeRef.current = next
        setMode(next)
        if (next === 'devil') setArmedAt(Date.now())
        log(next === 'devil' ? 'err' : 'ok', next === 'devil' ? 'DEVIL MODE ENGAGED' : 'Devil mode disengaged')
      } else if (k === 'b') {
        e.preventDefault()
        // Ctrl+B: next background; Ctrl+Shift... reserved. Off after the last one, then back to the first.
        if (!hud.bg) applyBackground('on')
        else applyBackground('next')
        log('sys', `Background: ${hud.bg ? hud.bgName : 'off'}`)
      } else if (k === 'm') {
        e.preventDefault()
        const next = !mutedRef.current
        mutedRef.current = next
        setMuted(next)
        sendToBrain('voice.mute', { muted: next }).catch((err) => log('err', String(err)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [booted, log])

  useEffect(() => {
    hud.exchanges = exchanges
    hud.facts = facts
    hud.heard = turns
    hud.spoken = spoken
    hud.thinking = voice === 'thinking' || voice === 'transcribing'
    hud.mode = mode
    if (fresh && hud.fresh !== fresh) {
      hud.fresh = fresh
      hud.freshAt = performance.now()
    }
  }, [exchanges, facts, turns, spoken, voice, mode, fresh])

  const eyeState: EyeState = !connected && booted ? 'offline' : EYE_FOR[voice]

  return (
    <div className={`app mode-${mode} ${work ? 'work-on' : ''}`}>
      <Scene state={eyeState} mode={mode} booted={booted} work={work} />
      {shutting && (
        <div className="shutdown">
          <div className="shutdown-line" />
          <div className="shutdown-text">SHUTTING DOWN</div>
        </div>
      )}
      {!booted ? (
        <BootScreen connected={connected} onDone={() => setBooted(true)} />
      ) : (
        <div className="hud">
          {SHOW_CARDS && (
            <>
              <HudFrame connected={connected} startedAt={startedAt.current} />
              <div className="col-left">
                <AgentCard state={eyeState} commands={turns} latency={null} connected={connected} />
                <SystemCard />
                <LogPanel lines={logs} />
              </div>
            </>
          )}
          <Visor active={mode === 'devil'} armedAt={armedAt} />
          <HudScreens />
          <WorkMode active={work} lastReply={lastReply} listening={voice === 'hearing' ? 'HEARING YOU' : voice === 'muted' ? 'MIC MUTED' : 'LISTENING'} />
          <Captions you="" him="" state={connected ? voice : 'unavailable'} detail={connected ? detail : 'brain offline'} />
          <div className="keyhint">
            <kbd>CTRL</kbd>+<kbd>M</kbd> {muted ? 'UNMUTE' : 'MUTE'} &nbsp; <kbd>CTRL</kbd>+<kbd>B</kbd> NEXT BACKGROUND &nbsp; <kbd>CTRL</kbd>+<kbd>D</kbd>{' '}
            {mode === 'devil' ? 'EXIT DEVIL MODE' : 'DEVIL MODE'}
          </div>
        </div>
      )}
    </div>
  )
}
