import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { EyeState } from '../types'
import { eyeFragment, eyeVertex } from './eyeShader'

const ACCENT = new THREE.Color('#ff2238')
const WHITE = new THREE.Color('#e9edf2')

/** Per-state targets the scene eases toward. */
const TARGETS: Record<EyeState, { speed: number; pupil: number; energy: number; warp: number }> = {
  idle: { speed: 1, pupil: 0.3, energy: 0.15, warp: 1 },
  thinking: { speed: 4.5, pupil: 0.17, energy: 0.8, warp: 5 },
  speaking: { speed: 1.6, pupil: 0.34, energy: 0.55, warp: 1.6 },
  offline: { speed: 0.15, pupil: 0.45, energy: 0, warp: 0.2 },
}

// Mouse position in [-1, 1], tracked on window so HUD overlays don't block it.
const mouse = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1)
  })
}

type Live = { speed: number; pupil: number; energy: number; warp: number; level: number }

function useLive(state: EyeState) {
  const live = useRef<Live>({ ...TARGETS.idle, level: 0 })
  useFrame((_, dt) => {
    const t = TARGETS[state]
    const k = 1 - Math.exp(-dt * 3)
    const l = live.current
    l.speed += (t.speed - l.speed) * k
    l.pupil += (t.pupil - l.pupil) * k
    l.energy += (t.energy - l.energy) * k
    l.warp += (t.warp - l.warp) * k
    // Synthetic voice level while speaking; Phase 2 replaces this with real audio.
    const tt = performance.now() / 1000
    const target =
      state === 'speaking' ? 0.35 + 0.65 * Math.abs(Math.sin(tt * 9) * Math.sin(tt * 3.7 + 1)) : 0
    l.level += (target - l.level) * (1 - Math.exp(-dt * 18))
  })
  return live
}

/* ───────────────────────────── Eye ───────────────────────────── */

function Eyeball({ live }: { live: React.RefObject<Live> }) {
  const group = useRef<THREE.Group>(null!)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: eyeVertex,
        fragmentShader: eyeFragment,
        uniforms: {
          uTime: { value: 0 },
          uPupil: { value: 0.3 },
          uEnergy: { value: 0.15 },
          uAccent: { value: ACCENT.clone() },
        },
      }),
    [],
  )

  useFrame(({ clock }, dt) => {
    const l = live.current
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uPupil.value = l.pupil + l.level * 0.06 + Math.sin(clock.elapsedTime * 0.8) * 0.01
    mat.uniforms.uEnergy.value = l.energy + l.level * 0.5
    // Look at the cursor, with a little idle saccade.
    const sx = Math.sin(clock.elapsedTime * 0.37) * 0.04
    const sy = Math.cos(clock.elapsedTime * 0.29) * 0.03
    const k = 1 - Math.exp(-dt * 6)
    group.current.rotation.y += (mouse.x * 0.55 + sx - group.current.rotation.y) * k
    group.current.rotation.x += (-mouse.y * 0.4 + sy - group.current.rotation.x) * k
  })

  return (
    <group ref={group}>
      <mesh material={mat}>
        <sphereGeometry args={[1, 128, 128]} />
      </mesh>
    </group>
  )
}

/* ─────────────────────────── Gyroscope ─────────────────────────── */

function Ring({ radius, tube = 0.004, opacity = 0.5, arc = Math.PI * 2, color = WHITE }: {
  radius: number
  tube?: number
  opacity?: number
  arc?: number
  color?: THREE.Color
}) {
  return (
    <mesh>
      <torusGeometry args={[radius, tube, 8, 256, arc]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  )
}

function Segments({ radius, count, arc, tube, opacity }: {
  radius: number
  count: number
  arc: number
  tube: number
  opacity: number
}) {
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} rotation={[0, 0, (i / count) * Math.PI * 2]}>
          <Ring radius={radius} tube={tube} arc={arc} opacity={i % 4 === 0 ? opacity * 1.6 : opacity} />
        </group>
      ))}
    </group>
  )
}

function Ticks({ radius, count, opacity }: { radius: number; count: number; opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const m = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const major = i % 10 === 0
      m.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0)
      m.rotation.set(0, 0, a)
      m.scale.set(major ? 0.09 : 0.04, major ? 0.006 : 0.004, 0.004)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [radius, count])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={WHITE} transparent opacity={opacity} toneMapped={false} />
    </instancedMesh>
  )
}

