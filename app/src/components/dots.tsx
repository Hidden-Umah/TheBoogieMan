// Dot-matrix primitives: everything drawn from small dots, LED style.
import { useEffect, useRef, useState } from 'react'

/** A ring of dots; `value` (0..1) lights that fraction, with an accent tail at the end. */
export function DotRing({ value, size = 120, dots = 64, spin = false }: { value: number; size?: number; dots?: number; spin?: boolean }) {
  const lit = Math.round(value * dots)
  const r = size / 2 - 6
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className={spin ? 'dot-spin' : ''}>
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / dots) * Math.PI * 2 - Math.PI / 2
        const on = i < lit
        const tail = on && i >= lit - 4
        return (
          <circle
            key={i}
            cx={Math.cos(a) * r}
            cy={Math.sin(a) * r}
            r={on ? 1.9 : 1.3}
            className={tail ? 'd-acc' : on ? 'd-on' : 'd-off'}
          />
        )
      })}
    </svg>
  )
}

/** Animated dotted waveform. Busy = taller, accent core. */
export function DotWave({ active, cols = 46, rows = 9 }: { active: number; cols?: number; rows?: number }) {
  const [t, setT] = useState(0)
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      setT(now / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const gap = 5
  const w = cols * gap
  const h = rows * gap
  const mid = (rows - 1) / 2
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="dot-wave">
      {Array.from({ length: cols }, (_, c) => {
        const center = 1 - Math.abs(c - cols / 2) / (cols / 2)
        const amp =
          (0.08 + active * center * 0.92) *
          Math.abs(Math.sin(c * 0.55 + t * (3 + active * 6)) * Math.sin(c * 0.21 - t * 2.3))
        const half = Math.round(amp * mid)
        return Array.from({ length: rows }, (_, r) => {
          const d = Math.abs(r - mid)
          const on = d <= half
          const acc = on && active > 0.3 && center > 0.55 && d >= half - 1 && half > 1
          return (
            <circle
              key={`${c}-${r}`}
              cx={c * gap + gap / 2}
              cy={r * gap + gap / 2}
              r={on ? 1.25 : r === mid ? 0.9 : 0.5}
              className={acc ? 'd-acc' : on ? 'd-on' : 'd-off'}
            />
          )
        })
      })}
    </svg>
  )
}

/** Dotted column chart of recent values (0..1). The latest column uses the accent. */
export function DotBars({ values, rows = 8 }: { values: number[]; rows?: number }) {
  const gap = 5
  const cols = values.length
  return (
    <svg width="100%" viewBox={`0 0 ${cols * gap} ${rows * gap}`} preserveAspectRatio="xMidYMid meet">
      {values.map((v, c) => {
        const n = Math.max(1, Math.round(v * rows))
        return Array.from({ length: rows }, (_, r) => {
          const on = rows - r <= n
          const acc = on && c >= cols - 3
          return (
            <circle
              key={`${c}-${r}`}
              cx={c * gap + gap / 2}
              cy={r * gap + gap / 2}
              r={on ? 1.2 : 0.5}
              className={acc ? 'd-acc' : on ? 'd-on' : 'd-off'}
            />
          )
        })
      })}
    </svg>
  )
}

export function Card({
  n,
  title,
  right,
  className = '',
  children,
}: {
  n: string
  title: string
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <span>
          <b>{n}</b> {title}
        </span>
        {right}
      </header>
      {children}
    </section>
  )
}
