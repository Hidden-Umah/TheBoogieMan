import { useEffect, useMemo, useRef, useState } from 'react'
import { channels } from '../lib/audio'
import { bend } from '../lib/curve'
import { onBrainMessage } from '../lib/brain'
import WorkFrame, { WorkFrameDots } from './WorkFrame'

/**
 * Work mode: the core slides away and this workspace takes over, over the background.
 * Top right: "Boss, what do you want to do?". When a task runs (research for now),
 * cards fly in from the right: queries, a god's-eye radar with levels, findings,
 * sources, and a RUNNING strip at the bottom with live steps.
 */

type Step = { key: string; label: string; status: 'pending' | 'running' | 'done' | 'failed'; detail: string }
type Source = { n: number; title: string; url: string; domain: string; snippet: string; date?: string; read?: boolean }
type Task = {
  id: string
  title: string
  startedAt: number
  steps: Step[]
  progress: number
  queries: string[]
  sources: Source[]
  findings: string[]
  metrics: Record<string, number>
  activity: string
  log: string[]
  done: boolean
  summary: string
  seconds: number
}

const STEP_KEYS: [string, string][] = [
  ['plan', 'PLANNING QUERIES'],
  ['search', 'SEARCHING THE WEB'],
  ['read', 'READING SOURCES'],
  ['analyze', 'ANALYZING'],
]

function newTask(id: string, title: string): Task {
  return {
    id,
    title,
    startedAt: performance.now(),
    steps: STEP_KEYS.map(([key, label]) => ({ key, label, status: 'pending', detail: '' })),
    progress: 0,
    queries: [],
    sources: [],
    findings: [],
    metrics: {},
    activity: 'Spinning up',
    log: [],
    done: false,
    summary: '',
    seconds: 0,
  }
}

