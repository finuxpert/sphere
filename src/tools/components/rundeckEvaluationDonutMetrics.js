/** Verified saved 1D evaluation signals, never SM37 execution counters. */
const bounded = (value, total) => Number.isSafeInteger(value) && value >= 0 && value <= total
const percent = (count, total) => total > 0 ? Number((count / total * 100).toFixed(1)) : null
const print = value => Number(value).toLocaleString('en-US')

export function evaluationDonutMetrics(preview) {
  const total = preview?.total
  const values = preview?.insights || {}
  if (!Number.isSafeInteger(total) || total < 0) return []
  const jobs = values.jobs
  const programs = values.programs
  const both = bounded(jobs, total) && bounded(programs, total) && jobs + programs === total
  const observed = [
    {
      title: 'Workload Mix',
      amount: both ? print(jobs) : '—',
      ratio: both ? percent(jobs, total) : null,
      detail: both ? print(jobs) + ' Jobs · ' + print(programs) + ' Programs' : 'Breakdown unavailable',
      footer: 'Job share of evaluated',
      available: both,
      source: 'Verified saved 1D evaluation: distinct JOB vs PROGRAM workload identities, not SAP execution frequency.',
    },
    {
      title: 'Recurring Workloads',
      count: values.recurring,
      detail: 'Repeated in collected samples',
      footer: 'Share of evaluated',
      source: 'Saved 1D performance signal recurring. This does not count SM37 job executions.',
    },
    {
      title: 'High Memory',
      count: values.highMemory,
      detail: 'Memory signal detected',
      footer: 'Share of evaluated',
      source: 'Saved 1D high_memory evaluation signal, not host memory utilization or an OOM event.',
    },
    {
      title: 'WP Signal Overlap',
      count: values.wpOverlap,
      detail: 'Critical WP evidence overlap',
      footer: 'Share of evaluated',
      source: 'Saved 1D wp_signal_overlap evaluation signal. Temporal overlap is not proof of causation.',
    },
  ]
  return observed.map(metric => {
    if (metric.title === 'Workload Mix') return metric
    const available = bounded(metric.count, total)
    return {
      ...metric,
      available,
      amount: available ? print(metric.count) : '—',
      ratio: available ? percent(metric.count, total) : null,
      detail: available ? metric.detail : 'Signal unavailable',
    }
  })
}
