// Live audio pushed by the brain: your mic while you talk, his voice while he speaks.
// Plain mutable objects so the 3D scene and canvases can read them every frame
// without React re-renders.

export type Source = 'mic' | 'voice'

export type Channel = {
  level: number
  bands: number[]
  at: number // performance.now() of the last update
  history: number[] // recent levels, newest last (~5 s)
}

const HISTORY = 90

function channel(): Channel {
  return { level: 0, bands: new Array(24).fill(0), at: 0, history: new Array(HISTORY).fill(0) }
}

export const channels: Record<Source, Channel> = { mic: channel(), voice: channel() }

// Most recent level from either source (drives the core).
export const audio = { level: 0, at: 0, source: 'voice' as Source }

export function setLevel(level: number, source: Source) {
  audio.level = level
  audio.source = source
  audio.at = performance.now()
  const c = channels[source]
  c.level = level
  c.at = audio.at
  c.history.push(level)
  if (c.history.length > HISTORY) c.history.shift()
}

export function setSpectrum(bands: number[], source: Source) {
  const c = channels[source]
  c.bands = bands
  c.at = performance.now()
}
