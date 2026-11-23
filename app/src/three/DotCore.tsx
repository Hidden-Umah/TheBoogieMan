import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Normal-mode centrepiece: a sphere made of dots (LED / dot-matrix style).
 * A noise field displaces the dots, so it breathes when idle, ripples when
 * thinking and pulses with the voice when speaking.
 */

const COUNT = 2600

// Ashima 3D simplex noise (MIT)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

const vertex = /* glsl */ `
  ${NOISE}
  uniform float uTime;
  uniform float uEnergy;
  uniform float uLevel;
  uniform float uPixel;
  attribute float aAcc;
  attribute float aSeed;
  varying float vAcc;
  varying float vFacing;
  varying float vLift;
  void main() {
    vec3 n = normalize(position);
    float speed = 0.25 + uEnergy * 1.4;
    float freq = 1.4 + uEnergy * 1.6;
    float d = snoise(n * freq + vec3(0.0, uTime * speed, uTime * speed * 0.6));
    float amp = 0.05 + uEnergy * 0.16 + uLevel * 0.22;
    float breathe = sin(uTime * 1.1) * 0.025;
    float lift = d * amp + breathe;
    vec3 pos = n * (1.0 + lift);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vFacing = normalize(normalMatrix * n).z;   // 1 = facing camera, -1 = far side
    vAcc = aAcc;
    vLift = lift;
    float twinkle = 0.75 + 0.25 * sin(uTime * 3.0 + aSeed * 40.0);
    gl_PointSize = uPixel * (0.85 + aAcc * 0.6 + max(lift, 0.0) * 1.4) * twinkle / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uEnergy;
  varying float vAcc;
  varying float vFacing;
  varying float vLift;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;               // round dots
    float depth = smoothstep(-1.0, 1.0, vFacing); // far side fades
    float a = mix(0.12, 1.0, depth);
    // Accent dots, plus dots that bulge outward catch the accent when busy.
    float hot = max(vAcc, smoothstep(0.08, 0.2, vLift) * uEnergy);
    vec3 col = mix(uColor, uAccent * 1.6, hot);
    gl_FragColor = vec4(col, a);
  }
`

export type CoreLive = { energy: number; level: number; accent: THREE.Color; line: THREE.Color }

export default function DotCore({ live, mouse }: { live: React.RefObject<CoreLive & { devil: number }>; mouse: { x: number; y: number } }) {
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Points>(null!)

  const geo = useMemo(() => {
    // Fibonacci sphere: evenly spaced dots.
    const pos = new Float32Array(COUNT * 3)
    const acc = new Float32Array(COUNT)
    const seed = new Float32Array(COUNT)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const th = golden * i
      pos.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3)
      // Accent dots gather in a few clusters rather than being sprinkled evenly.
      const x = Math.cos(th) * r
      const z = Math.sin(th) * r
      const cluster = Math.sin(x * 3.1 + 1.3) * Math.sin(y * 2.7 + 0.4) * Math.sin(z * 3.7 + 2.1)
      acc[i] = cluster > 0.42 ? 1 : 0
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aAcc', new THREE.BufferAttribute(acc, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uLevel: { value: 0 },
          uPixel: { value: 44 },
          uColor: { value: new THREE.Color() },
          uAccent: { value: new THREE.Color() },
        },
      }),
    [],
  )

  useFrame(({ clock, gl }, dt) => {
    const l = live.current
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uEnergy.value = l.energy
    mat.uniforms.uLevel.value = l.level
    mat.uniforms.uPixel.value = 44 * gl.getPixelRatio()
    ;(mat.uniforms.uColor.value as THREE.Color).copy(l.line)
    ;(mat.uniforms.uAccent.value as THREE.Color).copy(l.accent)
    spin.current.rotation.y += dt * (0.12 + l.energy * 0.6)
    // Tilt toward the cursor.
    const k = 1 - Math.exp(-dt * 3)
    group.current.rotation.y += (mouse.x * 0.45 - group.current.rotation.y) * k
    group.current.rotation.x += (-mouse.y * 0.35 - group.current.rotation.x) * k
    // Collapse away as devil mode takes over.
    const s = Math.max(0.0001, 1 - l.devil)
    group.current.scale.setScalar(s)
    group.current.visible = s > 0.01
  })

  return (
    <group ref={group}>
      <points ref={spin} geometry={geo} material={mat} />
      {/* Hot core at the centre */}
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ff4a1c" toneMapped={false} />
      </mesh>
    </group>
  )
}
