// Procedural cyborg eyeball. Everything is computed from the sphere's object-space
// position, so the iris always sits on the +Z pole and rotating the mesh "looks".

export const eyeVertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

export const eyeFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPupil;     // pupil radius in iris units (0..1)
  uniform float uEnergy;    // 0 idle .. 1 intense
  uniform vec3  uAccent;
  varying vec3 vPos;
  varying vec3 vNormalV;
  varying vec3 vViewDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec3 p = normalize(vPos);
    float ang = acos(clamp(p.z, -1.0, 1.0));   // 0 at the front of the eye
    float r = ang / 0.62;                       // iris spans r in [0, 1]
    float th = atan(p.y, p.x);

    // ── Sclera: dark gunmetal with machined panel lines ──
    vec3 sclera = vec3(0.030, 0.032, 0.036);
    float lon = smoothstep(0.985, 1.0, abs(cos(th * 8.0)));
    float lat = smoothstep(0.975, 1.0, abs(cos(ang * 14.0)));
    sclera += vec3(0.11) * max(lon * 0.5, lat * 0.35) * smoothstep(1.15, 1.6, r);

    // ── Iris: radial fibres in the accent colour ──
    float f1 = noise(vec2(th * 22.0, r * 5.0));
    float f2 = noise(vec2(th * 70.0, r * 16.0 - uTime * 0.15));
    float fib = f1 * 0.65 + f2 * 0.35;
    vec3 iris = uAccent * (0.10 + fib * (0.55 + uEnergy * 0.6));
    iris *= mix(1.4, 0.45, smoothstep(uPupil, 1.0, r));

    // Mechanical shutter segments and a fine engraved ring
    float seg = step(0.55, fract(th / 6.28318 * 36.0 + uTime * 0.05)) * exp(-pow((r - 0.80) * 38.0, 2.0));
    iris += vec3(0.9) * seg * 0.22;
    iris += vec3(0.7) * exp(-pow((r - 0.62) * 90.0, 2.0)) * 0.25;

    // Collar glow just outside the pupil
    iris += uAccent * exp(-pow((r - uPupil - 0.07) * 16.0, 2.0)) * (1.2 + uEnergy * 1.5);

    // Dark limbus at the iris edge, then blend into sclera
    iris = mix(iris, vec3(0.0), smoothstep(0.86, 1.0, r) * 0.9);
    vec3 col = mix(iris, sclera, smoothstep(0.99, 1.03, r));

    // Pupil + its hot rim
    col = mix(col, vec3(0.0), smoothstep(uPupil, uPupil - 0.025, r));
    col += uAccent * exp(-pow((r - uPupil) * 70.0, 2.0)) * 2.2;

    // Cool fresnel rim so the ball reads as 3D against black space
    float fres = pow(1.0 - max(dot(vNormalV, vViewDir), 0.0), 3.5);
    col += vec3(0.62, 0.66, 0.72) * fres * 0.45;

    // Glassy specular highlight from a fixed key light (upper left)
    vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
    vec3 H = normalize(L + vViewDir);
    float spec = pow(max(dot(vNormalV, H), 0.0), 220.0);
    col += vec3(1.0) * spec * 1.4;
    // Soft shading so the sphere has volume
    col *= 0.55 + 0.45 * max(dot(vNormalV, L), 0.0);

    gl_FragColor = vec4(col, 1.0);
  }
`
