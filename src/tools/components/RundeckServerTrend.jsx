import React from 'react'
import * as echarts from './logEcharts.js'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import { hostResourceState } from './rundeckStatusSemantics.js'
import './RundeckWorkloadExplorer.css'

const API = `${import.meta.env.BASE_URL}api`
const DEFAULT_RANGE = '6h'
const TREND_STORAGE_KEY = 'sphere.live.trend'
const RANGES = [['30m', '30M'], ['1h', '1H'], ['3h', '3H'], ['6h', '6H'], ['24h', '24H'], ['7d', '7D'], ['30d', '30D']]
const BUCKETS = [['auto', 'Auto'], ['10m', '10m'], ['30m', '30m'], ['1h', '1H'], ['6h', '6H'], ['1d', '1D']]
const METRICS = [['cpu', 'CPU'], ['ram', 'Memory'], ['iowait', 'I/O Wait'], ['wp', 'Critical WP'], ['availability', 'Availability']]
const AVAILABILITY_CATEGORIES = { availability: 'SAP_APP', hana: 'HANA_SYSTEM_DB', replication: 'HANA_REPLICATION', ssh: 'SSH', web: 'WEB_DISPATCHER' }
const DEFAULT_COLLECTION_CADENCE_MS = 10 * 60 * 1000
const BUCKET_INTERVAL_MS = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}

const metricLabel = (value) => ({ cpu: 'CPU', ram: 'Memory', iowait: 'I/O Wait', wp: 'Critical WP', availability: 'Availability', swap: 'Swap I/O', load: 'Load', hana: 'HANA Availability', replication: 'Replication Availability', ssh: 'SSH Reachability', web: 'Web Dispatcher Availability' })[value] || 'Metric'
const rangeLabel = (value) => RANGES.find(([key]) => key === value)?.[1] || (value === '90d' ? '90D' : String(value || '').toUpperCase())
const token = (name, fallback) => typeof window === 'undefined' ? fallback : window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

