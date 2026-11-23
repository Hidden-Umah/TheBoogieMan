import { useCallback, useEffect, useRef, useState } from 'react'
import BootScreen from './components/BootScreen'
import CommandBar from './components/CommandBar'
import HudFrame from './components/HudFrame'
import InfoPanel, { type Info } from './components/InfoPanel'
import LogPanel, { type LogLevel, type LogLine } from './components/LogPanel'
import Scene from './three/Scene'
import type { EyeState } from './types'
import { brainStatus, onBrainStatus, sendToBrain, type BrainReply } from './lib/brain'

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
  ['sys', 'Cooling subsystems at 31°C'],
  ['warn', 'Unknown process pinged port 1420 · ignored'],
  ['sys', 'Awaiting instructions from the boss'],
]

const MAX_LOGS = 120

function stamp() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => n.toString().padStart(2, '0')).join(':')
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [connected, setConnected] = useState(false)
  const [eye, setEye] = useState<EyeState>('idle')
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [info, setInfo] = useState<Info | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
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
    }, 2600)
    return () => clearInterval(id)
  }, [booted, log])

  const eyeState: EyeState = !connected && booted ? 'offline' : eye

  async function command(text: string) {
    setBusy(true)
    setEye('thinking')
    log('boss', text)
    log('sys', 'Routing command → Rust core → neural cortex')
    const t0 = performance.now()
    try {
      const reply = await sendToBrain<BrainReply>('user.message', { text })
      const ms = Math.round(performance.now() - t0)
      setLatency(ms)
      if (reply.type === 'error') {
        const msg = String((reply.payload as unknown as { message: string }).message)
        log('err', msg)
        setEye('idle')
        return
      }
      const p = reply.payload
      log('ai', p.text)
      log('ok', `Response received · ${ms}ms · Python ${p.python}`)
      setInfo({
        key: Date.now(),
        title: 'INCOMING TRANSMISSION',
        query: text,
        body: p.text,
        meta: [`LATENCY ${ms}MS`, `PYTHON ${p.python}`, `${p.chars} CHARS`],
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
    <div className="app">
      <Scene state={eyeState} booted={booted} />
      {!booted ? (
        <BootScreen connected={connected} onDone={() => setBooted(true)} />
      ) : (
        <div className="hud">
          <HudFrame state={eyeState} connected={connected} latency={latency} startedAt={startedAt.current} />
          <LogPanel lines={logs} />
          <InfoPanel info={info} onClose={() => setInfo(null)} />
          <CommandBar disabled={!connected} busy={busy} onSubmit={command} />
        </div>
      )}
    </div>
  )
}
