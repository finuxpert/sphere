import { formatWib } from './sapUiFormat.js'

const GAP_MS = 25 * 60 * 1000

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rowMetric(row, key) {
  const details = row?.details || {}
  if (key === 'cpu') return numeric(row?.cpu_pct)
  if (key === 'pss') return numeric(details.total_pss_gb ?? details.pss_gb)
  if (key === 'read') return numeric(details.total_read_mib_s ?? details.read_mib_s)
  if (key === 'write') return numeric(details.total_write_mib_s ?? details.write_mib_s)
  if (key === 'processes') return numeric(details.process_count) ?? (Array.isArray(details.pids) ? details.pids.length : null)
  if (key === 'wp') return Array.isArray(details.wps) ? details.wps.length : details.wp ? 1 : null
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

function peakObservation(items = [], getter) {
  let best = null
  items.forEach((row) => {
    const value = getter(row)
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return
    if (!best || Number(value) > best.value) best = { value: Number(value), at: row.collected_at || '' }
  })
  return best
}

function episodeStats(items = []) {
  if (!items.length) return {
    firstSeen: '', lastSeen: '', avgCpu: null, peakCpu: null, peakCpuAt: '',
    avgPss: null, peakPss: null, peakPssAt: '', avgProcesses: null,
    peakCriticalWp: null, peakCriticalWpAt: '',
  }
  const ordered = [...items].sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at))
  const cpu = ordered.map((row) => rowMetric(row, 'cpu')).filter((value) => value !== null)
  const pss = ordered.map((row) => rowMetric(row, 'pss')).filter((value) => value !== null)
  const cpuPeak = peakObservation(ordered, (row) => rowMetric(row, 'cpu'))
  const pssPeak = peakObservation(ordered, (row) => rowMetric(row, 'pss'))
  const criticalPeak = peakObservation(ordered, (row) => numeric(row.host_wp_critical))
  return {
    firstSeen: ordered[0]?.collected_at || '',
    lastSeen: ordered.at(-1)?.collected_at || '',
    avgCpu: average(cpu),
    peakCpu: cpuPeak?.value ?? null,
    peakCpuAt: cpuPeak?.at || '',
    avgPss: average(pss),
    peakPss: pssPeak?.value ?? null,
    peakPssAt: pssPeak?.at || '',
    avgProcesses: average(ordered.map((row) => rowMetric(row, 'processes'))),
    peakCriticalWp: criticalPeak?.value ?? null,
    peakCriticalWpAt: criticalPeak?.at || '',
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
  }).format(date).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
}

function chartAxisSplitNumber(start, end) {
  const span = Number(end) - Number(start)
  if (!Number.isFinite(span) || span <= 0) return 5
  if (span <= 6 * 60 * 60 * 1000) return 6
  if (span <= 24 * 60 * 60 * 1000) return 6
  if (span <= 7 * 24 * 60 * 60 * 1000) return 7
  return 6
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
  const data = []
  rows.forEach((row, index) => {
    if (index > 0) {
      const previous = Date.parse(rows[index - 1]?.collected_at || '')
      const current = Date.parse(row?.collected_at || '')
      if (Number.isFinite(previous) && Number.isFinite(current) && current - previous > GAP_MS) {
        data.push([new Date(previous + 1).toISOString(), null])
        data.push([new Date(current - 1).toISOString(), null])
      }
    }
    data.push([row.collected_at, rowMetric(row, key)])
  })
  return data
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


export {
  rowMetric,
  selectObservationEpisode,
  episodeStats,
  durationText,
  chartAxisText,
  chartAxisSplitNumber,
  temporalText,
  nearestRow,
  metricSeriesData,
  chartProfile,
}