function useTask() {
  const [task, setTask] = useState<Task | null>(null)
  useEffect(() => {
    const un = onBrainMessage((msg) => {
      const p = msg.payload as Record<string, any>
      if (!msg.type.startsWith('task.')) return
      if (msg.type === 'task.start') {
        setTask(newTask(String(p.id), String(p.title)))
        return
      }
      setTask((t) => {
        if (!t || t.id !== p.id) return t
        const log = (line: string) => [...t.log, line].slice(-6)
        switch (msg.type) {
          case 'task.step': {
            const steps = t.steps.map((s) => (s.key === p.key ? { ...s, status: p.status, detail: p.detail || s.detail } : s))
            return { ...t, steps, progress: Math.max(t.progress, Number(p.progress) || 0), activity: p.detail || p.label, log: log(`${p.label} · ${p.detail || p.status}`) }
          }
          case 'task.queries':
            return { ...t, queries: p.queries }
          case 'task.source':
            return { ...t, sources: [...t.sources, p as Source], log: log(`+ ${p.domain}`) }
          case 'task.reading':
            return { ...t, sources: t.sources.map((s) => (s.url === p.url ? { ...s, read: p.chars > 0 } : s)), activity: `reading ${p.domain}`, log: log(`read ${p.domain} · ${p.chars} chars`) }
          case 'task.metric':
            return { ...t, metrics: { ...t.metrics, [p.name]: Number(p.value) } }
          case 'task.finding':
            return { ...t, findings: [...t.findings, String(p.text)] }
          case 'task.done':
            return { ...t, done: true, progress: 1, summary: String(p.summary || ''), seconds: Number(p.seconds) || 0, activity: 'Report ready', log: log('DONE') }
        }
        return t
      })
    })
    return () => {
      un.then((f) => f())
    }
  }, [])
  return task
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

/** Dot-matrix level meter. */
function Level({ label, value, max, suffix = '' }: { label: string; value: number; max: number; suffix?: string }) {
  const dots = 18
  const lit = Math.round(Math.min(1, value / max) * dots)
  return (
    <div className="lvl">
      <div className="lvl-k">
        <span>{label}</span>
        <b>
          {Math.round(value)}
          {suffix}
        </b>
      </div>
      <div className="lvl-dots">
        {Array.from({ length: dots }, (_, i) => (
          <i key={i} className={i < lit ? (i >= dots - 3 ? 'acc' : 'on') : ''} />
        ))}
      </div>
    </div>
  )
}

/** God's eye: radar of every source found; read ones burn orange. */
function GodEye({ task, style, className = '' }: { task: Task; style?: React.CSSProperties; className?: string }) {
  const [jitter, setJitter] = useState(0)
  useEffect(() => {
    if (task.done) return
    const id = setInterval(() => setJitter(Math.random()), 220)
    return () => clearInterval(id)
  }, [task.done])
  const m = task.metrics
  const intensity = task.done ? 100 : 55 + jitter * 40
  return (
    <section className={`wcard w-eye ${className}`} style={style}>
      <header className="wcard-head">
        <span>
          <b>02</b> GOD'S EYE
        </span>
        <span className={task.done ? 'muted' : 'hot'}>{task.done ? 'LOCKED' : 'SCANNING'}</span>
      </header>
      <div className="eye-wrap">
        <svg viewBox="-110 -110 220 220" className="radar">
          {[100, 75, 50, 25].map((r) => (
            <circle key={r} r={r} className="rg" />
          ))}
          <line x1={-104} x2={104} y1={0} y2={0} className="rg" />
          <line y1={-104} y2={104} x1={0} x2={0} className="rg" />
          {Array.from({ length: 72 }, (_, i) => (
            <line key={i} x1={0} x2={0} y1={-100} y2={i % 6 ? -96 : -91} className="rt" transform={`rotate(${i * 5})`} />
          ))}
          {!task.done && (
            <g className="sweep">
              <path d="M0 0 L0 -100 A100 100 0 0 1 58.8 -80.9 Z" className="sweep-fill" />
              <line x1={0} y1={0} x2={0} y2={-100} className="sweep-line" />
            </g>
          )}
          {task.sources.map((s) => {
            const a = hash(s.domain) * Math.PI * 2
            const r = 22 + ((s.n * 37) % 70)
            return (
              <g key={s.url} transform={`translate(${Math.cos(a) * r} ${Math.sin(a) * r})`} className={`blip ${s.read ? 'read' : ''}`}>
                <circle r={s.read ? 3.4 : 2.4} />
                <circle r={8} className="ping" />
              </g>
            )
          })}
          <circle r={3} className="center" />
        </svg>
        <div className="levels">
          <Level label="SOURCES" value={m.sources || 0} max={12} />
          <Level label="DOMAINS" value={m.domains || 0} max={10} />
          <Level label="READ" value={m.read || 0} max={4} />
          <Level label="CONFIDENCE" value={m.confidence || 0} max={100} suffix="%" />
          <Level label="INTENSITY" value={intensity} max={100} suffix="%" />
        </div>
      </div>
    </section>
  )
}

function Typed({ text, cps = 60 }: { text: string; cps?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const id = window.setInterval(() => setN((c) => (c >= text.length ? (window.clearInterval(id), c) : c + 1)), 1000 / cps)
    return () => window.clearInterval(id)
  }, [text, cps])
  return <>{text.slice(0, n)}</>
}

function Elapsed({ task }: { task: Task }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (task.done) return
    const id = setInterval(() => tick((x) => x + 1), 100)
    return () => clearInterval(id)
  }, [task.done])
  const s = task.done ? task.seconds : (performance.now() - task.startedAt) / 1000
  return <>{s.toFixed(1)}s</>
}

type Box = { l: number; t: number; w: number; h: number; o?: number }
type Slot = 'stage' | 'side' | 'd0' | 'd1' | 'd2' | 'hidden' | 'dq' | 'deye' | 'dfind' | 'dsrc'
const SLOTS: Record<Slot, Box> = {
  stage: { l: 0, t: 20, w: 64, h: 60 },
  side: { l: 65.5, t: 20, w: 34.5, h: 60 },
  d0: { l: 0, t: 0, w: 22.6, h: 17 },
  d1: { l: 23.4, t: 0, w: 22.6, h: 17 },
  d2: { l: 46.8, t: 0, w: 22.6, h: 17 },
  hidden: { l: 112, t: 20, w: 34, h: 60, o: 0 },
  // Final dashboard
  dq: { l: 0, t: 0, w: 69.2, h: 17 },
  deye: { l: 0, t: 20, w: 32, h: 60 },
  dfind: { l: 33, t: 20, w: 35.5, h: 60 },
  dsrc: { l: 69.5, t: 20, w: 30.5, h: 60 },
}
type Phase = 'idle' | 'plan' | 'search' | 'read' | 'analyze' | 'done'
const LAYOUT: Record<Exclude<Phase, 'idle'>, Record<'queries' | 'eye' | 'sources' | 'findings', Slot>> = {
  plan: { queries: 'stage', eye: 'hidden', sources: 'hidden', findings: 'hidden' },
  search: { queries: 'd0', eye: 'stage', sources: 'side', findings: 'hidden' },
  read: { queries: 'd0', eye: 'side', sources: 'stage', findings: 'hidden' },
  analyze: { queries: 'd0', eye: 'side', sources: 'd1', findings: 'stage' },
  done: { queries: 'dq', eye: 'deye', sources: 'dsrc', findings: 'dfind' },
}

