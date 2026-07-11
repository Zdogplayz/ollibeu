/**
 * Decorative olive branches draped across the top of the app, with a faint
 * glow rising behind them. Purely ornamental: aria-hidden, pointer-events
 * none, and colored entirely from theme variables so day and night both work.
 *
 * Geometry notes: one branch is drawn (stem, twigs, leaf pairs, three olives)
 * and mirrored for the right side. Leaves are slender rotated ellipses placed
 * at hand-tuned stations along the stem; angles roughly follow the stem's
 * tangent, fanned ±38° to read as opposite leaf pairs.
 */

interface LeafStation {
  x: number
  y: number
  tangent: number // stem direction at this point, degrees
}

const STATIONS: LeafStation[] = [
  { x: 60, y: 13, tangent: -3 },
  { x: 165, y: 17, tangent: 2 },
  { x: 265, y: 22, tangent: 6 },
  { x: 360, y: 28, tangent: 9 },
  { x: 455, y: 36, tangent: 11 },
  { x: 550, y: 45, tangent: 14 },
  { x: 635, y: 54, tangent: 17 }
]

const TWIG_STATIONS: LeafStation[] = [
  { x: 395, y: 42, tangent: 38 },
  { x: 435, y: 52, tangent: 42 }
]

function Leaf(props: { x: number; y: number; angle: number; tone: 'a' | 'b' }) {
  return (
    <ellipse
      className={props.tone === 'a' ? 'olive-leaf' : 'olive-leaf olive-leaf-soft'}
      cx={props.x}
      cy={props.y}
      rx={15}
      ry={3.6}
      transform={`rotate(${props.angle} ${props.x} ${props.y})`}
    />
  )
}

function Olive(props: { x: number; y: number }) {
  // stemlet starts on the branch and the fruit hangs clearly below it
  return (
    <g>
      <path
        className="olive-stemlet"
        d={`M ${props.x} ${props.y} q 1.6 5 0.6 9`}
        fill="none"
      />
      <ellipse className="olive-fruit" cx={props.x + 0.4} cy={props.y + 14} rx={5} ry={6.4} />
      <circle className="olive-shine" cx={props.x - 1.2} cy={props.y + 11.4} r={1.4} />
    </g>
  )
}

function Branch() {
  return (
    <g>
      {/* main stem: eases in from the corner and droops toward center */}
      <path
        className="olive-stem"
        d="M -30 14 C 170 4, 420 22, 690 58"
        fill="none"
      />
      {/* two short twigs peeling downward off the stem */}
      <path className="olive-stem olive-twig" d="M 355 28 C 390 36, 420 46, 445 58" fill="none" />
      <path className="olive-stem olive-twig" d="M 520 42 C 548 50, 572 58, 590 66" fill="none" />
      {STATIONS.map((s, i) => (
        <g key={i}>
          <Leaf x={s.x} y={s.y - 5} angle={s.tangent - 38} tone={i % 2 ? 'a' : 'b'} />
          <Leaf x={s.x + 14} y={s.y + 6} angle={s.tangent + 38} tone={i % 2 ? 'b' : 'a'} />
        </g>
      ))}
      {TWIG_STATIONS.map((s, i) => (
        <g key={`t${i}`}>
          <Leaf x={s.x} y={s.y} angle={s.tangent - 30} tone="b" />
          <Leaf x={s.x + 10} y={s.y + 9} angle={s.tangent + 26} tone="a" />
        </g>
      ))}
      {/* a tip leaf so the branch ends in a point, not a bare line */}
      <Leaf x={686} y={56} angle={22} tone="a" />
      <Olive x={300} y={24} />
      <Olive x={505} y={44} />
      <Olive x={628} y={57} />
    </g>
  )
}

export default function OliveCrown() {
  return (
    <div className="olive-crown" aria-hidden="true">
      <div className="olive-glow" />
      <svg
        className="olive-svg"
        viewBox="0 0 1440 96"
        preserveAspectRatio="xMidYMin slice"
      >
        <g className="olive-sway">
          <Branch />
        </g>
        {/* the animated group must carry NO attribute transform (CSS rotate
            and SVG attribute transforms compose in different unit spaces);
            the mirror lives on an inner group instead */}
        <g className="olive-sway olive-sway-right">
          <g transform="translate(1440 0) scale(-1 1)">
            <Branch />
          </g>
        </g>
      </svg>
    </div>
  )
}
