import React from 'react'
import { shortHost } from './sapUiFormat.js'
import './RundeckMonthlyReview.css'

const API = import.meta.env.BASE_URL + 'api'
const PAGE_SIZE = 25
const EMPTY_ASSESSMENT = { reviewer: '', summary: '', impact: '', analysis: '', actions: '' }

function monthOptions() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1))
    return {
      value: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) + (index === 0 ? ' · ongoing' : ''),
    }
  })
}

const MONTHS = monthOptions()
const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
const percent = value => fmt(value) === '—' ? '—' : fmt(value) + '%'
const when = value => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date) + ' WIB'
}
const identity = row => String(row.consumer_type || '') + ':' + String(row.consumer_key || '')
const hostNames = row => (Array.isArray(row?.hosts) ? row.hosts : []).map(host => shortHost(typeof host === 'string' ? host : host?.host)).filter(Boolean)

function readAssessment(month) {
  try {
    const saved = JSON.parse(window.localStorage.getItem('sphere.monthly-review.draft.v1:' + month) || 'null')
    return saved && typeof saved === 'object'
      ? Object.fromEntries(Object.keys(EMPTY_ASSESSMENT).map(field => [field, String(saved[field] || '')]))
      : { ...EMPTY_ASSESSMENT }
  } catch {
    return { ...EMPTY_ASSESSMENT }
  }
}

function DailyTrend({ rows = [], period }) {
  const [year, month] = period.split('-').map(Number)
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const byDay = new Map(rows.map(row => [Number(String(row.day).slice(8, 10)), row]))
  const barWidth = 8
  const step = 16
  const width = days * step + 30
  return <div className="sphereMonthlyTrend" role="img" aria-label="Daily observed APP host CPU average in percent; empty days have no retained complete observations">
    <svg viewBox={'0 0 ' + width + ' 144'} preserveAspectRatio="xMidYMid meet">
      {[25, 50, 75, 100].map(level => <g key={level}>
        <line x1="25" x2={width - 5} y1={119 - level} y2={119 - level} stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 4"/>
        <text x="2" y={122 - level} fontSize="9" fill="currentColor" opacity=".65">{level}</text>
      </g>)}
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1
        const point = byDay.get(day)
        const value = point?.avg_host_cpu_pct
        const height = value === null || value === undefined ? 0 : Math.max(1, Math.min(100, Number(value)))
        const x = 25 + index * step
        return <g key={day}>
          <title>{period + '-' + String(day).padStart(2, '0') + ': ' + (value === null || value === undefined ? 'No complete observation' : percent(value) + ' average host CPU · ' + point.complete_checks + ' complete checks')}</title>
          {height ? <rect x={x} y={119 - height} width={barWidth} height={height} rx="2" fill={height >= 80 ? '#e1a162' : '#32a6b7'}/>
            : <rect x={x} y="116" width={barWidth} height="3" rx="1" fill="#617a88" opacity=".4"/>}
          {(day === 1 || day % 5 === 0) && <text x={x + 3} y="135" fontSize="9" fill="currentColor" opacity=".7" textAnchor="middle">{day}</text>}
        </g>
      })}
    </svg>
    <small>Daily average host CPU · Complete observations only · Missing days are not zero</small>
  </div>
}

