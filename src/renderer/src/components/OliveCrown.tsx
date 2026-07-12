/**
 * Decorative olive branches draped across the top of the app, with a faint
 * glow rising behind them. Purely ornamental: aria-hidden, pointer-events
 * none, colored entirely from theme variables.
 *
 * Botany notes (modeled on watercolor olive-branch references):
 * - leaves are lanceolate — pointed at both ends — and ATTACH at their base,
 *   growing off the stem at alternating sides, roughly following the stem's
 *   tangent fanned outward
 * - sizes and angles vary; leaves near the tip run shorter
 * - olives grow in small pairs (one larger, one smaller) on a short stalk
 *   nestled into the foliage
 *
 * All positions are sampled from the stem's actual cubic bezier, so leaves
 * are mathematically on the stem. Variation is deterministic (index-hashed),
 * never random, so renders are stable.
 */

// ── stem geometry ────────────────────────────────────────────────────────
const P0 = { x: -30, y: 12 }
const P1 = { x: 170, y: 2 }
const P2 = { x: 420, y: 20 }
const P3 = { x: 690, y: 42 }

function bez(t: number): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y
  }
}

function tangentDeg(t: number): number {
  const u = 1 - t
  const dx = 3 * u * u * (P1.x - P0.x) + 6 * u * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x)
  const dy = 3 * u * u * (P1.y - P0.y) + 6 * u * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y)
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

// deterministic “hand jitter” from an index
function jitter(i: number, span: number): number {
  return ((((i * 73) % 17) - 8) / 8) * span
}

// ── leaf ─────────────────────────────────────────────────────────────────
/** Lanceolate leaf: base at (0,0), tip at (len,0), widest a third along. */
function leafPath(len: number, width: number): string {
  return [
    `M 0 0`,
    `C ${len * 0.22} ${-width}, ${len * 0.6} ${-width * 0.72}, ${len} 0`,
    `C ${len * 0.6} ${width * 0.72}, ${len * 0.22} ${width}, 0 0`,
    'Z'
  ].join(' ')
}

function Leaf(props: { x: number; y: number; angle: number; len: number; tone: 'a' | 'b' }) {
  return (
    <path
      className={props.tone === 'a' ? 'olive-leaf' : 'olive-leaf olive-leaf-soft'}
      d={leafPath(props.len, props.len * (props.tone === 'a' ? 0.2 : 0.24))}
      transform={`translate(${props.x} ${props.y}) rotate(${props.angle})`}
    />
  )
}

// ── olives: a nestled pair on a short curving stalk ──────────────────────
function OlivePair(props: { x: number; y: number; flip: boolean }) {
  const s = props.flip ? -1 : 1
  return (
    <g transform={`translate(${props.x} ${props.y})`}>
      <path
        className="olive-stemlet"
        d={`M 0 0 q ${3 * s} 5 ${1.5 * s} 10 M ${1 * s} 5 q ${4 * s} 2 ${6 * s} 7`}
        fill="none"
      />
      <ellipse
        className="olive-fruit"
        cx={1.5 * s}
        cy={13}
        rx={4.6}
        ry={5.4}
        transform={`rotate(${8 * s} ${1.5 * s} 13)`}
      />
      <ellipse className="olive-fruit olive-fruit-young" cx={7.5 * s} cy={13.5} rx={3.2} ry={3.8} />
      <circle className="olive-shine" cx={0.2 * s} cy={10.8} r={1.2} />
    </g>
  )
}

// ── branch assembly ──────────────────────────────────────────────────────
interface LeafSpec {
  x: number
  y: number
  angle: number
  len: number
  tone: 'a' | 'b'
}

function buildLeaves(): LeafSpec[] {
  const leaves: LeafSpec[] = []
  // 11 stations along the stem; alternate sides; occasional near-pair like
  // the reference's clustered leaves
  const ts = [0.04, 0.11, 0.18, 0.25, 0.32, 0.39, 0.46, 0.53, 0.6, 0.67, 0.74, 0.81, 0.88, 0.94]
  ts.forEach((t, i) => {
    const p = bez(t)
    const tan = tangentDeg(t)
    const side = i % 2 === 0 ? -1 : 1
    // leaves shrink toward the tip; jitter length and spread by index
    const len = 40 - t * 11 + jitter(i, 4)
    const spread = 46 + jitter(i + 3, 12)
    leaves.push({
      x: p.x,
      y: p.y,
      angle: tan + side * spread,
      len,
      tone: i % 3 === 0 ? 'b' : 'a'
    })
    // every other station grows a second, shorter leaf on the other side,
    // slightly behind — the near-opposite pairs of the reference
    if (i % 2 === 1) {
      const p2 = bez(t + 0.02)
      leaves.push({
        x: p2.x,
        y: p2.y,
        angle: tan - side * (spread - 8),
        len: len * 0.78,
        tone: 'b'
      })
    }
  })
  // terminal pair: two leaves closing the sprig in a V, like the reference tips
  const tip = bez(0.99)
  const tipTan = tangentDeg(0.99)
  leaves.push({ x: tip.x, y: tip.y, angle: tipTan + 20, len: 30, tone: 'a' })
  leaves.push({ x: tip.x, y: tip.y, angle: tipTan - 16, len: 26, tone: 'b' })
  return leaves
}

const LEAVES = buildLeaves()
const OLIVE_1 = bez(0.36)
const OLIVE_2 = bez(0.74)

function Branch() {
  return (
    <g>
      {/* stem, drawn in two strokes so it visibly tapers toward the tip */}
      <path
        className="olive-stem"
        d={`M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`}
        fill="none"
      />
      <path
        className="olive-stem olive-stem-tip"
        d={`M ${bez(0.62).x} ${bez(0.62).y} C ${bez(0.75).x} ${bez(0.75).y}, ${bez(0.88).x} ${
          bez(0.88).y
        }, ${P3.x} ${P3.y}`}
        fill="none"
      />
      {LEAVES.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
      <OlivePair x={OLIVE_1.x} y={OLIVE_1.y} flip={false} />
      <OlivePair x={OLIVE_2.x} y={OLIVE_2.y} flip />
    </g>
  )
}

export default function OliveCrown() {
  return (
    <div className="olive-crown" aria-hidden="true">
      <div className="olive-glow" />
      <svg className="olive-svg" viewBox="0 -12 1440 108" preserveAspectRatio="xMidYMin slice">
        <defs>
          {/* two-tone “watercolor” fills — darker rim reading, lighter heart */}
          <linearGradient id="oliveLeafA" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0" style={{ stopColor: 'var(--olive-leaf-deep)' }} />
            <stop offset="1" style={{ stopColor: 'var(--olive-leaf-light)' }} />
          </linearGradient>
          <linearGradient id="oliveLeafB" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0" style={{ stopColor: 'var(--olive-leaf-light)' }} />
            <stop offset="1" style={{ stopColor: 'var(--olive-leaf-pale)' }} />
          </linearGradient>
        </defs>
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
