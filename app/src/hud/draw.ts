// Canvas drawing for the curved HUD screens. Each screen is a canvas texture
// wrapped onto a cylinder segment, so everything here bends with the screen.
import { channels, type Source } from '../lib/audio'
import { hud } from './store'

export type Palette = { fg: string; dim: string; muted: string; faint: string; accent: string; fill: string; edge: string }

export const PALETTES: Record<'normal' | 'devil', Palette> = {
  normal: {
    fg: '#eceae6',
    dim: 'rgba(236,234,230,0.66)',
    muted: 'rgba(236,234,230,0.38)',
    faint: 'rgba(236,234,230,0.12)',
    accent: '#ff4a1c',
    fill: 'rgba(14,14,16,0.74)',
    edge: 'rgba(236,234,230,0.22)',
  },
  devil: {
    fg: '#ffd9d9',
    dim: 'rgba(255,217,217,0.7)',
    muted: 'rgba(255,140,140,0.45)',
    faint: 'rgba(255,60,60,0.16)',
    accent: '#ff1030',
    fill: 'rgba(24,4,8,0.74)',
    edge: 'rgba(255,40,40,0.45)',
  },
}

const MONO = '"JetBrains Mono", ui-monospace, monospace'
export const PAD = 46

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Glass panel, edge, corner ticks and the "01 TITLE" header. Returns the content top. */
export function frame(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, n: string, title: string, right?: { text: string; hot?: boolean }) {
  ctx.clearRect(0, 0, w, h)
  roundRect(ctx, 6, 6, w - 12, h - 12, 34)
  ctx.fillStyle = p.fill
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = p.edge
  ctx.stroke()
  // Corner ticks
  ctx.strokeStyle = p.fg
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 3
  const t = 34
  for (const [x, y, dx, dy] of [
    [6, 6, 1, 1],
    [w - 6, 6, -1, 1],
    [6, h - 6, 1, -1],
    [w - 6, h - 6, -1, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x + dx * 34, y)
    ctx.lineTo(x + dx * 34 + dx * t, y)
    ctx.moveTo(x, y + dy * 34)
    ctx.lineTo(x, y + dy * 34 + dy * t)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // Header
  ctx.textBaseline = 'middle'
  ctx.font = `500 26px ${MONO}`
  ctx.fillStyle = p.muted
  ctx.fillText(n, PAD, PAD + 8)
  ctx.fillStyle = p.dim
  ctx.fillText(spaced(title), PAD + 54, PAD + 8)
  if (right) {
    ctx.textAlign = 'right'
    ctx.fillStyle = right.hot ? p.accent : p.muted
    ctx.fillText(spaced(right.text), w - PAD, PAD + 8)
    ctx.textAlign = 'left'
  }
  ctx.fillStyle = p.faint
  ctx.fillRect(PAD, PAD + 34, w - PAD * 2, 2)
  return PAD + 58
}

function spaced(s: string) {
  return s
}

/** Word-wraps `text` into lines that fit `max` px with the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > max && line) {
        lines.push(line)
        line = word
      } else line = test
    }
    lines.push(line)
  }
  return lines
}

// ───────────────────────── 01 / 02: voice patterns ─────────────────────────

const shown: Record<Source, number[]> = { mic: new Array(24).fill(0), voice: new Array(24).fill(0) }

export function drawVoice(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, source: Source) {
  const c = channels[source]
  const now = performance.now()
  const live = now - c.at < 400
  const active = live && c.level > 0.05
  const top = frame(ctx, w, h, p, source === 'mic' ? '01' : '02', source === 'mic' ? 'YOUR VOICE' : 'BOOGEYMAN', {
    text: active ? `${Math.round(c.level * 100)}%` : 'IDLE',
    hot: active,
  })
  const t = now / 1000
  const footH = 56
  const bottom = h - PAD - footH
  const specH = (bottom - top) * 0.6
  const rows = 12
  const cols = c.bands.length
  const gx = (w - PAD * 2) / cols
  const gy = specH / rows
  const r = Math.min(gx, gy) * 0.24
  const s = shown[source]
  for (let i = 0; i < cols; i++) {
    const idle = 0.05 + 0.04 * Math.sin(t * 2 + i * 0.6)
    const target = live ? c.bands[i] : idle
    s[i] += (target - s[i]) * (target > s[i] ? 0.5 : 0.12)
    const lit = Math.round(s[i] * rows)
    for (let row = 0; row < rows; row++) {
      const on = rows - row <= lit
      const peak = on && rows - row === lit && lit > 3
      ctx.beginPath()
      ctx.arc(PAD + gx * i + gx / 2, top + gy * row + gy / 2, on ? r : r * 0.42, 0, Math.PI * 2)
      ctx.fillStyle = peak ? p.accent : p.fg
      ctx.globalAlpha = on ? 0.95 : 0.14
      ctx.fill()
    }
  }
  // Loudness trace
  const tTop = top + specH + 18
  const mid = tTop + (bottom - tTop) / 2
  const half = (bottom - tTop) / 2 - 4
  const hist = c.history
  const step = (w - PAD * 2) / hist.length
  ctx.globalAlpha = 0.18
  ctx.fillStyle = p.fg
  ctx.fillRect(PAD, mid, w - PAD * 2, 2)
  for (let i = 0; i < hist.length; i++) {
    const amp = Math.max(0.02, hist[i]) * half
    ctx.globalAlpha = 0.3 + 0.7 * (i / hist.length)
    ctx.fillStyle = live && i > hist.length - 8 && hist[i] > 0.25 ? p.accent : p.fg
    for (let y = -amp; y <= amp; y += 9) ctx.fillRect(PAD + i * step, mid + y, Math.max(2, step * 0.5), 3.5)
  }
  ctx.globalAlpha = 1
  // Footer
  ctx.fillStyle = p.faint
  ctx.fillRect(PAD, h - PAD - footH + 8, w - PAD * 2, 2)
  ctx.font = `400 22px ${MONO}`
  ctx.fillStyle = p.muted
  ctx.textBaseline = 'middle'
  ctx.fillText(spaced(source === 'mic' ? 'MIC · 16 kHz' : 'VOICE · 24 kHz'), PAD, h - PAD - 16)
  ctx.textAlign = 'right'
  ctx.fillText(spaced(source === 'mic' ? `${hud.heard} HEARD` : `${hud.spoken} SPOKEN`), w - PAD, h - PAD - 16)
  ctx.textAlign = 'left'
}

// ───────────────────────── 03: response ─────────────────────────

const CPS = 24 // typing speed, roughly speaking pace

export function drawResponse(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) {
  const now = performance.now()
  const top = frame(ctx, w, h, p, '03', hud.mode === 'devil' ? 'INTEL' : 'RESPONSE', hud.thinking ? { text: 'THINKING', hot: true } : undefined)
  const maxW = w - PAD * 2
  const bottom = h - PAD
  // Lay out newest-first from the bottom up, so the latest is always in view.
  type Block = { lines: string[]; font: string; color: string; lh: number; gap: number; caret?: boolean; tag?: boolean }
  const blocks: Block[] = []
  const xs = hud.exchanges
  for (let k = xs.length - 1; k >= 0 && blocks.length < 10; k--) {
    const e = xs[k]
    const current = k === xs.length - 1
    if (e.him) {
      ctx.font = `400 ${current ? 36 : 28}px ${MONO}`
      const n = current ? Math.min(e.him.length, Math.floor(((now - e.at) / 1000) * CPS)) : e.him.length
      blocks.push({
        lines: wrap(ctx, e.him.slice(0, n), maxW),
        font: ctx.font,
        color: current ? p.fg : p.muted,
        lh: current ? 52 : 40,
        gap: 26,
        caret: current && n < e.him.length,
      })
    }
    if (e.you) {
      ctx.font = `400 24px ${MONO}`
      blocks.push({ lines: wrap(ctx, `YOU › ${e.you}`, maxW), font: ctx.font, color: current ? p.dim : p.muted, lh: 34, gap: 10, tag: true })
    }
  }
  if (hud.thinking) blocks.unshift({ lines: ['···'], font: `700 40px ${MONO}`, color: p.accent, lh: 50, gap: 20 })

  ctx.save()
  ctx.beginPath()
  ctx.rect(PAD - 4, top, maxW + 8, bottom - top)
  ctx.clip()
  let y = bottom
  for (const b of blocks) {
    y -= b.gap
    for (let i = b.lines.length - 1; i >= 0; i--) {
      y -= b.lh
      if (y < top - b.lh) break
      const fade = Math.min(1, Math.max(0, (y - top) / 120))
      ctx.globalAlpha = fade
      ctx.font = b.font
      ctx.textBaseline = 'top'
      let x = PAD
      let line = b.lines[i]
      if (b.tag && i === 0 && line.startsWith('YOU › ')) {
        ctx.fillStyle = p.accent
        ctx.fillText('YOU ›', x, y)
        x += ctx.measureText('YOU › ').width
        line = line.slice(6)
      }
      ctx.fillStyle = b.color
      ctx.fillText(line, x, y)
      if (b.caret && i === b.lines.length - 1 && Math.floor(now / 450) % 2 === 0) {
        const cw = ctx.measureText(line).width
        ctx.fillStyle = p.accent
        ctx.fillRect(x + cw + 6, y + 6, 18, 36)
      }
    }
    if (y < top) break
  }
  ctx.restore()
  ctx.globalAlpha = 1
  if (xs.length === 0 && !hud.thinking) {
    ctx.font = `400 26px ${MONO}`
    ctx.fillStyle = p.muted
    ctx.textBaseline = 'top'
    wrap(ctx, 'Say something, boss. His words appear here.', maxW).forEach((l, i) => ctx.fillText(l, PAD, top + 10 + i * 38))
  }
}

// ───────────────────────── 04: memory ─────────────────────────

export function drawMemory(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) {
  const now = performance.now()
  const top = frame(ctx, w, h, p, '04', 'MEMORY', { text: `${hud.facts.length} FACTS` })
  const maxW = w - PAD * 2 - 34
  let y = top + 4
  ctx.textBaseline = 'top'
  if (hud.facts.length === 0) {
    ctx.font = `400 26px ${MONO}`
    ctx.fillStyle = p.muted
    wrap(ctx, 'Nothing yet. Try: "remember that I love jollof".', maxW + 34).forEach((l, i) => ctx.fillText(l, PAD, y + 6 + i * 38))
    return
  }
  for (const f of [...hud.facts].reverse()) {
    if (y > h - PAD - 40) break
    const fresh = f.id === hud.fresh && now - hud.freshAt < 6000
    const k = fresh ? Math.min(1, (now - hud.freshAt) / 500) : 1
    ctx.font = `400 26px ${MONO}`
    const lines = wrap(ctx, f.text, maxW)
    const blockH = lines.length * 36 + 18
    if (fresh) {
      ctx.globalAlpha = 0.16 * (1 - Math.max(0, (now - hud.freshAt - 2500) / 3500))
      ctx.fillStyle = p.accent
      ctx.fillRect(PAD - 10, y - 4, w - PAD * 2 + 20, blockH)
    }
    ctx.globalAlpha = k
    ctx.beginPath()
    ctx.arc(PAD + 8, y + 17, 6, 0, Math.PI * 2)
    ctx.fillStyle = fresh ? p.accent : p.fg
    ctx.fill()
    ctx.fillStyle = fresh ? p.fg : p.dim
    lines.forEach((l, i) => ctx.fillText(l, PAD + 34 + (1 - k) * 30, y + i * 36))
    ctx.globalAlpha = 1
    y += blockH
    ctx.fillStyle = p.faint
    ctx.fillRect(PAD, y - 10, w - PAD * 2, 2)
  }
}