function formatTrendAxis(value, range) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const base = { timeZone: 'Asia/Jakarta', hour12: false }
  if (range === '30d' || range === '7d') {
    return new Intl.DateTimeFormat('id-ID', { ...base, day: '2-digit', month: 'short' }).format(date)
  }
  if (range === '24h') {
    return new Intl.DateTimeFormat('id-ID', { ...base, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return formatWib(value, false)
}

const palette = () => ({ text: token('--sphere-text', '#e7edf0'), secondary: token('--sphere-text-secondary', '#a9b5bb'), muted: token('--sphere-text-muted', '#718089'), grid: token('--sphere-chart-grid', 'rgba(126,147,158,.08)'), panel: token('--sphere-surface-1', '#141d23'), attention: token('--sphere-attention', '#6aa2d8'), warning: token('--sphere-warning', '#d8b35f'), danger: token('--sphere-danger', '#db7d86'), series: [token('--sphere-chart-1', '#72a9e8'), token('--sphere-chart-2', '#8cc985'), token('--sphere-chart-3', '#aaa0df'), token('--sphere-chart-4', '#e1a16c'), token('--sphere-chart-5', '#5dcbd1')] })

async function json(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Trend data unavailable (${response.status})`)
  return response.json()
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return <div className="rundeckSegmented" role="group" aria-label={ariaLabel}>{options.map(([key, label]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}</div>
}

function gapDurationText(from, to) {
  const minutes = Math.max(0, Math.round((to - from) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remain = minutes % 60
  return remain ? `${hours}h ${remain}m` : `${hours}h`
}

function gapLabel(from, to) {
  return `COLLECTION GAP · ${formatWib(from, false)}–${formatWib(to, false)} WIB · ${gapDurationText(from, to)}`
}

function resolvedGapIntervalMs(trend) {
  const explicitSeconds = Number(trend?.bucket_interval_seconds)
  if (Number.isFinite(explicitSeconds) && explicitSeconds >= 60) return explicitSeconds * 1000

  const resolvedBucket = String(trend?.bucket || '').toLowerCase()
  if (BUCKET_INTERVAL_MS[resolvedBucket]) return BUCKET_INTERVAL_MS[resolvedBucket]

  const cadenceMs = Number(trend?.collection_cadence_seconds || 600) * 1000
  return Number.isFinite(cadenceMs) && cadenceMs >= 60_000 ? cadenceMs : DEFAULT_COLLECTION_CADENCE_MS
}

function trendGaps(trend) {
  const rows = trend?.items || []
  const rangeStart = Date.parse(trend?.since || trend?.range_started_at || '')
  const rangeEnd = Date.now()
  const intervalMs = resolvedGapIntervalMs(trend)

  if (trend?.metric === 'availability' && Array.isArray(trend?.observation_gaps)) {
    const gaps = trend.observation_gaps
      .map((gap) => [Date.parse(gap?.from || ''), Date.parse(gap?.to || '')])
      .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
    return { gaps, rangeStart, rangeEnd, intervalMs }
  }

  const gapThresholdMs = intervalMs * 2
  const buckets = Array.from(new Set(rows.map((row) => Date.parse(row.bucket)).filter(Number.isFinite))).sort((a, b) => a - b)
  const gaps = []
  if (Number.isFinite(rangeStart) && buckets.length && buckets[0] - rangeStart > gapThresholdMs) gaps.push([rangeStart, buckets[0] - intervalMs])
  for (let index = 1; index < buckets.length; index += 1) {
    if (buckets[index] - buckets[index - 1] > gapThresholdMs) gaps.push([buckets[index - 1] + intervalMs, buckets[index] - intervalMs])
  }
  if (buckets.length && rangeEnd - buckets[buckets.length - 1] > gapThresholdMs) gaps.push([buckets[buckets.length - 1] + intervalMs, rangeEnd])
  return { gaps, rangeStart, rangeEnd, intervalMs }
}

function CollectionGapBand({ trend }) {
  const { gaps } = React.useMemo(() => trendGaps(trend), [trend])
  if (!gaps.length) return null
  const sorted = [...gaps].sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]))
  const [from, to] = sorted[0]
  const observed = trend?.metric === 'availability'
  return <details className={`rundeckCollectionGapBandV132 ${observed ? 'is-observation-gap' : ''}`} role="status">
    <summary title={observed ? 'No Service Availability observation was retained for this interval. Missing observation is UNKNOWN, not DOWN.' : 'No retained performance collection exists inside this interval. This is a data collection gap, not evidence of SAP downtime.'}>
      <span>{observed ? 'No Observation' : 'Collection Gap'}</span>
      <strong>{formatWib(from, false)}–{formatWib(to, false)} WIB</strong>
      <small>{gapDurationText(from, to)} {observed ? 'without retained Service Availability observation' : 'without retained collection'}{gaps.length > 1 ? ` · +${gaps.length - 1} additional gap${gaps.length > 2 ? 's' : ''}` : ''}</small>
    </summary>
    {gaps.length > 1 && <div className="rundeckGapDetailsV133">
      {sorted.slice(0, 8).map(([gapFrom, gapTo], index) => <div key={`${gapFrom}-${gapTo}`}>
        <b>{index + 1}</b><span>{formatWib(gapFrom, true)}–{formatWib(gapTo, true)} WIB</span><small>{gapDurationText(gapFrom, gapTo)}</small>
      </div>)}
      {gaps.length > 8 && <small>+{gaps.length - 8} more retained-gap interval{gaps.length - 8 === 1 ? '' : 's'}</small>}
    </div>}
  </details>
}

function AvailabilityCoverageBand({ trend }) {
  if (trend?.metric !== 'availability' || !trend?.coverage_limited || !trend?.history_started_at) return null
  return <div className="rundeckCoverageBandV133">
    <span>History Coverage</span>
    <strong>starts {formatWib(trend.history_started_at, true)} WIB</strong>
    <small>Earlier history in this selected range was not retained by SPHERE; this is not an availability outage.</small>
  </div>
}

function AvailabilityObservationSummary({ trend }) {
  if (trend?.metric !== 'availability' || !Array.isArray(trend?.uptime) || !trend.uptime.length) return null
  return <div className="rundeckAvailabilitySummaryV133" title="Observed availability is calculated only from retained Service Availability checks; it is not an SLA calculation.">
    <span>Observed availability</span>
    <div>{trend.uptime.map((row) => <small key={row.name}><b>{row.name}</b> {row.uptime_pct === null || row.uptime_pct === undefined ? '—' : `${numberText(row.uptime_pct, 2)}%`}</small>)}</div>
  </div>
}

function TrendFreshness({ trend }) {
  const latest = Date.parse(trend?.latest_collection_at || '')
  const staleMinutes = Math.max(1, Number(trend?.stale_after_minutes || 20))
  if (!Number.isFinite(latest) || Date.now() - latest < staleMinutes * 60 * 1000) return null
  const ageMinutes = Math.max(1, Math.floor((Date.now() - latest) / 60000))
  return <div className="rundeckHistoryState">STALE · historical data only · last collection {formatWib(trend.latest_collection_at, true)} WIB · {ageMinutes}m ago</div>
}

function TrendChart({ trend, mode, range, onSelect }) {
  const ref = React.useRef(null)
  const option = React.useMemo(() => {
    const colors = palette()
    const rows = trend?.items || []
    const hosts = Array.from(new Set(rows.map((row) => row.host))).sort()
    const availabilityMode = trend?.metric === 'availability'
    const valueKey = mode === 'max' ? 'max_value' : 'avg_value'
    const compactPoints = ['30m', '1h', '3h', '6h'].includes(range)
    const { gaps, rangeStart, rangeEnd } = trendGaps(trend)
    const gapPoints = gaps.map(([from, to]) => Math.round((from + to) / 2))
    const threshold = []
    if (!availabilityMode && trend?.warning !== null && trend?.warning !== undefined) threshold.push({ yAxis: Number(trend.warning), lineStyle: { color: colors.warning, type: 'dashed', opacity: .45 }, label: { formatter: `Warn ${trend.warning}${trend?.unit === '%' ? '%' : ''}`, color: colors.warning, fontSize: 8, position: 'insideEndTop' } })
    if (!availabilityMode && trend?.critical !== null && trend?.critical !== undefined) threshold.push({ yAxis: Number(trend.critical), lineStyle: { color: colors.danger, type: 'dashed', opacity: .48 }, label: { formatter: `Crit ${trend.critical}${trend?.unit === '%' ? '%' : ''}`, color: colors.danger, fontSize: 8, position: 'insideEndTop' } })
    return {
      animationDuration: 140,
      backgroundColor: 'transparent', color: colors.series, textStyle: { color: colors.text },
      legend: { top: 0, type: 'scroll', itemWidth: 14, itemHeight: 8, data: hosts.map(shortHost), textStyle: { color: colors.secondary, fontSize: 9 } },
      grid: { left: 52, right: 58, top: 38, bottom: compactPoints ? 28 : 43 },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: colors.panel, borderWidth: 0, textStyle: { color: colors.text, fontSize: 10 } },
      xAxis: { type: 'time', min: Number.isFinite(rangeStart) ? rangeStart : undefined, max: rangeEnd, axisLabel: { color: colors.muted, fontSize: 9, hideOverlap: true, formatter: (value) => formatTrendAxis(value, range) }, axisTick: { show: false }, axisLine: { lineStyle: { color: colors.grid } }, splitLine: { show: false } },
      yAxis: { type: 'value', name: availabilityMode ? (trend?.metric_label || 'Availability') : `${trend?.metric_label || ''}${trend?.unit ? ` (${trend.unit})` : ''}`, nameTextStyle: { color: colors.muted, fontSize: 9 }, axisLabel: { color: colors.muted, fontSize: 9, formatter: availabilityMode ? ((value) => Number(value) >= 75 ? 'UP' : Number(value) <= 25 ? 'DOWN' : '') : ((value) => `${value}${trend?.unit === '%' ? '%' : ''}`) }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { lineStyle: { color: colors.grid } }, min: availabilityMode || trend?.unit === '%' ? 0 : undefined, max: availabilityMode || trend?.unit === '%' ? 100 : undefined, splitNumber: 2 },
      dataZoom: [{ type: 'inside', filterMode: 'none' }],
      series: hosts.map((host, index) => ({
        name: shortHost(host), type: 'line', step: availabilityMode ? 'end' : false, connectNulls: false,
        showSymbol: availabilityMode || compactPoints, symbolSize: availabilityMode ? 5 : (compactPoints ? 3.5 : 2.5),
        lineStyle: { width: availabilityMode ? 2 : 1.8 },
        emphasis: { focus: 'series', scale: true, lineStyle: { width: availabilityMode ? 2.5 : 2.3 } },
        data: [
          ...rows.filter((row) => row.host === host).map((row) => ({ value: [row.bucket, row[valueKey]], bucket: row.bucket, peakAt: row.peak_at, peakCollectionId: row.peak_collection_id, host: row.host, avg: row.avg_value, max: row.max_value, status: row.status })),
          ...gapPoints.map((at) => ({ value: [at, null], gap: true })),
        ].sort((a, b) => new Date(a.value[0]).getTime() - new Date(b.value[0]).getTime()),
        markLine: index === 0 && threshold.length ? { silent: true, symbol: ['none', 'none'], data: threshold } : undefined,
        markArea: index === 0 && gaps.length ? {
          silent: true,
          label: { show: true, formatter: (params) => params?.name || (availabilityMode ? 'NO OBSERVATION' : 'COLLECTION GAP'), fontSize: 8, color: availabilityMode ? colors.attention : colors.warning, position: 'insideTop' },
          itemStyle: { color: availabilityMode ? colors.attention : colors.warning, opacity: .06, borderColor: availabilityMode ? colors.attention : colors.warning, borderWidth: 1, borderType: 'dashed' },
          data: gaps.map(([from, to]) => [{ name: availabilityMode ? `NO OBSERVATION · ${formatWib(from, false)}–${formatWib(to, false)} WIB · ${gapDurationText(from, to)}` : gapLabel(from, to), xAxis: from }, { xAxis: to }]),
        } : undefined,
      }))
    }
  }, [mode, range, trend])

  React.useEffect(() => {
    if (!ref.current) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(option, true)
    const click = (event) => {
      const pixel = [event?.offsetX, event?.offsetY]
      if (!chart.containPixel({ gridIndex: 0 }, pixel)) return
      let nearest = null
      let distance = Number.POSITIVE_INFINITY
      ;(option.series || []).forEach((series, seriesIndex) => (series.data || []).forEach((item, dataIndex) => {
        const point = chart.convertToPixel({ seriesIndex }, item.value)
        if (!Array.isArray(point)) return
        const current = ((point[0] - pixel[0]) ** 2) + ((point[1] - pixel[1]) ** 2)
        if (current < distance) { distance = current; nearest = { seriesIndex, dataIndex, item } }
      }))
      if (!nearest) return
      chart.dispatchAction({ type: 'showTip', seriesIndex: nearest.seriesIndex, dataIndex: nearest.dataIndex })
      const item = nearest.item
      const availability = trend?.metric === 'availability'
      const selectedAt = availability ? item.bucket : (mode === 'max' ? (item.peakAt || item.bucket) : item.bucket)
      const selectedCollectionId = availability ? '' : (mode === 'max' ? (item.peakCollectionId || '') : '')
      onSelect?.({ host: item.host, at: selectedAt, collectionId: selectedCollectionId, bucket: item.bucket, value: availability ? item.status : (mode === 'max' ? item.max : item.avg), status: item.status, availability, mode, metricLabel: trend?.metric_label || metricLabel(trend?.metric), unit: availability ? '' : (trend?.unit || '') })
    }
    chart.getZr().on('click', click)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); chart.getZr().off('click', click); chart.dispose() }
  }, [mode, onSelect, option, trend])

  return <div ref={ref} className="rundeckTrendChart" role="img" aria-label="Server trend" />
}

function selectedTimelineRow(selected, timeline) {
  if (!selected?.host) return null
  return (timeline?.items || []).find((row) => shortHost(row.host) === shortHost(selected.host)) || null
}

function snapshotContext(selected, row, consumer) {
  if (!consumer?.consumer_key) return null
  return {
    key: consumer.consumer_key,
    host: row?.host || selected?.host || '',
    consumerType: consumer.consumer_type || '',
    source: 'trend-snapshot',
    at: selected?.at || '',
    collectionId: row?.collection_id || selected?.collectionId || '',
    trendMode: selected?.mode || '',
    trendMetric: selected?.metricLabel || '',
  }
}

function pssValue(consumer) {
  const details = consumer?.details || {}
  const value = details.total_pss_gb ?? details.pss_gb
  return value === null || value === undefined ? null : Number(value)
}

function processCount(consumer) {
  const details = consumer?.details || {}
  const value = details.process_count ?? details.pids?.length
  return value === null || value === undefined ? null : Number(value)
}

function SelectedTime({ selected, timeline, loading, error, onSelectJob }) {
  if (!selected && !loading && !error) return <div className="rundeckRcaHint">Click a chart point to inspect that APP's historical workload snapshot.</div>
  const selectedRow = selectedTimelineRow(selected, timeline)
  const consumers = selectedRow?.top_consumers || []
  const collectionId = selectedRow?.collection_id || timeline?.collection_id || selected?.collectionId || ''
  return <section className="rundeckRcaSection" aria-live="polite">
    <div className="rundeckRcaHeader"><div><span>Selected Time</span><h4><SphereIcon name="target" /> {selected?.host ? shortHost(selected.host) : 'APP'}</h4><small>{selected?.at ? `${formatWib(selected.at, true)} WIB` : 'Loading'}</small></div>{selectedRow && <span className={`rundeckInlineStatus is-${hostResourceState(selectedRow).toLowerCase()}`}>{hostResourceState(selectedRow)}</span>}</div>
    {loading && <div className="rundeckHistoryState">Loading historical snapshot…</div>}
    {error && <div className="rundeckHistoryState is-error">{error}</div>}
    {!loading && !error && selected && <div className="rundeckHistoricalSnapshot">
      <div className="rundeckHistoricalSnapshotHead">
        <div><span>Historical Snapshot</span><strong>Top workloads observed on {shortHost(selected.host)} at this collection</strong></div>
        <small>{collectionId ? `Collection ${collectionId.replace(/^rundeck-/, '').slice(0, 18)}` : 'Nearest retained collection'}</small>
      </div>
      <div className="rundeckSnapshotConsumers">
        {consumers.map((consumer, index) => {
          const context = snapshotContext(selected, selectedRow, consumer)
          const pss = pssValue(consumer)
          const processes = processCount(consumer)
          return <div key={`${consumer.consumer_type}-${consumer.consumer_key}-${index}`} className="rundeckSnapshotConsumer">
            <button type="button" className="rundeckSnapshotConsumerButton" onClick={() => context && onSelectJob?.(context)} title={`${workloadTypeLabel(consumer.consumer_type)} · click to inspect historical workload detail`}>{index + 1}. {consumer.consumer_key}</button>
            <span className="rundeckSnapshotMetric">CPU <b>{numberText(consumer.cpu_pct, 1)}%</b></span>
            <span className="rundeckSnapshotMetric">PSS <b>{pss === null || Number.isNaN(pss) ? '—' : `${numberText(pss, 2)}G`}</b></span>
            <span className="rundeckSnapshotMetric">Proc <b>{processes === null || Number.isNaN(processes) ? '—' : numberText(processes, 0)}</b></span>
          </div>
        })}
        {!consumers.length && <div className="rundeckSnapshotEmpty">No retained workload context was stored for this APP in the resolved collection.</div>}
      </div>
    </div>}
  </section>
}

export default function RundeckServerTrend({ refreshToken = '', databaseEnabled = false, onSelectJob, onTrendContext }) {
  const saved = React.useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem(TREND_STORAGE_KEY) || '{}') } catch { return {} }
  }, [])
  const [range, setRange] = React.useState(RANGES.some(([key]) => key === saved.range) ? saved.range : DEFAULT_RANGE)
  const [bucket, setBucket] = React.useState(BUCKETS.some(([key]) => key === saved.bucket) ? saved.bucket : 'auto')
  const [metric, setMetric] = React.useState(METRICS.some(([key]) => key === saved.metric) || AVAILABILITY_CATEGORIES[saved.metric] ? saved.metric : 'cpu')
  const [mode, setMode] = React.useState(saved.mode === 'avg' ? 'avg' : 'max')
  const [trend, setTrend] = React.useState(null)
  const [trendLoading, setTrendLoading] = React.useState(false)
  const [trendError, setTrendError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [timeline, setTimeline] = React.useState(null)
  const [timelineLoading, setTimelineLoading] = React.useState(false)
  const [timelineError, setTimelineError] = React.useState('')
  const timelineRequestSequence = React.useRef(0)
  const availabilityMetric = Boolean(AVAILABILITY_CATEGORIES[metric])

  React.useEffect(() => { onTrendContext?.({ metric, metricLabel: trend?.metric_label || metricLabel(metric), range, rangeLabel: rangeLabel(range), mode }) }, [metric, mode, onTrendContext, range, trend?.metric_label])
  React.useEffect(() => {
    try { window.localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify({ range, bucket, metric, mode })) } catch { /* best-effort UI preference */ }
  }, [bucket, metric, mode, range])
  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    setTrendLoading(true); setTrendError('')
    const category = AVAILABILITY_CATEGORIES[metric]
    const url = category ? `${API}/availability/history?range=${encodeURIComponent(range)}&category=${encodeURIComponent(category)}` : `${API}/history/trend?range=${encodeURIComponent(range)}&bucket=${encodeURIComponent(bucket)}&metric=${encodeURIComponent(metric)}`
    json(url, controller.signal).then((result) => setTrend(category ? { ...result, metric: 'availability', metric_label: result.metric_label || metricLabel(metric), display_metric: metric } : result)).catch((failure) => { if (failure.name !== 'AbortError') setTrendError(failure.message || 'Unable to load trend.') }).finally(() => { if (!controller.signal.aborted) setTrendLoading(false) })
    return () => controller.abort()
  }, [bucket, databaseEnabled, metric, range, refreshToken])
  React.useEffect(() => { timelineRequestSequence.current += 1; setSelected(null); setTimeline(null); setTimelineLoading(false); setTimelineError('') }, [bucket, metric, mode, range])

  const selectPoint = React.useCallback((point) => {
    timelineRequestSequence.current += 1
    const requestSequence = timelineRequestSequence.current
    setSelected(point); setTimeline(null); setTimelineLoading(false); setTimelineError('')
    if (!point?.at || (point.availability && !/^APP\d+$/i.test(String(shortHost(point.host || ''))))) return
    setTimelineLoading(true)
    const collection = point.collectionId ? `&collection_id=${encodeURIComponent(point.collectionId)}` : ''
    json(`${API}/history/timeline?at=${encodeURIComponent(point.at)}&window_minutes=5${collection}`)
      .then((result) => {
        if (timelineRequestSequence.current !== requestSequence) return
        setTimeline(result)
      })
      .catch((failure) => {
        if (timelineRequestSequence.current === requestSequence) setTimelineError(failure.message || 'Unable to load historical snapshot.')
      })
      .finally(() => {
        if (timelineRequestSequence.current === requestSequence) setTimelineLoading(false)
      })
  }, [])

  return <section className="rundeckServerTrendPanelV1234" aria-label="Server Trend">
    <div className="rundeckMonitoringHead"><h3><SphereIcon name="trend" /> Server Trend</h3></div>
    <div className="rundeckTrendToolbar"><div className="rundeckTrendGroup"><Segmented options={METRICS} value={metric} onChange={setMetric} ariaLabel="Performance metric" /></div><div className="rundeckTrendGroup"><Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="Time period" /></div>{!availabilityMetric && <div className="rundeckTrendGroup"><Segmented options={[["avg", "Avg"], ["max", "Peak"]]} value={mode} onChange={setMode} ariaLabel="Trend view" /></div>}</div>
    <details className="rundeckAdvancedControls"><summary>Advanced</summary><div><button type="button" className={metric === 'load' ? 'is-active' : ''} onClick={() => setMetric('load')}>Load</button><button type="button" className={metric === 'swap' ? 'is-active' : ''} onClick={() => setMetric('swap')}>Swap I/O</button><button type="button" className={metric === 'hana' ? 'is-active' : ''} onClick={() => setMetric('hana')}>HANA</button><button type="button" className={metric === 'replication' ? 'is-active' : ''} onClick={() => setMetric('replication')}>Replication</button><button type="button" className={metric === 'ssh' ? 'is-active' : ''} onClick={() => setMetric('ssh')}>SSH</button><button type="button" className={metric === 'web' ? 'is-active' : ''} onClick={() => setMetric('web')}>Web Dispatcher</button>{!availabilityMetric && <Segmented options={BUCKETS} value={bucket} onChange={setBucket} ariaLabel="Trend interval" />}</div></details>
    {!databaseEnabled && <div className="rundeckHistoryState">Trend data is not available yet.</div>}
    {databaseEnabled && trendLoading && <div className="rundeckHistoryState">Loading trend…</div>}
    {databaseEnabled && trendError && <div className="rundeckHistoryState is-error">{trendError}</div>}
    {databaseEnabled && !trendLoading && !trendError && trend?.items?.length > 0 && <><TrendFreshness trend={trend} /><AvailabilityCoverageBand trend={trend} /><CollectionGapBand trend={trend} /><AvailabilityObservationSummary trend={trend} /><TrendChart trend={trend} mode={mode} range={range} onSelect={selectPoint} /></>}
    {databaseEnabled && !trendLoading && !trendError && trend && !trend.items?.length && <div className="rundeckHistoryState">No stored data in this range yet.</div>}
    <SelectedTime selected={selected} timeline={timeline} loading={timelineLoading} error={timelineError} onSelectJob={onSelectJob} />
  </section>
}
