import React from 'react'
import './RundeckLiveOverview.css'

const API = import.meta.env.BASE_URL + 'api'

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
  if (!value) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return seconds + 's'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm'
  return Math.floor(seconds / 3600) + 'h'
}

function Status({ value }) {
  if (!value || value === 'NORMAL') return null
  return <span className={'rundeckLiveStatus is-' + value.toLowerCase()}>{value}</span>
}

export default function RundeckLiveOverview({ refreshToken }) {
  const [hosts, setHosts] = React.useState([])
  const [selectedHost, setSelectedHost] = React.useState('')
  const [infra, setInfra] = React.useState({ fs: [], network: [], storage: [] })
  const [jobs, setJobs] = React.useState(null)
  const [error, setError] = React.useState('')

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
  }, [refreshToken])

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
      setInfra({ fs: fs.items || [], network: network.items || [], storage: storage.items || [] })
      setJobs(jobData)
      setError('')
    }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [selectedHost, refreshToken])

  const hostRow = hosts.find((row) => row.host === selectedHost)
  const topFs = [...infra.fs].sort((a, b) => Number(b.used_pct || 0) - Number(a.used_pct || 0)).slice(0, 4)
  const topStorage = [...infra.storage].sort((a, b) => Number(b.metrics?.util_pct || 0) - Number(a.metrics?.util_pct || 0)).slice(0, 3)
  const fsOverall = worst(infra.fs.map((row) => fsState(row.used_pct)))
  const storageOverall = worst(infra.storage.map((row) => storageState(row.metrics?.util_pct)))
  const dropTotal = infra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_dropped_delta || 0) + Number(row.metrics?.tx_dropped_delta || 0), 0)
  const errorTotal = infra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_errors_delta || 0) + Number(row.metrics?.tx_errors_delta || 0), 0)
  const networkOverall = dropTotal + errorTotal > 0 ? 'ATTENTION' : 'NORMAL'
  const infraOverall = worst([fsOverall, storageOverall, networkOverall])
  const rx = infra.network.reduce((sum, row) => sum + Number(row.metrics?.rx_mbps || 0), 0)
  const tx = infra.network.reduce((sum, row) => sum + Number(row.metrics?.tx_mbps || 0), 0)
  const jobSummary = jobs?.summary || {}
  const jobOverall = Number(jobSummary.failed || 0) > 0 ? 'CRITICAL' : Number(jobSummary.long_running || 0) > 0 ? 'ATTENTION' : 'NORMAL'

  return <section className="rundeckLiveOverview" aria-label="Live monitoring overview">
    <header className="rundeckLiveOverviewHead">
      <div className="rundeckLiveScope">
        <select value={selectedHost} onChange={(event) => setSelectedHost(event.target.value)} aria-label="Monitoring host">
          {hosts.map((row) => <option key={row.host} value={row.host}>{(row.source ? row.source + ' · ' : '') + row.host}</option>)}
        </select>
        <span>Updated {ageText(hostRow?.snapshot_ts)} ago</span>
      </div>
      {error && <span className="rundeckLiveOverviewError">{error}</span>}
    </header>

    <div className="rundeckLiveSummaryStrip">
      <div><span>Infrastructure</span><strong>{infraOverall}</strong><Status value={infraOverall} /></div>
      <div><span>Jobs</span><strong>{jobOverall}</strong><Status value={jobOverall} /></div>
      <div><span>Host</span><strong>{selectedHost || '—'}</strong></div>
    </div>

    <div className="rundeckLiveCardGrid">
      <article>
        <header><h4>Filesystem</h4><Status value={fsOverall} /></header>
        <div className="rundeckLiveRows">
          {topFs.map((row) => <div key={row.mount_point}><span>{row.mount_point}</span><strong className={'is-' + fsState(row.used_pct).toLowerCase()}>{metric(row.used_pct, '%')}</strong></div>)}
          {!topFs.length && <div><span>No data</span><strong>—</strong></div>}
        </div>
      </article>

      <article>
        <header><h4>Network</h4><Status value={networkOverall} /></header>
        <div className="rundeckLiveMetricPair"><div><span>RX</span><strong>{metric(rx, ' Mbps')}</strong></div><div><span>TX</span><strong>{metric(tx, ' Mbps')}</strong></div></div>
        <div className="rundeckLiveRows"><div><span>Drop Δ</span><strong className={dropTotal > 0 ? 'is-attention' : ''}>{metric(dropTotal)}</strong></div><div><span>Error Δ</span><strong className={errorTotal > 0 ? 'is-attention' : ''}>{metric(errorTotal)}</strong></div></div>
      </article>

      <article>
        <header><h4>Storage I/O</h4><Status value={storageOverall} /></header>
        <div className="rundeckLiveRows">
          {topStorage.map((row) => <div key={row.sample_key}><span>{row.metrics?.mount || row.sample_key}</span><strong className={'is-' + storageState(row.metrics?.util_pct).toLowerCase()}>{metric(row.metrics?.util_pct, '%')}</strong></div>)}
          {!topStorage.length && <div><span>No data</span><strong>—</strong></div>}
        </div>
      </article>

      <article>
        <header><h4>SAP Jobs</h4><Status value={jobOverall} /></header>
        <div className="rundeckLiveMetricPair is-jobs">
          <div><span>Active</span><strong>{jobSummary.active ?? '—'}</strong></div>
          <div><span>Failed</span><strong className={Number(jobSummary.failed || 0) > 0 ? 'is-critical' : ''}>{jobSummary.failed ?? '—'}</strong></div>
          <div><span>Long Running</span><strong className={Number(jobSummary.long_running || 0) > 0 ? 'is-attention' : ''}>{jobSummary.long_running ?? '—'}</strong></div>
          <div><span>Executions</span><strong>{jobSummary.executions ?? '—'}</strong></div>
        </div>
      </article>
    </div>
  </section>
}
