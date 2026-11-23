import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { drawMemory, drawResponse, drawVoice, PALETTES } from '../hud/draw'
import { hud } from '../hud/store'

/**
 * The side screens: real curved panels on the inside wall of a cylinder, with the
 * camera standing at its centre. Like sitting inside a wraparound monitor:
 * the screens curve toward you and everything drawn on them bends with them.
 * Moving the mouse turns your head slightly toward the left or right screens.
 */

const R = 5 // cylinder radius (camera at the centre)
const INNER = THREE.MathUtils.degToRad(26) // angle of the inner edge from straight ahead
const OUTER = THREE.MathUtils.degToRad(49) // angle of the outer edge
const H = 1.72 // height of one screen
const GAP = 0.2
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
    <mesh geometry={geo} position={[0, y, 0]}>
      <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

function Head() {
  useFrame(({ camera }, dt) => {
    const k = 1 - Math.exp(-dt * 3)
    camera.rotation.order = 'YXZ'
    camera.rotation.y += (-mouse.x * 0.13 - camera.rotation.y) * k
    camera.rotation.x += (mouse.y * 0.05 - camera.rotation.x) * k
  })
  return null
}

const pal = () => PALETTES[hud.mode]
const normalOnly = () => hud.mode === 'normal'
const always = () => true

export default function HudScreens() {
  return (
    <div className="hud-screens">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 70, near: 0.1, far: 50, position: [0, 0, 0] }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Head />
        <Screen side="left" row={0} delay={200} visible={normalOnly} draw={(c, w, h) => drawVoice(c, w, h, pal(), 'mic')} />
        <Screen side="left" row={1} delay={400} visible={normalOnly} draw={(c, w, h) => drawVoice(c, w, h, pal(), 'voice')} />
        <Screen side="right" row={0} delay={300} visible={always} draw={(c, w, h) => drawResponse(c, w, h, pal())} />
        <Screen side="right" row={1} delay={500} visible={normalOnly} draw={(c, w, h) => drawMemory(c, w, h, pal())} />
      </Canvas>
    </div>
  )
}
