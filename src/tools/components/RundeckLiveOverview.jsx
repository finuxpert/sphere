import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { infrastructureTelemetryFreshness, infrastructureObservationStatus } from './infrastructureFreshness.js'
import './RundeckLiveOverview.css'

const API = import.meta.env.BASE_URL + 'api'
const HOST_STORAGE_KEY = 'sphere.live.host'

async function loadJson(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Request failed (' + response.status + ')')
  return response.json()
}

function metric(value, suffix = '') {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 1 }) + suffix : '—'
}

function fsState(value) {
  return Number(value) >= 90 ? 'CRITICAL' : Number(value) >= 80 ? 'ATTENTION' : 'NORMAL'
}

function storageState(value) {
  return Number(value) >= 95 ? 'CRITICAL' : Number(value) >= 80 ? 'ATTENTION' : 'NORMAL'
}

const severity = { NORMAL: 0, ATTENTION: 1, CRITICAL: 2 }

function worst(values) {
  return values.reduce((current, value) => (severity[value] || 0) > (severity[current] || 0) ? value : current, 'NORMAL')
}

function ageText(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return seconds + 's'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm'
  return Math.floor(seconds / 3600) + 'h'
}

function formatObservedAt(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(timestamp).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
}

function Status({ value }) {
  if (!value || value === 'NORMAL') return null
  return <span className={'rundeckLiveStatus is-' + value.toLowerCase()}>{value}</span>
}

