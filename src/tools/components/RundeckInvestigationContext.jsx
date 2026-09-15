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
      label: 'TREND SNAPSHOT',
      detail: [shortHost(job.host || ''), at].filter(Boolean).join(' · '),
      note: 'Selected from a retained Server Trend snapshot; current system state remains live.',
    }
  }
  if (source === 'workload-explorer') {
    return {
      tone: 'history',
      label: 'WORKLOAD EXPLORER',
      detail: [shortHost(job.host || ''), job.days ? `${job.days}D window` : ''].filter(Boolean).join(' · '),
      note: 'Opened from historical Job / Program performance; current dashboard state remains live.',
    }
  }
  if (source === 'performance-review') {
    return {
      tone: 'review',
      label: 'REVIEW',
      detail: job.days ? `${job.days}D evaluation window` : 'Performance Review',
      note: 'Review context is supporting evidence, not a root-cause conclusion.',
    }
  }
  if (source === 'critical-wp-inline-drilldown') {
    return {
      tone: 'live',
      label: 'LIVE · APP DRILLDOWN',
      detail: shortHost(job.host || ''),
      note: 'Workload observed in the aligned collection while Critical WP was active.',
    }
  }
  return {
    tone: 'live',
    label: 'LIVE',
    detail: shortHost(job.host || ''),
    note: 'Latest aligned workload context.',
  }
}

export default function RundeckInvestigationContext({ job = null }) {
  if (!job?.key) return null
  const meta = sourceMeta(job)
  return <div className={`rundeckInvestigationContext is-${meta.tone}`} aria-label="Investigation context">
    <span className="rundeckInvestigationContextLabel"><SphereIcon name="target" /> {meta.label}</span>
    {meta.detail && <strong>{meta.detail}</strong>}
    <small>{meta.note}</small>
  </div>
}
