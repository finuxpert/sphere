import React from 'react'
import './RundeckJobSummaryDonuts.css'

const API = import.meta.env.BASE_URL + 'api/jobs/overview?days=1'
const number = value => Number(value || 0).toLocaleString('en-US')
const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
const share = (numerator, denominator) => denominator > 0 ? clamp(numerator / denominator * 100) : null
const runtimeLabel = seconds => {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '—'
  const total = Math.max(0, Math.round(Number(seconds)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const remain = total % 60
  return hours ? hours + 'h ' + String(minutes).padStart(2, '0') + 'm' :
    minutes + 'm ' + String(remain).padStart(2, '0') + 's'
}

function Donut({ title, amount, ratio, detail, footer, available, ariaSource }) {
  return <article className={'sphereJobDonutCard' + (available ? '' : ' is-unavailable')}
    aria-label={title + ': ' + (available ? amount + '. ' + detail : footer) + '. ' + ariaSource}
    title={ariaSource}>
    <div className="sphereJobDonutRing" role="img"
      aria-label={ratio === null ? 'Breakdown unavailable' : ratio.toFixed(1) + ' percent of described denominator'}
      style={{ '--sphere-job-ring-pct': (ratio === null ? 0 : ratio) + '%' }}>
      <span>{available ? amount : '—'}</span>
    </div>
    <div className="sphereJobDonutCopy">
      <strong>{title}</strong>
      <span className="sphereJobDonutDetail">{available ? detail : footer}</span>
      {available && footer && <small>{footer}</small>}
    </div>
  </article>
}

export default function RundeckJobSummaryDonuts({ refreshToken = '', evaluation = null, evaluationVerified = false }) {
  const [state, setState] = React.useState({ loading: true, result: null, error: '' })
  React.useEffect(() => {
    const controller = new AbortController()
    setState(previous => ({ ...previous, loading: true, error: '' }))
    fetch(API, { cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('SM37 overview unavailable (' + response.status + ')')
        return response.json()
      })
      .then(result => {
        if (!controller.signal.aborted) setState({ loading: false, result, error: '' })
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ loading: false, result: null, error: error.message })
      })
    return () => controller.abort()
  }, [refreshToken])

  const metrics = state.result?.source?.authoritative === true && state.result?.complete === true
    ? state.result.metrics : null
  const executions = Math.max(0, Number(metrics?.executions) || 0)
  const completed = Math.max(0, Number(metrics?.completed) || 0)
  const failed = Math.max(0, Number(metrics?.failed) || 0)
  const durationCount = Math.max(0, Number(metrics?.durations) || 0)
  const uniqueJobs = Math.max(0, Number(metrics?.unique_jobs) || 0)
  const runtime = metrics?.avg_runtime_seconds
  const sourceAvailable = Boolean(metrics) && executions > 0
  const sourceNote = state.loading ? 'Checking SM37…' :
    state.error ? 'SM37 unavailable' :
    !metrics ? 'SM37 not configured' : 'No runs in 24h'
  const candidates = evaluationVerified && evaluation
    ? Math.max(0, Number(evaluation.review) || 0) + Math.max(0, Number(evaluation.attention) || 0)
    : null
  const review = Math.max(0, Number(evaluation?.review) || 0)
  const watch = Math.max(0, Number(evaluation?.attention) || 0)
  return <section className="sphereJobDonuts" aria-label="Four source-backed job and program indicators">
    <Donut title="Avg Runtime" amount={runtimeLabel(runtime)}
      available={sourceAvailable && durationCount > 0 && runtime !== null}
      ratio={sourceAvailable ? share(durationCount, completed) : null}
      detail={'Completed jobs · ' + number(durationCount) + ' measured'}
      footer={sourceAvailable ? 'Ring: duration coverage' : sourceNote}
      ariaSource="SM37 24h. Duration is start to end, averaged across finished executions with timestamps." />
    <Donut title="Error Count" amount={number(failed)}
      available={sourceAvailable}
      ratio={sourceAvailable ? share(failed, failed + completed) : null}
      detail={number(failed) + ' failed · ' + number(completed) + ' completed'}
      footer={sourceAvailable ? 'Ring: failed share of terminal' : sourceNote}
      ariaSource="SM37 24h unique executions with failure statuses, not inferred Work Process errors." />
    <Donut title="Execution Frequency" amount={number(executions)}
      available={sourceAvailable}
      ratio={sourceAvailable ? share(Math.max(0, executions - uniqueJobs), executions) : null}
      detail={number(uniqueJobs) + ' distinct jobs/clients'}
      footer={sourceAvailable ? 'Ring: repeat executions' : sourceNote}
      ariaSource="SM37 24h count of unique imported execution identities, not sampled collection frequency." />
    <Donut title="Review Candidates" amount={number(candidates)}
      available={candidates !== null}
      ratio={candidates === null ? null : share(review, candidates)}
      detail={number(review) + ' Review · ' + number(watch) + ' Watch'}
      footer={candidates === null ? 'Evaluation unavailable' : 'Ring: Review share'}
      ariaSource="Saved 24h evaluation classifications, separate from SM37 execution results." />
  </section>
}
