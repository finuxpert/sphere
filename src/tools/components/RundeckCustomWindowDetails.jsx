import React from 'react'
import { createPortal } from 'react-dom'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import { customRangeCaption } from './rundeckCustomRange.js'

const metric = (value, unit = '') => value == null || value === ''
  ? '—' : numberText(value, 1) + unit

export default function RundeckCustomWindowDetails({ data, selectedWindow, onClose, onSelectJob }) {
  const dialogRef = React.useRef(null)
  React.useEffect(() => {
    const oldFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => dialogRef.current?.querySelector('[data-window-close]')?.focus({preventScroll:true}), 0)
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const nodes = [...dialogRef.current.querySelectorAll('button:not([disabled]),[href],input:not([disabled])')]
      if (!nodes.length) return
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', keydown)
      document.body.style.overflow = overflow
      oldFocus?.focus?.({preventScroll:true})
    }
  }, [onClose])
  const hosts = data?.host_samples || []
  const workloads = data?.workloads || []
  const alerts = data?.alerts || []
  const limited = data?.limited || {}
  const anyMore = Object.values(limited).some(Boolean) || hosts.length > 40 || workloads.length > 40 || alerts.length > 20
  return createPortal(<div className="rundeckTrendPointModalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="rundeckTrendPointModal rundeckCustomWindowModal" role="dialog" aria-modal="true" aria-label="Custom time range observations">
      <header className="rundeckTrendPointModalHeader">
        <div><span>SPHERE · SAVED OBSERVATIONS</span><h4>{customRangeCaption(selectedWindow)}</h4>
          <small>Raw samples inside selected WIB interval · not SAP job completion</small></div>
        <button type="button" data-window-close onClick={onClose} aria-label="Close custom range details">×</button>
      </header>
      <div className="rundeckTrendPointModalBody rundeckCustomWindowBody">
        <p>{hosts.length}{limited.host_samples ? '+' : ''} APP samples · {workloads.length}{limited.workloads ? '+' : ''} workload observations · {alerts.length}{limited.alerts ? '+' : ''} alerts</p>
        <h4>APP observations</h4>
        {hosts.length ? <table><thead><tr><th>Observed WIB</th><th>APP</th><th>CPU</th><th>RAM</th><th>IO Wait</th><th>Load</th><th>Crit WP</th></tr></thead><tbody>
          {hosts.slice(0,40).map((row,index) => <tr key={row.collection_id + ':' + row.host + ':' + index}>
            <td>{formatWib(row.collected_at,true)}</td><td>{shortHost(row.host)}</td>
            <td>{metric(row.cpu_pct,'%')}</td><td>{metric(row.ram_pct,'%')}</td>
            <td>{metric(row.io_wait_pct,'%')}</td><td>{metric(row.load_1)}</td><td>{row.wp_critical ?? '—'}</td>
          </tr>)}
        </tbody></table> : <p>No stored APP samples within this range. Missing readings are not evidence of downtime.</p>}
        <h4>Job / Program observations</h4>
        {workloads.length ? <table><thead><tr><th>Observed WIB</th><th>APP</th><th>Job / Program</th><th>CPU total</th><th>PSS</th></tr></thead><tbody>
          {workloads.slice(0,40).map((row,index) => <tr key={row.collection_id + ':' + row.consumer_key + ':' + index}>
            <td>{formatWib(row.collected_at,true)}</td><td>{shortHost(row.host)}</td>
            <td><button type="button" title={row.consumer_key} onClick={() => {
              onClose()
              onSelectJob?.({ key:row.consumer_key, host:row.host, consumerType:row.consumer_type, source:'custom-window', at:row.collected_at })
            }}>{row.consumer_key}</button></td><td>{metric(row.cpu_pct,'%')}</td>
            <td>{metric(row.details?.total_pss_gb ?? row.details?.pss_gb,' GB')}</td>
          </tr>)}
        </tbody></table> : <p>No saved job/program observation in this interval.</p>}
        <h4>Saved alerts</h4>
        {alerts.length ? <ul>{alerts.slice(0,20).map((row,index) => <li key={row.collection_id + ':' + row.code + ':' + index}>
          {formatWib(row.collected_at,true)} WIB · {shortHost(row.host) || 'System'} · {row.code} · {row.message}
        </li>)}</ul> : <p>No saved alert in this interval; this is not confirmation of healthy operation.</p>}
        {anyMore && <p>Only the first 40 APP/workload rows and first 20 alerts are shown. A + count means the backend result is capped.</p>}
        <p>Source: retained observations only. Multi-core grouped CPU can exceed 100%. Temporal overlap does not establish causation; SM37 remains authoritative for job execution status.</p>
      </div>
    </section>
  </div>, document.body)
}
