// State the curved HUD screens draw from. A plain mutable object: the screens
// redraw on their own clock, so React only writes here and never re-renders them.
import type { Mode } from '../types'

export type Exchange = { id: number; you: string; him: string; at: number }
export type Fact = { id: string; text: string; at: string }

export const hud = {
  exchanges: [] as Exchange[],
  facts: [] as Fact[],
  fresh: null as string | null,
  freshAt: 0,
  thinking: false,
  heard: 0,
  spoken: 0,
  mode: 'normal' as Mode,
  bg: true, // background video on/off (Ctrl+B)
  bgName: savedBg(),
  bgMissing: null as string | null,
}

function savedBg(): string {
  try {
    return localStorage.getItem('bg') || 'nebula'
  } catch {
    return 'nebula'
  }
}

export function saveBg(name: string) {
  try {
    localStorage.setItem('bg', name)
  } catch {
    /* storage unavailable: fine, it just won't be remembered */
  }
}
