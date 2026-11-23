import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Fragmented radial data rings: broken arcs made of wireframe cells, with some
 * cells filled in the accent colour that flicker with activity. Each ring is its
 * own group so they can spin at different speeds and directions.
 */

type RingSpec = { r: number; w: number; rows: number; z: number; cell: number; fill: number; speed: number }

const RINGS: RingSpec[] = [
  { r: 1.22, w: 0.09, rows: 2, z: 0.08, cell: 0.11, fill: 0.35, speed: 0.5 },
  { r: 1.42, w: 0.2, rows: 3, z: -0.06, cell: 0.07, fill: 0.2, speed: -0.22 },
  { r: 1.72, w: 0.12, rows: 2, z: 0.12, cell: 0.06, fill: 0.12, speed: 0.15 },
  { r: 1.95, w: 0.26, rows: 4, z: -0.1, cell: 0.05, fill: 0.16, speed: -0.09 },
  { r: 2.32, w: 0.1, rows: 2, z: 0.04, cell: 0.045, fill: 0.1, speed: 0.06 },
  { r: 2.6, w: 0.04, rows: 1, z: 0.16, cell: 0.08, fill: 0.04, speed: -0.035 },
]

// Seeded PRNG so the layout is stable between reloads.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function buildRing(spec: RingSpec, seed: number) {
  const rand = rng(seed)
  const line: number[] = []
  const shade: number[] = []
  const fill: number[] = []
  const fSeed: number[] = []
  const fBase: number[] = []

  const pt = (a: number, rad: number) => [Math.cos(a) * rad, Math.sin(a) * rad, 0]
  const seg = (a0: number, r0: number, a1: number, r1: number, s: number) => {
    line.push(...pt(a0, r0), ...pt(a1, r1))
    shade.push(s, s, s, s, s, s)
  }

  let a = rand() * Math.PI * 2
  const end = a + Math.PI * 2
  while (a < end) {
    a += 0.04 + rand() * 0.35 // gap
    const len = 0.12 + rand() * 0.85
    const stop = Math.min(a + len, end)
    const s = 0.25 + rand() * 0.75
    // Some segments run hot: their cells fill in clusters, like heat on a radar.
    const hot = rand() < 0.3
    const fillP = hot ? Math.min(0.85, spec.fill * 4.5) : spec.fill * 0.15
    const rowH = spec.w / spec.rows
    // Long arcs bounding the segment (inner + outer), subdivided so they curve.
    for (let row = 0; row <= spec.rows; row++) {
      const rad = spec.r + row * rowH
      if (row !== 0 && row !== spec.rows && rand() < 0.4) continue
      const steps = Math.max(2, Math.ceil((stop - a) / 0.03))
      for (let i = 0; i < steps; i++) {
        seg(a + ((stop - a) * i) / steps, rad, a + ((stop - a) * (i + 1)) / steps, rad, s)
      }
    }
    // Cells: radial dividers + some filled.
    let c = a
    while (c < stop - 0.001) {
      const cw = spec.cell * (0.6 + rand() * 1.4)
      const c1 = Math.min(c + cw, stop)
      seg(c, spec.r, c, spec.r + spec.w, s)
      for (let row = 0; row < spec.rows; row++) {
        if (rand() < fillP) {
          const r0 = spec.r + row * rowH + rowH * 0.12
          const r1 = r0 + rowH * 0.76
          const ca = c + (c1 - c) * 0.08
          const cb = c1 - (c1 - c) * 0.08
          const p00 = pt(ca, r0), p01 = pt(cb, r0), p10 = pt(ca, r1), p11 = pt(cb, r1)
          fill.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10)
          const sd = rand() * 100
          const base = rand()
          for (let k = 0; k < 6; k++) {
            fSeed.push(sd)
            fBase.push(base)
          }
        }
      }
      c = c1
    }
    seg(stop, spec.r, stop, spec.r + spec.w, s)
    a = stop
  }

  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
  lines.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3))
  const fills = new THREE.BufferGeometry()
  fills.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3))
  fills.setAttribute('aSeed', new THREE.Float32BufferAttribute(fSeed, 1))
  fills.setAttribute('aBase', new THREE.Float32BufferAttribute(fBase, 1))
  return { lines, fills }
}

const fillVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aBase;
  varying float vSeed;
  varying float vBase;
  void main() {
    vSeed = aSeed;
    vBase = aBase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fillFragment = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uAccent;
  varying float vSeed;
  varying float vBase;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float rate = 1.5 + uEnergy * 14.0;
    float tick = floor(uTime * rate + vSeed * 3.0);
    float flick = h(vSeed * 17.0 + tick * 3.1);
    // More cells come alive as energy rises.
    float alive = step(1.0 - (0.45 + uEnergy * 0.5), vBase);
    float on = alive * (0.35 + 0.65 * step(0.3 - uEnergy * 0.2, flick));
    float tone = 0.55 + h(vSeed) * 0.9;
    gl_FragColor = vec4(uAccent * tone * (1.0 + uEnergy * 0.8), on * 0.9);
  }
`

export type ArcsLive = { energy: number; speed: number }

export default function DataArcs({
  live,
  accent,
  lineColor,
}: {
  live: React.RefObject<ArcsLive>
  accent: THREE.Color
  lineColor: THREE.Color
}) {
  const groups = useRef<THREE.Group[]>([])
  const built = useMemo(() => RINGS.map((spec, i) => buildRing(spec, 1337 + i * 97)), [])
  const fillMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fillVertex,
        fragmentShader: fillFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uAccent: { value: accent } },
      }),
    [accent],
  )
  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        color: lineColor,
        toneMapped: false,
        depthWrite: false,
      }),
    [lineColor],
  )

  useFrame(({ clock }, dt) => {
    const l = live.current
    fillMat.uniforms.uTime.value = clock.elapsedTime
    fillMat.uniforms.uEnergy.value = l.energy
    groups.current.forEach((g, i) => {
      if (g) g.rotation.z += RINGS[i].speed * l.speed * dt
    })
  })

  return (
    <group scale={0.8}>
      {built.map((b, i) => (
        <group key={i} position={[0, 0, RINGS[i].z]} ref={(g) => { if (g) groups.current[i] = g }}>
          <lineSegments geometry={b.lines} material={lineMat} />
          <mesh geometry={b.fills} material={fillMat} />
        </group>
      ))}
    </group>
  )
}
