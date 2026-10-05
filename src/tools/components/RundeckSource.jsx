import React from 'react'
import RundeckCurrentWorkload from './RundeckCurrentWorkload.jsx'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import RundeckPerformanceIncident from './RundeckPerformanceIncident.jsx'
import RundeckSystemData from './RundeckSystemData.jsx'
import SphereIcon from './SphereIcon.jsx'
import { APP_DISPLAY_VERSION, APP_TAGLINE } from '../../app/version.js'
import { numberText, shortHost } from './sapUiFormat.js'
import { systemHealthState } from './rundeckSystemHealth.js'
import './RundeckSource.css'
import './RundeckPlatformHealth.css'

const API = `${import.meta.env.BASE_URL}api`
const BRAND_LOGO = `${import.meta.env.BASE_URL}branding/logo/sphere-logo-navbar-dark.png`
const REPORT_URL = typeof window === 'undefined' ? '' : `${window.location.origin}${import.meta.env.BASE_URL}#/tool/logs`

const formatTime = (value, compact = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', compact
    ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(date)
}

const metric = (value, suffix = '') => (
  value === null || value === undefined || value === ''
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

const ageMinutes = (value) => {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
}

const ageLabel = (minutes) => {
  if (!Number.isFinite(minutes)) return 'age unknown'
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const pssText = (row = {}) => {
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  const value = Number(raw)
  return Number.isFinite(value) ? `${numberText(value, 2)} GB` : '—'
}

const processText = (row = {}) => {
  const value = Number(row.details?.process_count || 0)
  return Number.isFinite(value) && value > 0 ? numberText(value, 0) : '1'
}

const programText = (row = {}) => {
  const program = row.details?.program
  if (program) return program
  return String(row.consumer_type || '').toUpperCase() === 'PROGRAM' ? row.consumer_key || '' : ''
}

const distinctProgramText = (row = {}) => {
  const program = String(programText(row) || '').trim()
  const workload = String(row.consumer_key || '').trim()
  if (!program) return ''
  return program.toUpperCase() === workload.toUpperCase() ? '' : program
}

const shortSignal = (label = '') => String(label || 'Performance issue')
  .replace(/Critical Work Process/gi, 'Critical WP')
  .replace(/Work Process/gi, 'WP')

const issueSignalText = (label, value) => {
  const normalized = shortSignal(label)
  if (/^Critical WP\b/i.test(normalized)) return `Critical WP ${value}`
  return [normalized, value].filter(Boolean).join(' ')
}

function StatusPill({ value = 'UNKNOWN', title = '' }) {
  return <span key={String(value)} className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`} title={title || undefined}>{value}</span>
}

function switchParentSource(value) {
  const select = document.querySelector('.logV2Header select')
  if (!select) return
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  if (descriptor?.set) descriptor.set.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function json(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function pdfStatusColor(status) {
  if (status === 'CRITICAL') return [190, 65, 73]
  if (status === 'WARNING') return [182, 132, 31]
  if (status === 'ATTENTION') return [88, 132, 184]
  if (status === 'UNKNOWN' || status === 'WAITING') return [108, 122, 132]
  return [41, 131, 91]
}

function clipped(value, length = 44) {
  const text = String(value || '—')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function reportDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function availabilityStatus(rows = [], name = '') {
  const key = String(name || '').toUpperCase()
  const row = rows.find((item) => String(item?.name || '').toUpperCase() === key)
  return String(row?.status || 'UNKNOWN').toUpperCase()
}

function availabilityServiceImpact(payload = {}) {
  const apps = payload?.sap_app || []
  const hana = payload?.hana_system_db || []
  const web = payload?.web_dispatcher || []
  const appDown = apps.some((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  const hanaPrimaryDown = hana.some((row) => String(row?.name || '').toUpperCase() === 'PRIMARY' && String(row?.status || '').toUpperCase() === 'DOWN')
  const webDown = web.length > 0 && web.every((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  return appDown || hanaPrimaryDown || webDown
}

export default function RundeckSource({ onCollection }) {
  const [latest, setLatest] = React.useState(null)
  const [health, setHealth] = React.useState(null)
  const [platform, setPlatform] = React.useState(null)
  const [availabilitySnapshot, setAvailabilitySnapshot] = React.useState(null)
  const [hosts, setHosts] = React.useState([])
  const [hostSnapshot, setHostSnapshot] = React.useState(null)
  const [history, setHistory] = React.useState([])
  const [runState, setRunState] = React.useState({ enabled: false, allowed: false })
  const [error, setError] = React.useState('')
  const [actionBusy, setActionBusy] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [pdfPreview, setPdfPreview] = React.useState(null)
  const [selectedJob, setSelectedJob] = React.useState(null)
  const [incidentSummary, setIncidentSummary] = React.useState(null)
  const [, setTrendContext] = React.useState({ metricLabel: 'CPU', rangeLabel: '6H', mode: 'max' })
  const loaded = React.useRef('')
  const panelRef = React.useRef(null)
  const onCollectionRef = React.useRef(onCollection)

  React.useEffect(() => {
    onCollectionRef.current = onCollection
  }, [onCollection])

  React.useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url)
  }, [pdfPreview?.url])

  const closePdfPreview = React.useCallback(() => {
    setPdfPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }, [])

  const selectJob = React.useCallback((job) => {
    if (!job?.key) return
    const scrollTop = typeof window !== 'undefined' ? window.scrollY : null
    setSelectedJob({ ...job, pinned: true })
    if (scrollTop !== null) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, left: 0, behavior: 'auto' })
      }))
    }
  }, [])

  const defaultJob = React.useCallback((job) => {
    if (!job?.key) return
    setSelectedJob((current) => current?.pinned ? current : { ...job, pinned: false })
  }, [])

  const enrichSelectedJob = React.useCallback((context) => {
    if (!context?.key) return
    setSelectedJob((current) => {
      if (!current || current.key !== context.key || current.host !== context.host) return current
      return { ...current, ...context, pinned: current.pinned }
    })
  }, [])

  const loadLatest = React.useCallback(async () => {
    const response = await fetch(`${API}/collections/latest`, { cache: 'no-store' })
    if (response.status === 404) return
    if (!response.ok) throw new Error('Unable to load Rundeck data.')
    const collection = await response.json()
    if (collection.status !== 'READY') throw new Error('Latest Rundeck run is not ready.')

    setLatest(collection)

    if (loaded.current !== collection.collection_id) {
      const raw = await fetch(`${API}/collections/${encodeURIComponent(collection.collection_id)}/raw`, { cache: 'no-store' })
      if (!raw.ok) throw new Error('Unable to download Rundeck data.')
      const blob = await raw.blob()
      await onCollectionRef.current?.([
        new File([blob], `${collection.collection_id}.log`, { type: 'text/plain' }),
      ])
      loaded.current = collection.collection_id
    }
  }, [])

  const refreshMeta = React.useCallback(async () => {
    const [healthResult, hostsResult, historyResult, runResult, platformResult, availabilityResult] = await Promise.allSettled([
      json(`${API}/health`),
      json(`${API}/history/hosts/latest`),
      json(`${API}/history/collections?days=90&limit=30`),
      json(`${API}/collect-now/status`),
      json(`${API}/platform/health`),
      json(`${API}/availability/latest`),
    ])

    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (hostsResult.status === 'fulfilled') {
      setHosts(hostsResult.value.items || [])
      setHostSnapshot(hostsResult.value)
    }
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value.items || [])
    if (runResult.status === 'fulfilled') setRunState(runResult.value)
    if (platformResult.status === 'fulfilled') setPlatform(platformResult.value)
    if (availabilityResult.status === 'fulfilled') setAvailabilitySnapshot(availabilityResult.value)
  }, [])

  const refreshAll = React.useCallback(async () => {
    try {
      await Promise.all([loadLatest(), refreshMeta()])
      setError('')
    } catch (failure) {
      setError(failure.message || 'Rundeck data unavailable.')
    }
  }, [loadLatest, refreshMeta])

  React.useEffect(() => {
    refreshAll()
    const timer = window.setInterval(refreshAll, 60000)
    return () => window.clearInterval(timer)
  }, [refreshAll])

  React.useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined
    const source = new EventSource(`${API}/events`)
    const onReady = () => refreshAll()
    source.addEventListener('collection_ready', onReady)
    source.onerror = () => {}
    return () => {
      source.removeEventListener('collection_ready', onReady)
      source.close()
    }
  }, [refreshAll])

  async function collectNow() {
    setActionBusy(true)
    setError('')
    try {
      const result = await json(`${API}/collect-now`, {
        method: 'POST',
        headers: { 'X-SPHERE-Action': 'collect-now' },
      })
      setRunState(result)
      await refreshMeta()
    } catch (failure) {
      setError(failure.message || 'Collect Now failed.')
    } finally {
      setActionBusy(false)
    }
  }

  async function exportPdf() {
    const panel = panelRef.current
    if (!panel || exporting) return
    setExporting(true)
    setError('')
    try {
      const trendRangeLabel = panel.querySelector('[aria-label="Shared trend period"] .is-active')?.textContent?.trim() || '30D'
      const trendIntervalLabel = panel.querySelector('[aria-label="Trend interval"] .is-active')?.textContent?.trim() || 'Auto'
      const trendModeLabel = panel.querySelector('[aria-label="Server trend view"] .is-active')?.textContent?.trim() || 'Peak'
      const reportRange = trendRangeLabel.toLowerCase()
      const reportBucket = trendIntervalLabel.toLowerCase()
      const [{ default: html2canvas }, { jsPDF }, ramTrendResult, cpuTrendResult, availabilityResult, brandLogo] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        json(`${API}/history/trend?range=${encodeURIComponent(reportRange)}&bucket=${encodeURIComponent(reportBucket)}&metric=ram`).catch(() => null),
        json(`${API}/history/trend?range=${encodeURIComponent(reportRange)}&bucket=${encodeURIComponent(reportBucket)}&metric=cpu`).catch(() => null),
        json(`${API}/availability/latest`).catch(() => null),
        loadImage(BRAND_LOGO),
      ])

      const capture = async (selector) => {
        const element = panel.querySelector(selector)
        if (!element) return null
        return html2canvas(element, { backgroundColor: '#0f151a', scale: 1.55, useCORS: true, logging: false })
      }
      const [serverChart1, serverChart2] = await Promise.all([
        capture('.is-server-trend-1 .rundeckTrendChart'),
        capture('.is-server-trend-2 .rundeckTrendChart'),
      ])
      const trendTitle1 = panel.querySelector('.is-server-trend-1 .rundeckMonitoringHead h3')?.textContent?.trim() || 'Server Trend 1'
      const trendTitle2 = panel.querySelector('.is-server-trend-2 .rundeckMonitoringHead h3')?.textContent?.trim() || 'Server Trend 2'

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      const W = pdf.internal.pageSize.getWidth()
      const H = pdf.internal.pageSize.getHeight()
      const margin = 8
      const contentW = W - margin * 2
      pdf.setFillColor(248, 250, 251)
      pdf.rect(0, 0, W, H, 'F')

      pdf.setFillColor(15, 21, 26)
      pdf.roundedRect(margin, 7, contentW, 16, 1, 1, 'F')
      let brandX = margin + 4
      if (brandLogo?.naturalWidth && brandLogo?.naturalHeight) {
        const logoH = 8
        const logoW = Math.min(31, logoH * (brandLogo.naturalWidth / brandLogo.naturalHeight))
        pdf.addImage(brandLogo, 'PNG', brandX, 11, logoW, logoH, undefined, 'FAST')
        brandX += logoW + 5
      } else {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(240, 245, 247)
        pdf.text('SPHERE', brandX, 17)
        brandX += 25
      }
      pdf.setTextColor(232, 238, 241)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11.2)
      if (typeof pdf.textWithLink === 'function' && REPORT_URL) pdf.textWithLink(APP_TAGLINE, brandX, 17, { url: REPORT_URL })
      else pdf.text(APP_TAGLINE, brandX, 17)

      const availabilityState = String(availabilityResult?.summary?.service_state || availabilityResult?.summary?.sap_state || 'UNKNOWN').toUpperCase()
      const availabilityApps = availabilityResult?.sap_app || []
      const availabilityAppUp = availabilityApps.filter((row) => String(row?.status || '').toUpperCase() === 'UP').length
      const hanaRows = availabilityResult?.hana_system_db || []
      const webRows = availabilityResult?.web_dispatcher || []
      const reportPerformanceAt = latest?.collection_time_wib || latest?.finished_at || ''
      const reportAvailabilityAt = availabilityResult?.collected_at || ''
      const reportPerformanceTs = Date.parse(reportPerformanceAt || '')
      const reportAvailabilityTs = Date.parse(reportAvailabilityAt || '')
      const reportSkewMinutes = Number.isFinite(reportPerformanceTs) && Number.isFinite(reportAvailabilityTs)
        ? Math.round(Math.abs(reportPerformanceTs - reportAvailabilityTs) / 60000)
        : null
      const reportAvailabilityAgeMinutes = Number.isFinite(reportAvailabilityTs)
        ? Math.max(0, Math.floor((Date.now() - reportAvailabilityTs) / 60000))
        : null
      const reportAvailabilityStale = Number.isFinite(reportAvailabilityAgeMinutes) && reportAvailabilityAgeMinutes >= 20
      const reportPerformanceStale = Boolean(health?.rundeck_stale)
      const status = systemHealthState(operationalHosts, {
        availabilityState,
        serviceCritical: availabilityServiceImpact(availabilityResult),
        stale: reportPerformanceStale,
        availabilityStale: reportAvailabilityStale,
      })
      const reportDataAlignment = collectionAligned && reportSkewMinutes !== null && reportSkewMinutes <= 15 && !reportPerformanceStale && !reportAvailabilityStale ? 'ALIGNED' : 'PARTIAL'
      const [sr, sg, sb] = pdfStatusColor(status)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(153, 168, 177)
      pdf.text('OPERATIONAL STATE', W - margin - 28, 15.6, { align: 'right' })
      pdf.setFillColor(sr, sg, sb)
      pdf.rect(W - margin - 25, 11, 21, 7, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text(status, W - margin - 14.5, 15.7, { align: 'center' })
      const operationalReason = reportDataAlignment !== 'ALIGNED'
        ? 'Data partial'
        : reportAvailabilityStale
          ? 'Availability data stale'
          : reportPerformanceStale
            ? 'Performance data stale'
            : ''
      if (operationalReason) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.6)
        pdf.setTextColor(192, 203, 209)
        pdf.text(operationalReason, W - margin - 4, 21, { align: 'right' })
      }

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.8)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`${formatTime(latest?.finished_at)} WIB  ·  Run #${latest?.execution_id || '—'}  ·  ${APP_DISPLAY_VERSION}`, margin, 29)
      pdf.setFontSize(6.8)
      pdf.setTextColor(112, 126, 135)
      pdf.text(
        `System ${String(platformState || 'UNKNOWN').toUpperCase()} · Collector ${String(platform?.collector?.status || 'UNKNOWN').toUpperCase()} · Data ${reportDataAlignment} · Availability ${availabilityState} · SM37 not connected`,
        margin,
        32.3,
      )

      const current = incidentSummary?.current_workload || {}
      const affected = shortHost(incidentSummary?.affected_server || '')
      const signal = incidentSummary?.primary_signal || {}
      const signalValue = metric(signal.value, signal.unit || '')
      const since = incidentSummary?.signal_active_since || incidentSummary?.detected_since
      pdf.setTextColor(71, 87, 97)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.6)
      pdf.text('SUMMARY', margin, 35)
      pdf.setTextColor(22, 31, 38)
      pdf.setFontSize(10.5)
      pdf.text(`${affected || 'SAP'}${signal.label ? ` · ${issueSignalText(signal.label, signalValue)}` : ''}`, margin, 40)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Since ${formatTime(since)} WIB · Duration ${reportDuration(incidentSummary?.duration_seconds)} · Performance ${formatTime(latest?.finished_at)} WIB`, margin, 44.5)
      pdf.setFontSize(7)
      pdf.text(`Availability ${availabilityApps.length ? `${availabilityAppUp}/${availabilityApps.length} APP UP` : 'UNKNOWN'} · ${formatTime(reportAvailabilityAt)} WIB · Selected ${clipped(selectedJob?.key || current.consumer_key || 'No workload selected', 34)}`, margin + 137, 44.5)

      pdf.setDrawColor(220, 226, 229)
      pdf.line(margin, 48, W - margin, 48)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(71, 87, 97)
      pdf.text('AVAILABILITY', margin, 52.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(22, 31, 38)
      pdf.text(`SAP APP ${availabilityApps.length ? `${availabilityAppUp}/${availabilityApps.length} UP` : 'UNKNOWN'}`, margin, 57)
      pdf.text(`HANA Primary ${availabilityStatus(hanaRows, 'PRIMARY')} · Secondary ${availabilityStatus(hanaRows, 'SECONDARY')} · Replication ${availabilityStatus(hanaRows, 'DR')}`, margin + 48, 57)
      pdf.text(`WEB HTTP ${availabilityStatus(webRows, 'HTTP')} · HTTPS ${availabilityStatus(webRows, 'HTTPS')}`, margin + 126, 57)
      pdf.line(margin, 61, W - margin, 61)

      let y = 68
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.8)
      pdf.setTextColor(22, 31, 38)
      pdf.text('SAP APP SERVER STATUS', margin, y)
      y += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.4)
      const columns = [0, 52, 92, 136, 180]
      ;['APP', 'CPU', 'RAM', 'I/O WAIT', 'APP CRIT WP'].forEach((label, index) => pdf.text(label, margin + columns[index], y))
      y += 4
      operationalHosts.slice(0, 5).forEach((host) => {
        pdf.text(shortHost(host.host), margin + columns[0], y)
        pdf.text(metric(host.cpu_pct, '%'), margin + columns[1], y)
        pdf.text(metric(host.ram_pct, '%'), margin + columns[2], y)
        pdf.text(metric(host.io_wait_pct, '%'), margin + columns[3], y)
        pdf.text(metric(host.wp_critical), margin + columns[4], y)
        y += 4
      })

      const chartY = y + 6
      const chartGap = 6
      const chartColW = (contentW - chartGap) / 2
      const chartMaxH = 38
      const drawTrendChart = (chart, title, x) => {
        if (!chart) return
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9.4)
        pdf.setTextColor(22, 31, 38)
        const trendContext = [trendRangeLabel, trendIntervalLabel, trendModeLabel].filter(Boolean).join(' · ')
        pdf.text(`${String(title || 'Server Trend').replace(/\s+/g, ' ')}${trendContext ? ` · ${trendContext}` : ''}`, x, chartY - 3)
        const ratio = Math.min(chartColW / chart.width, chartMaxH / chart.height)
        pdf.addImage(chart.toDataURL('image/jpeg', .92), 'JPEG', x, chartY, chart.width * ratio, chart.height * ratio, undefined, 'FAST')
      }
      drawTrendChart(serverChart1, trendTitle1, margin)
      drawTrendChart(serverChart2, trendTitle2, margin + chartColW + chartGap)

      const bucketDurationMs = (label, rows = []) => {
        const fixed = {
          '10m': 10 * 60 * 1000,
          '30m': 30 * 60 * 1000,
          '1h': 60 * 60 * 1000,
          '6h': 6 * 60 * 60 * 1000,
          '1d': 24 * 60 * 60 * 1000,
        }[String(label || '').toLowerCase()]
        if (fixed) return fixed
        const byHost = new Map()
        rows.forEach((row) => {
          const host = shortHost(row?.host || '')
          const at = Date.parse(row?.bucket || '')
          if (!host || !Number.isFinite(at)) return
          if (!byHost.has(host)) byHost.set(host, [])
          byHost.get(host).push(at)
        })
        const diffs = []
        byHost.forEach((times) => {
          times.sort((a, b) => a - b)
          for (let index = 1; index < times.length; index += 1) {
            const diff = times[index] - times[index - 1]
            if (diff > 0) diffs.push(diff)
          }
        })
        if (!diffs.length) return 10 * 60 * 1000
        diffs.sort((a, b) => a - b)
        return diffs[Math.floor(diffs.length / 2)]
      }

      const thresholdEpisodes = (trend, metricName) => {
        const warning = Number(trend?.warning)
        const critical = Number(trend?.critical)
        const sourceRows = (trend?.items || [])
          .map((row) => ({ ...row, peakValue: Number(row?.max_value), atMs: Date.parse(row?.peak_at || row?.bucket || '') }))
          .filter((row) => Number.isFinite(row.peakValue) && Number.isFinite(row.atMs))
        if (!Number.isFinite(warning)) {
          return { metric: metricName, warning, critical, peak: null, episodes: [] }
        }
        const intervalMs = bucketDurationMs(reportBucket, sourceRows)
        const byHost = new Map()
        sourceRows
          .filter((row) => row.peakValue >= warning)
          .forEach((row) => {
            const host = shortHost(row?.host || '') || 'APP'
            if (!byHost.has(host)) byHost.set(host, [])
            byHost.get(host).push({ ...row, host })
          })
        const episodes = []
        byHost.forEach((rows, host) => {
          rows.sort((left, right) => left.atMs - right.atMs)
          let episode = null
          rows.forEach((row) => {
            const contiguous = episode && row.atMs - episode.lastAtMs <= intervalMs * 1.6
            if (!contiguous) {
              if (episode) episodes.push(episode)
              episode = {
                host,
                startAt: row.bucket || row.peak_at,
                endAt: row.bucket || row.peak_at,
                lastAtMs: row.atMs,
                peakValue: row.peakValue,
                at: row.peak_at || row.bucket,
                bucket: row.bucket,
                collectionId: row.peak_collection_id || '',
              }
            } else {
              episode.endAt = row.bucket || row.peak_at
              episode.lastAtMs = row.atMs
              if (row.peakValue > episode.peakValue) {
                episode.peakValue = row.peakValue
                episode.at = row.peak_at || row.bucket
                episode.bucket = row.bucket
                episode.collectionId = row.peak_collection_id || ''
              }
            }
          })
          if (episode) episodes.push(episode)
        })
        episodes.sort((left, right) => Date.parse(left.at || '') - Date.parse(right.at || ''))
        const peak = episodes.reduce((best, episode) => (!best || episode.peakValue > best.peakValue ? episode : best), null)
        return { metric: metricName, warning, critical, peak, episodes }
      }

      const loadEpisodeTimeline = async (episode) => {
        if (!episode?.at) return null
        const collection = episode.collectionId ? `&collection_id=${encodeURIComponent(episode.collectionId)}` : ''
        return json(`${API}/history/timeline?at=${encodeURIComponent(episode.at)}&window_minutes=5${collection}`).catch(() => null)
      }

      const buildThresholdSummary = async (trend, metricName) => {
        const base = thresholdEpisodes(trend, metricName)
        if (!base.episodes.length) return { ...base, workloads: [] }
        const timelines = await Promise.all(base.episodes.map((episode) => loadEpisodeTimeline(episode)))
        const workloadMap = new Map()
        base.episodes.forEach((episode, episodeIndex) => {
          const timeline = timelines[episodeIndex]
          const row = (timeline?.items || []).find((item) => shortHost(item?.host || '') === episode.host)
            || (timeline?.items || [])[0]
            || null
          const seenInEpisode = new Set()
          ;(row?.top_consumers || []).slice(0, 5).forEach((workload) => {
            const key = String(workload?.consumer_key || '').trim()
            if (!key) return
            const details = workload?.details || {}
            const pss = Number(details.total_pss_gb ?? details.pss_gb)
            const cpu = Number(workload?.cpu_pct)
            let item = workloadMap.get(key)
            if (!item) {
              item = { key, seen: 0, cpuPeak: null, pssPeak: null }
              workloadMap.set(key, item)
            }
            if (!seenInEpisode.has(key)) {
              item.seen += 1
              seenInEpisode.add(key)
            }
            if (Number.isFinite(cpu)) item.cpuPeak = item.cpuPeak === null ? cpu : Math.max(item.cpuPeak, cpu)
            if (Number.isFinite(pss)) item.pssPeak = item.pssPeak === null ? pss : Math.max(item.pssPeak, pss)
          })
        })
        const workloads = [...workloadMap.values()]
          .sort((left, right) => right.seen - left.seen || (right.cpuPeak ?? -1) - (left.cpuPeak ?? -1))
          .slice(0, 5)
        return { ...base, workloads }
      }

      const [ramSummary, cpuSummary] = await Promise.all([
        buildThresholdSummary(ramTrendResult, 'RAM'),
        buildThresholdSummary(cpuTrendResult, 'CPU'),
      ])

      const workY = chartY + chartMaxH + 5
      const thresholdY = workY
      const thresholdH = Math.max(38, H - 18 - thresholdY)
      pdf.setFillColor(244, 247, 249)
      pdf.setDrawColor(220, 226, 229)
      pdf.roundedRect(margin, thresholdY, contentW, thresholdH, 1.2, 1.2, 'FD')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9.2)
      pdf.setTextColor(22, 31, 38)
      pdf.text('JOB/PROGRAM SAAT RAM / CPU TINGGI', margin + 3, thresholdY + 5)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.9)
      pdf.setTextColor(92, 105, 114)
      pdf.text('Dirangkum dari job/program yang tercatat aktif pada collection saat RAM atau CPU melewati threshold.', margin + 3, thresholdY + 8.5)

      const panelGap = 5
      const panelW = (contentW - 6 - panelGap) / 2
      const drawThresholdSummary = (summary, x) => {
        const title = summary.metric === 'RAM' ? 'RAM TINGGI' : 'CPU TINGGI'
        const episodeCount = summary.episodes.length
        const peak = summary.peak
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(71, 87, 97)
        pdf.text(title, x, thresholdY + 13)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(92, 105, 114)
        if (!episodeCount) {
          pdf.text(`Tidak ada kejadian melewati threshold pada periode ${trendRangeLabel}`, x, thresholdY + 17)
          return
        }
        const peakText = peak
          ? ` · Peak ${numberText(peak.peakValue, 1)}% · ${peak.host} · ${formatTime(peak.at)} WIB`
          : ''
        pdf.text(`${episodeCount} kejadian${peakText}`, x, thresholdY + 17)

        const seenX = x + panelW - 47
        const cpuX = x + panelW - 31
        const pssX = x + panelW - 15
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(6.8)
        pdf.setTextColor(71, 87, 97)
        pdf.text('JOB / PROGRAM', x, thresholdY + 22)
        pdf.text('MUNCUL', seenX, thresholdY + 22, { align: 'right' })
        pdf.text('CPU PEAK', cpuX, thresholdY + 22, { align: 'right' })
        pdf.text('PSS PEAK', pssX, thresholdY + 22, { align: 'right' })
        pdf.setDrawColor(220, 226, 229)
        pdf.line(x, thresholdY + 23.5, x + panelW, thresholdY + 23.5)

        let rowY = thresholdY + 28
        if (!summary.workloads.length) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(7)
          pdf.setTextColor(92, 105, 114)
          pdf.text('Tidak ada data job/program tersimpan untuk kejadian ini.', x, rowY)
          return
        }
        summary.workloads.forEach((row) => {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(7)
          pdf.setTextColor(22, 31, 38)
          pdf.text(clipped(row.key, 31), x, rowY)
          pdf.text(`${row.seen} / ${episodeCount}`, seenX, rowY, { align: 'right' })
          pdf.text(row.cpuPeak == null ? '—' : `${numberText(row.cpuPeak, 1)}%`, cpuX, rowY, { align: 'right' })
          pdf.text(row.pssPeak == null ? '—' : `${numberText(row.pssPeak, 2)} GB`, pssX, rowY, { align: 'right' })
          rowY += 4.2
        })

        const leader = summary.workloads[0]
        if (leader) {
          const percent = Math.round((leader.seen / episodeCount) * 100)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(6.8)
          pdf.setTextColor(71, 87, 97)
          pdf.text(`Paling sering muncul: ${clipped(leader.key, 27)} · ${leader.seen}/${episodeCount} kejadian (${percent}%)`, x, thresholdY + thresholdH - 4)
        }
      }

      drawThresholdSummary(ramSummary, margin + 3)
      pdf.setDrawColor(224, 230, 233)
      pdf.line(margin + 3 + panelW + panelGap / 2, thresholdY + 11, margin + 3 + panelW + panelGap / 2, thresholdY + thresholdH - 3)
      drawThresholdSummary(cpuSummary, margin + 3 + panelW + panelGap)

      pdf.setDrawColor(220, 226, 229)
      pdf.line(margin, H - 15, W - margin, H - 15)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.6)
      pdf.setTextColor(71, 87, 97)
      pdf.text('CATATAN', margin, H - 11.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.1)
      pdf.setTextColor(92, 105, 114)
      pdf.text(
        `APP Critical WP = evidence APP · Data kosong = UNKNOWN · Job/program yang muncul belum otomatis penyebab utama · Grouped CPU bisa >100%`,
        margin,
        H - 8,
      )
      pdf.setDrawColor(210, 217, 221)
      pdf.line(margin, H - 5.7, W - margin, H - 5.7)
      pdf.setFontSize(7.2)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`SPHERE · ${APP_DISPLAY_VERSION} · Rundeck Run #${latest?.execution_id || '—'}`, margin, H - 2.7)
      pdf.text('Page 1 / 1', W - margin - 18, H - 2.7)

      const host = shortHost(incidentSummary?.affected_server || selectedJob?.host || 'SAP') || 'SAP'
      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date()).replaceAll('-', '').replace(', ', '_').replace(':', '')
      const filename = `SPHERE_Performance_${host}_${stamp}_Run${latest?.execution_id || 'NA'}.pdf`
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      setPdfPreview((currentPreview) => {
        if (currentPreview?.url) URL.revokeObjectURL(currentPreview.url)
        return { url, blob, filename }
      })
    } catch (failure) {
      setError(failure.message || 'PDF preview failed.')
    } finally {
      setExporting(false)
    }
  }

  const collectionAligned = !latest?.collection_id || !hostSnapshot?.collection_id || hostSnapshot.collection_id === latest.collection_id
  const operationalHosts = collectionAligned ? hosts : []
  const collectionCount = history.length
  const partialCount = history.filter((row) => row.status === 'PARTIAL').length
  const failedCount = history.filter((row) => row.status === 'FAILED').length
  const platformState = platform?.status || 'UNKNOWN'
  const releaseState = platform?.releases?.backend?.status === 'WARNING' || platform?.releases?.web?.status === 'WARNING' ? 'WARNING' : 'NORMAL'
  const serviceStates = [
    platform?.collector?.status,
    platform?.filesystem?.status,
    platform?.inode?.status,
    platform?.filesystem?.status,
    platform?.database?.status === 'ok' ? 'NORMAL' : platform?.database?.status,
    platform?.maintenance?.status,
    platform?.backup?.status || 'NOT_CONFIGURED',
    releaseState,
  ].map((value) => String(value || 'UNKNOWN').toUpperCase())
  const serviceNormalCount = serviceStates.filter((value) => value === 'NORMAL' || value === 'OK').length
  const serviceNotConfiguredCount = serviceStates.filter((value) => value === 'NOT_CONFIGURED').length
  const serviceProblemCount = serviceStates.filter((value) => !['NORMAL', 'OK', 'NOT_CONFIGURED'].includes(value)).length
  const serviceSummary = [
    `${serviceNormalCount} normal`,
    serviceNotConfiguredCount ? `${serviceNotConfiguredCount} not configured` : '',
    serviceProblemCount ? `${serviceProblemCount} needs attention` : '',
  ].filter(Boolean).join(' · ')
  const appCount = latest?.received_hosts?.length || operationalHosts.length || 0
  const incidentStart = incidentSummary?.signal_active_since || incidentSummary?.detected_since || ''
  const latestCollectionAt = latest?.collection_time_wib || latest?.finished_at || ''
  const performanceTs = Date.parse(latestCollectionAt || '')
  const availabilityTs = Date.parse(availabilitySnapshot?.collected_at || '')
  const sourceSkewMinutes = Number.isFinite(performanceTs) && Number.isFinite(availabilityTs)
    ? Math.round(Math.abs(performanceTs - availabilityTs) / 60000)
    : null
  const performanceAgeMinutes = ageMinutes(latestCollectionAt)
  const availabilityAgeMinutes = ageMinutes(availabilitySnapshot?.collected_at)
  const availabilityStale = availabilityAgeMinutes !== null && availabilityAgeMinutes >= 20
  const performanceStale = Boolean(health?.rundeck_stale) || (performanceAgeMinutes !== null && performanceAgeMinutes >= 15)
  const dataAlignment = collectionAligned && sourceSkewMinutes !== null && sourceSkewMinutes <= 15 && !performanceStale && !availabilityStale
    ? 'ALIGNED'
    : 'PARTIAL'
  const freshnessSummary = `Performance ${ageLabel(performanceAgeMinutes)} · Availability ${ageLabel(availabilityAgeMinutes)}`
  const freshnessWarning = performanceStale || availabilityStale || (sourceSkewMinutes !== null && sourceSkewMinutes > 15)
  const dataAlignmentTitle = [
    `Performance #${latest?.execution_id || '—'} · age ${ageLabel(performanceAgeMinutes)}`,
    `Availability #${availabilitySnapshot?.execution_id || '—'} · age ${ageLabel(availabilityAgeMinutes)}`,
    sourceSkewMinutes === null ? 'time difference unknown' : `time difference ${sourceSkewMinutes}m`,
    freshnessWarning ? 'data was collected at different times' : 'data times are aligned',
    runState.running ? `collection running #${runState.execution_id || '—'} (not committed)` : 'no collection currently running',
  ].join(' · ')

  const currentWorkload = <RundeckCurrentWorkload
    collectionId={latest?.collection_id || ''}
    selectedJob={selectedJob}
    onSelectJob={selectJob}
    onSelectedContext={enrichSelectedJob}
    compactLimit={50}
  />

  return <section ref={panelRef} className="rundeckPanel" aria-label="SAP performance monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div className="rundeckTitleBlock">
        <h2 aria-label="SAP Performance"><SphereIcon name="activity" /></h2>
        <div key={latest?.collection_id || 'waiting'} className="rundeckLandscapeMeta is-fresh" aria-label="SAP performance data status">
          <span>{formatTime(latestCollectionAt, true)} WIB</span>
          <span>{appCount || '—'} APP</span>
          <span className="rundeckCycleIdentityV132">Performance <b>READY</b> #{latest?.execution_id || '—'}</span>
        </div>
      </div>
      <div className="rundeckActions">
        <div className="rundeckActionCluster">
        <div className="rundeckModeSwitch" role="group" aria-label="Data source">
          <button type="button" className="is-active" aria-pressed="true" title="Automatic Rundeck source"><SphereIcon name="refresh" /> Rundeck</button>
          <button type="button" onClick={() => switchParentSource('manual')} title="Manual Upload Logs"><SphereIcon name="upload" /> Manual</button>
        </div>
        <button type="button" className="rundeckPdfButton" disabled={exporting} onClick={exportPdf} title="Preview one-page performance report"><SphereIcon name="pdf" /> {exporting ? 'Generating…' : 'PDF Preview'}</button>
        {runState.enabled && (
          <button
            type="button"
            className="rundeckCollectButton"
            disabled={actionBusy || !runState.allowed}
            onClick={collectNow}
            title={runState.running ? `Collector execution #${runState.execution_id || '—'} is still running; Performance READY remains the last committed snapshot.` : runState.cooldown ? 'Collect Now is in cooldown' : 'Run the approved SPHERE Rundeck job'}
          >
            <SphereIcon name="refresh" /> {actionBusy ? 'Collection starting' : runState.running ? `Collection running #${runState.execution_id || '—'}` : runState.cooldown ? 'Collect cooldown' : 'Collect Now'}
          </button>
        )}
        </div>
        <div className="rundeckStateCluster">
          <details className={`rundeckDataAlignment ${freshnessWarning ? 'is-freshness-warning' : ''}`}>
            <summary title={dataAlignmentTitle}>
              <span>Data</span><StatusPill value={dataAlignment} />
              <small className="rundeckSourceFreshness">{freshnessSummary}</small>
            </summary>
            <div className="rundeckDataAlignmentPopover">
              <div><span>Performance data</span><strong>{ageLabel(performanceAgeMinutes)} old</strong></div>
              <div><span>Availability data</span><strong>{ageLabel(availabilityAgeMinutes)} old</strong></div>
              <div><span>Time difference</span><strong>{sourceSkewMinutes === null ? 'Unknown' : `${sourceSkewMinutes}m`}</strong></div>
              <p>{freshnessWarning ? 'Some data is older than the current performance snapshot. Check the timestamps before comparing them.' : 'Performance and availability data are close enough in time to compare.'}</p>
            </div>
          </details>
        </div>
      </div>
    </header>

    {error && <div className={`rundeckMessage ${latest ? 'is-reconnecting' : ''}`} role="status">{latest ? `Refresh delayed. Showing last good run #${latest.execution_id || '—'}.` : error}</div>}
    {!collectionAligned && <div className="rundeckMessage" role="status">Waiting for one complete aligned Rundeck run.</div>}

    <RundeckPerformanceIncident
      refreshToken={latest?.collection_id || ''}
      selectedJob={selectedJob}
      onSelectJob={selectJob}
      onDefaultJob={defaultJob}
      onSummary={setIncidentSummary}
      showStatus={false}
    />

    <RundeckMonitoringHistory
      refreshToken={latest?.collection_id || ''}
      databaseEnabled={Boolean(health?.database)}
      selectedJob={selectedJob}
      onSelectJob={selectJob}
      currentWorkloadContent={currentWorkload}
      incidentStart={incidentStart}
      latestCollectionId={latest?.collection_id || ''}
      latestCollectionAt={latestCollectionAt}
      onTrendContext={setTrendContext}
      systemDataSummary={`${collectionCount} runs · ${partialCount} partial · ${failedCount} failed · ${serviceSummary}`}
      systemDataContent={<RundeckSystemData history={history} platform={platform} platformState={platformState} serviceSummary={serviceSummary} releaseState={releaseState} />}
    />

    {pdfPreview && <div className="rundeckPdfPreviewBackdrop" role="dialog" aria-modal="true" aria-label="PDF preview">
      <section className="rundeckPdfPreview">
        <header>
          <div><span>SPHERE REPORT PREVIEW</span><strong>{pdfPreview.filename}</strong></div>
          <button type="button" onClick={closePdfPreview} aria-label="Close PDF preview">Close</button>
        </header>
        <iframe src={pdfPreview.url} title="SPHERE PDF preview" />
        <footer>
          <a href={pdfPreview.url} target="_blank" rel="noreferrer">Open in New Tab</a>
          <a className="is-primary" href={pdfPreview.url} download={pdfPreview.filename}>Download PDF</a>
        </footer>
      </section>
    </div>}
  </section>
}
