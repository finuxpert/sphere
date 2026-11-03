import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { toWibInputValue, validateCustomWib, verifiedTopConsumers } from './rundeckTopConsumerWindow.js'
import './RundeckTopConsumersDual.css'

const ENDPOINT = import.meta.env.BASE_URL + 'api/evaluation/top-consumers'
const PRESETS = ['30m', '1h', '6h', '24h']
const MAX_REQUEST_MS = 30_000

const formatAmount = (value, metric) => metric === 'cpu'
  ? Number(value).toFixed(2) + ' cores'
  : Number(value).toFixed(2) + ' GB'

function ConsumerList({ metric, rows = [], loading = false, error = '' }) {
  const peak = rows.length ? Math.max(...rows.map(row => row.value)) : 0
  const label = metric === 'cpu' ? 'Top 10 CPU · Avg Cores' : 'Top 10 Memory · Avg PSS'
  return <div className={'sphereEvaluationDualPanel is-' + metric} aria-label={label}>
    <div className="sphereEvaluationDualPanelTitle" title={metric === 'cpu'
      ? 'Average observed CPU core equivalents per workload, not host utilization'
      : 'Average observed proportional set size (PSS) per workload, not installed RAM'}>
      <strong>{label}</strong>
    </div>
    {loading || error || !rows.length ? <div className="sphereEvaluationTop5Unavailable" role="status">
      {loading ? 'Checking saved samples…' : error || 'No recorded consumers in this window'}
    </div> :
      <div className="sphereEvaluationTop5Bars">
        {rows.map(row => <div key={row.consumer_type + ':' + row.consumer_key}
          className="sphereEvaluationTop5Row"
          title={row.consumer_type + ' ' + row.consumer_key + ' · ' +
            formatAmount(row.value, metric) + ' · ' + row.observations +
            ' observed rows across ' + row.collection_checks + ' collections · Last ' +
            (row.last_seen ? formatWib(row.last_seen, true) + ' WIB' : 'unknown') +
            ' · bar is relative to highest measured consumer, not total host usage'}>
          <span className="sphereEvaluationTop5Name">{row.consumer_key}</span>
          <span className="sphereEvaluationTop5Track" aria-hidden="true">
            <i style={{ width: peak > 0 ? Math.max(0, Math.min(100, row.value / peak * 100)) + '%' : '0%' }} />
          </span>
          <span className="sphereEvaluationTop5Value">{formatAmount(row.value, metric)}</span>
        </div>)}
      </div>}
  </div>
}

