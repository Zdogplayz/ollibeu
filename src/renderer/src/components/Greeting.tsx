import { greetingFor } from '@shared/dayText'

export default function Greeting(props: {
  name: string
  now: Date
  night: boolean
  quote: string | null
}) {
  const dateLine =
    props.now.toLocaleDateString(undefined, { weekday: 'long' }) +
    ', ' +
    props.now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return (
    <header className="greeting">
      <div className="date-line">{dateLine}</div>
      <h1>
        {greetingFor(props.now, props.night)}
        {props.name ? `, ${props.name}` : ''} {props.night ? '🌙' : '🌿'}
      </h1>
      {props.quote && <div className="quote">"{props.quote}"</div>}
    </header>
  )
}
