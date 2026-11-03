import React from 'react'
import { formatWib } from './sapUiFormat.js'
import {
  WP_TYPES, WP_COLORS, WORKLOAD_COLORS, niceCountMax,
  peakActivity, splitActivitySeries, validateActivityTrend,
} from './rundeckWorkloadActivityCharts.js'
import './RundeckSapWorkloadMiniCharts.css'

const API = import.meta.env.BASE_URL + 'api/history/workload/activity'
const W = 360, H = 108, L = 37, R = 8, T = 9, B = 24
const GAP_MS = 26 * 60_000
const countFormat = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })
const formatPoint = value => formatWib(value, true) + ' WIB'

function Axes({ max, y, start, end }) {
  return <>
    {[0, .5, 1].map(fraction =>
      <g key={fraction}>
        <line x1={L} x2={W-R} y1={y(max*fraction)} y2={y(max*fraction)}
          stroke="currentColor" opacity=".13"/>
        <text x={L-5} y={y(max*fraction)+3} textAnchor="end" fontSize="9"
          fill="currentColor">{countFormat(max*fraction)}</text>
      </g>)}
    <text x={L} y={H-4} fill="currentColor" fontSize="9">{formatPoint(start)}</text>
    <text x={W-R} y={H-4} textAnchor="end" fill="currentColor" fontSize="9">{formatPoint(end)}</text>
  </>
}

function ObservedChart({ data, metric }) {
  const points = data?.items || []
  const start = Date.parse(data?.start || '')
  const end = Date.parse(data?.end || '')
  const span = Math.max(1, end - start)
  const x = time => L + (Date.parse(time) - start) / span * (W-L-R)
  const isWP = metric === 'wp'
  const usable = points.filter(p => isWP ? p.wp !== null : p.jobs !== null)
  const biggest = isWP
    ? Math.max(0, ...usable.map(p => p.observed_wp || 0))
    : Math.max(0, ...usable.map(p => Math.max(p.jobs || 0, p.programs || 0)))
  const max = niceCountMax(biggest)
  const y = v => T + (1 - Math.max(0, Number(v)) / max) * (H-T-B)
  const segments = splitActivitySeries(points, p => isWP ? p.wp !== null : p.jobs !== null, GAP_MS)
  return <svg viewBox={'0 0 ' + W + ' ' + H} role="img"
    aria-label={isWP
      ? 'Stacked observed work processes by type; not total work process capacity or utilization'
      : 'Distinct observed SAP Job and Program identities per complete collection'}>
    <Axes max={max} y={y} start={data.start} end={data.end}/>
    {!isWP ? <>
      {(['jobs', 'programs']).map(key =>
        <g key={key} fill="none" stroke={WORKLOAD_COLORS[key]} strokeWidth="1.9" strokeLinejoin="round"
          strokeLinecap="round">
          {segments.map((segment, i) => segment.length > 1
            ? <polyline key={i} points={segment.map(p => x(p.collected_at)+','+y(p[key])).join(' ')} />
            : null)}
        </g>)}
      {usable.map(p => ['jobs','programs'].map(key =>
        <circle key={p.collection_id+':'+key} cx={x(p.collected_at)} cy={y(p[key])}
          r="1.1" fill={WORKLOAD_COLORS[key]}>
          <title>{(key==='jobs'?'Jobs: ':'Programs: ')+p[key]+' observed names · '+formatPoint(p.collected_at)+' · All APPs; not execution count'}</title>
        </circle>))}
    </> : <>
      {WP_TYPES.map((type, index) =>
        <g key={type}>
          {segments.map((segment, segmentIndex) => {
            const before = row => WP_TYPES.slice(0,index).reduce((sum,k)=>sum+row.wp[k],0)
            const top = row => before(row)+row.wp[type]
            const upper = segment.map(row => x(row.collected_at)+','+y(top(row)))
            const lower = [...segment].reverse().map(row => x(row.collected_at)+','+y(before(row)))
            return <polygon key={segmentIndex} points={upper.concat(lower).join(' ')}
              fill={WP_COLORS[type]} opacity=".85">
              <title>{type+' · observed WP count; deduplicated by APP and WP ID'}</title>
            </polygon>
          })}
        </g>)}
      {usable.map(p => <circle key={p.collection_id} cx={x(p.collected_at)}
        cy={y(p.observed_wp)} r="1.2" fill={WP_COLORS.OTHER} opacity=".7">
        <title>{formatPoint(p.collected_at)+' · '+p.observed_wp+' observed WP · '+WP_TYPES.map(k=>k+' '+p.wp[k]).join(' · ')+' · Not full SAP WP capacity'}</title>
      </circle>)}
    </>}
  </svg>
}

