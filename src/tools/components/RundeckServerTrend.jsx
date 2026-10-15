import { buildHostTrendSeries } from './rundeckTrendSeries.js'
import { trendPercentAxisMax } from './rundeckTrendAxis.js'
import { technicalLoadScale } from './rundeckTechnicalLoadScale.js'
import React from 'react'
import { createPortal } from 'react-dom'
import * as echarts from './logEcharts.js'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import { hostResourceState } from './rundeckStatusSemantics.js'
import { resolveServerTrendMetrics } from './rundeckTrendPreferences.js'
import { wibMinuteInput, validateCustomRange, customRangeSearch, customRangeCaption } from './rundeckCustomRange.js'
import RundeckCustomWindowDetails from './RundeckCustomWindowDetails.jsx'
import { resolveTrendFocus, trendFocusStyle, trendHostColorIndex, trendFocusHosts } from './rundeckTrendFocus.js'
import './RundeckWorkloadExplorer.css'

const API = `${import.meta.env.BASE_URL}api`
const DEFAULT_RANGE = '6h'
const TREND_STORAGE_KEY = 'sphere.live.trend'
const RANGES = [['30m', '30M'], ['1h', '1H'], ['3h', '3H'], ['6h', '6H'], ['24h', '24H'], ['7d', '7D'], ['30d', '30D']]
const BUCKETS = [['auto', 'Auto'], ['10m', '10m'], ['30m', '30m'], ['1h', '1H'], ['6h', '6H'], ['1d', '1D']]
const METRICS = [['cpu', 'CPU'], ['ram', 'RAM'], ['iowait', 'I/O Wait'], ['wp', 'Critical WP'], ['availability', 'Availability']]
const AVAILABILITY_CATEGORIES = { availability: 'SAP_APP', hana: 'HANA_SYSTEM_DB', replication: 'HANA_REPLICATION', ssh: 'SSH', web: 'WEB_DISPATCHER' }
const DEFAULT_COLLECTION_CADENCE_MS = 10 * 60 * 1000
const BUCKET_INTERVAL_MS = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}

const metricLabel = (value) => ({ cpu: 'CPU', ram: 'RAM', iowait: 'I/O Wait', wp: 'Critical WP', availability: 'Availability', swap: 'Swap I/O', load: 'Load', hana: 'HANA Availability', replication: 'Replication Availability', ssh: 'SSH Reachability', web: 'Web Dispatcher Availability' })[value] || 'Metric'
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
    return new Intl.DateTimeFormat('id-ID', { ...base, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
  }
  return formatWib(value, false)
}

function numericTrendSample(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const sample = Number(value)
  return Number.isFinite(sample) ? sample : null
}

function formatSavedBucketWindow(trend, bucket) {
  const at = Date.parse(bucket || '')
  if (!Number.isFinite(at)) return 'Bucket unavailable'
  const duration = BUCKET_INTERVAL_MS[String(trend?.bucket || '').toLowerCase()] || null
  if (!duration) return `Bucket ${formatWib(at, true)} WIB`
  const end = at + duration
  const fromLabel = formatWib(at, true)
  const endLabel = formatWib(end, true)
  const sameDate = fromLabel.split(',')[0] === endLabel.split(',')[0]
  return `Bucket ${fromLabel}–${sameDate ? formatWib(end) : endLabel} WIB`
}
function trendAxisSplitNumber(range) {
  if (range === '30d') return 6
  if (range === '7d') return 6
  if (range === '24h') return 6
  if (range === '6h') return 6
  return 5
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

function gapTimeRangeText(from, to) {
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
  const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' })
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })
  const startDate = dateFmt.format(start)
  const endDate = dateFmt.format(end)
  const startTime = timeFmt.format(start).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
  const endTime = timeFmt.format(end).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
  return `${startDate} ${startTime} - ${endDate} ${endTime} WIB`
}

function gapLabel(from, to) {
  return `COLLECTION GAP - ${gapTimeRangeText(from, to)} - ${gapDurationText(from, to)}`
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
  const customEnd = Date.parse(trend?.window_end || '')
  const rangeEnd = Number.isFinite(customEnd) ? customEnd - 1 : Date.now()
  const intervalMs = resolvedGapIntervalMs(trend)

  if (trend?.metric === 'availability' && Array.isArray(trend?.observation_gaps)) {
    const gaps = trend.observation_gaps
      .map((gap) => [Date.parse(gap?.from || ''), Date.parse(gap?.to || '')])
      .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
    return { gaps, rangeStart, rangeEnd, intervalMs, historyStartedAt: null }
  }

  const gapThresholdMs = intervalMs * 2
  const buckets = Array.from(new Set(rows.map((row) => Date.parse(row.bucket)).filter(Number.isFinite))).sort((a, b) => a - b)
  const historyStartedAt = Number.isFinite(rangeStart) && buckets.length && buckets[0] - rangeStart > gapThresholdMs
    ? buckets[0]
    : null
  const gaps = []
  for (let index = 1; index < buckets.length; index += 1) {
    if (buckets[index] - buckets[index - 1] > gapThresholdMs) gaps.push([buckets[index - 1] + intervalMs, buckets[index] - intervalMs])
  }
  if (buckets.length && rangeEnd - buckets[buckets.length - 1] > gapThresholdMs) gaps.push([buckets[buckets.length - 1] + intervalMs, rangeEnd])
  return { gaps, rangeStart, rangeEnd, intervalMs, historyStartedAt }
}

function CollectionGapBand({ trend }) {
  const { gaps, historyStartedAt } = React.useMemo(() => trendGaps(trend), [trend])
  const observed = trend?.metric === 'availability'
  if (!gaps.length && !historyStartedAt) return null
  const sorted = [...gaps].sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]))
  const [from, to] = sorted[0] || []
  return <>
    {historyStartedAt && !observed && <div className="rundeckHistoryStartV13471" role="status" title="Earlier time in this selected range has no retained SPHERE performance collection.">
      <span>Data tersimpan mulai</span>
      <strong>{formatWib(historyStartedAt, true)} WIB</strong>
    </div>}
    {gaps.length > 0 && <details className={`rundeckCollectionGapBandV132 ${observed ? 'is-observation-gap' : ''}`} role="status">
      <summary title={observed ? 'No Service Availability observation was retained for this interval. Missing observation is UNKNOWN, not DOWN.' : 'No retained performance collection exists inside this interval. This is a data collection gap, not evidence of SAP downtime.'}>
        <span>{observed ? 'No Observation' : 'Collection Gap'}</span>
        <strong>{gapTimeRangeText(from, to)}</strong>
        <small>{gapDurationText(from, to)}{gaps.length > 1 ? ` · +${gaps.length - 1} more` : ''}</small>
      </summary>
      {gaps.length > 1 && <div className="rundeckGapDetailsV133">
        {sorted.slice(0, 8).map(([gapFrom, gapTo], index) => <div key={`${gapFrom}-${gapTo}`}>
          <b>{index + 1}</b><span>{gapTimeRangeText(gapFrom, gapTo)}</span><small>{gapDurationText(gapFrom, gapTo)}</small>
        </div>)}
        {gaps.length > 8 && <small>+{gaps.length - 8} more retained-gap interval{gaps.length - 8 === 1 ? '' : 's'}</small>}
      </div>}
    </details>}
  </>
}

function AvailabilityCoverageBand({ trend }) {
  if (trend?.metric !== 'availability' || !trend?.coverage_limited || !trend?.history_started_at) return null
  return <div className="rundeckCoverageBandV133">
    <span>History Coverage</span>
    <strong>starts {formatWib(trend.history_started_at, true)} WIB</strong>
    <small>Earlier history was not retained by SPHERE. This is not an outage.</small>
  </div>
}

