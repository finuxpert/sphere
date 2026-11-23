/* SPHERE Reports presentation. No API fetches, DB writes or deployment side effects.
 * Keep source-scoped fields, saved-period checks and export rendering equivalent.
 */
import React from 'react'
import { customDayCount, monthlyReportPeriod, reportPeakEvidenceWib } from './rundeckMonthlyPeriod.js'
import { monthlyRankMetricValue, monthlyTrendIntervalLabel, monthlyReviewBasis } from './rundeckMonthlyPresentation.js'
import { fmt, pct, wpCoreEq, id, hostLabel, hostsFor, when, monthlySize, MONTHLY_STORAGE_ROWS, MONTHLY_STORAGE_REASON, monthlyStorageNote, savedPeriodPeak } from './rundeckMonthlyEvidence.js'
import { monthlyEnterpriseReportModel } from './rundeckMonthlyEnterprisePdf.js'

const CHART_COLORS = ['#3dd6dc', '#839af4', '#af90e7', '#e7a364', '#7ac59c']
const loadTimeHostTrend=()=>import('./RundeckMonthlyTimeHostTrend.jsx')
const TimeHostTrend=React.lazy(loadTimeHostTrend)

function HostTrend({ rows = [], month, weekStart = null, customStart = null, customEnd = null, metric, mode = 'peak', host = 'ALL', threshold = null, fitObserved = true }) {
  const field = (mode === 'avg' ? 'avg_' : 'peak_') + metric + '_pct'
  const [year, monthNum] = month.split('-').map(Number)
  const windowStart=customStart||weekStart
  const days = customStart?customDayCount(customStart,customEnd):weekStart?7:new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const dateAt = day => windowStart
    ? new Date(Date.parse(windowStart+'T00:00:00Z')+(day-1)*86400000).toISOString().slice(0,10)
    : month+'-'+String(day).padStart(2,'0')
  const dayIndex = date => windowStart
    ? Math.round((Date.parse(String(date).slice(0,10)+'T00:00:00Z')-Date.parse(windowStart+'T00:00:00Z'))/86400000)+1
    : Number(String(date).slice(-2))
  const names = [...new Set(rows.map(row => hostLabel(row.host)))].sort().filter(name => host === 'ALL' || name === host)
  const observedDays = rows
    .filter(row => (host === 'ALL' || hostLabel(row.host) === host) &&
      row[field] !== null && row[field] !== undefined && Number.isFinite(Number(row[field])))
    .map(row => dayIndex(row.day))
    .filter(day => Number.isInteger(day) && day >= 1 && day <= days)
  const firstObservedDay = observedDays.length ? Math.min(...observedDays) : 1
  // Display-only focus. Days before the first retained sample remain unavailable,
  // never zero; Full month shows the complete calendar domain on demand.
  const startDay = fitObserved ? firstObservedDay : 1
  const width = 620; const left = 36; const plotW = 566; const top = 12; const plotH = 124
  const xFor = day => left + (day - startDay) * plotW / Math.max(1, days - startDay)
  const yFor = val => top + plotH * (1 - Math.max(0, Math.min(100, Number(val))) / 100)
  const showThreshold = threshold != null && Number.isFinite(Number(threshold))
  return <div className="sphereMonthlyTrend" role="group" aria-label={metric.toUpperCase() + ' daily APP ' + mode + ' trend'}>
    <svg viewBox={'0 0 ' + width + ' 164'} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={'Saved daily ' + mode + ' host ' + metric + ' percent; missing days are not zero'}>
      {[0,25,50,75,100].map(level => <g key={level}>
        <line x1={left} x2={left + plotW} y1={yFor(level)} y2={yFor(level)} stroke="currentColor" strokeOpacity=".11" strokeDasharray="3 4"/>
        <text x="5" y={yFor(level)+3} fontSize="9" fill="currentColor" opacity=".6">{level}%</text>
      </g>)}
      {[...new Set((customStart?[1,Math.max(1,Math.round(days/2)),days]:weekStart?[1,2,3,4,5,6,7]:[startDay,5,10,15,20,25,days]).filter(day=>day>=startDay && day<=days))].map(day => <text key={day} x={xFor(day)} y="155" fontSize="10.5" fontWeight="600" fill="currentColor" opacity=".92" textAnchor="middle">{new Intl.DateTimeFormat('en-GB',{
        day:'2-digit',month:'short',timeZone:'UTC',
      }).format(new Date(dateAt(day)+'T00:00:00Z'))}</text>)}
      {showThreshold && <g>
        <line x1={left} x2={left + plotW} y1={yFor(threshold)} y2={yFor(threshold)} stroke="#e2b56a" strokeWidth="1.5" strokeDasharray="6 4"/>
        <rect x={left + plotW - 115} y={yFor(threshold) - 15} width="114" height="13" rx="2" fill="#253642"/>
        <text x={left + plotW - 4} y={yFor(threshold) - 5} fontSize="10" fill="#ffd39a" textAnchor="end">Warning {pct(threshold)}</text>
      </g>}
      {names.map((name,i) => {
        const points = rows.filter(row => hostLabel(row.host) === name && row[field] !== null && row[field] !== undefined)
          .map(row => ({day:dayIndex(row.day),value:row[field],
            warningChecks:Number(row[metric+'_warning_checks']||0), peakAt:row['peak_'+metric+'_at']||null})).sort((a,b)=>a.day-b.day)
        return <g key={name}>
          {points.map((point,k) => <g key={point.day}>
            {k>0 && point.day===points[k-1].day+1 && <path
              d={(() => {
                const x0=xFor(points[k-1].day), y0=yFor(points[k-1].value)
                const x1=xFor(point.day), y1=yFor(point.value), dx=(x1-x0)*.42
                return 'M '+x0+' '+y0+' C '+(x0+dx)+' '+y0+' '+(x1-dx)+' '+y1+' '+x1+' '+y1
              })()}
              fill="none" stroke={CHART_COLORS[i%CHART_COLORS.length]}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {mode==='peak' && point.warningChecks>0 && <circle cx={xFor(point.day)} cy={yFor(point.value)}
              r="5.5" fill="none" stroke="#e6ad67" strokeWidth="1.3" aria-hidden="true"/>}
            <circle cx={xFor(point.day)} cy={yFor(point.value)} r="2.9" fill={CHART_COLORS[i%CHART_COLORS.length]}>
              <title>{name} · {dateAt(point.day)} · {pct(point.value)} {mode} {metric.toUpperCase()} · {fmt(point.warningChecks,0)} warning host-checks{mode==='peak' && point.peakAt ? ' · Peak time '+when(point.peakAt) : ''}</title>
            </circle>
          </g>)}
        </g>
      })}
    </svg>
    <div className="sphereMonthlyTrendLegend">
      {names.map((name,i)=><span key={name}><i style={{background:CHART_COLORS[i%CHART_COLORS.length]}}/>{name}</span>)}
    </div>
    <small>Daily APP peaks; gold rings mark warnings. Missing dates are not zero.</small>
    {firstObservedDay>1 && <small className="sphereMonthlyObservedNote">
      Data starts {dateAt(firstObservedDay)}.
      {fitObserved ? ' Earlier dates are outside this display, not missing-value zeros.' : ' Earlier dates have no retained observations.'}
    </small>}
  </div>
}

function MonthlyRanking({ title, rows=[], metric, loading=false, error='' }) {
  const values=rows.map(row=>monthlyRankMetricValue(row,metric))
  const top=Math.max(0,...values.filter(v=>v!==null && Number.isFinite(v)))
  return <section className="sphereMonthlyManagerPanel" aria-label={title}>
    <h4>{title}</h4>
    <div className="sphereMonthlyManagerBars">
      {rows.slice(0,5).map((row,index)=>{
        const val=values[index]
        const usable=val!==null&&Number.isFinite(val)
        return <div className="sphereMonthlyManagerBar" key={id(row)}>
          <span className="sphereMonthlyManagerJob" title={row.consumer_key}>{row.consumer_key}</span>
          <div className="sphereMonthlyManagerTrack"><i style={{width:usable&&top>0?(val/top*100)+'%':'0%'}}/></div>
          <b>{usable?fmt(val,2)+(metric==='cpu'?' cores':' GB'):'—'}</b>
        </div>
      })}
      {!rows.length&&<span className="sphereMonthlyManagerMissing">{loading?'Loading saved evaluation…':error?'Evaluation unavailable':'No workloads recorded'}</span>}
    </div>
  </section>
}
export default function MonthlyManagementDashboard({month,weekStart=null,customStart=null,customEnd=null,full,preview,storage,storageError='',loading=false,evaluationError=''}) {
  const data=full||preview
  const pressure=data?.monthly_pressure||{}
  const reportWindow=monthlyReportPeriod(month,{weekStart,customStart,customEnd})
  const model=full && Array.isArray(full.monthly_top_wp_cpu) &&
    Array.isArray(full.monthly_top_wp_pss) && storage?.month===month &&
    (weekStart ? storage?.week_start===weekStart : !storage?.week_start) &&
    (weekStart ? full.week_start===weekStart : !full.week_start) &&
    (customStart ? storage?.start_date===customStart && storage?.end_date===customEnd &&
      full.start_date===customStart && full.end_date===customEnd :
      !storage?.start_date && !full?.start_date)
    ? monthlyEnterpriseReportModel(month,{...full,monthly_storage:storage}) : null
  const hosts=Array.from({length:5},(_,i)=>{
    const name='APP'+(i+1)
    return (pressure.hosts||[]).find(row=>hostLabel(row.host)===name)||{host:name}
  })
  // Host preview is independently verified and must not wait for workload SQL or storage mapping.
  const peak=metric=>{
    const p=savedPeriodPeak(pressure,metric,month,weekStart,customStart,customEnd)
    return p
      ? <><strong>Peak {pct(p.value)} · {p.host}</strong><small>{reportPeakEvidenceWib(p.at)}</small></>
      : <strong>Not Collected</strong>
  }
  const cpuRanking=model?.sortedCpu||full?.monthly_top_wp_cpu||[]
  const memoryRanking=model?.sortedPss||full?.monthly_top_wp_pss||[]
  const candidates=model?.candidates||full?.monthly_abap_candidates?.slice(0,5)||[]
  return <div className="sphereMonthlyManagement" aria-label={customStart?"SAP Custom Performance Report":weekStart?"SAP Weekly Performance Report":"SAP Monthly Performance Report"}>
    <div className="sphereMonthlyManagerPair">
      {['cpu','ram'].map(metric=><section className="sphereMonthlyManagerPanel" key={metric}>
        <div className="sphereMonthlyManagerHeading">
          <div className="sphereMonthlyHeadingCopy">
            <h4>{metric==='cpu'?'APP CPU Utilization':'APP Memory Utilization'}</h4>
            <small className="sphereMonthlyChartSubtitle">{Array.isArray(pressure.trend_hosts) && Number(pressure.trend_bucket_minutes)>0
              ?monthlyTrendIntervalLabel(pressure.trend_bucket_minutes):'Daily peak per APP · WIB'}</small>
          </div>
          <div className="sphereMonthlyManagerPeak">{peak(metric)}</div>
        </div>
        {Array.isArray(pressure.trend_hosts) && Number(pressure.trend_bucket_minutes)>0
          ? <React.Suspense fallback={null}>
              <TimeHostTrend rows={pressure.trend_hosts} bucketMinutes={pressure.trend_bucket_minutes}
                month={month} weekStart={weekStart} customStart={customStart} customEnd={customEnd} metric={metric}
                threshold={pressure.thresholds?.[metric+'_warning_pct']}/>
            </React.Suspense>
          : <HostTrend rows={pressure.daily_hosts||[]} month={month} weekStart={weekStart} customStart={customStart} customEnd={customEnd} metric={metric}
              fitObserved={false} threshold={pressure.thresholds?.[metric+'_warning_pct']}/>}
      </section>)}
    </div>
    <div className="sphereMonthlyManagerPair">
      <MonthlyRanking title="Top 5 Workloads — Peak WP CPU" metric="cpu" rows={cpuRanking} loading={loading} error={evaluationError}/>
      <MonthlyRanking title="Top 5 Workloads — Peak PSS" metric="ram" rows={memoryRanking} loading={loading} error={evaluationError}/>
    </div>
    <div className="sphereMonthlyManagerPair is-tables">
      <section className="sphereMonthlyManagerPanel">
        <h4>Application Server Utilization</h4>
        <table className="sphereMonthlyManagerTable"><thead><tr><th>APP</th><th title="APP host CPU average (%)">CPU Avg</th><th title="APP host peak CPU utilization (%)">CPU Peak</th><th title="APP host RAM average (%)">RAM Avg</th><th title="APP host peak RAM utilization (%)">RAM Peak</th>
              <th title={'Number of APP host checks at or above '+pct(pressure.thresholds?.cpu_warning_pct)+' CPU warning threshold'}>CPU Warning Checks</th>
              <th title={'Number of APP host checks at or above '+pct(pressure.thresholds?.ram_warning_pct)+' RAM warning threshold'}>RAM Warning Checks</th></tr></thead>
          <tbody>{hosts.map(row=><tr key={row.host}>
            <td>{hostLabel(row.host)}</td><td>{pct(row.avg_cpu_pct)}</td><td>{pct(row.peak_cpu_pct)}</td>
            <td>{pct(row.avg_ram_pct)}</td><td>{pct(row.peak_ram_pct)}</td>
            <td>{fmt(row.cpu_warning_host_checks,0)}</td><td>{fmt(row.ram_warning_host_checks,0)}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <section className="sphereMonthlyManagerPanel">
        <h4>Top 5 Workloads for Review</h4>
        <table className="sphereMonthlyManagerTable"><thead><tr><th>No</th><th>Program / Job</th><th>APP</th><th title="Saved workload observations, not SM37 job executions">Observations</th><th title="Peak WP CPU in logical CPU core-equivalents">WP CPU</th><th title="Peak Proportional Set Size memory in gigabytes">PSS GB</th><th>Last Seen (WIB)</th><th title="Signal-based review suggestion; validate with SAP diagnostics">Suggested Review</th></tr></thead>
          <tbody>{candidates.map((row,index)=><tr key={id(row)}>
            <td>{index+1}</td><td className="is-job"><span className="sphereMonthlyJobName" title={row.consumer_key}>{row.consumer_key}</span></td>
            <td>{hostsFor(row)||'—'}</td><td>{fmt(row.observations,0)}</td>
            <td>{wpCoreEq(row.peak_cpu_pct)}</td><td>{fmt(row.peak_pss_gb,2)}</td>
            <td>{when(row.last_seen)}</td>
            <td title={'Source-backed review basis: '+monthlyReviewBasis(row)+'; verify before tuning'}>
                {row.signals?.high_memory?'Review memory use':row.signals?.sustained_high_cpu||row.signals?.cpu_spike?'Review processing':row.signals?.baseline_anomaly?'Check workload change':'Review in SAP'}
                <small className="sphereMonthlyReviewBasis">{monthlyReviewBasis(row)}</small>
              </td>
          </tr>)}
          {!full&&<tr><td colSpan="8">{loading?'Loading saved evaluation…':evaluationError?'Evaluation unavailable. Retry to load tuning candidates.':'Waiting for evaluated workloads…'}</td></tr>}
          {full&&!candidates.length&&<tr><td colSpan="8">No candidates observed for this period</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
    <section className="sphereMonthlyManagerPanel is-storage">
      <div className="sphereMonthlyManagerHeading"><h4>{'Filesystem Capacity'+(()=>{
        const known=[...new Set((storage?.items||[]).map(row=>hostLabel(row.host))
          .filter(label=>/^APP[1-5]$/.test(label)))]
        return known.length===1?' · '+known[0]:''
      })()}</h4>
        <small className="sphereMonthlyStorageNote" role="status">{monthlyStorageNote(storage, !storage && !storageError, storageError)}</small>
      </div>
      <table className="sphereMonthlyManagerTable"><thead><tr><th>Filesystem</th><th>Mounted On / Host</th><th>Total</th><th>Used</th><th title="Source-reported df available blocks only">Available (df)</th><th>Used (%)</th><th>Last Sample (WIB)</th></tr></thead><tbody>
        {MONTHLY_STORAGE_ROWS.map(name=>{
          const row=storage?.month===month &&
            (weekStart?storage?.week_start===weekStart:!storage?.week_start) &&
            (customStart?storage?.start_date===customStart&&storage?.end_date===customEnd:!storage?.start_date)
            ?storage.items?.find(r=>r.category===name):null
          const snapshot=Date.parse(row?.sample_at||'')
          const present=row?.status==='COLLECTED' && Number.isFinite(snapshot) &&
            snapshot>=Date.parse(reportWindow.startUtc) &&
            snapshot<Date.parse(reportWindow.exclusiveEndUtc)
          return <tr key={name} title={present ? 'Saved Infrastructure sample · '+when(row.sample_at) : MONTHLY_STORAGE_REASON[row?.reason]||'Historical sample unavailable'}><td>{name}</td>
            <td>{present?row.mount_point+' · '+hostLabel(row.host):'Not Collected'}</td>
            <td>{present?monthlySize(row.total_bytes):'—'}</td><td>{present?monthlySize(row.used_bytes):'—'}</td>
            <td>{present&&row.availability_source==='EXPLICIT'&&Number.isFinite(Number(row.free_bytes))
              &&row.free_bytes!==null?monthlySize(row.free_bytes):'—'}</td><td>{present?pct(row.used_pct):'—'}</td>
            <td>{present?when(row.sample_at):'—'}</td></tr>
        })}
      </tbody></table>
    </section>
  </div>
}
