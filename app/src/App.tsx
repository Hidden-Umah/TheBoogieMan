import { useCallback, useEffect, useRef, useState } from 'react'
import BootScreen from './components/BootScreen'
import { AgentCard, SystemCard } from './components/Cards'
import CommandBar from './components/CommandBar'
import HudFrame from './components/HudFrame'
import InfoPanel, { type Info } from './components/InfoPanel'
import LogPanel, { type LogLevel, type LogLine } from './components/LogPanel'
import Visor from './components/Visor'
import { brainStatus, onBrainStatus, sendToBrain, type BrainReply } from './lib/brain'
import Scene from './three/Scene'
import type { EyeState, Mode } from './types'

// Flavour lines that tick through the log while idle.
const AMBIENT: [LogLevel, string][] = [
  ['sys', 'Optic array recalibrated · drift 0.003°'],
  ['sys', 'Neural cortex heartbeat nominal'],
  ['sys', 'Scanning local network · 0 threats'],
  ['ok', 'Memory banks synchronised'],
  ['sys', 'Rust core: thread pool idle'],
  ['sys', 'Signal-to-noise ratio 42.7 dB'],
  ['sys', 'Watching. Always watching.'],
  ['ok', 'Integrity check passed'],
  ['sys', 'Awaiting instructions from the boss'],
]

const MAX_LOGS = 120

// Cards are parked for now: only the centrepiece shows. Later they appear when the boss calls.
const SHOW_CARDS = false

function stamp() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => n.toString().padStart(2, '0')).join(':')
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [connected, setConnected] = useState(false)
  const [eye, setEye] = useState<EyeState>('idle')
  const [mode, setMode] = useState<Mode>('normal')
  const [armedAt, setArmedAt] = useState(0)
  const modeRef = useRef<Mode>('normal')
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [info, setInfo] = useState<Info | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [commands, setCommands] = useState(0)
  const startedAt = useRef(Date.now())
  const logId = useRef(0)
  const speakTimer = useRef<number>(undefined)

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

  // Ambient chatter once the HUD is up.
  useEffect(() => {
    if (!booted) return
    log('ok', 'HUD online. Welcome, boss.')
    let i = 0
    const id = setInterval(() => {
      const [lv, text] = AMBIENT[i++ % AMBIENT.length]
      log(lv, text)
    }, 2800)
    return () => clearInterval(id)
  }, [booted, log])

  // Ctrl+D toggles Devil Mode.
  useEffect(() => {
    if (!booted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (e.repeat) return
        const next = modeRef.current === 'devil' ? 'normal' : 'devil'
        modeRef.current = next
        setMode(next)
        if (next === 'devil') setArmedAt(Date.now())
        log(next === 'devil' ? 'err' : 'ok', next === 'devil' ? 'DEVIL MODE ENGAGED' : 'Devil mode disengaged')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [booted, log])

  const eyeState: EyeState = !connected && booted ? 'offline' : eye

  async function command(text: string) {
    setBusy(true)
    setEye('thinking')
    setCommands((n) => n + 1)
    log('boss', text)
    log('sys', 'Routing command → Rust core → neural cortex')
    const t0 = performance.now()
    try {
      const reply = await sendToBrain<BrainReply>('user.message', { text })
      const ms = Math.round(performance.now() - t0)
      setLatency(ms)
      if (reply.type === 'error') {
        log('err', String((reply.payload as unknown as { message: string }).message))
        setEye('idle')
        return
      }
      const p = reply.payload
      log('ai', p.text)
      log('ok', `Response received · ${ms}ms · Python ${p.python}`)
      setInfo({
        key: Date.now(),
        title: mode === 'devil' ? 'INTEL' : 'TRANSMISSION',
        query: text,
        body: p.text,
        meta: [`${ms}MS`, `PY ${p.python}`, `${p.chars} CHARS`],
      })
      // "Speak" for a time proportional to the reply. Real audio arrives in Phase 2.
      setEye('speaking')
      window.clearTimeout(speakTimer.current)
      speakTimer.current = window.setTimeout(() => setEye('idle'), Math.min(6000, 1200 + p.text.length * 45))
    } catch (err) {
      log('err', String(err))
      setEye('idle')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`app mode-${mode}`}>
      <Scene state={eyeState} mode={mode} booted={booted} />
      {!booted ? (
        <BootScreen connected={connected} onDone={() => setBooted(true)} />
      ) : (
        <div className="hud">
          {SHOW_CARDS && (
            <>
              <HudFrame connected={connected} startedAt={startedAt.current} />
              <div className="col-left">
                <AgentCard state={eyeState} commands={commands} latency={latency} connected={connected} />
                <SystemCard />
                <LogPanel lines={logs} />
              </div>
            </>
          )}
          <InfoPanel info={info} onClose={() => setInfo(null)} />
          <Visor active={mode === 'devil'} armedAt={armedAt} />
          <CommandBar disabled={!connected} busy={busy} devil={mode === 'devil'} onSubmit={command} />
          <div className="keyhint">
            <kbd>CTRL</kbd>+<kbd>D</kbd> {mode === 'devil' ? 'EXIT DEVIL MODE' : 'DEVIL MODE'}
          </div>
        </div>
      )}
    </div>
  )
}
