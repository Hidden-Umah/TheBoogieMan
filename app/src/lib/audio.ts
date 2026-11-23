// Live audio level pushed by the brain (mic while you talk, his voice while he speaks).
// A plain mutable object so the 3D scene can read it every frame without React re-renders.
export const audio = { level: 0, at: 0, source: 'voice' as 'mic' | 'voice' }

export function setLevel(level: number, source: 'mic' | 'voice') {
  audio.level = level
  audio.source = source
  audio.at = performance.now()
}
