import React from 'react'
import * as echarts from './logEcharts.js'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckJobHistory.css'

const API = `${import.meta.env.BASE_URL}api`
const GAP_MS = 25 * 60 * 1000
const CPU_HINT = 'CPU Usage is the grouped job/program CPU observation and can exceed 100 percent when more than one CPU core is used.'

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const themeToken = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const palette = () => ({
  text: themeToken('--sphere-text', '#e7edf0'),
  secondary: themeToken('--sphere-text-secondary', '#a9b5bb'),
  muted: themeToken('--sphere-text-muted', '#718089'),
  grid: themeToken('--sphere-chart-grid', 'rgba(126,147,158,.08)'),
  panel: themeToken('--sphere-surface-1', '#141d23'),
  accent: themeToken('--sphere-accent', '#4fc6c8'),
  memory: themeToken('--sphere-memory', '#8ba7d9'),
  ioRead: themeToken('--sphere-io-read', '#7bb89c'),
  ioWrite: themeToken('--sphere-io-write', '#b49ac8'),
  wp: themeToken('--sphere-wp', '#d0a96c'),
  warning: themeToken('--sphere-warning', '#d8b35f'),
  danger: themeToken('--sphere-danger', '#db7d86'),
})

const PERFORMANCE_RANGES = [['current','Current'],['3h','3H'],['6h','6H'],['24h','24H'],['7d','7D'],['30d','30D']]