function TimeSelector({ range, onRange, name }) {
  return <div className="sphereFleetMiniActions" role="group" aria-label={name+' time range, shared between both observed SAP charts'}>
    {['6h','24h'].map(v => <button key={v} type="button" aria-pressed={range===v}
      onClick={() => onRange?.(v)}>{v.toUpperCase()}</button>)}
  </div>
}

function TrendPanel({ kind, range, onRange, data, loading, error, onRetry }) {
  const isWP = kind === 'wp'
  const name = isWP ? 'Work Process by Type' : 'SAP Workload Activity'
  const observed = isWP ? data?.wp_checks : data?.activity_checks
  const points = data?.items?.filter(p => isWP ? p.wp !== null : p.jobs !== null) || []
  const peak = peakActivity(points, p => isWP ? p.observed_wp : p.jobs+p.programs)
  const subtitle = isWP ? 'Observed WP snapshots · All APPs' : 'Observed Job / Program names · All APPs'
  const scopeLimited = data?.coverage_scope === 'TOP_CONSUMERS_ONLY'
  return <section className="sphereMonitoringMiniChart" aria-label={name}>
    <div className="sphereFleetMiniTrend sphereWorkloadActivityMini">
      <div className="sphereFleetMiniHead">
        <strong>{name}</strong>
        <TimeSelector range={range} onRange={onRange} name={name}/>
      </div>
      <div className="sphereFleetMiniMeta" title={isWP
        ? 'Only WP seen in RCA-WP collector output; this is not total DIA/BTC capacity or busy percentage'
        : 'Unique JOB and PROGRAM identities per complete snapshot across APP1–APP5, not SM37 run counts'}>
        {subtitle}
      </div>
      {loading
        ? <p className="sphereFleetMiniEmpty" role="status">Checking saved observations…</p>
        : error ? <div className="sphereWorkloadActivityError" role="alert">
          <span title={error}>{error.includes('timed out') ? 'History timed out' : 'Data unavailable'}</span>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
        : !observed ? <p className="sphereFleetMiniEmpty" role="status">Not Collected · no verified {isWP?'WP types':'workloads'}</p>
        : <ObservedChart data={data} metric={kind}/>}
      <div className="sphereWorkloadActivityLegend" aria-label={isWP?'Observed WP categories':'Observed workload categories'}>
        {isWP
          ? WP_TYPES.map(type => <span key={type}><i style={{background:WP_COLORS[type]}}/>{type === 'OTHER' ? 'Other' : type}</span>)
          : <><span><i style={{background:WORKLOAD_COLORS.jobs}}/>Jobs</span>
            <span><i style={{background:WORKLOAD_COLORS.programs}}/>Programs</span></>}
      </div>
      <small className="sphereFleetMiniFooter" title={scopeLimited
        ? 'Legacy source covers only previously stored top consumers; not the complete observed population'
        : 'Distinct observed identities; WP are deduplicated per host and collection, not total capacity'}>
        {scopeLimited ? 'Limited historic ranking · ' : ''}
        {peak ? 'Peak '+peak.value+' '+(isWP?'observed WP':'workloads')+' · '+formatPoint(peak.at) : 'No verified peak'}
        {observed && data.complete_checks > observed ? ' · '+observed+'/'+data.complete_checks+' checks' : ''}
      </small>
    </div>
  </section>
}

export default function RundeckSapWorkloadMiniCharts({range='24h',onRange,refreshToken=''}) {
  const [state,setState] = React.useState({range:'',loading:true,data:null,error:''})
  const [retry,setRetry] = React.useState(0)
  React.useEffect(() => {
    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 16000)
    setState({range,loading:true,data:null,error:''})
    const params = new URLSearchParams({range})
    fetch(API+'?'+params.toString(),{cache:'no-store',signal:controller.signal})
      .then(response => {
        if (!response.ok) throw Error('Saved WP observations unavailable ('+response.status+')')
        return response.json()
      })
      .then(result => {
        if (controller.signal.aborted) return
        const verified = validateActivityTrend(result,range)
        if (!verified) throw Error('Inconsistent RCA-WP activity response')
        setState({range,loading:false,data:verified,error:''})
      })
      .catch(error => {
        if (!controller.signal.aborted || timedOut) setState({
          range, loading:false, data:null,
          error:timedOut ? 'History request timed out (16s)' : error.message,
        })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  },[range,refreshToken,retry])
  const valid = state.range === range
  return <>
    <TrendPanel kind="workload" range={range} onRange={onRange}
      data={valid?state.data:null} loading={!valid||state.loading} error={valid?state.error:''}
      onRetry={() => setRetry(n => n + 1)}/>
    <TrendPanel kind="wp" range={range} onRange={onRange}
      data={valid?state.data:null} loading={!valid||state.loading} error={valid?state.error:''}
      onRetry={() => setRetry(n => n + 1)}/>
  </>
}
