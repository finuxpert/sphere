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
      note: 'Review context is supporting evidence, not a root-cause conclusion.',
    }
  }
  if (source === 'critical-wp-inline-drilldown') {
    return {
      tone: 'live',
      label: 'LIVE',
      detail: [shortHost(job.host || ''), 'Critical WP context'].filter(Boolean).join(' · '),
      note: 'Selected from workloads observed on this APP while Critical WP was active; correlation only.',
    }
  }
  if (source === 'current') {
    return {
      tone: 'live',
      label: 'LIVE',
      detail: [shortHost(job.host || ''), 'Active issue context'].filter(Boolean).join(' · '),
      note: 'Automatically selected from the active performance issue context; not the global CPU ranking or a root-cause conclusion.',
    }
  }
  if (source === 'current-workload') {
    return {
      tone: 'live',
      label: 'LIVE',
      detail: [shortHost(job.host || ''), 'Current workloads'].filter(Boolean).join(' · '),
      note: 'Selected directly from Current Workloads.',
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
  return <div className={`rundeckInvestigationContext is-${meta.tone}`} aria-label="Investigation context" title={meta.note || undefined}>
    <span className="rundeckInvestigationContextLabel"><SphereIcon name="target" /> {meta.label}</span>
    {meta.detail && <strong>{meta.detail}</strong>}
  </div>
}