async function loadHistory(job, signal) {
  const params = new URLSearchParams({ job: job.key, days: '90', limit: '1000' })
  if (job.host) params.set('host', job.host)
  if (job.consumerType) params.set('type', job.consumerType)
  const response = await fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Job / Program history unavailable (${response.status})`)
  }
  return response.json()
}

async function loadRangeHistory(job, range, signal, anchorAt = '') {
  const type = String(job.consumerType || '').toUpperCase()
  if (!['JOB','PROGRAM'].includes(type)) throw new Error('Historical range is available for Job and Program context.')
  const params = new URLSearchParams({
    job: job.key,
    type,
    range,
  })
  if (job.host) params.set('host', job.host)
  if (anchorAt) params.set('at', anchorAt)
  const [summaryResponse, trendResponse] = await Promise.all([
    fetch(`${API}/history/workload/summary?${params.toString()}`, { cache: 'no-store', signal }),
    fetch(`${API}/history/workload/trend?${params.toString()}`, { cache: 'no-store', signal }),
  ])
  if (!summaryResponse.ok || !trendResponse.ok) {
    const failed = !summaryResponse.ok ? summaryResponse : trendResponse
    const body = await failed.json().catch(() => ({}))
    throw new Error(body.detail || `Historical performance unavailable (${failed.status})`)
  }
  return { summary: await summaryResponse.json(), trend: await trendResponse.json() }
}

function rowMetric(row, key) {
  const details = row?.details || {}
  if (key === 'cpu') return numeric(row?.cpu_pct)
  if (key === 'pss') return numeric(details.total_pss_gb ?? details.pss_gb)
  if (key === 'read') return numeric(details.total_read_mib_s ?? details.read_mib_s)
  if (key === 'write') return numeric(details.total_write_mib_s ?? details.write_mib_s)
  if (key === 'processes') return numeric(details.process_count) ?? numeric(details.pids?.length) ?? 1
  if (key === 'wp') return numeric(details.wps?.length) ?? 1
  return null
}

function observationEpisodes(items = []) {
  const rows = [...items]
    .filter((row) => Number.isFinite(Date.parse(row?.collected_at || '')))
    .sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at))
  const episodes = []
  let current = []
  rows.forEach((row) => {
    const timestamp = Date.parse(row.collected_at)
    const previous = current.at(-1)
    const previousTimestamp = previous ? Date.parse(previous.collected_at) : null
    if (previous && Number.isFinite(previousTimestamp) && timestamp - previousTimestamp > GAP_MS) {
      episodes.push(current)
      current = []
    }
    current.push(row)
  })
  if (current.length) episodes.push(current)
  return episodes
}

function selectObservationEpisode(items, targetAt = '') {
  const episodes = observationEpisodes(items)
  if (!episodes.length) return []
  const target = Date.parse(targetAt || '')
  if (!Number.isFinite(target)) return episodes.at(-1)

  let best = episodes[0]
  let bestDistance = Number.POSITIVE_INFINITY
  episodes.forEach((episode) => {
    episode.forEach((row) => {
      const distance = Math.abs(Date.parse(row.collected_at) - target)
      if (distance < bestDistance) {
        bestDistance = distance
        best = episode
      }
    })
  })
  return best
}

function average(values = []) {
  const valid = values.filter((value) => value !== null)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function episodeStats(items = []) {
  if (!items.length) return { firstSeen: '', lastSeen: '', avgCpu: null, peakCpu: null, avgPss: null, avgProcesses: null }
  const ordered = [...items].sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at))
  const cpu = ordered.map((row) => rowMetric(row, 'cpu')).filter((value) => value !== null)
  return {
    firstSeen: ordered[0]?.collected_at || '',
    lastSeen: ordered.at(-1)?.collected_at || '',
    avgCpu: average(cpu),
    peakCpu: cpu.length ? Math.max(...cpu) : null,
    avgPss: average(ordered.map((row) => rowMetric(row, 'pss'))),
    avgProcesses: average(ordered.map((row) => rowMetric(row, 'processes'))),
  }
}

function durationText(firstSeen, lastSeen) {
  const first = Date.parse(firstSeen || '')
  const last = Date.parse(lastSeen || '')
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return '—'
  const minutes = Math.max(0, Math.round((last - first) / 60000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function chartAxisText(value, start, end) {
  const span = Number(end) - Number(start)
  if (!Number.isFinite(span) || span <= 24 * 60 * 60 * 1000) return formatWib(value, false)
  if (span <= 72 * 60 * 60 * 1000) return formatWib(value, true)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    ...(span <= 7 * 24 * 60 * 60 * 1000 ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date)
}

function chartAxisSplitNumber(start, end) {
  const span = Number(end) - Number(start)
  if (!Number.isFinite(span) || span <= 0) return 5
  if (span <= 6 * 60 * 60 * 1000) return 6
  if (span <= 24 * 60 * 60 * 1000) return 6
  if (span <= 7 * 24 * 60 * 60 * 1000) return 7
  return 6
}

function issueMarkerPosition(issueTs, startTs, endTs) {
  const span = Number(endTs) - Number(startTs)
  if (!Number.isFinite(issueTs) || !Number.isFinite(span) || span <= 0) return 'insideEndTop'
  return (issueTs - Number(startTs)) / span > .72 ? 'insideStartTop' : 'insideEndTop'
}

function temporalText(issueStart, firstSeen) {
  const issue = Date.parse(issueStart || '')
  const first = Date.parse(firstSeen || '')
  if (!Number.isFinite(issue) || !Number.isFinite(first)) return ''
  const delta = first - issue
  const absMinutes = Math.round(Math.abs(delta) / 60000)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  const duration = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
  if (delta > 0) return `Job / Program first observed ${duration} after issue start`
  if (delta < 0) return `Job / Program was already observed ${duration} before issue start`
  return 'Job / Program first observed at issue start'
}

function nearestRow(rows, value) {
  const target = Date.parse(value || '')
  if (!Number.isFinite(target) || !rows.length) return rows[0] || null
  return rows.reduce((best, row) => {
    const current = Date.parse(row.collected_at || '')
    if (!Number.isFinite(current)) return best
    if (!best) return row
    const bestTime = Date.parse(best.collected_at || '')
    return Math.abs(current - target) < Math.abs(bestTime - target) ? row : best
  }, null)
}

function metricSeriesData(rows, key) {
  return rows.map((row) => [row.collected_at, rowMetric(row, key)])
}

function chartProfile(rows = []) {
  const pssValues = rows.map((row) => rowMetric(row, 'pss')).filter((value) => value !== null)
  const readValues = rows.map((row) => rowMetric(row, 'read')).filter((value) => value !== null)
  const writeValues = rows.map((row) => rowMetric(row, 'write')).filter((value) => value !== null)
  const wpValues = rows.map((row) => rowMetric(row, 'wp')).filter((value) => value !== null)
  return {
    hasPss: pssValues.length > 0,
    hasIo: [...readValues, ...writeValues].some((value) => Math.abs(value) > 0),
    hasWp: wpValues.length > 0,
    wpVariable: new Set(wpValues.map((value) => Number(value).toFixed(2))).size > 1,
    hasCritical: rows.some((row) => Number(row.host_wp_critical || 0) > 0),
    criticalSamples: rows.filter((row) => Number(row.host_wp_critical || 0) > 0).length,
    totalSamples: rows.length,
  }
}

function SingleSamplePerformance({ row }) {
  const pss = rowMetric(row, 'pss')
  const read = rowMetric(row, 'read')
  const write = rowMetric(row, 'write')
  const processes = rowMetric(row, 'processes')
  const wp = rowMetric(row, 'wp')
  const critical = Number(row.host_wp_critical || 0)
  return <div className="rundeckSingleSample" aria-label="Single job or program observation">
    <div className="rundeckSingleSampleTime">{formatWib(row.collected_at, true)} WIB</div>
    <div className="rundeckSingleSampleMetrics">
      <span><b title={CPU_HINT}>CPU Usage</b>{numberText(rowMetric(row, 'cpu'), 1)}%</span>
      {pss !== null && <span><b>PSS Memory</b>{numberText(pss, 2)} GB</span>}
      <span><b>Processes</b>{numberText(processes, 0)}</span>
      {(Math.abs(read || 0) > 0 || Math.abs(write || 0) > 0)
        ? <><span><b>I/O Read</b>{numberText(read, 2)} MiB/s</span><span><b>I/O Write</b>{numberText(write, 2)} MiB/s</span></>
        : <span><b>I/O</b>0 MiB/s</span>}
      <span><b>WP</b>{numberText(wp, 0)}</span>
      {critical > 0 && <span className="is-attention"><b>Critical WP</b>{critical}</span>}
    </div>
    <div className="rundeckSingleSampleAxis"><i /><strong>{formatWib(row.collected_at, false)}</strong></div>
  </div>
}

function UnifiedJobPerformanceChart({ items, incidentStart, expanded = false }) {
  const ref = React.useRef(null)
  const chartConfig = React.useMemo(() => {
    const colors = palette()
    const rows = [...items].sort((left, right) => Date.parse(left.collected_at || '') - Date.parse(right.collected_at || ''))
    const profile = chartProfile(rows)
    const firstTs = Date.parse(rows[0]?.collected_at || '')
    const lastTs = Date.parse(rows.at(-1)?.collected_at || '')
    const issueTs = Date.parse(incidentStart || '')
    const issueInRange = Number.isFinite(issueTs) && Number.isFinite(firstTs) && Number.isFinite(lastTs) && issueTs >= firstTs && issueTs <= lastTs

    const lanes = [
      { id: 'cpu', name: 'CPU', height: expanded ? 126 : 76 },
      profile.hasPss ? { id: 'pss', name: 'PSS Memory', height: expanded ? 82 : 50 } : null,
      profile.hasIo ? { id: 'io', name: 'I/O', height: expanded ? 70 : 44 } : null,
      profile.hasWp ? { id: 'wp', name: 'WP', height: expanded ? (profile.wpVariable ? 58 : 46) : (profile.wpVariable ? 40 : 28) } : null,
      profile.hasCritical ? { id: 'event', name: 'Critical WP', height: expanded ? 38 : 28 } : null,
    ].filter(Boolean)

    let top = 16
    const gap = expanded ? 16 : 14
    const grids = lanes.map((lane) => {
      const grid = { left: 96, right: 30, top, height: lane.height }
      top += lane.height + gap
      return grid
    })
    const chartHeight = Math.max(170, top + 30)
    const laneIndex = Object.fromEntries(lanes.map((lane, index) => [lane.id, index]))

    const axisBase = {
      type: 'time',
      min: firstTs,
      max: lastTs,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: colors.muted,
        fontSize: 9,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        formatter: (value) => chartAxisText(value, firstTs, lastTs),
        margin: 10,
      },
      splitNumber: chartAxisSplitNumber(firstTs, lastTs),
      axisPointer: { show: true, snap: true, lineStyle: { color: colors.muted, width: 1, type: 'dashed' } },
    }
    const yBase = {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
      splitNumber: 2,
      axisLabel: { color: colors.muted, fontSize: 9, margin: 8 },
      nameTextStyle: { color: colors.secondary, fontSize: 9.5, align: 'left' },
    }
    const line = (name, key, laneId, color, extra = {}) => {
      const index = laneIndex[laneId]
      if (index === undefined) return null
      return {
        name,
        type: 'line',
        xAxisIndex: index,
        yAxisIndex: index,
        showSymbol: rows.length <= 36,
        symbolSize: 4,
        smooth: false,
        connectNulls: false,
        lineStyle: { width: 1.8, color },
        itemStyle: { color },
        emphasis: { focus: 'series' },
        data: metricSeriesData(rows, key),
        ...extra,
      }
    }
    const issueMark = issueInRange ? {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { color: colors.warning, type: 'dashed', width: 1, opacity: .62 },
      label: { formatter: `Issue Started · ${formatWib(incidentStart, true)} WIB`, color: colors.warning, fontSize: 8, padding: [0,0,3,0], position: issueMarkerPosition(issueTs, firstTs, lastTs) },
      data: [{ xAxis: incidentStart }],
    } : undefined

    const series = [
      line('CPU Usage', 'cpu', 'cpu', colors.accent, { markLine: issueMark }),
      profile.hasPss ? line('PSS Memory', 'pss', 'pss', colors.memory) : null,
      profile.hasIo ? line('I/O Read', 'read', 'io', colors.ioRead) : null,
      profile.hasIo ? line('I/O Write', 'write', 'io', colors.ioWrite) : null,
      profile.hasWp ? line('WP Count', 'wp', 'wp', colors.wp, { step: 'middle' }) : null,
      profile.hasCritical ? {
        name: 'Critical WP',
        type: 'scatter',
        xAxisIndex: laneIndex.event,
        yAxisIndex: laneIndex.event,
        symbol: 'triangle',
        symbolSize: (value, params) => Math.min(13, 8 + Number(params?.data?.critical || 0)),
        itemStyle: { color: colors.danger },
        data: rows.filter((row) => Number(row.host_wp_critical || 0) > 0).map((row) => ({ value: [row.collected_at, .5], critical: Number(row.host_wp_critical || 0) })),
      } : null,
    ].filter(Boolean)

    return {
      height: chartHeight,
      profile,
      option: {
        animationDuration: 180,
        animationDurationUpdate: 220,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicOut',
        backgroundColor: 'transparent',
        textStyle: { color: colors.text },
        grid: grids,
        graphic: lanes.map((lane,index)=>({
          type:'text',left:8,top:Math.max(0,grids[index].top+3),silent:true,
          style:{text:lane.id==='wp'?'WP Count':lane.name,fill:colors.secondary,font:'700 9.5px sans-serif'},
        })),
        xAxis: lanes.map((lane, index) => ({
          ...axisBase,
          gridIndex: index,
          axisLabel: index === lanes.length - 1 ? axisBase.axisLabel : { show: false },
          axisLine: index === lanes.length - 1 ? axisBase.axisLine : { show: false },
        })),
        yAxis: lanes.map((lane, index) => lane.id === 'event'
          ? { type: 'value', gridIndex: index, min: 0, max: 1, show: false }
          : {
              ...yBase,
              gridIndex: index,
              name: '',
              splitLine: lane.id === 'wp' && !profile.wpVariable ? { show: false } : yBase.splitLine,
              splitNumber: lane.id === 'wp' ? 1 : 2,
              axisLabel: lane.id === 'wp'
                ? { ...yBase.axisLabel, formatter: (value) => Math.round(value) }
                : yBase.axisLabel,
            }),
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        tooltip: {
          trigger: 'axis',
          confine: true,
          backgroundColor: colors.panel,
          borderWidth: 0,
          textStyle: { color: colors.text, fontSize: 10 },
          formatter: (points = []) => {
            if (!points.length) return ''
            const row = nearestRow(rows, points[0]?.axisValue)
            if (!row) return ''
            const critical = Number(row.host_wp_critical || 0)
            return [
              `<b>${formatWib(row.collected_at, true)} WIB</b>`,
              `CPU Usage <b>${numberText(rowMetric(row, 'cpu'), 1)}%</b>`,
              profile.hasPss ? `PSS Memory <b>${numberText(rowMetric(row, 'pss'), 2)} GB</b>` : '',
              `Processes <b>${numberText(rowMetric(row, 'processes'), 0)}</b>`,
              profile.hasIo ? `I/O Read <b>${numberText(rowMetric(row, 'read'), 2)} MiB/s</b>` : 'I/O <b>0 MiB/s</b>',
              profile.hasIo ? `I/O Write <b>${numberText(rowMetric(row, 'write'), 2)} MiB/s</b>` : '',
              profile.hasWp ? `WP <b>${numberText(rowMetric(row, 'wp'), 0)}</b>` : '',
              critical > 0 ? `APP Critical WP <b>${critical}</b>` : '',
              `Run <b>#${row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</b>`,
            ].filter(Boolean).join('<br/>')
          },
        },
        dataZoom: [{ type: 'inside', xAxisIndex: lanes.map((_, index) => index), filterMode: 'none' }],
        series,
      },
    }
  }, [expanded, incidentStart, items])

  React.useEffect(() => {
    if (!ref.current) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(chartConfig.option, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [chartConfig.option])

  return <div className="rundeckJobPerformanceWrap">
    {!chartConfig.profile.hasIo && <div className="rundeckHiddenMetric">I/O 0 MiB/s</div>}
    <div ref={ref} className="rundeckJobPerformanceChart" style={{ height: `${chartConfig.height}px` }} role="img" aria-label="Job or program CPU usage, memory, I/O, work process and Critical WP timeline with WIB time axis" />
  </div>
}

function HistoricalRangeChart({ trend, mode = 'avg', incidentStart = '' }) {
  const ref = React.useRef(null)
  const option = React.useMemo(() => {
    const colors = palette()
    const items = trend?.items || []
    const cpuKey = mode === 'peak' ? 'peak_cpu_pct' : 'avg_cpu_pct'
    const pssKey = mode === 'peak' ? 'peak_pss_gb' : 'avg_pss_gb'
    const processKey = mode === 'peak' ? 'max_processes' : 'avg_processes'
    const firstItem = Date.parse(items[0]?.bucket || '')
    const lastItem = Date.parse(items.at(-1)?.bucket || '')
    const windowStart = Date.parse(trend?.window_start || '')
    const windowEnd = Date.parse(trend?.window_end || '')
    const first = Number.isFinite(windowStart) ? windowStart : firstItem
    const last = Number.isFinite(windowEnd) ? windowEnd : lastItem
    const issue = Date.parse(incidentStart || '')
    const issueInRange = Number.isFinite(issue) && Number.isFinite(first) && Number.isFinite(last) && issue >= first && issue <= last
    const nearestBucket = (value) => {
      const target = Date.parse(value || '')
      if (!Number.isFinite(target) || !items.length) return items[0] || null
      return items.reduce((best, row) => {
        const current = Date.parse(row.bucket || '')
        if (!Number.isFinite(current)) return best
        if (!best) return row
        return Math.abs(current - target) < Math.abs(Date.parse(best.bucket || '') - target) ? row : best
      }, null)
    }
    const issueMark = issueInRange ? {
      symbol:'none',
      label:{formatter:`Issue Started · ${formatWib(incidentStart,true)} WIB`,color:colors.warning,fontSize:9,padding:[0,0,3,0],position:issueMarkerPosition(issue,first,last)},
      lineStyle:{color:colors.warning,type:'dashed',opacity:.62},
      data:[{xAxis:incidentStart}],
    } : undefined
    return {
      backgroundColor:'transparent',
      animationDuration:180,
      textStyle:{color:colors.text},
      grid:[
        {left:70,right:44,top:26,height:138},
        {left:70,right:44,top:188,height:88},
        {left:70,right:44,top:306,height:30},
      ],
      xAxis:[
        {type:'time',gridIndex:0,min:first,max:last,axisLabel:{show:false},axisLine:{lineStyle:{color:colors.grid}},splitLine:{show:false}},
        {type:'time',gridIndex:1,min:first,max:last,axisLabel:{show:false},axisLine:{lineStyle:{color:colors.grid}},splitLine:{show:false}},
        {type:'time',gridIndex:2,min:first,max:last,splitNumber:chartAxisSplitNumber(first,last),axisLabel:{color:colors.muted,fontSize:10,hideOverlap:true,showMinLabel:true,showMaxLabel:true,margin:10,formatter:(value)=>chartAxisText(value,first,last)},axisLine:{lineStyle:{color:colors.grid}},splitLine:{show:false}},
      ],
      graphic:[
        {type:'text',left:64,top:8,silent:true,style:{text:'CPU',fill:colors.secondary,font:'700 10px sans-serif'}},
        {type:'text',left:64,top:170,silent:true,style:{text:'PSS Memory',fill:colors.secondary,font:'700 10px sans-serif'}},
        {type:'text',left:64,top:290,silent:true,style:{text:'Critical WP',fill:colors.secondary,font:'700 9.5px sans-serif'}},
      ],
      yAxis:[
        {type:'value',gridIndex:0,name:'',axisLabel:{color:colors.muted,fontSize:10},splitLine:{lineStyle:{color:colors.grid}}},
        {type:'value',gridIndex:1,name:'',axisLabel:{color:colors.muted,fontSize:10},splitLine:{lineStyle:{color:colors.grid}}},
        {type:'value',gridIndex:2,min:0,max:1,name:'',axisLabel:{show:false},axisLine:{show:false},axisTick:{show:false},splitLine:{show:false}},
      ],
      axisPointer:{link:[{xAxisIndex:'all'}]},
      tooltip:{
        trigger:'axis',
        confine:true,
        backgroundColor:colors.panel,
        borderWidth:0,
        textStyle:{color:colors.text,fontSize:10},
        formatter:(points=[])=>{
          if(!points.length)return ''
          const row=nearestBucket(points[0]?.axisValue)
          if(!row)return ''
          const cpu=row[cpuKey]
          const pss=row[pssKey]
          const processes=row[processKey]
          const critical=Number(row.max_critical_wp||0)
          const checks=Number(row.checks||0)
          const criticalChecks=Number(row.critical_wp_checks||0)
          return [
            `<b>${formatWib(row.bucket,true)} WIB</b>`,
            `CPU ${mode === 'peak' ? 'peak' : 'avg'} <b>${cpu == null ? '—' : `${numberText(cpu,1)}%`}</b>`,
            `PSS ${mode === 'peak' ? 'peak' : 'avg'} <b>${pss == null ? '—' : `${numberText(pss,2)} GB`}</b>`,
            `Processes <b>${processes == null ? '—' : numberText(processes,mode === 'peak' ? 0 : 1)}</b>`,
            `Critical WP <b>${critical}</b> · during period <b>${criticalChecks} / ${checks} checks</b>`,
            `Data points / checks <b>${Number(row.observations||0)} / ${checks}</b>`,
          ].join('<br/>')
        },
      },
      series:[
        {name:`${mode === 'peak' ? 'Peak' : 'Avg'} CPU`,type:'line',showSymbol:items.length<80,symbolSize:4,data:items.map(row=>[row.bucket,row[cpuKey]]),lineStyle:{width:2,color:colors.accent},itemStyle:{color:colors.accent},markLine:issueMark},
        {name:`${mode === 'peak' ? 'Peak' : 'Avg'} PSS`,type:'line',xAxisIndex:1,yAxisIndex:1,showSymbol:items.length<80,symbolSize:4,data:items.map(row=>[row.bucket,row[pssKey]]),lineStyle:{width:2,color:colors.memory},itemStyle:{color:colors.memory}},
        {name:'Critical WP',type:'scatter',xAxisIndex:2,yAxisIndex:2,symbol:'triangle',symbolSize:(value,params)=>Math.min(12,6+Number(params?.data?.critical||0)),itemStyle:{color:colors.danger},data:items.filter(row=>Number(row.max_critical_wp||0)>0).map(row=>({value:[row.bucket,.5],critical:Number(row.max_critical_wp||0),checks:Number(row.critical_wp_checks||0)}))},
      ],
    }
  },[incidentStart,mode,trend])
  React.useEffect(()=>{
    if(!ref.current)return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart=echarts.init(ref.current,null,{renderer:'canvas'})
    chart.setOption(option,true)
    const resize=()=>chart.resize()
    window.addEventListener('resize',resize)
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null
    observer?.observe(ref.current)
    return()=>{observer?.disconnect();window.removeEventListener('resize',resize);chart.dispose()}
  },[option])
  return <div ref={ref} className="rundeckJobHistoricalRangeChart" role="img" aria-label="Historical CPU, PSS and Critical WP overlap trend" />
}

export default function RundeckJobHistory({ job = null, refreshToken = '', incidentStart = '', latestCollectionId = '', presentation = 'inline' }) {
  const [history, setHistory] = React.useState(null)
  const [resolvedJob, setResolvedJob] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [range, setRange] = React.useState('current')
  const [rangeMode, setRangeMode] = React.useState('avg')
  const [rangeData, setRangeData] = React.useState(null)
  const [rangeLoading, setRangeLoading] = React.useState(false)
  const [rangeError, setRangeError] = React.useState('')
  const jobKey = job?.key || ''
  const jobHost = job?.host || ''
  const jobConsumerType = job?.consumerType || ''
  const jobAt = job?.at || ''

  React.useEffect(() => {
    setRange('current')
    setRangeData(null)
    setRangeError('')
  }, [jobAt, jobConsumerType, jobHost, jobKey])

  React.useEffect(() => {
    if (!jobKey) {
      setHistory(null)
      setResolvedJob(null)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    const requestedJob = { key: jobKey, host: jobHost, consumerType: jobConsumerType, at: jobAt }
    setLoading(true)
    setError('')
    loadHistory(requestedJob, controller.signal)
      .then((result) => {
        setHistory(result)
        setResolvedJob(requestedJob)
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Job / Program history unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [jobAt, jobConsumerType, jobHost, jobKey, refreshToken])

  const selectedRangeAnchor = React.useMemo(() => {
    const selectedItems = selectObservationEpisode(history?.items || [], jobAt)
    if (!selectedItems.length) return ''
    const selectedLatest = selectedItems.at(-1)
    if (latestCollectionId && selectedLatest?.collection_id === latestCollectionId) return ''
    return selectedLatest?.collected_at || jobAt || ''
  }, [history, jobAt, latestCollectionId])

  React.useEffect(() => {
    if (!jobKey || range === 'current') {
      setRangeData(null)
      setRangeError('')
      setRangeLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const requestedJob = { key: jobKey, host: jobHost, consumerType: jobConsumerType }
    setRangeLoading(true)
    setRangeError('')
    loadRangeHistory(requestedJob, range, controller.signal, selectedRangeAnchor)
      .then(setRangeData)
      .catch((failure) => { if (failure.name !== 'AbortError') setRangeError(failure.message || 'Historical performance unavailable') })
      .finally(() => { if (!controller.signal.aborted) setRangeLoading(false) })
    return () => controller.abort()
  }, [jobConsumerType, jobHost, jobKey, range, refreshToken, selectedRangeAnchor])

  if (!jobKey) return null

  const displayJob = resolvedJob || { key: jobKey, host: jobHost, consumerType: jobConsumerType, at: jobAt }
  const displayKey = displayJob.key || jobKey
  const displayHost = displayJob.host || jobHost
  const displayConsumerType = displayJob.consumerType || jobConsumerType
  const displayAt = displayJob.at || ''
  const changingSelection = Boolean(
    history && resolvedJob && loading && (
      resolvedJob.key !== jobKey || resolvedJob.host !== jobHost || resolvedJob.consumerType !== jobConsumerType || resolvedJob.at !== jobAt
    )
  )
  const episodeItemsAsc = selectObservationEpisode(history?.items || [], displayAt)
  const episodeItems = [...episodeItemsAsc].reverse()
  const stats = episodeStats(episodeItemsAsc)
  const latest = episodeItems[0] || null
  const latestDetails = latest?.details || {}
  const isCurrent = Boolean(latestCollectionId && latest?.collection_id === latestCollectionId)
  const timelineText = temporalText(incidentStart, stats.firstSeen)
  const observed = durationText(stats.firstSeen, stats.lastSeen)
  const profile = chartProfile(episodeItems)
  const contentKey = `${displayHost}|${displayConsumerType}|${displayKey}|${displayAt}`
  const program = String(latestDetails.program || '').trim()
  const appName = shortHost(displayHost || latest?.host || '')
  const jobName = String(latestDetails.job_name || (String(displayConsumerType || latest?.consumer_type).toUpperCase() === 'JOB' ? displayKey : '')).trim()
  const observedAt = latest?.collected_at || displayAt || stats.lastSeen
  const wpType = String(latestDetails.wp_type || '').trim()
  const wpNumber = String(latestDetails.wp || '').trim()
  const wpContext = [wpType, wpNumber].filter(Boolean).join(' ') || '—'
  const displayType = workloadTypeLabel(displayConsumerType || latest?.consumer_type)
  const contextText = [appName, program && program.toUpperCase() !== String(displayKey).toUpperCase() ? program : ''].filter(Boolean).join(' · ')

  const drawerPresentation = presentation === 'drawer'
  const historicalSummary = rangeData?.summary || null
  const historicalTrend = rangeData?.trend || null
  const historicalModeLabel = rangeMode === 'peak' ? 'Peak' : 'Average'
  const historicalEligible = ['JOB','PROGRAM'].includes(String(displayConsumerType || latest?.consumer_type || '').toUpperCase())

  return <section className={`rundeckJobHistory ${drawerPresentation ? 'is-drawer-presentation' : ''}`} aria-label="Selected job or program performance" aria-busy={loading}>
    <div className="rundeckJobHistoryHead">
      <div>
        <span>Selected Job / Program</span>
        <h3><SphereIcon name="target" /> {displayKey} <span className="rundeckJobTypeBadge">{displayType}</span> {history && <em className={isCurrent ? 'is-current' : 'is-ended'}>{isCurrent ? 'CURRENT' : 'NO LONGER SEEN'}</em>}</h3>
        <small>{contextText}</small>
      </div>
    </div>

    {loading && !history && <div className="rundeckJobHistoryState">Loading performance history…</div>}
    {loading && history && <div className="rundeckJobHistoryState is-updating">{changingSelection ? 'Updating selected item…' : 'Refreshing performance…'}</div>}
    {error && <div className="rundeckJobHistoryState is-error">{error}</div>}

    {history && <div key={contentKey} className="rundeckJobHistoryContent">
      <section className="rundeckJobEpisodeMatrix" aria-label="Selected period and performance summary">
        <div className="rundeckJobEpisodeGroupLabel is-episode">Selected Period</div>
        <div className="rundeckJobEpisodeGroupLabel is-performance">Performance Summary</div>
        <div className="rundeckJobEpisodeMetrics">
          <span><b>First Seen</b>{formatWib(stats.firstSeen, true)} WIB</span>
          <span><b>Last Seen</b>{formatWib(stats.lastSeen, true)} WIB</span>
          <span><b>Duration</b>{observed}</span>
          <span><b>Records</b>{episodeItems.length}</span>
          <span title={CPU_HINT}><b>Avg CPU</b>{numberText(stats.avgCpu)}%</span>
          <span title={CPU_HINT}><b>Peak CPU</b>{numberText(stats.peakCpu)}%</span>
          <span><b>Avg PSS</b>{stats.avgPss === null ? '—' : `${numberText(stats.avgPss, 2)} GB`}</span>
          <span><b>Processes</b>{stats.avgProcesses === null ? '—' : numberText(stats.avgProcesses, 1)}</span>
        </div>
      </section>

      {String(displayConsumerType || latest?.consumer_type || '').toUpperCase() === 'JOB' && <details className="rundeckSm37Verification is-compact" aria-label="SAP job check">
        <summary className="rundeckSm37VerificationHead">
          <strong>SAP Job Check</strong>
          <span>JOB DATA NOT CONNECTED</span>
        </summary>
        <div className="rundeckSm37VerificationGrid">
          <span><b>Job Name</b>{jobName || '—'}</span>
          <span><b>Program</b>{program || '—'}</span>
          <span><b>APP</b>{appName || '—'}</span>
          <span><b>Observed</b>{observedAt ? `${formatWib(observedAt, true)} WIB` : '—'}</span>
          <span><b>WP</b>{wpContext}</span>
        </div>
        <p>SM37 job data is not connected. Check Job Name, Program and execution time manually if needed.</p>
      </details>}

      {(incidentStart || timelineText) && <div className="rundeckJobTimeline">
        <strong>Timing</strong>
        <span><b>Issue Start</b>{incidentStart ? `${formatWib(incidentStart, true)} WIB` : '—'}</span>
        <span><b>First Seen</b>{stats.firstSeen ? `${formatWib(stats.firstSeen, true)} WIB` : '—'}</span>
        {timelineText && <em>{timelineText}</em>}
        <small className="rundeckJobCorrelationDisclaimer">Same time window — root cause not confirmed</small>
      </div>}

      <div className="rundeckJobAnalysisWorkspace">
        <aside className="rundeckJobAnalysisSidebar" aria-label="Performance analysis controls and summary">
          <section className="rundeckJobHistoricalAnalysis" aria-label="Historical analysis">
            <div className="rundeckJobSectionLabel">Performance Analysis</div>
            <div className="rundeckJobPerformanceRange" aria-label="Performance time range">
              <div className="rundeckJobRangeTabs" role="group" aria-label="Performance time range">
                {PERFORMANCE_RANGES.map(([key,label]) => <button key={key} type="button" disabled={key !== 'current' && !historicalEligible} className={range===key?'is-active':''} aria-pressed={range===key} onClick={()=>setRange(key)}>{label}</button>)}
              </div>
              {range !== 'current' && <div className="rundeckJobRangeMode" role="group" aria-label="Historical aggregation">
                <button type="button" className={rangeMode==='avg'?'is-active':''} aria-pressed={rangeMode==='avg'} onClick={()=>setRangeMode('avg')}>Avg</button>
                <button type="button" className={rangeMode==='peak'?'is-active':''} aria-pressed={rangeMode==='peak'} onClick={()=>setRangeMode('peak')}>Peak</button>
              </div>}
            </div>
            <small className="rundeckJobCurrentSemantics" title="Current shows the selected data period">Current = selected data period</small>
          </section>

          {range === 'current'
            ? <div className="rundeckJobPerformanceTitle">
                <span title="Current shows the selected observation period"><SphereIcon name="trend" /> Selected Period Performance</span>
                <small>{numberText(stats.avgCpu)}% avg · {numberText(stats.peakCpu)}% peak{stats.avgPss === null ? '' : ` · ${numberText(stats.avgPss, 2)} GB PSS`}</small>
                {profile.hasCritical && <em title="Critical WP was recorded on the same SAP App Server during one or more workload observations.">Critical WP during period · {profile.criticalSamples}/{profile.totalSamples} data points</em>}
              </div>
            : <div className="rundeckJobHistoricalSummary">
                <span><b>Range</b>{range.toUpperCase()}</span>
                <span><b>Data Points</b>{historicalSummary?.checks ?? '—'}</span>
                <span><b>Avg CPU</b>{historicalSummary?.avg_cpu_pct == null ? '—' : `${numberText(historicalSummary.avg_cpu_pct,1)}%`}</span>
                <span><b>Peak CPU</b>{historicalSummary?.peak_cpu_pct == null ? '—' : `${numberText(historicalSummary.peak_cpu_pct,1)}%`}</span>
                <span><b>Avg PSS</b>{historicalSummary?.avg_pss_gb == null ? '—' : `${numberText(historicalSummary.avg_pss_gb,2)} GB`}</span>
                <span title="Critical WP was observed on the same APP during retained workload samples; this is temporal overlap, not proof of causation."><b>Critical WP During Period</b>{historicalSummary ? `${historicalSummary.critical_wp_checks ?? 0} / ${historicalSummary.checks ?? 0} data points` : '—'}</span>
              </div>}
        </aside>

        <section className="rundeckJobAnalysisCanvas" aria-label="Performance chart">
          {range === 'current'
            ? <div key={`performance-${contentKey}`} className="rundeckJobPerformanceDisclosure is-direct">
                {episodeItems.length === 1
                  ? <SingleSamplePerformance row={episodeItems[0]} />
                  : episodeItems.length > 1
                    ? <UnifiedJobPerformanceChart items={episodeItems} incidentStart={incidentStart} expanded={drawerPresentation} />
                    : <div className="rundeckJobHistoryState">No saved performance history yet.</div>}
              </div>
            : <div className="rundeckJobHistoricalRange">
                <div className="rundeckJobHistoricalTitle"><strong>Performance History · {historicalModeLabel}</strong><small>{historicalTrend?.bucket ? `${historicalTrend.bucket} buckets` : 'Retained observations'}</small></div>
                {rangeLoading && <div className="rundeckJobHistoryState">Loading {range.toUpperCase()} performance…</div>}
                {rangeError && <div className="rundeckJobHistoryState is-error">{rangeError}</div>}
                {!rangeLoading && !rangeError && historicalTrend?.items?.length ? <HistoricalRangeChart trend={historicalTrend} mode={rangeMode} incidentStart={incidentStart} /> : null}
                {!rangeLoading && !rangeError && historicalTrend && !historicalTrend.items?.length && <div className="rundeckJobHistoryState rundeckJobHistoricalEmpty">
                  <SphereIcon name="history" />
                  <strong>No retained observations in this range</strong>
                  <small>Try another range with retained data.</small>
                </div>}
              </div>}
        </section>
      </div>
    </div>}
  </section>
}
