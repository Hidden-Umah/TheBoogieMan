import { useEffect, useMemo, useRef, useState } from 'react'
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
function GodEye({ task }: { task: Task }) {
  const [jitter, setJitter] = useState(0)
  useEffect(() => {
    if (task.done) return
    const id = setInterval(() => setJitter(Math.random()), 220)
    return () => clearInterval(id)
  }, [task.done])
  const m = task.metrics
  const intensity = task.done ? 100 : 55 + jitter * 40
  return (
    <section className="wcard w-eye" style={{ animationDelay: '0.1s' }}>
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

export default function WorkMode({ active, lastReply, listening }: { active: boolean; lastReply: string; listening: string }) {
  const task = useTask()
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
      <section className="wcard w-ask">
        <div className="w-ask-k">
          <span>WORKSPACE</span>
          <span className={running ? 'hot' : 'muted'}>{running ? '● LIVE' : listening}</span>
        </div>
        <div className="w-ask-q">{task ? (running ? 'ON IT, BOSS.' : 'DONE, BOSS.') : 'BOSS, WHAT DO YOU WANT TO DO?'}</div>
        <div className="w-ask-sub">{task ? task.title : 'Say it. Research, news, anything you need looked into.'}</div>
        {lastReply && <div className="w-ask-reply">› {lastReply}</div>}
      </section>

      {task && (
        <>
          <section className="wcard w-queries" key={`q-${task.id}`}>
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

          <GodEye task={task} key={`e-${task.id}`} />

          <section className="wcard w-findings" key={`f-${task.id}`} style={{ animationDelay: '0.2s' }}>
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

          <section className="wcard w-sources" key={`s-${task.id}`} style={{ animationDelay: '0.3s' }}>
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

          <section className="wcard w-run" key={`r-${task.id}`} style={{ animationDelay: '0.4s' }}>
            <header className="wcard-head">
              <span>
                <b>05</b> {running ? 'RUNNING' : 'COMPLETE'}
              </span>
              <span className={running ? 'hot' : 'muted'}>
                {pct}% · <Elapsed task={task} />
              </span>
            </header>
            <div className="run-steps">
              {task.steps.map((s) => (
                <div key={s.key} className={`rs ${s.status}`}>
                  <span className="ri">{icon[s.status]}</span>
                  <span className="rl">{s.label}</span>
                  <span className="rd">{s.detail}</span>
                </div>
              ))}
            </div>
            <div className="run-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="run-foot">
              <span className="act">{task.activity}</span>
              <span className="runlog">{task.log.slice(-3).join('   ')}</span>
            </div>
          </section>
        </>
      )}
    </div>
    </div>
  )
}