export default function RundeckTopConsumersDual({ refreshToken = '' }) {
  const [selection, setSelection] = React.useState({ range: '24h' })
  const [customOpen, setCustomOpen] = React.useState(false)
  const [fromWib, setFromWib] = React.useState('')
  const [toWib, setToWib] = React.useState('')
  const [customError, setCustomError] = React.useState('')
  const [retry, setRetry] = React.useState(0)
  const [state, setState] = React.useState({ key: '', data: null, loading: true, error: '' })

  const requestKey = selection.range === 'custom'
    ? 'custom:' + selection.from_at + ':' + selection.to_at
    : selection.range
  React.useEffect(() => {
    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, MAX_REQUEST_MS)
    const params = new URLSearchParams({ range: selection.range })
    if (selection.range === 'custom') {
      params.set('from_at', selection.from_at)
      params.set('to_at', selection.to_at)
    }
    setState({ key: requestKey, data: null, loading: true, error: '' })
    fetch(ENDPOINT + '?' + params.toString(), { cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Collection ranking unavailable (' + response.status + ')')
        return response.json()
      })
      .then(payload => {
        const data = verifiedTopConsumers(payload, selection.range)
        if (!data) throw new Error('Collection ranking response is inconsistent')
        if (!controller.signal.aborted) setState({ key: requestKey, data, loading: false, error: '' })
      })
      .catch(error => {
        if (!controller.signal.aborted || timedOut) setState({
          key: requestKey, data: null, loading: false,
          error: timedOut ? 'Ranking request timed out' : error.message,
        })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [requestKey, refreshToken, retry, selection.range, selection.from_at, selection.to_at])

  const stateMatches = state.key === requestKey
  const loading = !stateMatches || state.loading
  const error = stateMatches ? state.error : ''
  const data = stateMatches ? state.data : null
  const switchRange = value => {
    setCustomOpen(false)
    setCustomError('')
    setSelection({ range: value })
  }
  const openCustom = () => {
    if (!customOpen) {
      if (selection.range !== 'custom') {
        const end = data?.end ? Date.parse(data.end) : Date.now()
        const safeEnd = Number.isFinite(end) ? Math.min(end, Date.now()) : Date.now()
        setFromWib(toWibInputValue(safeEnd - 60 * 60_000))
        setToWib(toWibInputValue(safeEnd))
      }
      setCustomError('')
    }
    setCustomOpen(value => !value)
  }
  const applyCustom = event => {
    event.preventDefault()
    const window = validateCustomWib(fromWib, toWib)
    if (!window.ok) { setCustomError(window.error); return }
    setCustomError('')
    setCustomOpen(false)
    setSelection({ range: 'custom', from_at: window.from_at, to_at: window.to_at })
  }

  const count = data?.complete_checks ?? null
  const windowLabel = data
    ? (selection.range === 'custom' ? 'Custom' : selection.range.toUpperCase()) +
      ' · ' + count + ' collection' + (count === 1 ? '' : 's')
    : selection.range === 'custom' ? 'Custom WIB' : selection.range.toUpperCase()

  return <section className={'sphereEvaluationTop5 sphereEvaluationDual' + (customOpen ? ' is-editing-window' : '')}
    aria-label="Top 10 CPU and Memory consumers from matching saved collection windows">
    <div className="sphereEvaluationTop5Head sphereEvaluationDualHead">
      <strong>Top Consumers <small title="CPU and Memory share one sampled window; Review KPIs and donut signals remain saved 24h">
        · {windowLabel}</small></strong>
      <div className="sphereConsumerRange" role="group" aria-label="Top CPU and Memory collection window">
        {PRESETS.map(value => <button key={value} type="button" aria-pressed={selection.range === value}
          onClick={() => switchRange(value)}>{value.toUpperCase()}</button>)}
        <button type="button" aria-pressed={selection.range === 'custom'}
          aria-expanded={customOpen} onClick={openCustom}>Custom</button>
      </div>
    </div>
    {data?.coverage_scope === 'TOP_CONSUMERS_ONLY' && <small className="sphereConsumerScopeWarning"
      title="Historic data contains only persisted top consumers, not all observed active jobs/programs">
      Historic top-only collection</small>}
    <div className="sphereEvaluationDualGrid">
      <ConsumerList metric="cpu" rows={data?.cpu || []} loading={loading} error={error} />
      <ConsumerList metric="memory" rows={data?.memory || []} loading={loading} error={error} />
    </div>
    {error && <button type="button" className="sphereConsumerRetry" onClick={() => setRetry(value => value + 1)}>
      Retry ranking</button>}
    {customOpen && <form className="sphereResourceRangePopover" role="dialog"
      aria-label="Custom consumer collection window in WIB" onSubmit={applyCustom}
      onKeyDown={event => { if (event.key === 'Escape') setCustomOpen(false) }}>
      <strong>Custom range · WIB</strong>
      <label>From <input type="datetime-local" required value={fromWib}
        onChange={event => setFromWib(event.target.value)} /></label>
      <label>To <input type="datetime-local" required value={toWib}
        onChange={event => setToWib(event.target.value)} /></label>
      {customError && <small role="alert">{customError}</small>}
      <div className="sphereResourceRangeActions">
        <button type="button" onClick={() => setCustomOpen(false)}>Cancel</button>
        <button type="submit">Apply</button>
      </div>
    </form>}
  </section>
}
