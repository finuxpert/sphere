import React from 'react'
import * as echarts from './logEcharts.js'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckWorkloadExplorer.css'

const API = `${import.meta.env.BASE_URL}api`
const TYPES = [['ALL', 'All'], ['JOB', 'Jobs'], ['PROGRAM', 'Programs']]
const PERIODS = [['24h', '24H'], ['3d', '3D'], ['7d', '7D'], ['30d', '30D']]
const RANGE_DAYS = { '24h': 1, '3d': 3, '7d': 7, '30d': 30 }

const token = (name, fallback) => typeof window === 'undefined'
  ? fallback
  : window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const palette = () => ({
  text: token('--sphere-text', '#e7edf0'),
  secondary: token('--sphere-text-secondary', '#a9b5bb'),
  muted: token('--sphere-text-muted', '#718089'),
  grid: token('--sphere-chart-grid', 'rgba(126,147,158,.08)'),
  panel: token('--sphere-surface-1', '#141d23'),
  accent: token('--sphere-accent', '#4fc6c8'),
  memory: token('--sphere-memory', '#8ba7d9'),
  wp: token('--sphere-wp', '#d0a96c'),
  danger: token('--sphere-danger', '#db7d86'),
})

async function requestJson(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Historical workload data unavailable (${response.status})`)
  }
  return response.json()
}

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckExplorerSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function pct(value) {
  return value === null || value === undefined ? '—' : `${numberText(value, 1)}%`
}

function gb(value) {
  return value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`
}

function durationText(start, end) {
  const left = Date.parse(start || '')
  const right = Date.parse(end || '')
  if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return '—'
  const minutes = Math.max(0, Math.round((right - left) / 60000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function buildEpisodes(items = [], bucketSeconds = 600) {
  const rows = [...items]
    .filter((row) => Number.isFinite(Date.parse(row?.bucket || '')))
    .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket))
  if (!rows.length) return []
  const maxGap = Math.max(20 * 60 * 1000, Number(bucketSeconds || 600) * 2500)
  const groups = []
  let current = []
  rows.forEach((row) => {
    const previous = current.at(-1)
    if (previous && Date.parse(row.bucket) - Date.parse(previous.bucket) > maxGap) {
      groups.push(current)
      current = []
    }
    current.push(row)
  })
  if (current.length) groups.push(current)
  return groups.map((group) => {
    const cpu = group.map((row) => Number(row.peak_cpu_pct)).filter(Number.isFinite)
    const avgCpu = group.map((row) => Number(row.avg_cpu_pct)).filter(Number.isFinite)
    const pss = group.map((row) => Number(row.peak_pss_gb)).filter(Number.isFinite)
    const processes = group.map((row) => Number(row.max_processes)).filter(Number.isFinite)
    const wp = group.map((row) => Number(row.max_critical_wp)).filter(Number.isFinite)
    return {
      start: group[0]?.bucket,
      end: group.at(-1)?.bucket,
      checks: group.reduce((sum, row) => sum + Number(row.checks || 0), 0),
      avgCpu: avgCpu.length ? avgCpu.reduce((sum, value) => sum + value, 0) / avgCpu.length : null,
      peakCpu: cpu.length ? Math.max(...cpu) : null,
      peakPss: pss.length ? Math.max(...pss) : null,
      maxProcesses: processes.length ? Math.max(...processes) : null,
      maxCriticalWp: wp.length ? Math.max(...wp) : 0,
    }
  }).reverse()
}

function WorkloadTrendChart({ trend }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!ref.current || !trend?.items?.length) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const colors = palette()
    const rows = trend.items
    const grids = [
      { left: 68, right: 20, top: 28, height: 74 },
      { left: 68, right: 20, top: 124, height: 54 },
      { left: 68, right: 20, top: 200, height: 46 },
      { left: 68, right: 20, top: 268, height: 36 },
    ]
    const xAxis = grids.map((_, index) => ({
      type: 'time',
      gridIndex: index,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: index === grids.length - 1
        ? { color: colors.muted, fontSize: 9, hideOverlap: true, formatter: (value) => formatWib(value, false) }
        : { show: false },
      axisPointer: { show: true, snap: true, lineStyle: { color: colors.muted, type: 'dashed' } },
    }))
    const yAxis = [
      { name: 'CPU %' },
      { name: 'PSS GB' },
      { name: 'Processes' },
      { name: 'Critical WP' },
    ].map((item, index) => ({
      type: 'value',
      gridIndex: index,
      min: 0,
      name: item.name,
      nameGap: 8,
      nameTextStyle: { color: colors.secondary, fontSize: 8.5, align: 'left', fontWeight: 600 },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.muted, fontSize: 8 },
      splitNumber: 2,
      splitLine: { lineStyle: { color: colors.grid } },
    }))
    const line = (name, field, lane, color, extra = {}) => ({
      name,
      type: 'line',
      xAxisIndex: lane,
      yAxisIndex: lane,
      showSymbol: rows.length <= 72,
      symbolSize: 3,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 1.6, color, ...(extra.lineStyle || {}) },
      itemStyle: { color },
      data: rows.map((row) => [row.bucket, row[field]]),
      ...extra,
    })
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption({
      animationDuration: 140,
      backgroundColor: 'transparent',
      textStyle: { color: colors.text },
      grid: grids,
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: colors.panel,
        borderWidth: 0,
        textStyle: { color: colors.text, fontSize: 9 },
      },
      xAxis,
      yAxis,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      series: [
        line('Avg CPU', 'avg_cpu_pct', 0, colors.accent),
        line('Peak CPU', 'peak_cpu_pct', 0, colors.danger, { lineStyle: { type: 'dashed', opacity: .7 } }),
        line('Avg PSS', 'avg_pss_gb', 1, colors.memory),
        line('Processes', 'avg_processes', 2, colors.secondary, { step: 'middle' }),
        line('Critical WP', 'max_critical_wp', 3, colors.wp, { step: 'middle' }),
      ],
    }, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [trend])
  return <div ref={ref} className="rundeckExplorerChart" role="img" aria-label="Job and Program performance history" />
}