export default function RundeckLiveOverview({ refreshToken, embedded = false, onOpenMetric = null }) {
  const [hosts, setHosts] = React.useState([])
  const [selectedHost, setSelectedHost] = React.useState(() => {
    try { return window.localStorage.getItem(HOST_STORAGE_KEY) || '' } catch { return '' }
  })
  const [infra, setInfra] = React.useState({ host: '', fs: [], network: [], storage: [] })
  const [clockNow, setClockNow] = React.useState(() => Date.now())
  const [refreshCycle, setRefreshCycle] = React.useState(0)
  const [jobs, setJobs] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const timer = setInterval(() => {
      setClockNow(Date.now())
      setRefreshCycle((value) => value + 1)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    loadJson(API + '/infra/hosts', controller.signal)
      .then((body) => {
        const items = body.items || []
        setHosts(items)
        setSelectedHost((current) => items.some((row) => row.host === current) ? current : (items[0]?.host || ''))
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [refreshToken, refreshCycle])

  React.useEffect(() => {
    if (!selectedHost) return
    try { window.localStorage.setItem(HOST_STORAGE_KEY, selectedHost) } catch { /* preference persistence is best-effort */ }
  }, [selectedHost])

  React.useEffect(() => {
    if (!selectedHost) return undefined
    const controller = new AbortController()
    const host = encodeURIComponent(selectedHost)
    Promise.all([
      loadJson(API + '/infra/filesystems?host=' + host, controller.signal),
      loadJson(API + '/infra/network?host=' + host, controller.signal),
      loadJson(API + '/infra/storage?host=' + host, controller.signal),
      loadJson(API + '/jobs/monitor?days=1&limit=50', controller.signal).catch(() => null),
    ]).then(([fs, network, storage, jobData]) => {
      setInfra({ host: selectedHost, fs: fs.items || [], network: network.items || [], storage: storage.items || [] })
      setJobs(jobData)
      setError('')
    }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [selectedHost, refreshToken, refreshCycle])

  const hostRow = hosts.find((row) => row.host === selectedHost)
  const observedInfra = infra.host === selectedHost ? infra : { fs: [], network: [], storage: [] }
  const telemetryRows = [...observedInfra.fs, ...observedInfra.network, ...observedInfra.storage]
  const snapshotFreshness = infrastructureTelemetryFreshness(hostRow?.snapshot_ts, hostRow?.collection_id, telemetryRows, clockNow)
  const observedAt = telemetryRows
    .map((row) => row.collected_at)
    .filter((stamp) => Number.isFinite(Date.parse(stamp || '')))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || hostRow?.snapshot_ts
  const topFs = [...observedInfra.fs].sort((a, b) => severity[fsState(b.used_pct)] - severity[fsState(a.used_pct)] || Number(b.used_pct || 0) - Number(a.used_pct || 0)).slice(0, 4)
  const topStorage = [...observedInfra.storage].sort((a, b) => severity[storageState(b.metrics?.util_pct)] - severity[storageState(a.metrics?.util_pct)] || Number(b.metrics?.util_pct || 0) - Number(a.metrics?.util_pct || 0)).slice(0, 3)
  const fsOverall = worst(observedInfra.fs.map((row) => fsState(row.used_pct)))
  const storageOverall = worst(observedInfra.storage.map((row) => storageState(row.metrics?.util_pct)))
  const dropTotal = observedInfra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_dropped_delta || 0) + Number(row.metrics?.tx_dropped_delta || 0), 0)
  const errorTotal = observedInfra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_errors_delta || 0) + Number(row.metrics?.tx_errors_delta || 0), 0)
  const networkOverall = dropTotal + errorTotal > 0 ? 'ATTENTION' : 'NORMAL'
  const rx = observedInfra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_mbps || 0), 0)
  const tx = observedInfra.network.reduce((sum, row) => sum + Number(row.metrics?.tx_mbps || 0), 0)
  const jobSummary = jobs?.summary || {}
  const authoritativeJobsReady = false
  const openMetric = (metricType, series = '') => onOpenMetric?.({ host: selectedHost || hostRow?.host || '', metric: metricType, series })
  const fsDisplayState = observedInfra.fs.length ? infrastructureObservationStatus(fsOverall, snapshotFreshness) : 'UNKNOWN'
  const storageDisplayState = observedInfra.storage.length ? infrastructureObservationStatus(storageOverall, snapshotFreshness) : 'UNKNOWN'
  const networkDisplayState = observedInfra.network.length ? infrastructureObservationStatus(networkOverall, snapshotFreshness) : 'UNKNOWN'
  const topFsRow = topFs[0]
  const exceptionParts = []
  if (snapshotFreshness === 'FRESH' && fsOverall !== 'NORMAL' && topFsRow) exceptionParts.push(`${topFsRow.mount_point} ${metric(topFsRow.used_pct, '%')}`)
  if (snapshotFreshness === 'FRESH' && storageOverall !== 'NORMAL') exceptionParts.push(`${storageOverall} · Storage I/O`)
  if (snapshotFreshness === 'FRESH' && networkOverall !== 'NORMAL') exceptionParts.push('ATTENTION · Network errors/drops')
  const summaryTarget = fsOverall !== 'NORMAL' && topFsRow
    ? { metric: 'filesystem', series: topFsRow.mount_point }
    : storageOverall !== 'NORMAL' && topStorage[0]
      ? { metric: 'storage', series: topStorage[0].metrics?.mount || topStorage[0].sample_key }
      : networkOverall !== 'NORMAL'
        ? { metric: 'network', series: '' }
        : null

  return <section className={`rundeckLiveOverview${embedded ? ' is-embedded' : ''}`} aria-label="Live monitoring overview">
    {embedded && <div className="rundeckEmbeddedInfrastructureTitle"><SphereIcon name="server" /> Infrastructure</div>}
    <header className="rundeckLiveOverviewHead">
      <div className="rundeckLiveScope">
        <select value={selectedHost} onChange={(event) => setSelectedHost(event.target.value)} aria-label="Monitoring host">
          {hosts.map((row) => <option key={row.host} value={row.host}>{(row.source ? row.source + ' · ' : '') + row.host}</option>)}
        </select>
        <span className={snapshotFreshness === 'FRESH' ? '' : 'is-stale'}>{snapshotFreshness === 'UNKNOWN' ? 'UNKNOWN · unverified telemetry' : `${snapshotFreshness === 'STALE' ? 'STALE' : 'Updated'} · ${ageText(observedAt)} ago`}</span>
      </div>
      {error && <span className="rundeckLiveOverviewError">{error}</span>}
    </header>

    {snapshotFreshness !== 'FRESH' && <div className="rundeckLiveDataDelayed" role="status">
      <strong>{snapshotFreshness === 'STALE' ? 'Collection delayed' : 'Infrastructure data unverified'}</strong>
      <span>{snapshotFreshness === 'STALE'
        ? `Sampled ${formatObservedAt(observedAt)} WIB · figures below are historical`
        : 'Host or metric collection missing/mismatched; figures below are historical'}</span>
    </div>}
    {exceptionParts.length > 0 && <button type="button" className="rundeckLiveExceptionSummary is-clickable" onClick={() => summaryTarget && openMetric(summaryTarget.metric, summaryTarget.series)} title="Open Infrastructure Analysis">
      <strong>{exceptionParts.length} needs attention</strong>
      <span>{exceptionParts.join(' · ')}</span>
      <em aria-hidden="true">›</em>
    </button>}

    <div className="rundeckLiveCardGrid">
      <article>
        <header><h4>Filesystem</h4><Status value={fsDisplayState} /></header>
        <div className="rundeckLiveRows">
          {topFs.map((row) => <button type="button" key={row.mount_point} className="rundeckLiveMetricLink" onClick={() => openMetric('filesystem', row.mount_point)} title="Open filesystem history"><span>{row.mount_point}</span><strong className={snapshotFreshness === 'FRESH' ? 'is-' + fsState(row.used_pct).toLowerCase() : 'is-historical'}>{snapshotFreshness === 'FRESH' ? metric(row.used_pct, '%') : 'Last ' + metric(row.used_pct, '%')}</strong><em aria-hidden="true">›</em></button>)}
          {!topFs.length && <div><span>No data</span><strong>—</strong></div>}
        </div>
      </article>

      <article>
        <header><h4>Network</h4><Status value={networkDisplayState} /></header>
        <div className="rundeckLiveMetricPair"><button type="button" className="rundeckLiveMetricLink" onClick={() => openMetric('network')} title="Open network history"><span>{snapshotFreshness === 'FRESH' ? 'RX' : 'Last RX'}</span><strong>{metric(rx, ' Mbps')}</strong><em aria-hidden="true">›</em></button><button type="button" className="rundeckLiveMetricLink" onClick={() => openMetric('network')} title="Open network history"><span>{snapshotFreshness === 'FRESH' ? 'TX' : 'Last TX'}</span><strong>{metric(tx, ' Mbps')}</strong><em aria-hidden="true">›</em></button></div>
        <div className="rundeckLiveRows"><button type="button" className="rundeckLiveMetricLink" onClick={() => openMetric('network')} title="Open network drop history"><span>Drop Δ</span><strong className={snapshotFreshness === 'FRESH' && dropTotal > 0 ? 'is-attention' : 'is-historical'}>{metric(dropTotal)}</strong><em aria-hidden="true">›</em></button><button type="button" className="rundeckLiveMetricLink" onClick={() => openMetric('network')} title="Open network error history"><span>Error Δ</span><strong className={snapshotFreshness === 'FRESH' && errorTotal > 0 ? 'is-attention' : 'is-historical'}>{metric(errorTotal)}</strong><em aria-hidden="true">›</em></button></div>
      </article>

      <article>
        <header><h4>Storage I/O</h4><Status value={storageDisplayState} /></header>
        <div className="rundeckLiveRows">
          {topStorage.map((row) => <button type="button" key={row.sample_key} className="rundeckLiveMetricLink" onClick={() => openMetric('storage', row.metrics?.mount || row.sample_key)} title="Open storage I/O history"><span>{row.metrics?.mount || row.sample_key}</span><strong className={snapshotFreshness === 'FRESH' ? 'is-' + storageState(row.metrics?.util_pct).toLowerCase() : 'is-historical'}>{snapshotFreshness === 'FRESH' ? metric(row.metrics?.util_pct, '%') : 'Last ' + metric(row.metrics?.util_pct, '%')}</strong><em aria-hidden="true">›</em></button>)}
          {!topStorage.length && <div><span>No data</span><strong>—</strong></div>}
        </div>
      </article>

    </div>
    <div className="rundeckLiveJobSource">
      <strong>SAP Job Source</strong>
      {!authoritativeJobsReady
        ? <><span>SM37 NOT CONNECTED</span><small>SM37 job execution data is not connected.</small></>
        : <small>Active {jobSummary.active ?? '—'} · Failed {jobSummary.failed ?? '—'} · Long running {jobSummary.long_running ?? '—'}</small>}
    </div>
  </section>
}
