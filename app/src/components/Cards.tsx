import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { EyeState } from '../types'
import { Card, DotBars, DotRing, DotWave } from './dots'

const STATE_TEXT: Record<EyeState, string> = {
  idle: 'STANDBY',
  thinking: 'THINKING...',
  speaking: 'SPEAKING',
  offline: 'NO SIGNAL',
}

export function AgentCard({
  state,
  commands,
  latency,
  connected,
}: {
  state: EyeState
  commands: number
  latency: number | null
  connected: boolean
}) {
  const active = state === 'thinking' ? 1 : state === 'speaking' ? 0.7 : state === 'offline' ? 0 : 0.12
  return (
    <Card n="01" title="AGENT STATUS">
      <div className={`agent-state st-${state}`}>{STATE_TEXT[state]}</div>
      <DotWave active={active} />
      <div className="kv-row">
        <div>
          <label>COMMANDS</label>
          <span className="dotnum">{commands}</span>
        </div>
        <div>
          <label>LATENCY</label>
          <span className="dotnum">{latency ?? '--'}</span>
        </div>
        <div>
          <label>LINK</label>
          <span className={`dotnum ${connected ? '' : 'acc'}`}>{connected ? 'ON' : 'OFF'}</span>
        </div>
      </div>
    </Card>
  )
}

type Snapshot = {
  cpu: number
  cores: number[]
  mem_used: number
  mem_total: number
  uptime: number
  host: string
  os: string
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : `${h}h ${m}m`
}

/** Live CPU / RAM from the Rust core (sysinfo). */
export function SystemCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [hist, setHist] = useState<number[]>(() => new Array(28).fill(0))
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const poll = async () => {
      try {
        const s = await invoke<Snapshot>('system_stats')
        if (!alive.current) return
        setSnap(s)
        setHist((h) => [...h.slice(1), Math.min(1, s.cpu / 100)])
      } catch {
        /* not running inside Tauri */
      }
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => {
      alive.current = false
      clearInterval(id)
    }
  }, [])

  const cpu = snap?.cpu ?? 0
  const memPct = snap ? snap.mem_used / snap.mem_total : 0
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1)

  return (
    <Card n="02" title="SYSTEM" right={<span className="muted">{snap?.host ?? '...'}</span>}>
      <div className="sys-grid">
        <div className="ring-wrap">
          <DotRing value={cpu / 100} size={104} dots={56} />
          <div className="ring-center">
            <span className="dotnum big">{Math.round(cpu)}</span>
            <label>CPU %</label>
          </div>
        </div>
        <div className="sys-side">
          <div>
            <label>
              <i className="pip on" />
              RAM
            </label>
            <span className="dotnum">{snap ? `${gb(snap.mem_used)}/${gb(snap.mem_total)}G` : '--'}</span>
          </div>
          <div>
            <label>
              <i className={`pip ${memPct > 0.85 ? 'acc' : 'on'}`} />
              LOAD
            </label>
            <span className="dotnum">{Math.round(memPct * 100)}%</span>
          </div>
          <div>
            <label>
              <i className="pip on" />
              UPTIME
            </label>
            <span className="dotnum">{snap ? fmtUptime(snap.uptime) : '--'}</span>
          </div>
        </div>
      </div>
      <DotBars values={hist} rows={6} />
    </Card>
  )
}