function AvailabilityObservationSummary({ trend }) {
  if (trend?.metric !== 'availability' || !Array.isArray(trend?.uptime) || !trend.uptime.length) return null
  const observedAt = trend?.latest_observation_at || trend?.latest_collection_at
  const observedMs = Date.parse(observedAt || '')
  const ageMinutes = Number.isFinite(observedMs) ? Math.max(0, Math.floor((Date.now() - observedMs) / 60000)) : null
  const staleAfter = Math.max(1, Number(trend?.stale_after_minutes || 20))
  const observedLabel = ageMinutes === null ? 'Saved availability · time unknown'
    : ageMinutes >= staleAfter ? `Saved availability · ${ageMinutes}m old` : 'Observed availability'
  return <div className="rundeckAvailabilitySummaryV133" title={`Saved Service Availability checks, not an SLA or current replication-health verdict. Last observation: ${observedAt ? `${formatWib(observedAt, true)} WIB` : 'unknown'}.`}>
    <span>{observedLabel}</span>
    <div>{trend.uptime.map((row) => <small key={row.name}><b>{row.name}</b> {row.uptime_pct === null || row.uptime_pct === undefined ? '—' : `${numberText(row.uptime_pct, 2)}%`}</small>)}</div>
  </div>
}

function TrendFreshness({ trend }) {
  // Availability age is shown inline next to the saved-check percentages.
  if (trend?.metric === 'availability' || trend?.range === 'custom') return null
  const latest = Date.parse(trend?.latest_collection_at || '')
  const staleMinutes = Math.max(1, Number(trend?.stale_after_minutes || 20))
  if (!Number.isFinite(latest) || Date.now() - latest < staleMinutes * 60 * 1000) return null
  const ageMinutes = Math.max(1, Math.floor((Date.now() - latest) / 60000))
  return <div className="rundeckHistoryState">Last collection {ageMinutes}m ago · {formatWib(trend.latest_collection_at, true)} WIB · showing saved history</div>
}

