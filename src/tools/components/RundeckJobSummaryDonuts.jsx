import React from 'react'
import { evaluationDonutMetrics } from './rundeckEvaluationDonutMetrics.js'
import './RundeckJobSummaryDonuts.css'

function Donut({ metric }) {
  const { title, amount, ratio, detail, footer, available, source } = metric
  return <article className={'sphereJobDonutCard' + (available ? '' : ' is-unavailable')}
    aria-label={title + ': ' + (available ? amount + '. ' + detail : 'Signal unavailable') + '. ' + source}
    title={source}>
    <div className="sphereJobDonutRing" role="img"
      aria-label={ratio === null ? 'No percentage denominator' : ratio.toFixed(1) + ' percent of saved evaluated workloads'}
      style={{ '--sphere-job-ring-pct': (ratio === null ? 0 : ratio) + '%' }}>
      <span>{available ? amount : '—'}</span>
    </div>
    <div className="sphereJobDonutCopy">
      <strong>{title}</strong>
      <span className="sphereJobDonutDetail">{detail}</span>
      <small>{available ? footer : 'Not collected in evaluation'}</small>
    </div>
  </article>
}

export default function RundeckJobSummaryDonuts({ evaluation = null, evaluationVerified = false }) {
  const metrics = evaluationVerified ? evaluationDonutMetrics(evaluation) : []
  if (!metrics.length) return <section className="sphereJobDonuts is-unavailable"
    aria-label="Evaluation signal overview unavailable">
    <p role="status">Evaluation signals unavailable</p>
  </section>
  return <section className="sphereJobDonuts"
    aria-label="Four saved 24h evaluation signals not duplicated by top status counters">
    {metrics.map(metric => <Donut key={metric.title} metric={metric} />)}
  </section>
}
