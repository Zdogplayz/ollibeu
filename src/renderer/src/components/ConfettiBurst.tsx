const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * 2 * Math.PI
  const radius = 34 + (i % 3) * 14
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius - 10,
    rot: (i % 2 ? 1 : -1) * (120 + i * 20),
    color: (['high', 'medium', 'low', 'accent'] as const)[i % 4]
  }
})

export default function ConfettiBurst() {
  return (
    <span className="confetti" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`confetti-piece confetti-${p.color}`}
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
