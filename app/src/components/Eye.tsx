import { useEffect, useRef } from 'react'

export type EyeState = 'idle' | 'thinking' | 'speaking' | 'offline'

const BARS = 72

/**
 * The cyborg eye. Pure SVG: concentric rings spin clockwise / anticlockwise at
 * speeds set by CSS per state. The outer voice ring is driven from JS so it can
 * react to audio later (Phase 2); for now it's synthesised while speaking.
 */
export default function Eye({ state }: { state: EyeState }) {
  const barsRef = useRef<SVGGElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let raf = 0
    const levels = new Array(BARS).fill(0)
    const tick = (t: number) => {
      const g = barsRef.current
      if (g) {
        const s = stateRef.current
        for (let i = 0; i < BARS; i++) {
          let target = 0.04
          if (s === 'speaking') {
            const wave = Math.sin(t / 90 + i * 0.5) * 0.5 + 0.5
            const wave2 = Math.sin(t / 140 - i * 0.9) * 0.5 + 0.5
            target = 0.15 + wave * wave2 * 0.85 * (0.6 + Math.random() * 0.4)
          } else if (s === 'thinking') {
            target = 0.08 + (Math.sin(t / 200 + i * 0.35) * 0.5 + 0.5) * 0.25
          }
          levels[i] += (target - levels[i]) * 0.25
          const bar = g.children[i] as SVGLineElement
          bar.setAttribute('y1', String(-178 - levels[i] * 42))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ticks = Array.from({ length: 120 }, (_, i) => i)
  const segments = Array.from({ length: 12 }, (_, i) => i)

  return (
    <div className={`eye eye-${state}`}>
      <svg viewBox="-250 -250 500 500" className="eye-svg">
        <defs>
          <radialGradient id="iris" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(78)">
            <stop offset="0" stopColor="var(--eye-core)" />
            <stop offset="0.35" stopColor="var(--eye)" />
            <stop offset="0.75" stopColor="var(--eye-deep)" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(240)">
            <stop offset="0" stopColor="var(--eye)" stopOpacity="0.35" />
            <stop offset="0.5" stopColor="var(--eye)" stopOpacity="0.06" />
            <stop offset="1" stopColor="var(--eye)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--eye)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--eye)" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        <circle r="240" fill="url(#glow)" />

        {/* Voice ring */}
        <g ref={barsRef} className="voice">
          {Array.from({ length: BARS }, (_, i) => (
            <line key={i} x1="0" x2="0" y1="-178" y2="-172" transform={`rotate(${(360 / BARS) * i})`} />
          ))}
        </g>

        {/* Outer dashed ring: clockwise, slow */}
        <g className="ring r1">
          <circle r="165" className="stroke dim" strokeDasharray="2 6" />
          <path d="M 0 -160 A 160 160 0 0 1 113 -113" className="stroke bright thick" />
          <path d="M 0 160 A 160 160 0 0 1 -113 113" className="stroke bright thick" />
        </g>

        {/* Tick ring: anticlockwise */}
        <g className="ring r2">
          {ticks.map((i) => (
            <line
              key={i}
              x1="0"
              x2="0"
              y1="-145"
              y2={i % 10 === 0 ? -132 : -139}
              className={`stroke ${i % 10 === 0 ? 'bright' : 'dim'}`}
              transform={`rotate(${i * 3})`}
            />
          ))}
        </g>

        {/* Segmented ring: clockwise, faster */}
        <g className="ring r3">
          {segments.map((i) => (
            <path
              key={i}
              d="M 0 -122 A 122 122 0 0 1 52 -110"
              className={`stroke ${i % 3 === 0 ? 'bright' : 'mid'} seg`}
              transform={`rotate(${i * 30})`}
            />
          ))}
        </g>

        {/* Thin ring with notches: anticlockwise, fast */}
        <g className="ring r4">
          <circle r="104" className="stroke mid" strokeDasharray="60 8 4 8" />
          <circle r="0" cx="0" cy="-104" />
          <rect x="-3" y="-108" width="6" height="8" className="fill-bright" />
          <rect x="-3" y="100" width="6" height="8" className="fill-bright" />
        </g>

        {/* Scanner sweep */}
        <g className="ring sweep">
          <path d="M 0 0 L 0 -98 A 98 98 0 0 1 69 -69 Z" fill="url(#sweep)" />
        </g>

        {/* Iris */}
        <circle r="92" className="stroke dim" />
        <circle r="78" fill="url(#iris)" className="iris" />
        <g className="ring r5">
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="0" x2="0" y1="-34" y2="-70" className="stroke fiber" transform={`rotate(${i * 15})`} />
          ))}
        </g>

        {/* Pupil */}
        <circle r="26" className="pupil" />
        <circle r="26" className="stroke bright pupil-ring" />
        <circle r="5" cx="-9" cy="-9" fill="#fff" opacity="0.8" />
      </svg>
    </div>
  )
}