function phaseOf(task: Task | null): Phase {
  if (!task) return 'idle'
  if (task.done) return 'done'
  const running = task.steps.find((s) => s.status === 'running')
  if (running) return running.key as Phase
  const next = task.steps.find((s) => s.status === 'pending')
  return (next?.key as Phase) ?? 'analyze'
}

function box(l: number, t: number, w: number, h: number, o = 1): React.CSSProperties {
  return { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, opacity: o, transform: bend(l, w) }
}
function place(slot: Slot): React.CSSProperties {
  const b = SLOTS[slot]
  return box(b.l, b.t, b.w, b.h, b.o ?? 1)
}
const docked = (slot: Slot) => slot === 'd0' || slot === 'd1' || slot === 'd2' || slot === 'dq'

/** Live voice bars for the HEARING card, straight from the mic channel. */
function LiveBars() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const bars = ref.current?.children
      const c = channels.mic
      const live = performance.now() - c.at < 400
      if (bars)
        for (let i = 0; i < bars.length; i++) {
          const v = live ? c.bands[i % c.bands.length] ?? 0 : 0.06 + 0.05 * Math.sin(performance.now() / 300 + i)
          ;(bars[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.06, v)})`
        }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="livebars" ref={ref}>
      {Array.from({ length: 48 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  )
}

type InputPhase = 'off' | 'live' | 'text' | 'fly'

export default function WorkMode({
  active,
  lastReply,
  listening,
  voice,
  heard,
}: {
  active: boolean
  lastReply: string
  listening: string
  voice: string
  heard: { id: number; text: string } | null
}) {
  const task = useTask()
  const phase = phaseOf(task)
  const layout = phase === 'idle' ? null : LAYOUT[phase]

  // The HEARING card: appears while he hears you, shows your words, then flies up into the header.
  const [input, setInput] = useState<InputPhase>('off')
  const [inputText, setInputText] = useState('')
  useEffect(() => {
    if (!active) return setInput('off')
    if (voice === 'hearing') {
      setInputText('')
      setInput('live')
    }
  }, [voice, active])
  useEffect(() => {
    if (!active || !heard) return
    setInputText(heard.text)
    setInput('text')
    const fly = window.setTimeout(() => setInput('fly'), 1800)
    const off = window.setTimeout(() => setInput('off'), 2900)
    return () => {
      window.clearTimeout(fly)
      window.clearTimeout(off)
    }
  }, [heard, active])
  useEffect(() => {
    if (input === 'live' && voice !== 'hearing' && voice !== 'transcribing') {
      const id = window.setTimeout(() => setInput((i) => (i === 'live' ? 'off' : i)), 1500)
      return () => window.clearTimeout(id)
    }
  }, [voice, input])
  const findingsEnd = useRef<HTMLDivElement>(null)
  useEffect(() => findingsEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [task?.findings.length])
  const running = task && !task.done
  const pct = Math.round((task?.progress || 0) * 100)
  const icon = useMemo(() => ({ pending: '○', running: '◐', done: '●', failed: '✕' }), [])

  return (
    <div className={`work-shell ${active ? 'on' : ''}`}>
      <WorkFrame />
      <WorkFrameDots />
    <div className={`work ${active ? 'on' : ''}`}>
      <section className={`wcard w-ask ${phase === 'idle' ? 'big' : ''}`} style={phase === 'idle' ? box(62, 0, 38, 27) : box(70.6, 0, 29.4, 17)}>
        <div className="w-ask-k">
          <span>WORKSPACE</span>
          <span className={running ? 'hot' : 'muted'}>{running ? '● LIVE' : listening}</span>
        </div>
        <div className="w-ask-q">{task ? (running ? 'ON IT, BOSS.' : 'DONE, BOSS.') : 'BOSS, WHAT DO YOU WANT TO DO?'}</div>
        <div className="w-ask-sub">{task ? task.title : 'Say it. Research, news, anything you need looked into.'}</div>
        {lastReply && <div className="w-ask-reply">› {lastReply}</div>}
      </section>

      {input !== 'off' && (
        <section className={`wcard w-input in-${input}`} style={input === 'fly' ? box(70.6, 0, 29.4, 17, 0) : box(18, 30, 44, 34)}>
          <header className="wcard-head">
            <span>
              <b>●</b> {input === 'live' ? 'HEARING YOU' : 'YOU SAID'}
            </span>
            <span className="hot">MIC</span>
          </header>
          <LiveBars />
          <div className="input-text">{inputText || '…'}</div>
        </section>
      )}

      {task && layout && (
        <>
          <section className={`wcard w-queries ${layout.queries === 'stage' ? 'focus' : ''} ${docked(layout.queries) ? 'docked' : ''}`} key={`q-${task.id}`} style={place(layout.queries)}>
            <header className="wcard-head">
              <span>
                <b>01</b> QUERIES
              </span>
              <span className="muted">{task.queries.length || '…'}</span>
            </header>
            <div className="chips">
              {task.queries.length === 0 && <span className="chip ghost">planning…</span>}
              {task.queries.map((q, i) => (
                <span key={q} className="chip" style={{ animationDelay: `${i * 0.12}s` }}>
                  {q}
                </span>
              ))}
            </div>
          </section>

          <GodEye task={task} key={`e-${task.id}`} style={place(layout.eye)} className={`${layout.eye === 'stage' ? 'focus' : ''} ${docked(layout.eye) ? 'docked' : ''}`} />

          <section className={`wcard w-findings ${layout.findings === 'stage' ? 'focus' : ''}`} key={`f-${task.id}`} style={place(layout.findings)}>
            <header className="wcard-head">
              <span>
                <b>03</b> FINDINGS
              </span>
              <span className="muted">{task.findings.length}</span>
            </header>
            <div className="findings">
              {task.done && task.summary && <p className="summary">{task.summary}</p>}
              {task.findings.length === 0 && <p className="muted small">Findings land here as the analysis comes in.</p>}
              {task.findings.map((f, i) => (
                <div key={i} className="finding">
                  <span className="fn">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <Typed text={f} />
                  </span>
                </div>
              ))}
              <div ref={findingsEnd} />
            </div>
          </section>

          <section className={`wcard w-sources ${layout.sources === 'stage' ? 'focus' : ''} ${docked(layout.sources) ? 'docked' : ''}`} key={`s-${task.id}`} style={place(layout.sources)}>
            <header className="wcard-head">
              <span>
                <b>04</b> SOURCES
              </span>
              <span className="muted">{task.sources.length}</span>
            </header>
            <div className="sources">
              {task.sources.map((s) => (
                <div key={s.url} className={`src ${s.read ? 'read' : ''}`}>
                  <span className="sn">[{s.n}]</span>
                  <span className="sd">{s.domain}</span>
                  <span className="st">{s.title}</span>
                </div>
              ))}
            </div>
          </section>

          {/* The RUNNING strip: one tile per step, laid along the curve, plus the progress tile. */}
          {task.steps.map((st, i) => (
            <section key={`r-${task.id}-${st.key}`} className={`wcard w-step ${st.status}`} style={{ ...box(i * 20.2, 83, 19.2, 17), animationDelay: `${0.1 + i * 0.08}s` }}>
              <header className="wcard-head">
                <span>
                  <b>{String(i + 1).padStart(2, '0')}</b> {st.label}
                </span>
                <span className="ri">{icon[st.status]}</span>
              </header>
              <div className="rd">{st.detail || (st.status === 'pending' ? 'waiting' : '')}</div>
              <div className="step-bar">
                <i />
              </div>
            </section>
          ))}
          <section className={`wcard w-run ${running ? 'live' : ''}`} key={`r-${task.id}`} style={{ ...box(80.8, 83, 19.2, 17), animationDelay: '0.45s' }}>
            <header className="wcard-head">
              <span>
                <b>05</b> {running ? 'RUNNING' : 'COMPLETE'}
              </span>
              <span className={running ? 'hot' : 'muted'}>
                <Elapsed task={task} />
              </span>
            </header>
            <div className="run-pct">{pct}%</div>
            <div className="run-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="run-foot">
              <span className="act">{task.activity}</span>
            </div>
          </section>
        </>
      )}
    </div>
    </div>
  )
}