async function generateReportPdf({ month, data, selections, assessment }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = pdf.internal.pageSize.getWidth()
  let y = 20
  let page = 1
  const margin = 17
  const max = width - margin * 2
  const addPage = () => { pdf.addPage(); page += 1; y = 20 }
  const ensure = height => { if (y + height > 278) addPage() }
  const line = (label, size = 10, bold = false, color = [42, 58, 69]) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    const lines = pdf.splitTextToSize(String(label || '—'), max)
    ensure(lines.length * size * .43 + 4)
    pdf.text(lines, margin, y)
    y += lines.length * size * .43 + 4
  }
  const section = title => {
    ensure(18)
    y += 3
    pdf.setDrawColor(205, 218, 225)
    pdf.line(margin, y, width - margin, y)
    y += 8
    line(title, 12, true)
  }
  pdf.setFillColor(13, 34, 47)
  pdf.rect(0, 0, width, 42, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(19)
  pdf.text('SAP Performance & Job Impact Review', margin, 23)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text('SPHERE · Monthly Basis Assessment · ' + month, margin, 32)
  y = 53
  line('STATUS: DRAFT · Manual assessment · SPHERE historical evidence only', 10, true)
  line('Period: ' + month + ' (Asia/Jakarta) | Saved window [start, exclusive end): ' + when(data.start) + ' to ' + when(data.end), 9)
  line('Generated: ' + when(new Date().toISOString()) + ' | Basis reviewer: ' + (assessment.reviewer || 'Not provided'), 9)
  section('Executive indicators')
  line('Observed JOB/PROGRAM identities: ' + fmt(data.summary?.workloads, 0)
    + ' | Jobs: ' + fmt(data.summary?.jobs, 0) + ' | Programs: ' + fmt(data.summary?.programs, 0), 10)
  line('Review required: ' + fmt(data.summary?.review_required, 0)
    + ' | Critical WP association (temporal): ' + fmt(data.summary?.wp_signal_overlap, 0), 10)
  line('Complete checks: ' + fmt(data.quality?.complete_checks, 0)
    + ' | Incomplete checks: ' + fmt(data.quality?.partial_or_incomplete_checks, 0)
    + ' | Coverage: ' + percent(data.quality?.coverage_pct)
    + ' | Confidence: ' + (data.quality?.confidence || 'UNKNOWN'), 9)
  line('Sampling scope: ' + (data.sampling?.coverage_scope || 'UNKNOWN')
    + '. Workload observations are not SM37 execution counts.', 9)
  section('SAP host performance observations')
  const daily = data.daily_host_trend || []
  if (!daily.length) line('No daily host trend in the selected month.', 10)
  else {
    const sorted = [...daily].sort((a, b) => (b.peak_host_cpu_pct ?? -1) - (a.peak_host_cpu_pct ?? -1))
    line('Daily host samples: ' + daily.length + ' day(s); highest observed host CPU:', 10)
    sorted.slice(0, 5).forEach(row => line(row.day + ' | Peak ' + percent(row.peak_host_cpu_pct) + ' | Avg ' + percent(row.avg_host_cpu_pct)
      + ' | Critical WP host-checks ' + fmt(row.critical_wp_host_checks, 0), 9))
  }
  section('Selected Job & Program evidence')
  if (!selections.length) line('No workloads selected for the report.', 10)
  selections.forEach((row, index) => {
    ensure(30)
    line((index + 1) + '. ' + row.consumer_key + ' (' + row.consumer_type + ')', 10, true)
    line('APP: ' + (hostNames(row).join(', ') || 'Not observed') + ' | Avg CPU: ' + percent(row.avg_cpu_pct)
      + ' | Peak CPU: ' + percent(row.peak_cpu_pct) + ' | Avg PSS: ' + fmt(row.avg_pss_gb, 2) + ' GB', 9)
    line('Previous month avg CPU: ' + percent(row.previous?.avg_cpu_pct) + ' | Observed checks: ' + fmt(row.occurrences, 0) + ' | APP Critical WP overlap: '
      + fmt(row.critical_wp_host_checks ?? row.critical_wp_checks, 0)
      + ' | First: ' + when(row.first_seen) + ' | Last: ' + when(row.last_seen), 8)
  })
  section('Manual SAP Basis assessment')
  ;[['Summary', assessment.summary], ['Operational impact', assessment.impact], ['Technical analysis', assessment.analysis], ['Action plan', assessment.actions]]
    .forEach(([heading, value]) => { line(heading, 10, true); line(value || 'Not assessed', 10) })
  section('Evidence interpretation & limitations')
  line('SPHERE records saved collection observations. Job/Program frequency is a count of observed collection checks, not completed SM37 executions. CPU may exceed 100% for grouped processes. PSS is process workload memory, not host RAM.', 9)
  line('Critical WP overlap means the workload and APP signal were seen on the same host in the same collection. It is not proof that the workload caused slow SAP response. No transaction response-time KPI is inferred.', 9)
  line('Coverage below 100%, incomplete checks, and collector gaps are retained as missing evidence. The reviewer is responsible for conclusions and follow-up actions.', 9)
  for (let number = 1; number <= page; number += 1) {
    pdf.setPage(number)
    pdf.setDrawColor(220, 230, 234)
    pdf.line(margin, 285, width - margin, 285)
    pdf.setTextColor(103, 122, 134)
    pdf.setFontSize(8)
    pdf.text('SPHERE MONTHLY REVIEW  /  DRAFT  /  SOURCE: SPHERE', margin, 290)
    pdf.text('Page ' + number + '/' + page, width - margin, 290, { align: 'right' })
  }
  pdf.save('SPHERE-Monthly-Performance-' + month + '-DRAFT.pdf')
}

