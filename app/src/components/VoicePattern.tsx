import { useEffect, useRef } from 'react'
import { channels, type Source } from '../lib/audio'

const ROWS = 11

/**
 * Live voice pattern for one source, dot-matrix style:
 *  - top: frequency spectrum (24 bands) as columns of dots, peaks in the accent colour
 *  - bottom: the last ~5 s of loudness as a mirrored dotted trace
 * Draws on a canvas every frame straight from the shared audio channel.
 */
export default function VoicePattern({ source }: { source: Source }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const shown = new Array(24).fill(0)
    let raf = 0

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const css = getComputedStyle(canvas)
      const fg = css.getPropertyValue('--fg').trim() || '#eceae6'
      const accent = css.getPropertyValue('--accent').trim() || '#ff4a1c'

      const c = channels[source]
      const live = performance.now() - c.at < 400
      const t = performance.now() / 1000

      // ── spectrum ──
      const specH = h * 0.58
      const cols = c.bands.length
      const gx = w / cols
      const gy = specH / ROWS
      const r = Math.max(1, Math.min(gx, gy) * 0.24)
      for (let i = 0; i < cols; i++) {
        // Idle shimmer so it never looks dead.
        const idle = 0.05 + 0.04 * Math.sin(t * 2 + i * 0.6)
        const target = live ? c.bands[i] : idle
        shown[i] += (target - shown[i]) * (target > shown[i] ? 0.5 : 0.12)
        const lit = Math.round(shown[i] * ROWS)
        for (let row = 0; row < ROWS; row++) {
          const on = ROWS - row <= lit
          const peak = on && ROWS - row === lit && lit > 3
          ctx.beginPath()
          ctx.arc(gx * i + gx / 2, gy * row + gy / 2, on ? r : r * 0.45, 0, Math.PI * 2)
          ctx.fillStyle = peak ? accent : fg
          ctx.globalAlpha = on ? 0.95 : 0.14
          ctx.fill()
        }
      }

      // ── loudness history ──
      const top = specH + 10
      const hh = h - top
      const mid = top + hh / 2
      const hist = c.history
      const step = w / hist.length
      ctx.globalAlpha = 0.16
      ctx.fillStyle = fg
      ctx.fillRect(0, mid, w, 1)
      for (let i = 0; i < hist.length; i++) {
        const amp = Math.max(0.02, hist[i]) * (hh / 2 - 2)
        const recent = i > hist.length - 8 && live
        ctx.globalAlpha = 0.35 + 0.65 * (i / hist.length)
        ctx.fillStyle = recent && hist[i] > 0.25 ? accent : fg
        for (let y = -amp; y <= amp; y += 4) {
          ctx.fillRect(i * step, mid + y, Math.max(1, step * 0.45), 1.6)
        }
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [source])

  return <canvas ref={ref} className="voice-pattern" />
}
