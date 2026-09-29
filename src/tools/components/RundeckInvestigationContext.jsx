import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, shortHost } from './sapUiFormat.js'

const sourceMeta = (job = {}) => {
  const source = String(job.source || '').toLowerCase()
  const at = job.at ? `${formatWib(job.at, true)} WIB` : ''
  const run = job.executionId || job.execution_id || ''

  if (source === 'observation-history') {
    return {
      tone: 'history',
      label: 'HISTORY',
      detail: [run ? `Run #${run}` : '', at].filter(Boolean).join(' · '),
      note: 'Historical selection only. Current dashboard state remains live.',
    }
  }
  if (source === 'selected-time' || source === 'trend' || source === 'trend-snapshot') {
    return {
      tone: 'trend',
      label: 'TREND HISTORY',
      detail: [shortHost(job.host || ''), at].filter(Boolean).join(' · '),
      note: 'Opened from a saved point in Server Trend. The rest of the dashboard still shows current data.',
    }
  }
  if (source === 'workload-explorer') {
    return {
      tone: 'history',
      label: 'JOB & PROGRAM HISTORY',
      detail: [shortHost(job.host || ''), job.days ? `${job.days}D window` : ''].filter(Boolean).join(' · '),
      note: 'Opened from historical Job and Program performance; current dashboard state remains live.',
    }
  }
  if (source === 'performance-review') {
    return {
      tone: 'review',
      label: 'REVIEW',
      detail: job.days ? `${job.days}D evaluation window` : 'Performance Review',
      note: 'Opened from the performance review list.',
    }
  }
  if (source === 'critical-wp-inline-drilldown') {
    return {
      tone: 'live',
      label: 'SELECTED JOB / PROGRAM · LIVE',
      detail: [shortHost(job.host || ''), 'Critical WP context'].filter(Boolean).join(' · '),
      note: 'Opened from jobs and programs seen on this APP while Critical WP was active.',
    }
  }
  if (source === 'current') {
    return {
      tone: 'live',
      label: 'SELECTED JOB / PROGRAM · LIVE',
      detail: [shortHost(job.host || ''), 'Active issue'].filter(Boolean).join(' · '),
      note: 'Automatically selected from the current performance issue.',
    }
  }
  if (source === 'current-workload') {
    return {
      tone: 'live',
      label: 'SELECTED JOB / PROGRAM · LIVE',
      detail: [shortHost(job.host || ''), 'Current jobs & programs'].filter(Boolean).join(' · '),
      note: 'Selected directly from Current Jobs & Programs.',
    }
  }
  return {
    tone: 'live',
    label: 'LIVE',
    detail: shortHost(job.host || ''),
    note: 'Latest selected job or program.',
  }
}

export default function RundeckInvestigationContext({ job = null }) {
  if (!job?.key) return null
  const meta = sourceMeta(job)
  return <div className={`rundeckInvestigationContext is-${meta.tone}`} aria-label="Investigation context" title={meta.note || undefined}>
    <span className="rundeckInvestigationContextLabel"><SphereIcon name="target" /> {meta.label}</span>
    {meta.detail && <strong>{meta.detail}</strong>}
  </div>
}