function Markers({ radius }: { radius: number }) {
  return (
    <group>
      {[0, Math.PI * 0.66, Math.PI * 1.33].map((a) => (
        <mesh key={a} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Gyroscope({ live }: { live: React.RefObject<Live> }) {
  const root = useRef<THREE.Group>(null!)
  const a = useRef<THREE.Group>(null!)
  const b = useRef<THREE.Group>(null!)
  const c = useRef<THREE.Group>(null!)
  const d = useRef<THREE.Group>(null!)
  const e = useRef<THREE.Group>(null!)
  const f = useRef<THREE.Group>(null!)

  useFrame((_, dt) => {
    const s = live.current.speed * dt
    a.current.rotation.z += 0.25 * s // segmented arcs: clockwise
    b.current.rotation.z -= 0.12 * s // ticks: anticlockwise
    c.current.rotation.y += 0.35 * s // tilted gimbal 1
    d.current.rotation.x -= 0.28 * s // tilted gimbal 2
    e.current.rotation.z -= 0.6 * s // inner fast ring
    f.current.rotation.z += 0.05 * s // outer slow
    // Gentle parallax against the cursor so the rig feels physical.
    const k = 1 - Math.exp(-dt * 2)
    root.current.rotation.y += (mouse.x * 0.18 - root.current.rotation.y) * k
    root.current.rotation.x += (-mouse.y * 0.12 - root.current.rotation.x) * k
  })

  return (
    <group ref={root}>
      <group ref={e}>
        <Ring radius={1.18} tube={0.003} opacity={0.35} />
        <Ring radius={1.18} tube={0.012} opacity={0.9} arc={0.5} />
      </group>
      <group ref={a}>
        <Segments radius={1.42} count={12} arc={0.32} tube={0.018} opacity={0.45} />
      </group>
      <group ref={b}>
        <Ticks radius={1.68} count={120} opacity={0.55} />
      </group>
      <group ref={c} rotation={[1.15, 0.25, 0]}>
        <Ring radius={1.95} tube={0.003} opacity={0.22} />
        <Markers radius={1.95} />
      </group>
      <group ref={d} rotation={[0.4, 0.95, 0.3]}>
        <Ring radius={2.15} tube={0.0025} opacity={0.16} />
        <Ring radius={2.15} tube={0.006} opacity={0.32} arc={0.8} />
      </group>
      <group ref={f}>
        <Segments radius={2.55} count={60} arc={0.05} tube={0.004} opacity={0.3} />
      </group>
    </group>
  )
}

/* ─────────────────────────── Voice ring ─────────────────────────── */

const BARS = 128

function VoiceRing({ live }: { live: React.RefObject<Live> }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const m = useMemo(() => new THREE.Object3D(), [])
  const levels = useMemo(() => new Float32Array(BARS), [])

  useFrame(({ clock, camera }) => {
    const l = live.current.level
    const t = clock.elapsedTime
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2
      const wave = Math.abs(Math.sin(a * 3 + t * 6) * Math.sin(a * 7 - t * 4))
      const target = 0.02 + l * (0.15 + wave * 0.5)
      levels[i] += (target - levels[i]) * 0.3
      const h = levels[i]
      const r = 1.3 + h / 2
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0)
      m.rotation.set(0, 0, a - Math.PI / 2)
      m.scale.set(0.012, h, 0.004)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
    // Always face the camera, like a HUD element anchored to the eye.
    ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BARS]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={WHITE} transparent opacity={0.8} toneMapped={false} />
    </instancedMesh>
  )
}

/* ─────────────────────────── Space ─────────────────────────── */

function makeShell(count: number, rMin: number, rMax: number) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = rMin + Math.pow(Math.random(), 0.6) * (rMax - rMin)
    pos.set([s * Math.cos(th) * r, s * Math.sin(th) * r, u * r], i * 3)
    const b = 0.25 + Math.pow(Math.random(), 3) * 0.75
    col.set([b, b, b * 1.05], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function Space({ live }: { live: React.RefObject<Live> }) {
  const far = useRef<THREE.Points>(null!)
  const near = useRef<THREE.Points>(null!)
  const farGeo = useMemo(() => makeShell(9000, 25, 120), [])
  const nearGeo = useMemo(() => makeShell(900, 4, 16), [])

  useFrame((_, dt) => {
    const w = live.current.warp
    far.current.rotation.y += 0.004 * w * dt
    far.current.rotation.x += 0.0015 * w * dt
    near.current.rotation.y -= 0.02 * w * dt
    near.current.rotation.z += 0.008 * w * dt
    // Parallax: near dust shifts more than far stars.
    const k = 1 - Math.exp(-dt * 1.5)
    near.current.position.x += (-mouse.x * 0.6 - near.current.position.x) * k
    near.current.position.y += (-mouse.y * 0.4 - near.current.position.y) * k
  })

  return (
    <>
      <points ref={far} geometry={farGeo}>
        <pointsMaterial size={0.18} sizeAttenuation vertexColors transparent opacity={0.9} depthWrite={false} />
      </points>
      <points ref={near} geometry={nearGeo}>
        <pointsMaterial size={0.035} sizeAttenuation vertexColors transparent opacity={0.6} depthWrite={false} />
      </points>
    </>
  )
}

/* ─────────────────────────── Camera ─────────────────────────── */

function CameraRig({ booted }: { booted: boolean }) {
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null!)
  const flying = useRef(true)

  useEffect(() => {
    camera.position.set(0, 0, 60)
  }, [camera])

  useFrame((_, dt) => {
    if (!flying.current) return
    const targetZ = booted ? 7 : 45
    const k = 1 - Math.exp(-dt * (booted ? 1.6 : 0.4))
    camera.position.z += (targetZ - camera.position.z) * k
    camera.position.x += (0 - camera.position.x) * k
    camera.position.y += (0 - camera.position.y) * k
    if (booted && Math.abs(camera.position.z - targetZ) < 0.02) flying.current = false
  })

  return (
    <OrbitControls
      ref={controls}
      enabled={booted}
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      minDistance={3.5}
      maxDistance={10}
      zoomSpeed={0.6}
    />
  )
}

function Rig({ state, booted }: { state: EyeState; booted: boolean }) {
  const live = useLive(state)
  return (
    <>
      <CameraRig booted={booted} />
      <Space live={live} />
      <Eyeball live={live} />
      <Gyroscope live={live} />
      <VoiceRing live={live} />
    </>
  )
}

export default function Scene({ state, booted }: { state: EyeState; booted: boolean }) {
  return (
    <div className="scene">
      <Canvas
        linear
        dpr={[1, 2]}
        camera={{ fov: 42, near: 0.1, far: 400, position: [0, 0, 60] }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor('#000000')}
      >
        <Rig state={state} booted={booted} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.18} luminanceSmoothing={0.3} radius={0.75} />
          <ChromaticAberration offset={new THREE.Vector2(0.00025, 0.00025)} radialModulation={false} modulationOffset={0} />
          <Noise opacity={0.035} />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