export default function RundeckMonthlyReview({ refreshToken = '', sourceHosts = [] }) {
  const [month, setMonth] = React.useState(MONTHS[1]?.value || MONTHS[0].value)
  const [tab, setTab] = React.useState('overview')
  const [kind, setKind] = React.useState('ALL')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState({})
  const [expanded, setExpanded] = React.useState(null)
  const [assessment, setAssessment] = React.useState(() => readAssessment(MONTHS[1]?.value || MONTHS[0].value))
  const [pdfBusy, setPdfBusy] = React.useState(false)
  const [pdfError, setPdfError] = React.useState('')
  const [savedLocal, setSavedLocal] = React.useState('')
  const searchInput = search.trim()
  const [appliedSearch, setAppliedSearch] = React.useState('')
  React.useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])
  React.useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      period: 'month', month, type: kind, limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE), q: appliedSearch, health: 'ALL',
    })
    setLoading(true)
    setError('')
    setData(null)
    fetch(API + '/evaluation/workloads?' + params.toString(), { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || 'Monthly evaluation unavailable (HTTP ' + response.status + ')')
        }
        return response.json()
      })
      .then(payload => {
        if (controller.signal.aborted) return
        if (payload.page?.scope !== 'FULL_EVALUATED_POPULATION' || payload.period !== 'month' || payload.month !== month) {
          throw new Error('Monthly full-population evidence contract unavailable')
        }
        setData(payload)
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message || 'Monthly history unavailable') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [month, kind, page, appliedSearch, refreshToken])

  const selectMonth = value => {
    setMonth(value)
    setPage(0)
    setSearch('')
    setAppliedSearch('')
    setKind('ALL')
    setSelected({})
    setExpanded(null)
    setAssessment(readAssessment(value))
    setSavedLocal('')
    setPdfError('')
  }
  const updateAssessment = (key, value) => setAssessment(previous => ({ ...previous, [key]: value }))
  const saveDraft = () => {
    try {
      window.localStorage.setItem('sphere.monthly-review.draft.v1:' + month, JSON.stringify(assessment))
      setSavedLocal('Saved in this browser only · not server-backed')
    } catch {
      setSavedLocal('Browser storage unavailable; draft remains in this open modal')
    }
  }
  const currentItems = data?.items || []
  const chosen = Object.values(selected)
  const addSelection = row => setSelected(previous => {
    const next = { ...previous }
    if (next[identity(row)]) delete next[identity(row)]
    else next[identity(row)] = row
    return next
  })
  const report = async () => {
    if (!data || loading) return
    setPdfBusy(true)
    setPdfError('')
    try {
      await generateReportPdf({ month, data, selections: chosen, assessment })
    } catch (failure) {
      setPdfError(failure.message || 'PDF export failed')
    } finally {
      setPdfBusy(false)
    }
  }
  const daily = data?.daily_host_trend || []
  const coverage = data?.quality || {}
  const summary = data?.summary || {}
  const total = Number(data?.page?.total || 0)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const impact = [...currentItems].sort((left, right) => (right.critical_wp_host_checks || 0) - (left.critical_wp_host_checks || 0))

  return <section className="sphereMonthlyReview" aria-label="Monthly SAP Performance and Job Impact Review">
    <div className="sphereMonthlyHead">
      <div><strong>Monthly SAP Performance & Job Impact Review</strong><small>SPHERE historical data only · Manual SAP Basis evaluation · Times in WIB</small></div>
      <div className="sphereMonthlyPicker">
        <label htmlFor="sphere-month-choice">Reporting month</label>
        <select id="sphere-month-choice" value={month} onChange={event => selectMonth(event.target.value)}>
          {MONTHS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereMonthlyTabs" role="tablist" aria-label="Monthly report sections">
      {[
        ['overview', 'Overview'], ['jobs', 'Jobs & Programs'], ['impact', 'Performance Impact'],
        ['assessment', 'Basis Assessment'], ['report', 'Report'],
      ].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id}
        className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {loading && <div className="sphereMonthlyState" role="status">Loading saved month evidence…</div>}
    {error && <div className="sphereMonthlyState is-error" role="alert">{error}. No substitute values or simulated evidence are shown.</div>}
    {data && !loading && <>
      <div className="sphereMonthlyProvenance">
        <span>Period [start, end): {when(data.start)} – {when(data.end)} (exclusive)</span>
        <span>Data confidence: <b>{coverage.confidence || 'UNKNOWN'}</b></span>
        <span>Coverage: <b>{percent(coverage.coverage_pct)}</b></span>
        <span>Complete checks: <b>{fmt(coverage.complete_checks, 0)}</b></span>
        <span>Incomplete: <b>{fmt(coverage.partial_or_incomplete_checks, 0)}</b></span>
      </div>
      {(coverage.confidence === 'LOW' || Number(coverage.partial_or_incomplete_checks || 0) > 0) && <div className="sphereMonthlyWarning" role="status">
        Historical evidence is limited or incomplete. Unobserved intervals are not counted as normal. Verify findings before reporting.
      </div>}
      {tab === 'overview' && <div className="sphereMonthlyLayout">
        <div className="sphereMonthlyStats">
          {[
            ['Observed workloads', fmt(summary.workloads, 0), 'Unique observed job/program identities'],
            ['Review required', fmt(summary.review_required, 0), 'Evaluation signal, not confirmed incident'],
            ['Programs / Jobs', fmt(summary.programs, 0) + ' / ' + fmt(summary.jobs, 0), 'Observed types'],
            ['WP overlap', fmt(summary.wp_signal_overlap, 0), 'Workloads co-observed with Critical WP'],
          ].map(([title, value, detail]) => <div className="sphereMonthlyStat" key={title}>
            <span>{title}</span><strong>{value}</strong><small>{detail}</small>
          </div>)}
        </div>
        <div className="sphereMonthlyPanel">
          <h4>Host CPU Trend <small>WIB calendar day</small></h4>
          {daily.length ? <DailyTrend rows={daily} period={month}/> : <p className="sphereMonthlyEmpty">No retained daily host samples in this period.</p>}
        </div>
        <div className="sphereMonthlyPanel">
          <h4>Reporting scope</h4>
          <div className="sphereMonthlyHosts">{sourceHosts.map(row => row?.host).filter(Boolean).map(host =>
            <span key={host} title={host}>{shortHost(host)}</span>)}</div>
          <p>Monthly evaluation uses persisted complete Rundeck collection checks. APP host chips show the monitored infrastructure scope, not monthly job execution totals.</p>
          <p>Job/process CPU may exceed 100% across cores. PSS is workload memory. SAP transaction response time and HANA SQL are not inferred unless retained as separate SPHERE evidence.</p>
        </div>
      </div>}
      {tab === 'jobs' && <div className="sphereMonthlyPanel">
        <div className="sphereMonthlyTableHead">
          <div><h4>Observed Jobs & Programs</h4><small>Full-population server evaluation · page {page + 1}/{pageCount} · {total} match(es)</small></div>
          <div className="sphereMonthlyFilters">
            <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Search job / program" aria-label="Search job and program"/>
            <select value={kind} onChange={event => { setKind(event.target.value); setPage(0) }} aria-label="Workload type">
              <option value="ALL">All types</option><option value="JOB">Jobs</option><option value="PROGRAM">Programs</option>
            </select>
          </div>
        </div>
        <div className="sphereMonthlyTableScroll"><table>
          <thead><tr><th>Job / Program</th><th>APP</th><th>Avg CPU</th><th>Peak CPU</th><th>Avg PSS</th><th>Prev Avg CPU</th><th>Observed checks</th><th>WP overlap</th><th>Report</th></tr></thead>
          <tbody>{currentItems.map(row => <React.Fragment key={identity(row)}>
            <tr>
              <td className="sphereMonthlyName">
                <button className="sphereMonthlyJobDetailToggle" type="button" aria-expanded={expanded === identity(row)}
                  onClick={() => setExpanded(previous => previous === identity(row) ? null : identity(row))}>{row.consumer_key}</button>
                <small>{row.consumer_type} · {row.assessment || row.status || 'Unclassified'}</small>
              </td>
              <td>{hostNames(row).join(', ') || '—'}</td><td>{percent(row.avg_cpu_pct)}</td><td>{percent(row.peak_cpu_pct)}</td>
              <td>{fmt(row.avg_pss_gb, 2)} GB</td><td>{percent(row.previous?.avg_cpu_pct)}</td><td>{fmt(row.occurrences, 0)}</td><td>{fmt(row.critical_wp_host_checks, 0)}</td>
              <td><button className={selected[identity(row)] ? 'is-selected' : ''} type="button" onClick={() => addSelection(row)} aria-pressed={Boolean(selected[identity(row)])}>{selected[identity(row)] ? 'Selected' : 'Select'}</button></td>
            </tr>
            {expanded === identity(row) && <tr className="sphereMonthlyEvidenceDetail"><td colSpan="9">
              <div><strong>Saved workload evidence</strong>
                <span>First observed: {when(row.first_seen)} · Last observed: {when(row.last_seen)}</span>
                <span>Host observations: {fmt(row.host_observations, 0)} · Average processes: {fmt(row.avg_process_count)} · Peak PSS: {fmt(row.peak_pss_gb, 2)} GB</span>
                <span>Reason: {row.assessment_reason || 'No reason provided by evaluation'}</span>
                <span>Critical WP overlap is temporal evidence only. SPHERE observations do not establish job execution status or direct root cause.</span>
              </div>
            </td></tr>}
          </React.Fragment>)}
          {!currentItems.length && <tr><td colSpan="9">No observed workloads match the selected month/filter.</td></tr>}
          </tbody>
        </table></div>
        <div className="sphereMonthlyPager"><small>Selected for report: {chosen.length} · Observations are not SM37 run counts</small>
          <button type="button" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Previous</button>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(n => n + 1)}>Next</button>
        </div>
      </div>}
      {tab === 'impact' && <div className="sphereMonthlyLayout">
        <div className="sphereMonthlyPanel">
          <h4>Host workload pressure <small>Daily APP CPU · not SAP response time</small></h4>
          {daily.length ? <DailyTrend rows={daily} period={month}/> : <p className="sphereMonthlyEmpty">No daily trend available.</p>}
        </div>
        <div className="sphereMonthlyPanel">
          <h4>Job-to-APP Critical WP overlap <small>Current page, sorted by host-check overlap</small></h4>
          <div className="sphereMonthlyTableScroll"><table><thead><tr><th>Job / Program</th><th>APP</th><th>WP host-checks</th><th>Observation</th></tr></thead>
            <tbody>{impact.map(row => <tr key={identity(row)}>
              <td className="sphereMonthlyName"><strong>{row.consumer_key}</strong></td><td>{hostNames(row).join(', ') || '—'}</td>
              <td>{fmt(row.critical_wp_host_checks, 0)}</td><td>{(row.critical_wp_host_checks || 0) > 0 ? 'Same-host temporal overlap' : 'No recorded overlap'}</td>
            </tr>)}
            {!impact.length && <tr><td colSpan="4">No evidence in this page.</td></tr>}
            </tbody></table></div>
          <p>Temporal co-observation does not establish root cause. Review server/resource evidence and write the conclusion in Basis Assessment.</p>
        </div>
      </div>}
      {tab === 'assessment' && <div className="sphereMonthlyAssessment">
        <div className="sphereMonthlyPanel">
          <h4>Manual SAP Basis Assessment</h4>
          {[
            ['reviewer', 'Reviewed by', 'SAP Basis engineer'],
            ['summary', 'Monthly summary', 'Overall job and program performance evaluation'],
            ['impact', 'Business / SAP performance impact', 'Which observed periods affected operational work, and what supports that conclusion?'],
            ['analysis', 'Technical findings', 'Workload, APP Critical WP overlap, resource pressure, limitations'],
            ['actions', 'Recommendation and follow-up', 'Actions, PIC, priority and target date'],
          ].map(([key, label, placeholder]) => <label key={key} className="sphereMonthlyField">
            <span>{label}</span>{key === 'reviewer'
              ? <input value={assessment[key]} onChange={event => updateAssessment(key, event.target.value)} placeholder={placeholder}/>
              : <textarea rows={key === 'analysis' ? 4 : 3} value={assessment[key]} onChange={event => updateAssessment(key, event.target.value)} placeholder={placeholder}/>}
          </label>)}
          <div className="sphereMonthlyActions"><button type="button" onClick={saveDraft}>Save local draft</button><small>{savedLocal || 'Notes remain in this modal until saved to this browser.'}</small></div>
        </div>
        <aside className="sphereMonthlyPanel">
          <h4>Included evidence ({chosen.length})</h4>
          {chosen.length ? chosen.map(row => <div key={identity(row)} className="sphereMonthlySelectedRow">
            <strong>{row.consumer_key}</strong><small>{row.consumer_type} · {hostNames(row).join(', ') || 'APP unverified'}</small>
            <button type="button" onClick={() => addSelection(row)}>Remove</button>
          </div>) : <p className="sphereMonthlyEmpty">Go to Jobs & Programs and select the evidence to include.</p>}
          <p>Draft notes are stored in this browser only. No server approval or shared archive is claimed.</p>
        </aside>
      </div>}
      {tab === 'report' && <div className="sphereMonthlyPanel sphereMonthlyReportPreview">
        <div className="sphereMonthlyTableHead">
          <div><h4>Report Preview</h4><small>Monthly Basis Review · {month} · DRAFT</small></div>
          <button type="button" className="is-primary" disabled={pdfBusy} onClick={report}>{pdfBusy ? 'Generating PDF…' : 'Export Draft PDF'}</button>
        </div>
        {pdfError && <p role="alert" className="sphereMonthlyWarning">{pdfError}</p>}
        <h3>SAP Performance & Job Impact Review</h3>
        <p><b>Period:</b> {month} WIB · <b>Reviewer:</b> {assessment.reviewer || 'Not supplied'} · <b>Status:</b> Draft</p>
        <p><b>Evidence:</b> {fmt(summary.workloads, 0)} observed workloads; {percent(coverage.coverage_pct)} coverage; {chosen.length} selected job/program entries.</p>
        <h4>Selected workload evidence</h4>
        {chosen.map(row => <p className="sphereMonthlyReportItem" key={identity(row)}><b>{row.consumer_key}</b> · {row.consumer_type} · Avg CPU {percent(row.avg_cpu_pct)} · Avg PSS {fmt(row.avg_pss_gb, 2)} GB · WP overlap {fmt(row.critical_wp_host_checks, 0)}</p>)}
        {!chosen.length && <p>No workload selected yet.</p>}
        {[['Monthly summary', 'summary'], ['Operational impact', 'impact'], ['Technical findings', 'analysis'], ['Recommendation / action plan', 'actions']].map(([label, key]) =>
          <div key={key}><h4>{label}</h4><p>{assessment[key] || 'Not assessed'}</p></div>)}
        <p className="sphereMonthlyReportDisclaimer">Source: SPHERE retained complete collections. Temporal correlations do not prove causation. Collection observations are not SM37 execution totals. Incomplete periods remain unobserved.</p>
      </div>}
    </>}
  </section>
}
