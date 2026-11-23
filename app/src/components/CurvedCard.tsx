/**
 * A card bent like part of a round screen. The wing it sits in is rotated in 3D
 * (see .wing in index.css); the frame itself has curved top and bottom edges.
 */
export default function CurvedCard({
  side,
  n,
  title,
  right,
  className = '',
  children,
}: {
  side: 'left' | 'right'
  n: string
  title: string
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  // Outer edge is straight; top and bottom arc toward the inner edge.
  const d =
    side === 'left'
      ? 'M0,1 Q55,-1.5 100,5 L100,95 Q55,101.5 0,99 Z'
      : 'M0,5 Q45,-1.5 100,1 L100,99 Q45,101.5 0,95 Z'
  const edge =
    side === 'left' ? 'M0,1 Q55,-1.5 100,5 M100,95 Q55,101.5 0,99' : 'M0,5 Q45,-1.5 100,1 M100,99 Q45,101.5 0,95'
  return (
    <section className={`ccard ccard-${side} ${className}`}>
      <svg className="ccard-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d={d} className="cf-fill" />
        <path d={d} className="cf-line" vectorEffect="non-scaling-stroke" />
        <path d={edge} className="cf-edge" vectorEffect="non-scaling-stroke" />
      </svg>
      <header className="ccard-head">
        <span>
          <b>{n}</b> {title}
        </span>
        {right}
      </header>
      <div className="ccard-body">{children}</div>
    </section>
  )
}
