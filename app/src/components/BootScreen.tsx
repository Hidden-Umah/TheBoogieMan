import { useEffect, useRef, useState } from 'react'

const STEPS = [
  'Initializing Rust core',
  'Mounting display matrix',
  'Calibrating optic array',
  'Spawning neural cortex (Python)',
  'Establishing brain link',
]

const MIN_MS = 4200
const MAX_WAIT_MS = 15000

/**
 * "Welcome to the Boogeyman". Runs through the boot steps, holds on the last one
 * until the brain is actually connected (or gives up after MAX_WAIT_MS), then
 * calls onDone so the HUD can take over.
 */
export default function BootScreen({ connected, onDone }: { connected: boolean; onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const start = performance.now()
    const id = setInterval(() => setElapsed(performance.now() - start), 50)
    return () => clearInterval(id)
  }, [])

  const timeProgress = Math.min(1, elapsed / MIN_MS)
  // Hold at 92% until the brain is up.
  const progress = connected ? timeProgress : Math.min(timeProgress, 0.92)
  const ready = progress >= 1 || elapsed > MAX_WAIT_MS
  const stepIndex = Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length))

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Start the fade once, then hand over to the HUD. The timer must not depend on
  // `leaving`, or flipping it would cancel the hand-over.
  useEffect(() => {
    if (!ready) return
    setLeaving(true)
    const id = setTimeout(() => onDoneRef.current(), 900)
    return () => clearTimeout(id)
  }, [ready])

  const pct = Math.round((ready ? 1 : progress) * 100)

  return (
    <div className={`boot ${leaving ? 'leaving' : ''}`}>
      <div className="boot-inner">
        <div className="boot-sub">WELCOME TO</div>
        <h1 className="boot-title" data-text="THE BOOGEYMAN">
          THE BOOGEYMAN
        </h1>
        <div className="boot-bar">
          <div className="boot-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="boot-status">
          <span>{ready ? (connected ? 'ALL SYSTEMS ONLINE' : 'BRAIN OFFLINE — CONTINUING') : STEPS[stepIndex]}</span>
          <span>{pct}%</span>
        </div>
        <ul className="boot-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < stepIndex || ready ? 'done' : i === stepIndex ? 'active' : ''}>
              {i < stepIndex || ready ? '■' : i === stepIndex ? '▶' : '□'} {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
