import type { Task } from '@shared/types'

export default function JustOneThing(props: {
  task: Task
  pinned: boolean
  onStart: () => void
  onShuffle: () => void
  onComplete: () => void
}) {
  return (
    <section className="card one-thing">
      <div className="section-label">Just one thing</div>
      <div className="title">{props.task.title}</div>
      {!!props.task.estimateMinutes && (
        <div className="estimate">~{props.task.estimateMinutes} minutes, and it’s off your mind</div>
      )}
      <div className="actions">
        {props.pinned ? (
          <button className="pill-button" onClick={props.onComplete}>
            done ✓
          </button>
        ) : (
          <button className="pill-button" onClick={props.onStart}>
            I’ll do this one →
          </button>
        )}
        <button className="pill-button quiet" onClick={props.onShuffle}>
          not this one
        </button>
      </div>
    </section>
  )
}
