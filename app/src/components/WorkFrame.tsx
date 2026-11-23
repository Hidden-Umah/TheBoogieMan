/**
 * The work screen's frame: a wide holo panel with pinched (concave) top and bottom
 * edges, chamfered corners with glowing dots, centre tabs, side notches, a neon
 * double edge and a gridded glass fill with a diagonal light streak.
 * Drawn in a 1000x600 box stretched to fit; strokes keep their width.
 */
const OUTER =
  'M12,72 L12,40 L34,20 Q250,38 404,50 L424,36 L576,36 L596,50 Q750,38 966,20 L988,40 L988,250 L978,262 L978,338 L988,350 ' +
  'L988,560 L966,580 Q750,562 596,550 L576,564 L424,564 L404,550 Q250,562 34,580 L12,560 L12,350 L22,338 L22,262 L12,250 Z'
const INNER =
  'M26,70 L26,48 L42,33 Q250,50 400,62 L412,54 L588,54 L600,62 Q750,50 958,33 L974,48 L974,258 L966,268 L966,332 L974,342 ' +
  'L974,552 L958,567 Q750,550 600,538 L588,546 L412,546 L400,538 Q250,550 42,567 L26,552 L26,342 L34,332 L34,268 L26,258 Z'

export default function WorkFrame() {
  return (
    <svg className="wframe" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="wf-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.14" />
        </linearGradient>
        <pattern id="wf-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0 L0 0 0 14" fill="none" stroke="var(--accent)" strokeOpacity="0.12" strokeWidth="0.6" />
        </pattern>
        <clipPath id="wf-clip">
          <path d={INNER} />
        </clipPath>
        <filter id="wf-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Glass, grid and the diagonal light streak */}
      <path d={INNER} fill="url(#wf-glass)" />
      <path d={INNER} fill="url(#wf-grid)" />
      <g clipPath="url(#wf-clip)">
        <path d="M120,600 L900,0" stroke="var(--accent)" strokeOpacity="0.28" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M80,600 L860,0 L1000,0 L1000,600 Z" fill="var(--accent)" fillOpacity="0.035" />
      </g>

      {/* Neon edges: a blurred glow under crisp lines */}
      <path d={OUTER} className="wf-glow" filter="url(#wf-glow)" vectorEffect="non-scaling-stroke" />
      <path d={OUTER} className="wf-edge" vectorEffect="non-scaling-stroke" />
      <path d={INNER} className="wf-inner" vectorEffect="non-scaling-stroke" />

      {/* Centre tabs */}
      <path d="M430,30 L570,30" className="wf-bar" vectorEffect="non-scaling-stroke" />
      <path d="M430,570 L570,570" className="wf-bar" vectorEffect="non-scaling-stroke" />
      <path d="M446,44 L554,44" className="wf-bar thin" vectorEffect="non-scaling-stroke" />
      <path d="M446,556 L554,556" className="wf-bar thin" vectorEffect="non-scaling-stroke" />
      {/* Side notches */}
      <path d="M8,268 L8,332 M992,268 L992,332" className="wf-bar thin" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Glowing corner dots, as HTML so they stay round however the frame stretches. */
export function WorkFrameDots() {
  return (
    <>
      <i className="wf-dot" style={{ left: '3.4%', top: '3.3%' }} />
      <i className="wf-dot" style={{ right: '3.4%', top: '3.3%' }} />
      <i className="wf-dot" style={{ left: '3.4%', bottom: '3.3%' }} />
      <i className="wf-dot" style={{ right: '3.4%', bottom: '3.3%' }} />
      <i className="wf-dot sm" style={{ left: '50%', top: '5%' }} />
      <i className="wf-dot sm" style={{ left: '50%', bottom: '5%' }} />
    </>
  )
}
