import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { drawMemory, drawResponse, drawVoice, PALETTES } from '../hud/draw'
import { hud } from '../hud/store'

/**
 * The side screens, laid out like one curved ultrawide monitor seen from the front.
 * Panels are segments of a large cylinder; the camera sits well in front of the
 * cylinder's centre (not at it), so the curve is gentle: the ends come slightly
 * toward you, and everything drawn on the panels bends with the glass.
 * Thin top and bottom edges run across the full width so it reads as one display.
 * Moving the mouse turns your head a little toward the left or right.
 */

const R = 30 // radius of the curve (bigger = gentler)
const ZC = 20 // cylinder centre sits this far behind the camera -> screen 10 away
const INNER = THREE.MathUtils.degToRad(9.2) // inner edge, measured at the curve's centre
const OUTER = THREE.MathUtils.degToRad(16.3) // outer edge
const SPAN = THREE.MathUtils.degToRad(17.8) // half-width of the whole "monitor"
const H = 3.7 // height of one screen
const GAP = 0.36
const TEX_W = 900
const TEX_H = Math.round((TEX_W * H) / (R * (OUTER - INNER)))

const mouse = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1)
  })
}

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

function Screen({ side, row, draw, visible, delay }: { side: 'left' | 'right'; row: 0 | 1; draw: DrawFn; visible: () => boolean; delay: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  const { canvas, ctx, tex, geo } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')!
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    // Seen from inside the cylinder, u runs right-to-left: flip it so text reads normally.
    tex.repeat.set(-1, 1)
    tex.offset.set(1, 0)
    const start = side === 'left' ? Math.PI + INNER : Math.PI - OUTER
    const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true, start, OUTER - INNER)
    return { canvas, ctx, tex, geo }
  }, [side])

  const last = useRef(0)
  const born = useRef(performance.now())
  useEffect(() => () => {
    tex.dispose()
    geo.dispose()
  }, [tex, geo])

  useFrame((_, dt) => {
    const now = performance.now()
    // Fade in on start (staggered), fade with mode changes.
    const target = now - born.current > delay && visible() ? 1 : 0
    const m = mat.current
    m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 5))
    m.visible = m.opacity > 0.01
    if (!m.visible || now - last.current < 33) return // ~30 fps is plenty for a screen
    last.current = now
    draw(ctx, canvas.width, canvas.height)
    tex.needsUpdate = true
  })

  const y = row === 0 ? (H + GAP) / 2 : -(H + GAP) / 2
  return (
    <mesh geometry={geo} position={[0, y, ZC]}>
      <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

function Head() {
  useFrame(({ camera }, dt) => {
    const k = 1 - Math.exp(-dt * 3)
    camera.rotation.order = 'YXZ'
    camera.rotation.y += (-mouse.x * 0.06 - camera.rotation.y) * k
    camera.rotation.x += (mouse.y * 0.03 - camera.rotation.x) * k
  })
  return null
}

/** The monitor's curved top and bottom edges, running across the full width. */
function Bezel() {
  const geo = useMemo(() => {
    const pts: number[] = []
    const cols: number[] = []
    const yTop = H + GAP / 2 + 0.18
    for (const y of [yTop, -yTop]) {
      const n = 160
      for (let i = 0; i < n; i++) {
        for (const j of [i, i + 1]) {
          const a = -SPAN + (2 * SPAN * j) / n
          pts.push(-R * Math.sin(a), y, ZC - R * Math.cos(a))
          // Fade out toward the ends.
          const f = Math.pow(Math.min(1, (SPAN - Math.abs(a)) / (SPAN * 0.35)), 1.5)
          cols.push(f, f, f)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    return g
  }, [])
  const mat = useRef<THREE.LineBasicMaterial>(null!)
  useFrame(() => {
    mat.current.color.set(hud.mode === 'devil' ? '#ff3a46' : '#eceae6')
  })
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial ref={mat} vertexColors transparent opacity={0.28} toneMapped={false} />
    </lineSegments>
  )
}

const pal = () => PALETTES[hud.mode]
const always = () => true

export default function HudScreens() {
  return (
    <div className="hud-screens">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 60, near: 0.1, far: 100, position: [0, 0, 0] }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Head />
        <Bezel />
        <Screen side="left" row={0} delay={200} visible={always} draw={(c, w, h) => drawVoice(c, w, h, pal(), 'mic')} />
        <Screen side="left" row={1} delay={400} visible={always} draw={(c, w, h) => drawVoice(c, w, h, pal(), 'voice')} />
        <Screen side="right" row={0} delay={300} visible={always} draw={(c, w, h) => drawResponse(c, w, h, pal())} />
        <Screen side="right" row={1} delay={500} visible={always} draw={(c, w, h) => drawMemory(c, w, h, pal())} />
      </Canvas>
    </div>
  )
}