function TrendChart({ trend, mode, range, onSelect, selectedHost = '', scaleMode = 'full', technicalAxisMax = null }) {
  const ref = React.useRef(null)
  const chartRef = React.useRef(null)
  const activeCallbackRef = React.useRef(null)
  const optionSchemaRef = React.useRef('')
  const reduceMotion = React.useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  // Recompute ECharts color tokens on a theme toggle. No network fetch or timer.
  const [themeRevision, setThemeRevision] = React.useState(0)
  React.useEffect(() => {
    const observer = new MutationObserver((records) => {
      if (records.some(record => record.attributeName === 'data-theme')) setThemeRevision(value => value + 1)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  const hosts = React.useMemo(() => Array.from(new Set((trend?.items || []).map(row => row.host))).sort(), [trend])
  const hostLabels = React.useMemo(() => hosts.map(shortHost), [hosts])
  const focusedHost = resolveTrendFocus(null, shortHost(selectedHost || ''), hostLabels)
  const option = React.useMemo(() => {
    // Theme revision is part of the memoized palette snapshot: refresh ECharts tokens after theme changes.
    const colors = { ...palette(), revision: themeRevision }
    const rows = trend?.items || []
    const availabilityMode = trend?.metric === 'availability'
    const selectedKey = focusedHost
    const valueKey = mode === 'max' ? 'max_value' : 'avg_value'
    // Focus changes only the visual Y range, never samples, severity thresholds, or source evidence.
    const percentTrend = !availabilityMode && trend?.unit === '%'
    const focusAxisMax = percentTrend ? trendPercentAxisMax(rows, valueKey, scaleMode) : 100
    const compactPoints = ['custom', '30m', '1h', '3h', '6h'].includes(range)
    const { gaps, rangeStart, rangeEnd } = trendGaps(trend)
    const gapPoints = gaps.map(([from, to]) => Math.round((from + to) / 2))
    const threshold = []
    if (!availabilityMode && trend?.warning !== null && trend?.warning !== undefined) threshold.push({ yAxis: Number(trend.warning), lineStyle: { color: colors.warning, type: 'dashed', opacity: .45 }, label: { formatter: `Warn ${trend.warning}${trend?.unit === '%' ? '%' : ''}`, color: colors.warning, fontSize: 9.2, fontWeight: 600, position: 'insideEndTop' } })
    if (!availabilityMode && trend?.critical !== null && trend?.critical !== undefined) threshold.push({ yAxis: Number(trend.critical), lineStyle: { color: colors.danger, type: 'dashed', opacity: .48 }, label: { formatter: `Crit ${trend.critical}${trend?.unit === '%' ? '%' : ''}`, color: colors.danger, fontSize: 9.2, fontWeight: 600, position: 'insideEndTop' } })
    const visibleThresholds = scaleMode === 'focus' && percentTrend ? threshold.filter(line => line.yAxis <= focusAxisMax) : threshold
    return {
      // Reveal observed history once; avoid perpetual "live" motion.
      // Reduced-motion preference is respected by the chart renderer itself.
      animationDuration: reduceMotion ? 0 : 300,
      animationDelay: 0,
      animationDurationUpdate: reduceMotion ? 0 : 200,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      backgroundColor: 'transparent', color: colors.series, textStyle: { color: colors.text },
      legend: { show: false, top: 0, type: 'scroll', itemWidth: 15, itemHeight: 9, itemGap: 12, data: hostLabels, textStyle: { color: colors.secondary, fontSize: 11.2, fontWeight: 600 } },
      // The panel heading carries the metric. Reserve the upper plot rail
      // for the accessible APP trace selector, not a duplicate axis name.
      grid: { left: 58, right: 72, top: 32, bottom: compactPoints ? 34 : 48 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        enterable: false,
        hideDelay: 0,
        transitionDuration: 0,
        position: (pos, params, dom, rect, size) => {
          const x = pos[0] > size.viewSize[0] / 2 ? 6 : Math.max(6, size.viewSize[0] - size.contentSize[0] - 6)
          const y = Math.max(6, Math.min(8, size.viewSize[1] - size.contentSize[1] - 6))
          return [x, y]
        },
        extraCssText: 'max-width:340px;min-width:230px;white-space:normal;line-height:1.35;pointer-events:none;',
        backgroundColor: colors.panel,
        borderWidth: 0,
        textStyle: { color: colors.text, fontSize: 11 },
        formatter: (points = []) => {
          if (!points.length) return ''
          const bucketAt = points[0]?.axisValue
          const valid = points.filter(point => {
            const sample = point?.data?.value?.[1]
            return sample !== null && sample !== undefined && sample !== '' && Number.isFinite(Number(sample))
          })
          const focused = valid.find(point => point.seriesName === focusedHost)
          const ranked = [...valid].sort((a, b) => Number(b.data.value[1]) - Number(a.data.value[1]))
          const visible = focused ? [focused, ...ranked.filter(point => point !== focused)] : ranked
          const intervalMs = resolvedGapIntervalMs(trend)
           const intervalEnd = (typeof bucketAt === 'number' ? bucketAt : Date.parse(bucketAt)) + intervalMs
           const intervalLabel = Number.isFinite(intervalEnd) && Number.isFinite(intervalMs)
             ? ` – ${formatWib(intervalEnd, true)} WIB` : ' WIB'
           const lines = [`<b>Bucket ${formatWib(bucketAt, true)}${intervalLabel} · ${mode === 'max' ? 'Peak' : 'Avg'}</b>`]
          visible.forEach(point => {
            const name = String(point.seriesName || '').replace(/[&<>"']/g, character => ({
              '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
            })[character])
            lines.push(`${point.marker || ''}${name} <b>${numberText(point.data.value[1], 1)}${trend?.unit === '%' ? '%' : ''}</b>${mode === 'max' && point.data?.peakAt ? ` · Peak at ${formatWib(point.data.peakAt, true)} WIB` : ''}`)
          })
          if (valid.length && visible.length < hosts.length) lines.push(`${hosts.length - visible.length} APP without samples in this bucket`)
          if (!valid.length) lines.push('No retained sample in bucket')
          return lines.join('<br/>')
        },
      },
      xAxis: { type: 'time', min: Number.isFinite(rangeStart) ? rangeStart : undefined, max: rangeEnd, splitNumber: trendAxisSplitNumber(range), axisLabel: { color: colors.muted, fontSize: 10.5, hideOverlap: true, showMinLabel: true, showMaxLabel: !['7d', '30d'].includes(range), margin: 10, formatter: (value) => formatTrendAxis(value, range) }, axisTick: { show: false }, axisLine: { lineStyle: { color: colors.grid } }, splitLine: { show: false } },
      yAxis: { type: 'value', name: '', nameTextStyle: { color: colors.muted, fontSize: 10 }, axisLabel: { color: colors.muted, fontSize: 10, formatter: availabilityMode ? ((value) => Number(value) >= 75 ? 'UP' : Number(value) <= 25 ? 'DOWN' : '') : ((value) => `${value}${trend?.unit === '%' ? '%' : ''}`) }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { lineStyle: { color: colors.grid } }, min: availabilityMode || trend?.unit === '%' ? 0 : undefined, max: availabilityMode || trend?.unit === '%' ? focusAxisMax : (trend?.metric === 'load' && Number.isFinite(technicalAxisMax) ? technicalAxisMax : undefined), splitNumber: 2 },
      dataZoom: [{ type: 'inside', filterMode: 'none' }],
      series: hosts.map((host, index) => {
        const traceStyle = trendFocusStyle(shortHost(host), selectedKey, availabilityMode)
        const traceColor = colors.series[trendHostColorIndex(shortHost(host), index, colors.series.length)]
        const focused = selectedKey && shortHost(host) === selectedKey
        return {
        id: host, name: shortHost(host), type: 'line', step: availabilityMode ? 'end' : false, connectNulls: false,
        showSymbol: availabilityMode || compactPoints,
        symbolSize: availabilityMode
          ? ((value, params) => String(params?.data?.status || '').toUpperCase() === 'DOWN' ? 8 : 3.5)
          : (focused ? 5 : (compactPoints ? 3.5 : 2.5)),
        lineStyle: { color: traceColor, width: traceStyle.width, opacity: traceStyle.opacity },
        itemStyle: availabilityMode
          ? { color: (params) => String(params?.data?.status || '').toUpperCase() === 'DOWN' ? colors.danger : colors.attention, opacity: traceStyle.itemOpacity }
          : { color: traceColor, opacity: traceStyle.itemOpacity },
        emphasis: { focus: 'series', scale: true, lineStyle: { width: availabilityMode ? 2.5 : 2.8, opacity: 1 } },
        data: buildHostTrendSeries(
          rows.filter((row) => row.host === host).map((row) => ({ value: [row.bucket, row[valueKey]], bucket: row.bucket, peakAt: row.peak_at, peakCollectionId: row.peak_collection_id, host: row.host, avg: row.avg_value, max: row.max_value, status: row.status })),
          resolvedGapIntervalMs(trend),
          gapPoints.map((at) => ({ value: [at, null], gap: true }))
        ),
        markLine: index === 0 && visibleThresholds.length ? { silent: true, symbol: ['none', 'none'], data: visibleThresholds } : undefined,
        markArea: index === 0 && gaps.length ? {
          silent: true,
          label: { show: true, formatter: (params) => params?.name || (availabilityMode ? 'NO OBSERVATION' : 'COLLECTION GAP'), fontSize: 8, color: availabilityMode ? colors.attention : colors.warning, position: 'insideTop' },
          itemStyle: { color: availabilityMode ? colors.attention : colors.warning, opacity: availabilityMode ? .035 : .06, borderColor: availabilityMode ? colors.attention : colors.warning, borderWidth: 1, borderType: 'dashed' },
          data: gaps.map(([from, to]) => [{ name: availabilityMode ? `NO OBSERVATION · ${formatWib(from, false)}–${formatWib(to, false)} WIB · ${gapDurationText(from, to)}` : gapLabel(from, to), xAxis: from }, { xAxis: to }]),
        } : undefined,
      }
      })
    }
  }, [focusedHost, hostLabels, hosts, mode, range, reduceMotion, scaleMode, technicalAxisMax, trend, themeRevision])

  // ECharts stays mounted while focus and stored samples update. No chart loop.
  // The latest handler is read at click-time, not captured by the mount effect.
  React.useEffect(() => {
    activeCallbackRef.current = { onSelect, trend, mode, option }
  }, [onSelect, trend, mode, option])

  React.useEffect(() => {
    if (!ref.current) return undefined
    const chart = echarts.getInstanceByDom?.(ref.current) || echarts.init(ref.current, null, { renderer: 'canvas' })
    chartRef.current = chart
    let lastExactClickAt = 0

    const selectItem = (item) => {
      if (!item || item.gap || item?.value?.[1] === null || item?.value?.[1] === undefined) return
      // A click opens exact-sample analysis; do not leave a hover bubble over the plot.
      chart.dispatchAction({ type: 'hideTip' })
      const { onSelect: currentSelect, trend: currentTrend, mode: currentMode } = activeCallbackRef.current
      const availability = currentTrend?.metric === 'availability'
      const selectedAt = availability ? item.bucket : (currentMode === 'max' ? (item.peakAt || item.bucket) : item.bucket)
      const selectedCollectionId = availability ? '' : (currentMode === 'max' ? (item.peakCollectionId || '') : '')
      currentSelect?.({
        host: item.host, at: selectedAt, collectionId: selectedCollectionId,
        peakAtVerified: currentMode === 'max' && Boolean(item.peakAt),
        bucket: item.bucket, value: availability ? item.status : (currentMode === 'max' ? item.max : item.avg),
        status: item.status, availability, mode: currentMode,
        metricLabel: currentTrend?.metric_label || metricLabel(currentTrend?.metric),
        unit: availability ? '' : (currentTrend?.unit || ''),
      })
    }

    const exactClick = (params) => {
      const item = params?.data
      if (!item || item.gap) return
      lastExactClickAt = Date.now()
      selectItem(item)
    }

    const fallbackClick = (event) => {
      if (Date.now() - lastExactClickAt < 80) return
      const pixel = [event?.offsetX, event?.offsetY]
      if (!chart.containPixel({ gridIndex: 0 }, pixel)) return
      const activeOption = activeCallbackRef.current.option
      let nearest = null
      let distance = Number.POSITIVE_INFINITY
      ;(activeOption.series || []).forEach((series, seriesIndex) => (series.data || []).forEach((item, dataIndex) => {
        if (item?.gap || item?.value?.[1] === null || item?.value?.[1] === undefined) return
        const point = chart.convertToPixel({ seriesIndex }, item.value)
        if (!Array.isArray(point)) return
        const current = ((point[0] - pixel[0]) ** 2) + ((point[1] - pixel[1]) ** 2)
        if (current < distance) { distance = current; nearest = { seriesIndex, dataIndex, item } }
      }))
      if (!nearest || distance > 900) return
      selectItem(nearest.item)
    }

    chart.on('click', exactClick)
    chart.getZr().on('click', fallbackClick)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.off('click', exactClick)
      chart.getZr().off('click', fallbackClick)
      chart.dispose()
      chartRef.current = null
      optionSchemaRef.current = ''
    }
  }, [])

  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const schema = `${trend?.metric || ''}:${range}:${mode}:${scaleMode}:${technicalAxisMax ?? 'auto'}`
    const schemaChanged = optionSchemaRef.current !== schema
    optionSchemaRef.current = schema
    chart.setOption(reduceMotion ? { ...option, animation: false } : option, {
      notMerge: schemaChanged,
      replaceMerge: schemaChanged ? undefined : ['series'],
      lazyUpdate: false,
    })
  }, [mode, option, range, reduceMotion, scaleMode, technicalAxisMax, trend?.metric])

  return <div className="rundeckTrendPlot">
    <div ref={ref} className="rundeckTrendChart" role="img"
      aria-label={`Saved ${trend?.metric_label || metricLabel(trend?.metric)} trend; select an APP to highlight its existing observations`} />
  </div>
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
    trendBucket: selected?.bucket || '',
    trendValue: selected?.value ?? null,
    snapshot: {
      collection_id: consumer.collection_id || row?.collection_id || selected?.collectionId || '',
      collected_at: consumer.collected_at || selected?.at || '',
      host: consumer.host || row?.host || selected?.host || '',
      consumer_type: consumer.consumer_type || '',
      consumer_key: consumer.consumer_key || '',
      rank: consumer.rank ?? null,
      cpu_pct: consumer.cpu_pct ?? null,
      ram_pct: consumer.ram_pct ?? null,
      host_wp_critical: row?.wp_critical ?? null,
      details: consumer.details || {},
    },
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

function MiniTrendContext({ trend, selected, range }) {
  const model = React.useMemo(() => {
    const host = selected?.host || ''
    const unit = selected?.unit || trend?.unit || ''
    const rows = (trend?.items || [])
      .filter((row) => shortHost(row.host || '') === shortHost(host))
      .map((row) => {
        const at = Date.parse(row.bucket || '')
        const value = numericTrendSample(selected?.mode === 'max' ? row.max_value : row.avg_value)
        const peakAt = Date.parse(row.peak_at || '')
        return Number.isFinite(at) && value !== null ? { at, value, peakAt: Number.isFinite(peakAt) ? peakAt : null } : null
      })
      .filter(Boolean)
      .sort((a,b)=>a.at-b.at)
    if (rows.length < 2) return null

    const minAt = rows[0].at
    const maxAt = rows.at(-1).at
    const values = rows.map((row)=>row.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const warning = numericTrendSample(trend?.warning)
    const critical = numericTrendSample(trend?.critical)
    const percentScale = unit === '%'
    const yMin = percentScale ? 0 : Math.min(rawMin, 0)
    const yMaxBase = Math.max(rawMax, Number.isFinite(critical) ? critical : Number.NEGATIVE_INFINITY, Number.isFinite(warning) ? warning : Number.NEGATIVE_INFINITY)
    const yMax = percentScale ? 100 : (yMaxBase > yMin ? yMaxBase * 1.08 : yMin + 1)
    const spanAt = Math.max(1, maxAt-minAt)
    const spanValue = Math.max(1e-9, yMax-yMin)
    const point = (row) => ({
      x: 52 + ((row.at-minAt)/spanAt)*438,
      y: 78 - ((row.value-yMin)/spanValue)*58,
    })
    const y = (value) => 78 - ((value-yMin)/spanValue)*58
    const points = rows.map((row)=>point(row))
    const selectedActualAt = selected?.mode === 'max' && selected?.peakAtVerified ? Date.parse(selected?.at || '') : NaN
    const selectedBucketAt = Date.parse(selected?.bucket || '')
    // Do not present a nearest or missing bucket as the exact selected point.
    const selectedRow = Number.isFinite(selectedBucketAt) ? rows.find(row => row.at === selectedBucketAt) : null
    const marker = selectedRow ? point(selectedRow) : null
    const selectedValue = numericTrendSample(selected?.value)
    const resolvedSelectedValue = selectedValue ?? selectedRow?.value ?? null
    const peakRow = rows.reduce((best,row)=>!best || row.value>best.value ? row : best,null)
    return {
      points: points.map((p)=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      marker,
      rawMin,
      rawMax,
      yMin,
      yMax,
      warning:Number.isFinite(warning)?warning:null,
      critical:Number.isFinite(critical)?critical:null,
      selectedValue:resolvedSelectedValue,
      firstAt:minAt,
      lastAt:maxAt,
      selectedActualAt:Number.isFinite(selectedActualAt) ? selectedActualAt : null,
      selectedBucketAt:Number.isFinite(selectedBucketAt) ? selectedBucketAt : null,
      peakObservedAt:selected?.mode === 'max' ? peakRow?.peakAt ?? null : null,
      peakBucketAt:peakRow?.at ?? null,
      peakValue:peakRow?.value ?? null,
      y,
      unit,
    }
  },[selected,trend])

  if(!model) return null
  const axisValues=[model.yMax,(model.yMax+model.yMin)/2,model.yMin]
  return <section className="rundeckTrendMiniContext is-dashboard-like" aria-label="History around selected point">
    <header>
      <div><span>History</span><strong>{selected?.metricLabel || metricLabel(trend?.metric)} · {rangeLabel(range)} · {selected?.mode === 'max' ? 'Peak' : 'Average'}</strong></div>
      <div className="rundeckTrendMiniSummary">
        <small>Range {numberText(model.rawMin,1)}–{numberText(model.rawMax,1)}{model.unit}</small>
        <small>{selected?.mode === 'max' ? 'Peak' : 'Highest average'} {model.peakValue == null ? '—' : `${numberText(model.peakValue,1)}${model.unit}`}{model.peakObservedAt ? ` · observed ${formatWib(model.peakObservedAt,true)} WIB` : model.peakBucketAt ? ` · bucket ${formatWib(model.peakBucketAt,true)} WIB` : ''}</small>
        {(model.warning !== null || model.critical !== null) && <small className="rundeckTrendMiniThresholdKey">{model.warning !== null ? `Warn ${numberText(model.warning,0)}${model.unit}` : ''}{model.warning !== null && model.critical !== null ? ' · ' : ''}{model.critical !== null ? `Critical ${numberText(model.critical,0)}${model.unit}` : ''}</small>}
      </div>
    </header>
    <svg viewBox="0 0 520 112" role="img" aria-label="History with thresholds and selected point">
      {axisValues.map((value,index) => {
        const yPos=20+(index*29)
        return <g key={index}>
          <line x1="52" y1={yPos} x2="490" y2={yPos} className="rundeckTrendMiniGrid" />
          <text x="45" y={yPos+3} textAnchor="end" className="rundeckTrendMiniAxisLabel">{numberText(value,0)}{model.unit}</text>
        </g>
      })}
      {model.warning !== null && model.warning >= model.yMin && model.warning <= model.yMax && <>
        <line x1="52" y1={model.y(model.warning)} x2="490" y2={model.y(model.warning)} className="rundeckTrendMiniThreshold is-warning" />
      </>}
      {model.critical !== null && model.critical >= model.yMin && model.critical <= model.yMax && <>
        <line x1="52" y1={model.y(model.critical)} x2="490" y2={model.y(model.critical)} className="rundeckTrendMiniThreshold is-critical" />
      </>}
      <polyline points={model.points} className="rundeckTrendMiniLine" />
      {model.marker && <>
        <line x1={model.marker.x} y1="16" x2={model.marker.x} y2="82" className="rundeckTrendMiniMarkerLine" />
        <circle cx={model.marker.x} cy={model.marker.y} r="4.5" className="rundeckTrendMiniMarker"><title>{`Selected ${model.selectedValue == null ? 'unavailable' : numberText(model.selectedValue,1)+model.unit} · ${formatSavedBucketWindow(trend,selected?.bucket)}`}</title></circle>
      </>}
      <text x="52" y="105" textAnchor="start" fill="var(--sphere-text-muted,#718089)" fontSize="9">{formatTrendAxis(model.firstAt, range)}</text>
      {model.marker && model.marker.x > 170 && model.marker.x < 370 && <text x={model.marker.x} y="105" textAnchor="middle" fill="var(--sphere-warning,#d8b35f)" fontSize="9">{formatTrendAxis(model.selectedBucketAt, range)}</text>}
      <text x="490" y="105" textAnchor="end" fill="var(--sphere-text-muted,#718089)" fontSize="9">{formatTrendAxis(model.lastAt, range)}</text>
    </svg>
    <footer>
      <span>{model.selectedActualAt ? `Peak observed ${formatWib(model.selectedActualAt,true)} WIB · ` : ''}{formatSavedBucketWindow(trend, selected?.bucket)}{!model.marker ? ' · Selected bucket not retained in plot' : ''}</span>
      <strong>{model.selectedValue == null ? '—' : `${numberText(model.selectedValue,1)}${model.unit}`}</strong>
    </footer>
  </section>
}

function trendPointNeighbors(trend, selected) {
  const host = shortHost(selected?.host || '')
  const rows = (trend?.items || [])
    .filter((row) => shortHost(row.host || '') === host)
    .map((row) => {
      const bucketAt = Date.parse(row.bucket || '')
      const value = numericTrendSample(selected?.mode === 'max' ? row.max_value : row.avg_value)
      return Number.isFinite(bucketAt) && value !== null ? { ...row, bucketAt, value } : null
    })
    .filter(Boolean)
    .sort((left, right) => left.bucketAt - right.bucketAt)
  if (!rows.length) return { previous: null, current: null, next: null, gap: false }
  const target = Date.parse(selected?.bucket || '')
  const index = Number.isFinite(target) ? rows.findIndex(row => row.bucketAt === target) : -1
  if (index < 0) return { previous: null, current: null, next: null, gap: false }
  const earlier = rows[index - 1] || null
  const expected = resolvedGapIntervalMs(trend)
  const elapsed = earlier ? rows[index].bucketAt - earlier.bucketAt : 0
  const isRaw = String(trend?.bucket || '').toLowerCase() === 'raw'
  const contiguous = earlier && (isRaw ? elapsed > 0 && elapsed <= expected * 1.5 : elapsed === expected)
  return { previous: contiguous ? earlier : null, current: rows[index], next: rows[index + 1] || null, gap: Boolean(earlier && !contiguous) }
}

function signedDelta(value, previous, unit = '') {
  const currentValue = numericTrendSample(value)
  const previousValue = numericTrendSample(previous)
  if (currentValue === null || previousValue === null) return null
  const delta = currentValue - previousValue
  return `${delta > 0 ? '+' : ''}${numberText(delta, 1)}${unit === '%' ? ' pp' : unit ? ' ' + unit : ''}`
}

function workloadWp(consumer) {
  const details = consumer?.details || {}
  return [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
}

function SelectedTime({ selected, timeline, loading, error, onSelectJob, onOpenInfrastructure, onOpenEvidence, trend, range }) {
  if (!selected && !loading && !error) return null
  const selectedRow = selectedTimelineRow(selected, timeline)
  const consumers = (selectedRow?.top_consumers || []).slice(0, 5)
  const collectionId = selectedRow?.collection_id || timeline?.collection_id || selected?.collectionId || ''
  const resourceState = selectedRow ? hostResourceState(selectedRow) : ''
  const neighbors = trendPointNeighbors(trend, selected)
  const selectedUnit = selected?.unit || trend?.unit || ''
  const topContext = consumers[0] ? snapshotContext(selected, selectedRow, consumers[0]) : null
  const warning = numericTrendSample(trend?.warning)
  const critical = numericTrendSample(trend?.critical)
  const selectedValue = numericTrendSample(selected?.value)
  const delta = neighbors.previous ? signedDelta(selectedValue, neighbors.previous.value, selectedUnit) : null
  const thresholdText = [
    warning !== null ? `Warn ${numberText(warning, 0)}${selectedUnit}` : '',
    critical !== null ? `Critical ${numberText(critical, 0)}${selectedUnit}` : '',
    delta ? `${delta} vs previous ${trend?.bucket === 'raw' ? 'sample' : 'bucket'}` : '',
    neighbors.gap ? 'Previous bucket unavailable (collection gap)' : '',
  ].filter(Boolean).join(' · ')

  return <section className="rundeckTrendModalContent" aria-live="polite">
    {!loading && !error && selectedRow && <section className="rundeckTrendInvestigationSnapshot" aria-label="APP snapshot at selected time">
      <header>
        <span>APP Snapshot</span>
        <small>
          {selectedRow.collected_at ? `${formatWib(selectedRow.collected_at, true)} WIB` : 'Saved observation'}
          {timeline?.correlation_mode === 'nearest-collection' ? ' · Nearest collection (±5m from bucket start)' : ''}{thresholdText ? ` · ${thresholdText}` : ''}
          {collectionId ? ` · Collection ${collectionId.replace(/^rundeck-/, '').slice(0, 18)}` : ''}
        </small>
      </header>
      <div className="rundeckTrendSnapshotMetrics">
        <span><b>CPU</b>{selectedRow.cpu_pct == null ? '—' : `${numberText(selectedRow.cpu_pct, 1)}%`}</span>
        <span><b>RAM</b>{selectedRow.ram_pct == null ? '—' : `${numberText(selectedRow.ram_pct, 1)}%`}</span>
        <span><b>I/O Wait</b>{selectedRow.io_wait_pct == null ? '—' : `${numberText(selectedRow.io_wait_pct, 1)}%`}</span>
        <span className={Number(selectedRow.wp_critical || 0) > 0 ? 'is-attention' : ''}><b>APP Critical WP</b>{selectedRow.wp_critical ?? 'Not observed'}</span>
        <span><b>APP Resource</b>{resourceState || 'UNKNOWN'}</span>
      </div>
      <p>Source: APP performance observation · Execution status: SAP SM37 · Temporal overlap does not prove workload causation.</p>
    </section>}

    {!loading && !error && selected && <MiniTrendContext trend={trend} selected={selected} range={range} />}

    {loading && <div className="rundeckHistoryState rundeckTrendModalLoading"><span className="rundeckTrendModalSpinner" aria-hidden="true" /> Loading saved history…</div>}
    {error && <div className="rundeckHistoryState is-error">{error}</div>}

    {!loading && !error && selected && <section className="rundeckTrendWorkloadPanel">
      <header>
        <div>
          <span>Top Workloads at Saved Observation</span>
          <strong>Top {consumers.length} loaded</strong>
        </div>
        {selectedRow?.collected_at && <small title="Timestamp of the saved host sample, not the bucket start">{formatWib(selectedRow.collected_at,true)} WIB</small>}
      </header>

      <div className="rundeckTrendWorkloadHead" aria-hidden="true">
        <span>Job / Program / Process</span><span title="Grouped CPU is multicore and may exceed 100%">CPU Total</span><span>PSS Memory</span><span>Processes</span><span>WP</span><span />
      </div>

      <div className="rundeckTrendWorkloadRows">
        {consumers.map((consumer, index) => {
          const context = snapshotContext(selected, selectedRow, consumer)
          const pss = pssValue(consumer)
          const processes = processCount(consumer)
          return <button
            key={`${consumer.consumer_type}-${consumer.consumer_key}-${index}`}
            type="button"
            className="rundeckTrendWorkloadRow"
            onClick={() => context && onSelectJob?.(context)}
            title={`${workloadTypeLabel(consumer.consumer_type)} · open Performance Analysis`}
          >
            <span className="rundeckTrendWorkloadIdentity"><b>{index + 1}. {consumer.consumer_key}</b><small>{workloadTypeLabel(consumer.consumer_type)}</small></span>
            <span>{numberText(consumer.cpu_pct, 1)}%</span>
            <span>{pss === null || Number.isNaN(pss) ? '—' : `${numberText(pss, 2)} GB`}</span>
            <span>{processes === null || Number.isNaN(processes) ? '—' : numberText(processes, 0)}</span>
            <span>{workloadWp(consumer)}</span>
            <span className="rundeckTrendWorkloadChevron">›</span>
          </button>
        })}
        {!consumers.length && <div className="rundeckSnapshotEmpty">No saved job or program data was found for this APP at this time.</div>}
      </div>
    </section>}

    {!loading && !error && selected && <div className="rundeckTrendInvestigationActions" aria-label="Trend investigation actions">
      <button type="button" disabled={!topContext} onClick={() => topContext && onSelectJob?.(topContext)}>Analyze Top Workload</button>
      <button type="button" onClick={() => onOpenInfrastructure?.({ host: selected?.host || '', at: selected?.at || '', collectionId })}>Infrastructure</button>
      <button type="button" disabled={!topContext} onClick={() => topContext && onOpenEvidence?.(topContext)}>Correlated Events</button>
    </div>}
  </section>
}

export default function RundeckServerTrend({ refreshToken = '', databaseEnabled = false, selectedJob = null, focusedHost = '', onFocusHost, sourceHosts = [], onSelectJob, onTrendContext, onOpenInfrastructure, onOpenEvidence }) {
  const saved = React.useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem(TREND_STORAGE_KEY) || '{}') } catch { return {} }
  }, [])
  const initialServerMetrics = React.useMemo(() => resolveServerTrendMetrics(saved), [saved])
  const [range, setRange] = React.useState(RANGES.some(([key]) => key === saved.range) ? saved.range : DEFAULT_RANGE)
  const [customOpen, setCustomOpen] = React.useState(false)
  const [customStart, setCustomStart] = React.useState(() => wibMinuteInput(new Date(Date.now() - 15 * 60000)))
  const [customEnd, setCustomEnd] = React.useState(() => wibMinuteInput(new Date(Date.now() - 5 * 60000)))
  const [customWindow, setCustomWindow] = React.useState(null)
  const [customError, setCustomError] = React.useState('')
  const [windowEvidence, setWindowEvidence] = React.useState(null)
  const [windowError, setWindowError] = React.useState('')
  const [windowLoading, setWindowLoading] = React.useState(false)
  const [windowModal, setWindowModal] = React.useState(false)
  const [bucket, setBucket] = React.useState(BUCKETS.some(([key]) => key === saved.bucket) ? saved.bucket : 'auto')
  const [serverMetric1, setServerMetric1] = React.useState(initialServerMetrics.first)
  const [serverMetric2, setServerMetric2] = React.useState(initialServerMetrics.second)
  const [technicalMetric, setTechnicalMetric] = React.useState(['load','swap','hana','replication','ssh','web'].includes(saved.technicalMetric) ? saved.technicalMetric : 'load')
  const [mode, setMode] = React.useState(saved.mode === 'avg' ? 'avg' : 'max')
  const [scaleMode, setScaleMode] = React.useState('full')
  const [loadScaleMode, setLoadScaleMode] = React.useState('full')
  const [serverTrend1, setServerTrend1] = React.useState(null)
  const [serverTrend2, setServerTrend2] = React.useState(null)
  const [technicalTrend, setTechnicalTrend] = React.useState(null)
  const [serverLoading1, setServerLoading1] = React.useState(false)
  const [serverLoading2, setServerLoading2] = React.useState(false)
  const [technicalLoading, setTechnicalLoading] = React.useState(false)
  const [serverError1, setServerError1] = React.useState('')
  const [serverError2, setServerError2] = React.useState('')
  const [technicalError, setTechnicalError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [selectedTrend, setSelectedTrend] = React.useState(null)
  const [timeline, setTimeline] = React.useState(null)
  const [timelineLoading, setTimelineLoading] = React.useState(false)
  const [timelineError, setTimelineError] = React.useState('')
  const timelineRequestSequence = React.useRef(0)
  const modalRef = React.useRef(null)
  const restoreFocusRef = React.useRef(null)

  const applyCustom = React.useCallback(event => {
    event.preventDefault()
    const next = validateCustomRange(customStart, customEnd)
    if (next.error) { setCustomError(next.error); return }
    setCustomError('')
    setCustomWindow(next)
    setRange('custom')
    setBucket('auto')
    setCustomOpen(false)
    setWindowModal(false)
  }, [customStart, customEnd])

  const loadTrend = React.useCallback((metric, setter, setLoading, setError, signal) => {
    if (range === 'custom' && !customWindow) return Promise.resolve()
    const category = AVAILABILITY_CATEGORIES[metric]
    const windowQuery = range === 'custom' ? '&' + customRangeSearch(customWindow) : ''
    const url = category
      ? `${API}/availability/history?range=${encodeURIComponent(range)}&category=${encodeURIComponent(category)}${windowQuery}`
      : `${API}/history/trend?range=${encodeURIComponent(range)}&bucket=${encodeURIComponent(range === 'custom' ? 'auto' : bucket)}&metric=${encodeURIComponent(metric)}${windowQuery}`
    setLoading(true)
    setError('')
    return json(url, signal)
      .then((result) => setter(category ? { ...result, metric: 'availability', metric_label: result.metric_label || metricLabel(metric), display_metric: metric } : result))
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message || 'Unable to load trend.') })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [bucket, customWindow, range])

  React.useEffect(() => {
    onTrendContext?.({ metric: serverMetric1, metricLabel: serverTrend1?.metric_label || metricLabel(serverMetric1), range, rangeLabel: range === 'custom' ? customRangeCaption(customWindow) : rangeLabel(range), mode })
  }, [customWindow, mode, onTrendContext, range, serverMetric1, serverTrend1?.metric_label])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify({
        range, bucket, serverMetric1, serverMetric2, technicalMetric, mode,
      }))
    } catch { /* best effort */ }
  }, [bucket, mode, range, serverMetric1, serverMetric2, technicalMetric])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    loadTrend(serverMetric1, setServerTrend1, setServerLoading1, setServerError1, controller.signal)
    return () => controller.abort()
  }, [databaseEnabled, loadTrend, refreshToken, serverMetric1])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    loadTrend(serverMetric2, setServerTrend2, setServerLoading2, setServerError2, controller.signal)
    return () => controller.abort()
  }, [databaseEnabled, loadTrend, refreshToken, serverMetric2])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    loadTrend(technicalMetric, setTechnicalTrend, setTechnicalLoading, setTechnicalError, controller.signal)
    return () => controller.abort()
  }, [databaseEnabled, loadTrend, refreshToken, technicalMetric])

  React.useEffect(() => {
    timelineRequestSequence.current += 1
    setSelected(null)
    setSelectedTrend(null)
    setTimeline(null)
    setTimelineLoading(false)
    setTimelineError('')
  }, [bucket, customWindow, mode, range, serverMetric1, serverMetric2, technicalMetric])

  React.useEffect(() => {
    if (range !== 'custom' || !customWindow || !databaseEnabled) return undefined
    const controller = new AbortController()
    setWindowLoading(true)
    setWindowError('')
    setWindowEvidence(null)
    json(`${API}/history/window?${customRangeSearch(customWindow)}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) setWindowEvidence(result) })
      .catch(failure => { if (!controller.signal.aborted && failure.name !== 'AbortError') setWindowError(failure.message || 'Window evidence unavailable') })
      .finally(() => { if (!controller.signal.aborted) setWindowLoading(false) })
    return () => controller.abort()
  }, [customWindow, databaseEnabled, range, refreshToken])

  const selectPoint = React.useCallback((point, sourceTrend) => {
    timelineRequestSequence.current += 1
    const requestSequence = timelineRequestSequence.current
    setSelected(point)
    setSelectedTrend(sourceTrend)
    setTimeline(null)
    setTimelineLoading(false)
    setTimelineError('')
    if (!point?.at || (point.availability && !/^APP\d+$/i.test(String(shortHost(point.host || ''))))) return
    setTimelineLoading(true)
    const collection = point.collectionId ? `&collection_id=${encodeURIComponent(point.collectionId)}` : ''
    json(`${API}/history/timeline?at=${encodeURIComponent(point.at)}&window_minutes=5${collection}`)
      .then((result) => { if (timelineRequestSequence.current === requestSequence) setTimeline(result) })
      .catch((failure) => { if (timelineRequestSequence.current === requestSequence) setTimelineError(failure.message || 'Unable to load saved history.') })
      .finally(() => { if (timelineRequestSequence.current === requestSequence) setTimelineLoading(false) })
  }, [])

  const closeTrendDetails = React.useCallback(() => {
    timelineRequestSequence.current += 1
    setSelected(null)
    setSelectedTrend(null)
    setTimeline(null)
    setTimelineLoading(false)
    setTimelineError('')
  }, [])

  React.useEffect(() => {
    if (!selected) return undefined
    restoreFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => modalRef.current?.querySelector('[data-trend-modal-close]')?.focus(), 0)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeTrendDetails(); return }
      if (event.key !== 'Tab' || !modalRef.current) return
      const focusable = [...modalRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute('hidden'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [closeTrendDetails, selected])

  const openSelectedJob = React.useCallback((context) => { closeTrendDetails(); onSelectJob?.(context) }, [closeTrendDetails, onSelectJob])
  const openTrendInfrastructure = React.useCallback((context) => { closeTrendDetails(); onOpenInfrastructure?.(context) }, [closeTrendDetails, onOpenInfrastructure])
  const openTrendEvidence = React.useCallback((context) => { closeTrendDetails(); onOpenEvidence?.(context) }, [closeTrendDetails, onOpenEvidence])

  const renderTrendState = (trend, loading, error, onSelect, { showGap = true, technicalAxisMax = null } = {}) => {
    if (!databaseEnabled) return <div className="rundeckHistoryState">Trend data is not available yet.</div>
    if (loading) return <div className="rundeckHistoryState">Loading trend…</div>
    if (error) return <div className="rundeckHistoryState is-error">{error}</div>
    if (trend?.items?.length > 0) return <>
      <TrendFreshness trend={trend} />
      <AvailabilityCoverageBand trend={trend} />
      {showGap && <CollectionGapBand trend={trend} />}
      <AvailabilityObservationSummary trend={trend} />
      <TrendChart trend={trend} mode={mode} range={range} onSelect={(point) => onSelect(point, trend)} selectedHost={focusedHost} scaleMode={scaleMode} technicalAxisMax={technicalAxisMax} />
    </>
    return trend ? <div className="rundeckHistoryState">{range === 'custom' ? 'No retained sample in the selected WIB interval. This is a collection gap / unknown observation, not evidence of SAP downtime.' : 'No stored data in this range yet.'}</div> : null
  }

  const focusOptions = trendFocusHosts(sourceHosts, [
    ...(serverTrend1?.items || []),
    ...(serverTrend2?.items || []),
    ...(technicalTrend?.items || []),
  ])
  const activeFocus = shortHost(focusedHost || '')
  const technicalAvailability = Boolean(AVAILABILITY_CATEGORIES[technicalMetric])
  const loadScale = React.useMemo(() => technicalLoadScale(technicalTrend?.items, mode), [technicalTrend, mode])
  const typicalLoadActive = technicalMetric === 'load' && loadScaleMode === 'typical'
  const activeTrend = selectedTrend || serverTrend1
  const activeMetric = selected?.metric || activeTrend?.display_metric || activeTrend?.metric || serverMetric1

  return <section className="rundeckTripleTrendV13457" aria-label="Server and Technical Trends">
    <div className="rundeckTrendEditorial">
      <h3>Performance Trends</h3><small>Saved APP and technical measurements</small>
      {scaleMode === 'focus' && <small className="rundeckTrendFocusReference" title="These are the original backend thresholds, not zoomed or recalculated.">
        {[serverTrend1,serverTrend2].filter(trend => trend?.unit === '%').map((trend,index) =>
          <span key={trend.metric || index}>{metricLabel(trend.metric)} warn {trend.warning ?? '—'}% / crit {trend.critical ?? '—'}%</span>)} · thresholds unchanged
      </small>}
      <button type="button" className="rundeckTrendYAxisToggle"
        aria-pressed={scaleMode === 'focus'} onClick={() => setScaleMode(value => value === 'full' ? 'focus' : 'full')}
        title="Focus rescales percent-based APP charts to observed samples. SAP Warning/Critical thresholds do not change; markers above the zoomed axis are not plotted. Full restores 0–100%."
      >APP % Axis · {scaleMode === 'focus' ? 'Focus' : '0–100%'}</button>
    </div>
    <div className="rundeckTrendSharedControls">
      <div className="rundeckTrendSharedGroup"><span>Time Range</span><Segmented options={RANGES} value={range} onChange={value => { setRange(value); setCustomOpen(false); setWindowModal(false) }} ariaLabel="Shared trend period" />
        <button type="button" className={'rundeckCustomRangeToggle' + (range === 'custom' ? ' is-active' : '')} aria-pressed={range === 'custom'} aria-expanded={customOpen} onClick={() => setCustomOpen(value => !value)}>Custom</button></div>
      <div className="rundeckTrendSharedGroup"><span>Interval{bucket === 'auto' && serverTrend1?.bucket ? ` · Auto → ${String(serverTrend1.bucket).toUpperCase()}` : ''}</span>{range === 'custom' ? <strong className="rundeckCustomRangeRaw">Raw · observed</strong> : <Segmented options={BUCKETS} value={bucket} onChange={setBucket} ariaLabel="Trend interval" />}</div>
      <div className="rundeckTrendSharedGroup"><span>Server View</span><Segmented options={[["avg","Avg"],["max","Peak"]]} value={mode} onChange={setMode} ariaLabel="Server trend view" /></div>
      <div className="rundeckTrendSharedGroup rundeckTrendSharedHosts">
        <span>APP Focus</span>
        {selectedJob?.host && shortHost(selectedJob.host) !== (shortHost(focusedHost) || '') && <small className="rundeckTrendFocusIdentity">Job {shortHost(selectedJob.host)} · Focus {shortHost(focusedHost) || 'All'}</small>}
        <div className="rundeckTrendHostLegend" role="group" aria-label="Highlight APP trace">
          <button type="button" aria-pressed={!activeFocus} className={!activeFocus ? 'is-focused' : ''} onClick={() => onFocusHost?.('')}>All</button>
          {focusOptions.map((label, index) => <button key={label} type="button"
            aria-pressed={activeFocus === label}
            className={activeFocus === label ? 'is-focused' : ''}
            style={{ '--trend-host-color': palette().series[trendHostColorIndex(label, index, palette().series.length)] }}
            onClick={() => onFocusHost?.(activeFocus === label ? '' : label)}>
            <span className="rundeckTrendHostSwatch" aria-hidden="true" />{label}
          </button>)}
        </div>
      </div>
    </div>

    {customOpen && <form className="rundeckCustomRangeForm" onSubmit={applyCustom} aria-label="Custom time range in WIB">
      <label>From · WIB<input type="datetime-local" step="60" required value={customStart} onChange={event => { setCustomStart(event.target.value); setCustomError('') }} /></label>
      <label>To · WIB<input type="datetime-local" step="60" required value={customEnd} onChange={event => { setCustomEnd(event.target.value); setCustomError('') }} /></label>
      <button type="submit">Apply</button><button type="button" onClick={() => { setCustomOpen(false); setCustomError('') }}>Cancel</button>
      {customError && <span className="is-error" role="alert">{customError}</span>}
    </form>}
    {range === 'custom' && customWindow && <div className="rundeckCustomRangeSummary" role="status">
      <strong>Custom · {customRangeCaption(customWindow)}</strong>
      <span>{windowLoading ? 'Loading saved observations…' : windowError ? windowError :
        windowEvidence ? `${windowEvidence.host_samples.length}${windowEvidence.limited?.host_samples ? '+' : ''} APP samples · ${windowEvidence.workloads.length}${windowEvidence.limited?.workloads ? '+' : ''} workload observations · ${windowEvidence.alerts.length}${windowEvidence.limited?.alerts ? '+' : ''} alerts` : 'Window evidence unavailable'}</span>
      <button type="button" disabled={windowLoading || !windowEvidence} onClick={() => setWindowModal(true)}>Window details</button>
      <small>Jobs &amp; Programs Current below shows latest collection, not this history window</small>
    </div>}
    {serverTrend1?.items?.length > 0 && range !== 'custom' && <div className="rundeckSharedCollectionCoverage" aria-label="Shared server collection coverage">
      <CollectionGapBand trend={serverTrend1} />
    </div>}

    <div className="rundeckTripleTrendGrid">
      <section className="rundeckServerTrendPanelV1234 is-server-trend is-server-trend-1" aria-label="Server Trend 1">
        <div className="rundeckMonitoringHead"><h3 title="APP host measurement; separate from grouped workload CPU"><SphereIcon name="trend" /> {metricLabel(serverMetric1)} Trend <small>· APP host</small></h3></div>
        <div className="rundeckTrendToolbar"><select className="rundeckTrendMetricSelect" aria-label="Server Trend 1 metric" value={serverMetric1} onChange={event => setServerMetric1(event.target.value)}>{METRICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        {renderTrendState(serverTrend1, serverLoading1, serverError1, selectPoint, { showGap: false })}
      </section>

      <section className="rundeckServerTrendPanelV1234 is-server-trend is-server-trend-2" aria-label="Server Trend 2">
        <div className="rundeckMonitoringHead"><h3 title="APP host measurement; separate from workload PSS and CPU"><SphereIcon name="trend" /> {metricLabel(serverMetric2)} Trend <small>· APP host</small></h3></div>
        <div className="rundeckTrendToolbar"><select className="rundeckTrendMetricSelect" aria-label="Server Trend 2 metric" value={serverMetric2} onChange={event => setServerMetric2(event.target.value)}>{METRICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        {renderTrendState(serverTrend2, serverLoading2, serverError2, selectPoint, { showGap: false })}
      </section>

      <section className="rundeckServerTrendPanelV1234 is-technical-trend" aria-label="Technical Trend">
        <div className="rundeckMonitoringHead rundeckTechnicalTrendHeading"><h3><SphereIcon name="server" /> Technical Trend <small title={technicalMetric === 'load' ? 'Linux load average, not CPU usage percent. Compare with logical CPU count and saved evidence.' : ''}>· {technicalMetric === 'load' ? 'Host load average (not %)' : metricLabel(technicalMetric)}</small></h3>
          {technicalMetric === 'load' && <button type="button" className="rundeckTechnicalScaleToggle"
            aria-pressed={loadScaleMode === 'typical'} aria-label="Switch Technical Load between Full and Typical scale"
            title="Typical zooms the plotted Load axis when extreme saved samples compress other observations. Peak and timestamp remain visible; Full restores every value."
            onClick={() => setLoadScaleMode(value => value === 'full' ? 'typical' : 'full')}>
            Load Y · {loadScaleMode === 'typical' ? 'Typical' : 'Full'}
          </button>}
        </div>
        <div className="rundeckTrendToolbar">
          <Segmented options={[["load","Load"],["swap","Swap I/O"],["hana","HANA"],["replication","Replication"],["ssh","SSH"],["web","Web Dispatcher"]]} value={technicalMetric} onChange={setTechnicalMetric} ariaLabel="Technical metric" />
          {technicalAvailability && <span className="rundeckTrendModeNote">Status timeline · Avg/Peak applies to Server Trends only</span>}
        </div>
        {typicalLoadActive && loadScale.axisMax != null && <div className="rundeckTechnicalLoadPeakNotice" role="status"
          title="Source peak remains unchanged; Typical is a visual crop, not missing data or SAP outage. Switch to Full to inspect the outlier on the chart.">
          {loadScale.outliers} samples above Y {loadScale.axisMax} · Peak {numberText(loadScale.peak,1)}
          {loadScale.peakHost ? ' · ' + shortHost(loadScale.peakHost) : ''}
          {loadScale.peakAt ? ' · ' + formatWib(loadScale.peakAt,true) + ' WIB' : ''}
          <button type="button" onClick={() => setLoadScaleMode('full')}>Show Full</button>
        </div>}
        {/* Source samples, gap markers and peak identity are preserved in both scales. */}
        {renderTrendState(technicalTrend, technicalLoading, technicalError, selectPoint, { showGap: false,
          technicalAxisMax: typicalLoadActive ? loadScale.axisMax : null })}
      </section>
    </div>

    {windowModal && windowEvidence && customWindow && <RundeckCustomWindowDetails
      data={windowEvidence} selectedWindow={customWindow}
      onClose={() => setWindowModal(false)} onSelectJob={onSelectJob} />}
    {selected && createPortal(<div className="rundeckTrendPointModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTrendDetails() }}>
      <section ref={modalRef} className="rundeckTrendPointModal" role="dialog" aria-modal="true" aria-label="Trend details">
        <header className="rundeckTrendPointModalHeader">
          <div>
            <span>SPHERE ANALYSIS · HISTORICAL OBSERVATION</span>
            <h4>{selected?.host ? shortHost(selected.host) : 'APP'} {selected?.metricLabel || metricLabel(activeMetric)} {activeTrend?.warning !== null && activeTrend?.warning !== undefined && Number.isFinite(Number(activeTrend.warning)) && Number(selected?.value) >= Number(activeTrend.warning) ? 'Spike' : 'Detail'}</h4>
            <small>{selected?.mode === 'max' ? 'Peak' : 'Average'} · {selected?.value == null ? '—' : `${numberText(selected.value, 1)}${selected?.unit || activeTrend?.unit || ''}`}</small>
            <small>{selected?.mode === 'max' && selected?.peakAtVerified ? 'Peak observed' : selected?.mode === 'max' ? 'Peak bucket starts' : 'Average bucket starts'} {selected?.at ? `${formatWib(selected.at, true)} WIB` : '—'}{selected?.bucket ? ` · ${formatSavedBucketWindow(activeTrend,selected.bucket)}` : ''}</small>
          </div>
          <button data-trend-modal-close type="button" onClick={closeTrendDetails} aria-label="Close Trend Details">×</button>
        </header>
        <div className="rundeckTrendPointModalBody">
          <SelectedTime selected={selected} timeline={timeline} loading={timelineLoading} error={timelineError} onSelectJob={openSelectedJob} onOpenInfrastructure={openTrendInfrastructure} onOpenEvidence={openTrendEvidence} trend={activeTrend} range={range} />
        </div>
      </section>
    </div>, document.body)}
  </section>
}
