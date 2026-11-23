import { useEffect, useRef, useState } from 'react'

/**
 * Devil mode: you're inside the helmet. Armour plates frame the screen, visor
 * contour lines glow along the glass, and a targeting reticle follows the cursor.
 * Mounting with a new `armedAt` key replays the shutter (visor slamming shut).
 */
export default function Visor({ active, armedAt }: { active: boolean; armedAt: number }) {
  const reticle = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (reticle.current) reticle.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    }
    window.addEventListener('pointermove', move)
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => {
      window.removeEventListener('pointermove', move)
      clearInterval(id)
    }
  }, [])

  return (
    <div className={`visor ${active ? 'on' : ''}`} aria-hidden={!active}>
      {/* Glass tint + reflection */}
      <div className="visor-glass" />

      <svg className="visor-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="hex" width="24" height="41.57" patternUnits="userSpaceOnUse" patternTransform="scale(1.1)">
            <path
              d="M12 0 L24 6.93 L24 20.78 L12 27.71 L0 20.78 L0 6.93 Z M12 27.71 L12 41.57 M0 20.78 L-12 27.71 M24 20.78 L36 27.71"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24252a" />
            <stop offset="0.55" stopColor="#121316" />
            <stop offset="1" stopColor="#08080a" />
          </linearGradient>
          <linearGradient id="metalSide" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d1e22" />
            <stop offset="1" stopColor="#060607" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Visor contour lines */}
        <g className="contours" filter="url(#glow)">
          <path className="c-main" d="M0 150 C 240 120, 400 70, 540 74 L 1060 74 C 1200 70, 1360 120, 1600 150" />
          <path className="c-thin" d="M0 190 C 260 160, 420 112, 560 116 L 1040 116 C 1180 112, 1340 160, 1600 190" />
          <path className="c-main" d="M70 170 C 30 330, 50 480, 170 590 L 250 660" />
          <path className="c-main" d="M1530 170 C 1570 330, 1550 480, 1430 590 L 1350 660" />
          <path className="c-thin" d="M330 900 C 460 770, 620 720, 800 718 C 980 720, 1140 770, 1270 900" />
          <path className="c-flow" d="M120 260 C 100 400, 120 500, 220 580" />
          <path className="c-flow" d="M1480 260 C 1500 400, 1480 500, 1380 580" />
        </g>

        {/* Top-centre target bar */}
        <g className="topbar" filter="url(#glow)">
          <path d="M660 96 L 940 96 L 918 110 L 682 110 Z" />
          <path className="bar2" d="M690 116 L 910 116 L 898 122 L 702 122 Z" />
        </g>

        {/* Brow plate */}
        <g className="armor">
          <path d="M420 0 L1180 0 L1110 34 L1030 64 L570 64 L490 34 Z" fill="url(#metal)" />
          <path d="M420 0 L1180 0 L1110 34 L1030 64 L570 64 L490 34 Z" fill="url(#hex)" />
          <path d="M490 34 L570 64 L1030 64 L1110 34" className="edge" />
          <path d="M600 40 L1000 40" className="seam" />
          {[640, 720, 880, 960].map((x) => (
            <rect key={x} x={x - 22} y={8} width={44} height={22} rx={3} className="vent" />
          ))}
          <circle cx={800} cy={22} r={5} className="led" />
        </g>

        {/* Cheek plates */}
        <g className="armor">
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900 L0 900 Z" fill="url(#metalSide)" />
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900 L0 900 Z" fill="url(#hex)" />
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900" className="edge" />
          <path d="M40 660 L120 648 L200 700 L250 790" className="seam" />
          <circle cx={150} cy={760} r={4} className="led" />
        </g>
        <g className="armor" transform="translate(1600 0) scale(-1 1)">
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900 L0 900 Z" fill="url(#metalSide)" />
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900 L0 900 Z" fill="url(#hex)" />
          <path d="M0 600 L110 585 L215 640 L300 760 L330 900" className="edge" />
          <path d="M40 660 L120 648 L200 700 L250 790" className="seam" />
          <circle cx={150} cy={760} r={4} className="led" />
        </g>
      </svg>

      {/* Corner readouts */}
      <div className="vr vr-tl">
        <div className="vr-k">PROTOCOL</div>
        <div className="vr-v">DEVIL</div>
        <div className="vr-bars">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      </div>
      <div className="vr vr-tr">
        <div className="vr-k">LOCAL TIME</div>
        <div className="vr-v">
          {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
        </div>
        <div className="vr-k">ALL LIMITS OFF</div>
      </div>

      {/* Reticle follows the cursor */}
      <div className="reticle" ref={reticle}>
        <div className="ret-ring" />
        <div className="ret-cross" />
      </div>

      {/* Shutter: the visor slamming shut, replayed on every activation */}
      {active && (
        <div className="shutter" key={armedAt}>
          <div className="sh-top" />
          <div className="sh-bot" />
          <div className="sh-text">DEVIL MODE</div>
        </div>
      )}
    </div>
  )
}
