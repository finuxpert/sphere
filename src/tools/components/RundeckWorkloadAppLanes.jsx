import React from 'react'
import { groupEvaluationsByApp } from './rundeckWorkloadAppLanes.js'
import { workloadHealthLevel } from './rundeckWorkloadHealthState.js'

const STATUS_LABELS = [
  { key: 'review', label: 'Review' },
  { key: 'attention', label: 'Attention' },
  { key: 'unknown', label: 'Data limited' },
  { key: 'normal', label: 'Normal' },
]

export default function RundeckWorkloadAppLanes({ rows = [], onSelectWorkload, onOpenApp, period = '' }) {
  const model = React.useMemo(() => groupEvaluationsByApp(rows), [rows])
  const lanes = React.useMemo(() => model.lanes.filter(lane => lane.key !== 'UNVERIFIED' || lane.total > 0), [model])
  const laneListRef = React.useRef(null)
  const [laneWidth, setLaneWidth] = React.useState(0)
  const [activeByLane, setActiveByLane] = React.useState({})

  React.useLayoutEffect(() => {
    const target = laneListRef.current?.querySelector('.rundeckAppEvalDots')
    if (!target) return undefined
    const measure = () => {
      const width = Math.round(target.getBoundingClientRect().width)
      setLaneWidth(previous => previous === width ? previous : width)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(target)
    window.addEventListener('resize', measure, { passive: true })
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [lanes.length])

  // Maintain actual hexagon readability; wrap dense APP lanes rather than shrinking to dots.
  const maxCount = Math.max(1, ...lanes.map(lane => lane.total))
  const dotSize = Math.max(10, Math.min(12, Math.floor((laneWidth - (maxCount - 1) * 2) / maxCount) || 12))
  const moveFocus = (event, laneKey, index, count) => {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(count - 1, index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else return
    event.preventDefault()
    setActiveByLane(previous => ({ ...previous, [laneKey]: next }))
    event.currentTarget.parentElement?.querySelectorAll('button.rundeckAppEvalHex')?.[next]?.focus({ preventScroll: true })
  }

  return <div ref={laneListRef} className="rundeckAppEvaluationLanes"
    style={{ '--lane-hex-size': dotSize + 'px' }}
    aria-label="Saved evaluations grouped by explicitly observed APP host">
    <div className="rundeckAppEvalColumnHead" aria-hidden="true">
      <span>APP / linked evaluations</span>
      <span>Saved evaluation hexagons</span>
      <div>{STATUS_LABELS.map(level => <span key={level.key}>{level.label}</span>)}</div>
    </div>
    {lanes.map(lane => <section key={lane.key} className={'rundeckAppEvalLane' + (lane.key === 'UNVERIFIED' ? ' is-host-unverified' : '')}
      aria-label={lane.label + ' · ' + lane.total + ' saved evaluation host memberships'}>
      <div className="rundeckAppEvalIdentity">
        {lane.key === 'UNVERIFIED'
          ? <strong>{lane.label}</strong>
          : <button type="button" className="rundeckAppEvalHostButton"
              disabled={!onOpenApp} title={'Open latest Current Jobs & Programs for ' + lane.label + '. Review remains global.'}
              onClick={() => onOpenApp?.(lane.key)} aria-label={'Open Current Jobs and Programs filtered to ' + lane.label}>
              {lane.label}<span aria-hidden="true"> ↗</span>
            </button>}
        <small>{lane.total} {lane.key === 'UNVERIFIED' ? 'without verified APP host' : 'linked evaluations'}</small>
      </div>
      <div className="rundeckAppEvalDots" role="group" aria-label={lane.label + ' evaluation hexagons'}>
        {lane.rows.map((row, index) => {
          const state = workloadHealthLevel(row)
          const type = String(row.consumer_type || '').toUpperCase() === 'JOB' ? 'Job' : 'Program'
          const identity = String(row.consumer_key || 'Unidentified workload')
          const label = lane.label + ' · ' + type + ' ' + identity + ' · global evaluation ' +
            (STATUS_LABELS.find(level => level.key === state)?.label || 'Unknown') +
            ' · ' + (period || 'saved window') + ' · not SM37 execution status'
          return <button key={row.consumer_type + ':' + identity} type="button"
            className={'rundeckAppEvalHex is-' + state}
            title={label} aria-label={label + ' · open analysis'}
            tabIndex={index === Math.min(activeByLane[lane.key] || 0, lane.total - 1) ? 0 : -1}
            onFocus={() => setActiveByLane(previous => previous[lane.key] === index ? previous : ({ ...previous, [lane.key]: index }))}
            onKeyDown={event => moveFocus(event, lane.key, index, lane.total)}
            onClick={() => onSelectWorkload?.(row)} />
        })}
        {!lane.total && <span className="rundeckAppEvalEmpty">No verified APP-linked evaluation</span>}
      </div>
      <div className="rundeckAppEvalBreakdown" aria-label={lane.label + ' counts by global evaluation status'}>
        {STATUS_LABELS.map(level => <span key={level.key} className={'is-' + level.key}
          title={level.label + ' · global evaluation classification, not a host-specific threshold'}>
          <i aria-hidden="true" />
          <strong>{lane.counts[level.key]}</strong>
          <small>{lane.total ? Math.round(100 * lane.counts[level.key] / lane.total) + '%' : '—'}</small>
        </span>)}
      </div>
    </section>)}
  </div>
}
