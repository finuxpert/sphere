import React from 'react'
import RundeckCurrentWorkload from './RundeckCurrentWorkload.jsx'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import RundeckPerformanceIncident from './RundeckPerformanceIncident.jsx'
import RundeckSystemData from './RundeckSystemData.jsx'
import SphereIcon from './SphereIcon.jsx'
import { APP_DISPLAY_VERSION, APP_TAGLINE } from '../../app/version.js'
import { numberText, shortHost } from './sapUiFormat.js'
import { evaluationReasonText } from './rundeckEvaluationExplain.js'
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
  const [trendContext, setTrendContext] = React.useState({ metricLabel: 'CPU', rangeLabel: '6H', mode: 'max' })
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
      const [{ default: html2canvas }, { jsPDF }, workloadResult, evaluationResult, availabilityResult, brandLogo] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        latest?.collection_id ? json(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latest.collection_id)}&limit=4`) : Promise.resolve({ items: [] }),
        json(`${API}/evaluation/workloads?period=1d&type=ALL&limit=100`).catch(() => ({ items: [] })),
        json(`${API}/availability/latest`).catch(() => null),
        loadImage(BRAND_LOGO),
      ])

      const capture = async (selector) => {
        const element = panel.querySelector(selector)
        if (!element) return null
        return html2canvas(element, { backgroundColor: '#0f151a', scale: 1.55, useCORS: true, logging: false })
      }
      const [serverChart, workloadChart] = await Promise.all([
        capture('.rundeckTrendChart'),
        capture('.rundeckJobPerformanceChart, .rundeckSingleSample'),
      ])

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      const W = pdf.internal.pageSize.getWidth()
      const H = pdf.internal.pageSize.getHeight()
      const margin = 9
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
      pdf.setFontSize(10.5)
      if (typeof pdf.textWithLink === 'function' && REPORT_URL) pdf.textWithLink(APP_TAGLINE, brandX, 17, { url: REPORT_URL })
      else pdf.text(APP_TAGLINE, brandX, 17)

      const availabilityState = String(availabilityResult?.summary?.service_state || availabilityResult?.summary?.sap_state || 'UNKNOWN').toUpperCase()
      const status = systemHealthState(operationalHosts, {
        availabilityState,
        serviceCritical: availabilityServiceImpact(availabilityResult),
      })
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
      const reportDataAlignment = collectionAligned && reportSkewMinutes !== null && reportSkewMinutes <= 15 ? 'ALIGNED' : 'PARTIAL'
      const [sr, sg, sb] = pdfStatusColor(status)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(5.8)
      pdf.setTextColor(153, 168, 177)
      pdf.text('OPERATIONAL STATE', W - margin - 28, 15.6, { align: 'right' })
      pdf.setFillColor(sr, sg, sb)
      pdf.rect(W - margin - 25, 11, 21, 7, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.4)
      pdf.text(status, W - margin - 14.5, 15.7, { align: 'center' })

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.4)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`${formatTime(latest?.finished_at)} WIB  ·  Run #${latest?.execution_id || '—'}  ·  ${APP_DISPLAY_VERSION}`, margin, 29)

      const current = incidentSummary?.current_workload || {}
      const affected = shortHost(incidentSummary?.affected_server || '')
      const signal = incidentSummary?.primary_signal || {}
      const signalValue = metric(signal.value, signal.unit || '')
      const since = incidentSummary?.signal_active_since || incidentSummary?.detected_since
      pdf.setTextColor(71, 87, 97)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.1)
      pdf.text('SUMMARY', margin, 35)
      pdf.setTextColor(22, 31, 38)
      pdf.setFontSize(9.8)
      pdf.text(`${affected || 'SAP'}${signal.label ? ` · ${issueSignalText(signal.label, signalValue)}` : ''}`, margin, 40)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.1)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Since ${formatTime(since)} WIB · Duration ${reportDuration(incidentSummary?.duration_seconds)} · Performance ${formatTime(latest?.finished_at)} WIB`, margin, 44.5)
      pdf.setFontSize(6.6)
      pdf.text(`Availability ${availabilityApps.length ? `${availabilityAppUp}/${availabilityApps.length} APP UP` : 'UNKNOWN'} · ${formatTime(reportAvailabilityAt)} WIB · Selected ${clipped(selectedJob?.key || current.consumer_key || 'No workload selected', 34)}`, margin + 137, 44.5)

      pdf.setDrawColor(220, 226, 229)
      pdf.line(margin, 48, W - margin, 48)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.9)
      pdf.setTextColor(71, 87, 97)
      pdf.text('AVAILABILITY', margin, 52.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(22, 31, 38)
      pdf.text(`SAP APP ${availabilityApps.length ? `${availabilityAppUp}/${availabilityApps.length} UP` : 'UNKNOWN'}`, margin, 57)
      pdf.text(`HANA P ${availabilityStatus(hanaRows, 'PRIMARY')} · S ${availabilityStatus(hanaRows, 'SECONDARY')} · DR ${availabilityStatus(hanaRows, 'DR')}`, margin + 48, 57)
      pdf.text(`WEB HTTP ${availabilityStatus(webRows, 'HTTP')} · HTTPS ${availabilityStatus(webRows, 'HTTPS')}`, margin + 126, 57)
      pdf.line(margin, 61, W - margin, 61)

      let y = 68
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.2)
      pdf.setTextColor(22, 31, 38)
      pdf.text('SAP APP SERVER STATUS', margin, y)
      y += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.1)
      const columns = [0, 52, 92, 136, 180]
      ;['APP', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP'].forEach((label, index) => pdf.text(label, margin + columns[index], y))
      y += 4
      operationalHosts.slice(0, 5).forEach((host) => {
        pdf.text(shortHost(host.host), margin + columns[0], y)
        pdf.text(metric(host.cpu_pct, '%'), margin + columns[1], y)
        pdf.text(metric(host.ram_pct, '%'), margin + columns[2], y)
        pdf.text(metric(host.io_wait_pct, '%'), margin + columns[3], y)
        pdf.text(metric(host.wp_critical), margin + columns[4], y)
        y += 4
      })

      const chartY = y + 5
      if (serverChart) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8.6)
        const trendMetric = String(trendContext.metricLabel || 'Performance').toUpperCase()
        const trendRange = String(trendContext.rangeLabel || '6H').toUpperCase()
        pdf.text(`SERVER ${trendMetric} TREND · ${trendRange}`, margin, chartY - 3)
        const ratio = Math.min(contentW / serverChart.width, 47 / serverChart.height)
        pdf.addImage(serverChart.toDataURL('image/jpeg', .92), 'JPEG', margin, chartY, serverChart.width * ratio, serverChart.height * ratio, undefined, 'FAST')
      }

      const workY = 156
      const leftW = contentW * .56
      const inspectedHost = shortHost(selectedJob?.host || incidentSummary?.affected_server || '') || 'SAP'
      const inspectedWorkload = selectedJob?.key || current.consumer_key
      const inspectedSource = [current, ...(workloadResult.items || [])].find((row) => (
        row?.consumer_key === inspectedWorkload && (!selectedJob?.host || !row?.host || row.host === selectedJob.host)
      )) || {}
      const inspectedProgram = distinctProgramText(inspectedSource)
      const selectedCriticalWpRaw = selectedJob && Object.prototype.hasOwnProperty.call(selectedJob, 'criticalWp')
        ? selectedJob.criticalWp
        : (inspectedSource.host_wp_critical ?? inspectedSource.host_critical_wp)
      const selectedCriticalWpText = selectedCriticalWpRaw === null || selectedCriticalWpRaw === undefined
        ? 'Not observed'
        : String(selectedCriticalWpRaw)
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.7)
      pdf.setDrawColor(220, 226, 229)
      pdf.line(margin, workY - 7, W - margin, workY - 7)
      pdf.text(`SELECTED WORKLOAD · ${inspectedHost} · ${clipped(inspectedWorkload, 48)}`, margin, workY - 2)
      if (inspectedProgram) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(92, 105, 114)
        pdf.text(`Program ${clipped(inspectedProgram, 48)}`, margin, workY + 0.8)
      }
      const selectedMetricY = inspectedProgram ? workY + 5.2 : workY + 2
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.9)
      pdf.setTextColor(71, 87, 97)
      pdf.text('CPU', margin, selectedMetricY)
      pdf.text('PSS MEMORY', margin + 27, selectedMetricY)
      pdf.text('PROCESSES', margin + 62, selectedMetricY)
      pdf.text('WP', margin + 91, selectedMetricY)
      pdf.text('APP CRIT WP', margin + 114, selectedMetricY)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.7)
      pdf.setTextColor(22, 31, 38)
      pdf.text(metric(inspectedSource.cpu_pct, '%'), margin, selectedMetricY + 3.5)
      pdf.text(pssText(inspectedSource), margin + 27, selectedMetricY + 3.5)
      pdf.text(processText(inspectedSource), margin + 62, selectedMetricY + 3.5)
      pdf.text(clipped(inspectedSource.details?.wp || inspectedSource.details?.wp_type || '—', 15), margin + 91, selectedMetricY + 3.5)
      pdf.text(selectedCriticalWpText, margin + 114, selectedMetricY + 3.5)
      pdf.setFontSize(6.2)
      pdf.setTextColor(92, 105, 114)
      const selectedObservedAt = selectedJob?.at || inspectedSource.collected_at || latest?.finished_at
      pdf.text(`Observed ${formatTime(selectedObservedAt)} WIB · Source: workload observation · SM37 not connected`, margin, selectedMetricY + 7.5)
      if (workloadChart) {
        const chartTop = selectedMetricY + 10
        const chartMaxH = 20
        const ratio = Math.min(leftW / workloadChart.width, chartMaxH / workloadChart.height)
        pdf.addImage(workloadChart.toDataURL('image/jpeg', .94), 'JPEG', margin, chartTop, workloadChart.width * ratio, workloadChart.height * ratio, undefined, 'FAST')
      }

      const evaluationItems = evaluationResult.items || []
      const sideX = margin + leftW + 7
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.6)
      pdf.text('JOBS / PROGRAMS TO REVIEW', sideX, workY - 3)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.6)
      pdf.setTextColor(92, 105, 114)
      pdf.text('Observed CPU, PSS and APP Critical WP', sideX, workY + 0.8)
      const reviewCols = [0, 58, 77, 96]
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.8)
      ;['JOB / PROGRAM', 'AVG CPU', 'PEAK CPU', 'AVG PSS'].forEach((label, index) => pdf.text(label, sideX + reviewCols[index], workY + 5))
      pdf.setDrawColor(220, 226, 229)
      pdf.line(sideX, workY + 6.5, W - margin, workY + 6.5)
      let sideY = workY + 11
      ;evaluationItems.slice(0, 3).forEach((row) => {
        const reason = evaluationReasonText(row)
        pdf.setTextColor(22, 31, 38)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7.4)
        pdf.text(clipped(`${shortHost(row.host || row.hosts?.[0] || '')} ${row.consumer_key || '—'}`, 34), sideX + reviewCols[0], sideY)
        pdf.text(metric(row.avg_cpu_pct, '%'), sideX + reviewCols[1], sideY)
        pdf.text(metric(row.peak_cpu_pct, '%'), sideX + reviewCols[2], sideY)
        pdf.text(row.avg_pss_gb == null ? '—' : `${numberText(row.avg_pss_gb, 2)} GB`, sideX + reviewCols[3], sideY)
        if (reason) {
          pdf.setTextColor(92, 105, 114)
          pdf.setFontSize(6.6)
          pdf.text(clipped(`Reason: ${reason}`, 55), sideX, sideY + 3)
          sideY += 7.2
        } else {
          sideY += 5.8
        }
      })

      pdf.setDrawColor(220, 226, 229)
      pdf.line(margin, H - 31, W - margin, H - 31)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.3)
      pdf.setTextColor(71, 87, 97)
      pdf.text('CHECK SUMMARY', margin, H - 27)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.1)
      pdf.setTextColor(22, 31, 38)
      pdf.text(`Availability: ${availabilityApps.length ? `${availabilityAppUp}/${availabilityApps.length} UP` : 'UNKNOWN'} · Critical WP: ${selectedCriticalWpText} · Data: ${reportDataAlignment} · Timing: ${reportSkewMinutes == null ? 'unknown' : `${reportSkewMinutes}m`}`, margin, H - 23)
      pdf.setFontSize(6.2)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Performance ${formatTime(reportPerformanceAt)} WIB · Availability ${formatTime(reportAvailabilityAt)} WIB`, margin + 158, H - 23)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.1)
      pdf.setTextColor(71, 87, 97)
      pdf.text('NOTES', margin, H - 18)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.7)
      pdf.setTextColor(92, 105, 114)
      pdf.text('SM37: NOT CONNECTED · Critical WP: APP level · Correlation based on time · Check job status in SAP (SM37).', margin, H - 14)
      pdf.setDrawColor(210, 217, 221)
      pdf.line(margin, H - 11, W - margin, H - 11)
      pdf.setFontSize(7.2)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`SPHERE · ${APP_DISPLAY_VERSION} · Rundeck Run #${latest?.execution_id || '—'}`, margin, H - 6)
      pdf.text('Page 1 / 1', W - margin - 18, H - 6)

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
  />

  return <section ref={panelRef} className="rundeckPanel" aria-label="SAP performance monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div className="rundeckTitleBlock">
        <h2><SphereIcon name="activity" /> SAP Performance Summary</h2>
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
          <div><span>Report Preview</span><strong>{pdfPreview.filename}</strong></div>
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
