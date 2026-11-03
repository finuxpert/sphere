import React from 'react'
import * as echarts from './logEcharts.js'
import { buildHostTrendSeries } from './rundeckTrendSeries.js'
import { formatTrendAxis, trendAxisSplitNumber, gapDurationText, gapLabel, resolvedGapIntervalMs } from './rundeckTrendFormatting.js'
import { trendPercentAxisMax } from './rundeckTrendAxis.js'
import { resolveTrendFocus, trendFocusStyle, trendHostColorIndex } from './rundeckTrendFocus.js'
import { savedTrendPeak } from './rundeckTrendPeak.js'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import { BUCKETS, metricLabel, palette } from './rundeckServerTrendShared.js'
import { trendGaps } from './rundeckServerTrendGaps.js'

export default function TrendChart({ trend, mode, range, onSelect, selectedHost = '', scaleMode = 'full', technicalAxisMax = null, displayWindow = null }) {
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
    const markerPeak = savedTrendPeak(trend, mode, selectedKey)
    const valueKey = mode === 'max' ? 'max_value' : 'avg_value'
    // Focus changes only the visual Y range, never samples, severity thresholds, or source evidence.
    const percentTrend = !availabilityMode && trend?.unit === '%'
    const focusAxisMax = percentTrend ? trendPercentAxisMax(rows, valueKey, scaleMode) : 100
    const compactPoints = ['custom', '30m', '1h', '3h', '6h'].includes(range)
    const { gaps: inferredGaps, rangeStart, rangeEnd } = trendGaps(trend)
    const gaps = trend?.network_source
      ? (trend?.collection_gaps || []).map(gap => [Date.parse(gap.before || ''), Date.parse(gap.after || '')]).filter(([from,to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
      : inferredGaps
    const gapPoints = gaps.map(([from, to]) => Math.round((from + to) / 2))
    const threshold = []
    if (!availabilityMode && trend?.warning !== null && trend?.warning !== undefined) threshold.push({ yAxis: Number(trend.warning), lineStyle: { color: colors.warning, type: 'dashed', opacity: .45 }, label: { formatter: `Warn ${trend.warning}${trend?.unit === '%' ? '%' : ''}`, color: colors.warning, fontSize: 9.2, fontWeight: 600, position: 'insideEndTop' } })
    if (!availabilityMode && trend?.critical !== null && trend?.critical !== undefined) threshold.push({ yAxis: Number(trend.critical), lineStyle: { color: colors.danger, type: 'dashed', opacity: .48 }, label: { formatter: `Crit ${trend.critical}${trend?.unit === '%' ? '%' : ''}`, color: colors.danger, fontSize: 9.2, fontWeight: 600, position: 'insideEndTop' } })
    // Linux load average is a runnable-task pressure indicator. The 28-core line
    // is a host-capacity reference, not an alert or CPU-utilization threshold.
    if (trend?.metric === 'load') threshold.push({ yAxis: 28, lineStyle: { color: colors.secondary, type: 'dotted', opacity: .5 }, label: { formatter: '28 cores', color: colors.secondary, fontSize: 9, position: 'insideEndTop' } })
    const visibleThresholds = threshold.filter(line =>
      !(scaleMode === 'focus' && percentTrend && line.yAxis > focusAxisMax) &&
      !(trend?.metric === 'load' && Number.isFinite(technicalAxisMax) && line.yAxis > technicalAxisMax))
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
      // Reserve axis-label and threshold space without wasting the chart's plot height.
      grid: { left: 42, right: 44, top: 13, bottom: compactPoints ? 24 : 27 },
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
        extraCssText: 'max-width:220px;min-width:0;white-space:normal;line-height:1.25;pointer-events:none;overflow-wrap:anywhere;',
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
            const lines = [trend?.range === 'custom'
              ? `<b>Saved sample · ${formatWib(bucketAt, true)} WIB</b>`
              : `<b>Bucket ${formatWib(bucketAt, true)}${intervalLabel} · ${mode === 'max' ? 'Peak' : 'Avg'}</b>`]
          visible.forEach(point => {
            const name = String(point.seriesName || '').replace(/[&<>"']/g, character => ({
              '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
            })[character])
            const interfaceName = String(point.data?.peakInterface || '').replace(/[&<>"']/g, character => ({
              '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
            })[character])
            const unit = trend?.unit === '%' ? '%' : trend?.unit ? ' ' + trend.unit : ''
            lines.push(`${point.marker || ''}${name} <b>${numberText(point.data.value[1], 1)}${unit}</b>${interfaceName ? ' · NIC ' + interfaceName : ''}${mode === 'max' && point.data?.peakAt ? ` · Peak at ${formatWib(point.data.peakAt, true)} WIB` : ''}`)
          })
          if (valid.length && visible.length < hosts.length) lines.push(`${hosts.length - visible.length} APP without samples in this bucket`)
          if (!valid.length) lines.push('No retained sample in bucket')
          if (trend?.requested_bucket === 'auto' && trend?.range !== 'custom') {
            const resolvedLabel = trend?.bucket === 'raw'
              ? 'Raw (collector samples)'
              : (BUCKETS.find(([key]) => key === trend?.bucket)?.[1] || 'Unknown')
            lines.push('Bucket interval: Auto → ' + resolvedLabel)
          }
          return lines.join('<br/>')
        },
      },
      xAxis: { type: 'time', minInterval: range === '24h' ? 4 * 3600_000 : undefined, min: displayWindow?.from ?? (Number.isFinite(rangeStart) ? rangeStart : undefined), max: displayWindow?.to ?? rangeEnd, splitNumber: trendAxisSplitNumber(range), axisLabel: { color: colors.muted, fontSize: 11, hideOverlap: true, showMinLabel: true, showMaxLabel: !['7d', '30d'].includes(range), margin: 10, formatter: (value) => formatTrendAxis(value, range) }, axisTick: { show: false }, axisLine: { lineStyle: { color: colors.grid } }, splitLine: { show: false } },
      yAxis: { type: 'value', name: '', nameTextStyle: { color: colors.muted, fontSize: 10 }, axisLabel: { color: colors.muted, fontSize: 11, formatter: availabilityMode ? ((value) => Number(value) >= 75 ? 'UP' : Number(value) <= 25 ? 'DOWN' : '') : ((value) => `${value}${trend?.unit === '%' ? '%' : trend?.unit ? ' ' + trend.unit : ''}`) }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { lineStyle: { color: colors.grid } }, min: availabilityMode || trend?.unit === '%' || Boolean(trend?.network_source) ? 0 : undefined, max: availabilityMode || trend?.unit === '%' ? focusAxisMax : (['load','network_rx','network_tx'].includes(trend?.metric) && Number.isFinite(technicalAxisMax) ? technicalAxisMax : undefined), splitNumber: 2 },
      dataZoom: [{ type: 'inside', filterMode: 'none' }],
      series: hosts.map((host, index) => {
        const traceStyle = trendFocusStyle(shortHost(host), selectedKey, availabilityMode)
        const traceColor = colors.series[trendHostColorIndex(shortHost(host), index, colors.series.length)]
        const focused = selectedKey && shortHost(host) === selectedKey
        return {
        id: host, name: shortHost(host), type: 'line', z: focused ? 6 : 2, step: availabilityMode && trend?.range !== 'custom' ? 'end' : false, connectNulls: false,
        showSymbol: availabilityMode || compactPoints,
        symbolSize: availabilityMode
          ? ((value, params) => String(params?.data?.status || '').toUpperCase() === 'DOWN' ? 8 : 3.5)
          : (focused ? 5 : (compactPoints ? 3.5 : 2.5)),
        lineStyle: { color: traceColor, width: availabilityMode && trend?.range === 'custom' ? 0 : traceStyle.width, opacity: traceStyle.opacity },
        itemStyle: availabilityMode
          ? { color: (params) => String(params?.data?.status || '').toUpperCase() === 'DOWN' ? colors.danger : colors.attention, opacity: traceStyle.itemOpacity }
          : { color: traceColor, opacity: traceStyle.itemOpacity },
        emphasis: { focus: 'series', scale: true, lineStyle: { width: availabilityMode ? 2.5 : 2.8, opacity: 1 } },
        data: buildHostTrendSeries(
          rows.filter((row) => row.host === host).map((row) => ({ value: [row.bucket, row[valueKey]], bucket: row.bucket, peakAt: row.peak_at, peakCollectionId: row.peak_collection_id, peakInterface: row.peak_interface, sourceHost: row.source_host, host: row.host, avg: row.avg_value, max: row.max_value, status: row.status })),
          resolvedGapIntervalMs(trend),
          gapPoints.map((at) => ({ value: [at, null], gap: true }))
        ),
        markPoint: markerPeak && shortHost(host) === markerPeak.host ? {
          silent: true, symbol: 'circle', symbolSize: 10,
          label: { show: false },
          itemStyle: { color: colors.warning, borderColor: colors.panel, borderWidth: 2 },
          data: [{ coord: [Date.parse(markerPeak.bucket), markerPeak.value], value: markerPeak.value }],
        } : undefined,
        markLine: index === 0 && visibleThresholds.length ? { silent: true, symbol: ['none', 'none'], data: visibleThresholds } : undefined,
        markArea: index === 0 && gaps.length && !trend?.network_source && !['network_rx','network_tx'].includes(trend?.metric) ? {
          silent: true,
          label: { show: true, formatter: (params) => params?.name || (availabilityMode ? 'NO OBSERVATION' : 'COLLECTION GAP'), fontSize: 8, color: availabilityMode ? colors.attention : colors.warning, position: 'insideTop' },
          itemStyle: { color: availabilityMode ? colors.attention : colors.warning, opacity: availabilityMode ? .035 : .06, borderColor: availabilityMode ? colors.attention : colors.warning, borderWidth: 1, borderType: 'dashed' },
          data: gaps.map(([from, to]) => [{ name: availabilityMode ? `NO OBSERVATION · ${formatWib(from, false)}–${formatWib(to, false)} WIB · ${gapDurationText(from, to)}` : trend?.network_source ? `INFRASTRUCTURE GAP · ${formatWib(from, false)}–${formatWib(to, false)} WIB` : gapLabel(from, to), xAxis: from }, { xAxis: to }]),
        } : undefined,
      }
      })
    }
  }, [displayWindow, focusedHost, hostLabels, hosts, mode, range, reduceMotion, scaleMode, technicalAxisMax, trend, themeRevision])

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
        network: Boolean(currentTrend?.network_source),
        interface: item.peakInterface || '',
        sourceHost: item.sourceHost || '',
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
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    // One resize source per mounted ECharts panel, not duplicate browser and
    // element callbacks on every responsive layout adjustment.
    if (observer) observer.observe(ref.current)
    else window.addEventListener('resize', resize)
    return () => {
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', resize)
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
    const schema = `${trend?.metric || ''}:${range}:${mode}:${scaleMode}:${technicalAxisMax ?? 'auto'}:${displayWindow ? 'fit' : 'full'}`
    const schemaChanged = optionSchemaRef.current !== schema
    optionSchemaRef.current = schema
    chart.setOption(reduceMotion ? { ...option, animation: false } : option, {
      notMerge: schemaChanged,
      replaceMerge: schemaChanged ? undefined : ['series'],
      lazyUpdate: false,
    })
  }, [displayWindow, mode, option, range, reduceMotion, scaleMode, technicalAxisMax, trend?.metric])

  return <div className="rundeckTrendPlot">
    <div ref={ref} className="rundeckTrendChart" role="img"
      aria-label={`Saved ${trend?.metric_label || metricLabel(trend?.metric)} trend; select an APP to highlight its existing observations`} />
  </div>
}
