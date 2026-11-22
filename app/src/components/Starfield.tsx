import { useEffect, useRef } from 'react'

type Star = { x: number; y: number; z: number; pz: number }

const COUNT = 900
const DEPTH = 1000

/**
 * Deep-space warp field. Stars live in 3D (x, y, z) and are projected onto the screen,
 * so near stars move fast and streak, far ones crawl. `speed` lets the HUD warp up
 * while the Boogeyman is thinking.
 */
export default function Starfield({ speed = 1 }: { speed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    let raf = 0
    let current = speedRef.current

    const spawn = (s: Star, far = false) => {
      s.x = (Math.random() - 0.5) * 2000
      s.y = (Math.random() - 0.5) * 2000
      s.z = far ? DEPTH : Math.random() * DEPTH
      s.pz = s.z
    }
    const stars: Star[] = Array.from({ length: COUNT }, () => {
      const s = { x: 0, y: 0, z: 0, pz: 0 }
      spawn(s)
      return s
    })

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = () => {
      current += (speedRef.current - current) * 0.04
      const cx = w / 2
      const cy = h / 2
      const fov = Math.min(w, h) * 0.6

      // Trail fade instead of a hard clear gives the streaks their tail.
      ctx.fillStyle = 'rgba(2, 2, 6, 0.35)'
      ctx.fillRect(0, 0, w, h)

      for (const s of stars) {
        s.pz = s.z
        s.z -= 1.2 * current
        if (s.z < 1) {
          spawn(s, true)
          continue
        }
        const sx = cx + (s.x / s.z) * fov
        const sy = cy + (s.y / s.z) * fov
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) {
          spawn(s, true)
          continue
        }
        const px = cx + (s.x / s.pz) * fov
        const py = cy + (s.y / s.pz) * fov
        const near = 1 - s.z / DEPTH
        const alpha = Math.min(1, near * 1.4)
        const size = near * 1.8 + 0.2

        ctx.strokeStyle = near > 0.85 ? `rgba(255, 190, 190, ${alpha})` : `rgba(200, 210, 255, ${alpha})`
        ctx.lineWidth = size
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }
      raf = requestAnimationFrame(frame)
    }
    ctx.fillStyle = '#020206'
    ctx.fillRect(0, 0, w, h)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="space">
      <canvas ref={canvasRef} className="space-canvas" />
      <div className="nebula" />
      <div className="vignette" />
    </div>
  )
}