export default function RundeckWorkloadExplorer({ refreshToken = '', onOpenLiveJob }) {
  const [query, setQuery] = React.useState('')
  const [type, setType] = React.useState('ALL')
  const [searchToken, setSearchToken] = React.useState(0)
  const [results, setResults] = React.useState([])
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [searchError, setSearchError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [range, setRange] = React.useState('24h')
  const [host, setHost] = React.useState('')
  const [summary, setSummary] = React.useState(null)
  const [trend, setTrend] = React.useState(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState('')

  React.useEffect(() => {
    const value = query.trim()
    if (value.length < 2) {
      setResults([])
      setSearchError('')
      setSearchLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearchLoading(true)
      setSearchError('')
      requestJson(`${API}/history/workload/search?q=${encodeURIComponent(value)}&type=${encodeURIComponent(type)}&limit=40`, controller.signal)
        .then((data) => setResults(data?.items || []))
        .catch((failure) => { if (failure.name !== 'AbortError') setSearchError(failure.message || 'Unable to search workloads.') })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false) })
    }, 220)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, type, searchToken, refreshToken])

  React.useEffect(() => {
    if (!selected?.consumer_key || !selected?.consumer_type) {
      setSummary(null)
      setTrend(null)
      setDetailError('')
      return undefined
    }
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError('')
    const params = new URLSearchParams({
      job: selected.consumer_key,
      type: selected.consumer_type,
      range,
    })
    if (host) params.set('host', host)
    Promise.all([
      requestJson(`${API}/history/workload/summary?${params.toString()}`, controller.signal),
      requestJson(`${API}/history/workload/trend?${params.toString()}`, controller.signal),
    ])
      .then(([summaryData, trendData]) => {
        setSummary(summaryData)
        setTrend(trendData)
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setDetailError(failure.message || 'Unable to load workload history.') })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [host, range, refreshToken, selected])

  const selectResult = (row) => {
    setSelected(row)
    setHost('')
  }
  const episodes = React.useMemo(() => buildEpisodes(trend?.items || [], trend?.bucket_seconds || 600), [trend])
  const hosts = selected?.hosts || summary?.hosts || []

  const openLive = () => {
    if (!selected?.consumer_key) return
    onOpenLiveJob?.({
      key: selected.consumer_key,
      host,
      consumerType: selected.consumer_type,
      source: 'workload-explorer',
      days: RANGE_DAYS[range] || 1,
    })
  }

  return <section className="rundeckWorkloadExplorer" aria-label="Job and Program History">
    <header className="rundeckExplorerHeader">
      <div>
        <h3><SphereIcon name="trend" /> Job &amp; Program History</h3>
        <p>Review historical SAP job and program performance from 24H to 30D.</p>
      </div>
      <div className="rundeckExplorerControls">
        <div className="rundeckExplorerSearch">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearchToken((value) => value + 1) }} placeholder="Search Job or Program, e.g. ZSD_H_INBOUND" aria-label="Search Job or Program" />
          <button type="button" onClick={() => setSearchToken((value) => value + 1)}>Search</button>
        </div>
        <Segmented options={TYPES} value={type} onChange={(value) => { setType(value); setSelected(null); setHost('') }} label="Workload type" />
      </div>
    </header>

    <div className="rundeckExplorerGrid">
      <aside className="rundeckExplorerResults">
        <div className="rundeckExplorerResultsHead"><strong>Jobs and Programs</strong><span>{searchLoading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</span></div>
        {searchError && <div className="rundeckExplorerState is-error">{searchError}</div>}
        {!searchError && query.trim().length < 2 && <div className="rundeckExplorerState">Type at least 2 characters to search Job and Program history.</div>}
        {!searchError && query.trim().length >= 2 && !searchLoading && !results.length && <div className="rundeckExplorerState">No observed Job or Program matches this search.</div>}
        <div className="rundeckExplorerResultList">
          {results.map((row) => {
            const active = selected?.consumer_key === row.consumer_key && selected?.consumer_type === row.consumer_type
            return <button key={`${row.consumer_type}-${row.consumer_key}`} type="button" className={`rundeckExplorerResult${active ? ' is-selected' : ''}`} onClick={() => selectResult(row)} title={row.consumer_key}>
              <strong>{row.consumer_key}</strong>
              <small>{workloadTypeLabel(row.consumer_type)} · {row.app_count || 0} APP · Peak {pct(row.peak_cpu_pct)} · Last {row.last_seen ? `${formatWib(row.last_seen, true)} WIB` : '—'}</small>
            </button>
          })}
        </div>
      </aside>

      <section className="rundeckExplorerDetail">
        {!selected && <div className="rundeckExplorerState">Select a Job or Program to view performance history.</div>}
        {selected && <>
          <div className="rundeckExplorerDetailHead">
            <div>
              <h4>{selected.consumer_key}</h4>
              <small>{workloadTypeLabel(selected.consumer_type)} · Historical observations</small>
            </div>
            <div className="rundeckExplorerDetailTools">
              <Segmented options={PERIODS} value={range} onChange={setRange} label="History period" />
              <select className="rundeckExplorerHostSelect" value={host} onChange={(event) => setHost(event.target.value)} aria-label="Application server filter">
                <option value="">All APP</option>
                {hosts.map((item) => <option key={item} value={item}>{shortHost(item)}</option>)}
              </select>
              <button type="button" className="rundeckExplorerOpenLive" onClick={openLive}>Open Workload</button>
            </div>
          </div>

          {detailLoading && <div className="rundeckExplorerState">Loading performance history…</div>}
          {detailError && <div className="rundeckExplorerState is-error">{detailError}</div>}
          {!detailLoading && !detailError && summary && <>
            <div className="rundeckExplorerSummary">
              <div className="rundeckExplorerStat"><span>Samples</span><strong>{numberText(summary.checks || 0, 0)}</strong></div>
              <div className="rundeckExplorerStat"><span>Avg CPU</span><strong>{pct(summary.avg_cpu_pct)}</strong></div>
              <div className="rundeckExplorerStat"><span>Peak CPU</span><strong>{pct(summary.peak_cpu_pct)}</strong></div>
              <div className="rundeckExplorerStat"><span>Avg PSS</span><strong>{gb(summary.avg_pss_gb)}</strong></div>
              <div className="rundeckExplorerStat"><span>Max Processes</span><strong>{numberText(summary.max_processes || 0, 0)}</strong></div>
              <div className="rundeckExplorerStat"><span>Critical WP Samples</span><strong>{numberText(summary.critical_wp_checks || 0, 0)}</strong></div>
            </div>
            {trend?.items?.length ? <WorkloadTrendChart trend={trend} /> : <div className="rundeckExplorerState">No observations in this selected period.</div>}
            <div className="rundeckExplorerSectionTitle"><strong>Performance Periods</strong><small>{trend?.bucket ? `${trend.bucket} interval · performance history` : 'Performance history'}</small></div>
            <table className="rundeckExplorerEpisodes">
              <thead><tr><th>Time Range</th><th>Duration</th><th>Avg CPU</th><th>Peak CPU</th><th>Peak PSS</th><th>Max Processes</th><th>Critical WP</th></tr></thead>
              <tbody>
                {episodes.slice(0, 12).map((episode, index) => <tr key={`${episode.start}-${index}`}>
                  <td>{formatWib(episode.start, true)} → {formatWib(episode.end, true)}</td>
                  <td>{durationText(episode.start, episode.end)}</td>
                  <td>{pct(episode.avgCpu)}</td>
                  <td>{pct(episode.peakCpu)}</td>
                  <td>{gb(episode.peakPss)}</td>
                  <td>{numberText(episode.maxProcesses || 0, 0)}</td>
                  <td>{numberText(episode.maxCriticalWp || 0, 0)}</td>
                </tr>)}
                {!episodes.length && <tr><td colSpan="7">No performance periods in this selected range.</td></tr>}
              </tbody>
            </table>
          </>}
        </>}
      </section>
    </div>
  </section>
}
