/**
 * Everything in front of you sits on the inside of a gently curved screen, like the side screens:
 * a panel turns to face you by how far left or right it sits, and its outer edge comes toward you,
 * so you can "look" left and right. Use with a parent that has `perspective` set.
 */
const BEND = 52 // degrees of turn per screen width away from centre
const PULL = 220 // px a panel at the very edge comes toward you

/** CSS transform for a panel at `left`% with `width`% across its parent. */
export function bend(left: number, width: number): string {
  const u = (left + width / 2) / 100 - 0.5 // -0.5 (left) … 0.5 (right)
  return `translateZ(${(u * u * 4 * PULL).toFixed(1)}px) rotateY(${(-u * BEND).toFixed(2)}deg)`
}
