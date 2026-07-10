export default function TodayRail(props: { night: boolean }) {
  return (
    <aside className="today-rail">
      <div className="section-label">Today</div>
      <p className="placeholder-copy">
        Your calendar will live here once Google is connected — appointments, gentle
        "leave by" nudges, and what tomorrow looks like.
      </p>
      <p className="placeholder-copy">{props.night ? 'Rest is productive too. ✨' : 'One thing at a time. 🍃'}</p>
    </aside>
  )
}
