import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import './RundeckSystemData.css'

const formatTime=(value)=>{
  if(!value)return '—'
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return String(value)
  return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)
}
const formatBytes=(value)=>{
  const bytes=Number(value)
  if(!Number.isFinite(bytes)||bytes<0)return '—'
  if(bytes<1024)return `${bytes} B`
  const units=['KB','MB','GB','TB'];let size=bytes/1024;let index=0
  while(size>=1024&&index<units.length-1){size/=1024;index+=1}
  return `${size.toLocaleString('en-US',{maximumFractionDigits:size>=10?1:2})} ${units[index]}`
}
const metric=(value,suffix='')=>value===null||value===undefined||value===''?'—':`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`

function State({value='UNKNOWN'}){
  const normalized=String(value||'UNKNOWN').toUpperCase()
  const name={DUE_SOON:'DUE ≤7D',DUE_3D:'DUE ≤3D',DUE_1D:'DUE ≤1D'}[normalized]||normalized
  return <span className={`rundeckSystemDataState is-${normalized.toLowerCase()}`}>{name}</span>
}

export default function RundeckSystemData({history=[],platform=null,platformState='UNKNOWN',serviceSummary='',releaseState='NORMAL'}){
  const [tab,setTab]=React.useState('collections')
  const [showAll,setShowAll]=React.useState(false)
  const [selected,setSelected]=React.useState(null)
  const rows=showAll?history:history.slice(0,8)
  const tokenStatus=platform?.token_management
  const tokenRows=tokenStatus?.items?.length?tokenStatus.items:[{kind:'reader',label:'Monitoring Reader',state:'UNKNOWN'},{kind:'runner',label:'Job Runner',state:'UNKNOWN'}]
  return <section className="rundeckSystemData" aria-label="System Data">
    <div className="rundeckSystemDataTabs" role="tablist" aria-label="System data view">
      <button type="button" role="tab" aria-selected={tab==='collections'} className={tab==='collections'?'is-active':''} onClick={()=>setTab('collections')}><SphereIcon name="history"/> Collection History <small>{history.length}</small></button>
      <button type="button" role="tab" aria-selected={tab==='services'} className={tab==='services'?'is-active':''} onClick={()=>setTab('services')}><SphereIcon name="database"/> SPHERE Services <small>{serviceSummary||platformState}</small></button>
      <button type="button" role="tab" aria-selected={tab==='tokens'} className={tab==='tokens'?'is-active':''} onClick={()=>setTab('tokens')}><SphereIcon name="database"/> Token Management <small>Reader / Runner</small></button>
    </div>

    {tab==='collections'&&<div className="rundeckSystemDataPane">
      <header><div><strong>Collection History</strong><small>Committed Performance collection runs</small></div><State value={history[0]?.status||'UNKNOWN'}/></header>
      <div className="rundeckSystemDataTableWrap"><table>
        <thead><tr><th>Run</th><th>Time WIB</th><th>APP</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((row)=><tr key={row.collection_id||row.execution_id} role="button" tabIndex={0} className={selected?.collection_id===row.collection_id?'is-selected':''}
            onClick={()=>setSelected(current=>current?.collection_id===row.collection_id?null:row)}
            onKeyDown={(event)=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();setSelected(current=>current?.collection_id===row.collection_id?null:row)}}>
            <td><strong>#{row.execution_id}</strong></td><td>{formatTime(row.collection_time_wib||row.finished_at)}</td><td>{row.received_host_count??row.received_hosts?.length??'—'}</td><td><State value={row.status||'UNKNOWN'}/></td>
          </tr>)}
          {!history.length&&<tr><td colSpan="4">No collection history yet.</td></tr>}
        </tbody>
      </table></div>
      {history.length>8&&<button type="button" className="rundeckSystemDataMore" onClick={()=>setShowAll(value=>!value)}>{showAll?'Show latest 8':`View all ${history.length} runs`}</button>}
      {selected&&<div className="rundeckSystemDataDetail"><strong>Run #{selected.execution_id||'—'}</strong><span>{formatTime(selected.collection_time_wib||selected.finished_at)} WIB</span><span>APP {selected.received_host_count??selected.received_hosts?.length??'—'}{selected.expected_host_count?`/${selected.expected_host_count}`:''}</span><State value={selected.status||'UNKNOWN'}/></div>}
    </div>}

    {tab==='services'&&<div className="rundeckSystemDataPane">
      <header><div><strong>SPHERE Services</strong><small>{serviceSummary||'Collector, storage, database and maintenance services'}</small></div><State value={platformState}/></header>
      <div className="rundeckSystemDataTableWrap"><table>
        <thead><tr><th>Component</th><th>State</th><th>Detail</th></tr></thead>
        <tbody>
          <tr><td>Rundeck</td><td><State value={platform?.collector?.status||'UNKNOWN'}/></td><td>{platform?.collector?`${platform.collector.poller_status} · ${platform.collector.credential_mode} · ${formatTime(platform.collector.checked_at)}`:'—'}</td></tr>
          <tr><td>Filesystem</td><td><State value={platform?.filesystem?.status||'UNKNOWN'}/></td><td>{metric(platform?.filesystem?.used_pct,'% used')}</td></tr>
          <tr><td>Inode</td><td><State value={platform?.inode?.status||'UNKNOWN'}/></td><td>{metric(platform?.inode?.used_pct,'% used')}</td></tr>
          <tr><td>Raw Logs</td><td><State value={platform?.filesystem?.status||'UNKNOWN'}/></td><td>{platform?.archive?`${platform.archive.files} files · ${formatBytes(platform.archive.bytes)}`:'—'}</td></tr>
          <tr><td>PostgreSQL</td><td><State value={platform?.database?.status==='ok'?'NORMAL':String(platform?.database?.status||'UNKNOWN').toUpperCase()}/></td><td>{platform?.database?`${formatBytes(platform.database.database_bytes)} · ${platform.database.connections??'—'} connections`:'—'}</td></tr>
          <tr><td>Retention</td><td><State value={platform?.maintenance?.status||'UNKNOWN'}/></td><td>{platform?.maintenance?.last_run?`${formatTime(platform.maintenance.last_run)} · ${platform.maintenance.retention_days} days`:'No maintenance result yet'}</td></tr>
          <tr><td>Backup</td><td><State value={platform?.backup?.status||'NOT_CONFIGURED'}/></td><td>{platform?.backup?.last_success?`Last success ${formatTime(platform.backup.last_success)}`:'Backup not configured'}</td></tr>
          <tr><td>Releases</td><td><State value={releaseState}/></td><td>{platform?.releases?`${platform.releases.backend.count} backend · ${platform.releases.web.count} web`:'—'}</td></tr>
        </tbody>
      </table></div>
    </div>}

    {tab==='tokens'&&<div className="rundeckSystemDataPane rundeckTokenManagement" aria-label="Rundeck credential expiry">
      <header><div><strong>Token Management</strong><small>Rundeck credential expiry · DEV only · WIB</small></div><State value={tokenStatus?.read_only ? "REPORTED" : "UNKNOWN"}/></header>
      <p className="rundeckTokenNotice">Last reported expiry information — not a live token validity check. Reader and Runner are separate credentials.</p>
      <div className="rundeckTokenGrid">
        {tokenRows.map((item)=><article className="rundeckTokenCard" key={item.kind}>
          <div className="rundeckTokenCardHead"><div><small>{item.kind==='reader'?'MONITORING / READ ONLY':'JOB OPERATIONS / RUNNER'}</small><strong>{item.label}</strong></div><State value={item.state||'UNKNOWN'}/></div>
          <dl>
            <div><dt>Expires (WIB)</dt><dd>{formatTime(item.expires_at)}{item.expires_at?' WIB':''}</dd></div>
            <div><dt>Time remaining</dt><dd>{Number.isInteger(item.days_remaining)?(item.days_remaining<=0?'Expiry reported as passed':`${item.days_remaining} day(s)`):'Unverified'}</dd></div>
            <div><dt>Identity</dt><dd>{item.identity||'Not verified'}</dd></div>
            <div><dt>Last report</dt><dd>{item.last_reported_at||'Not registered'}</dd></div>
          </dl>
          <button type="button" className="rundeckTokenRenew" disabled title="Locked until maintainer authentication, Runner ACL and safe server-side rotation are verified">Renew Now · Locked</button>
        </article>)}
      </div>
      <p className="rundeckTokenFootnote">Expiry warnings appear within 7, 3 and 1 days and after the reported expiry. Renew Now requires an authenticated maintainer gateway, GET-only verification, approval, atomic rollback and systemd consumer checks. No token is accepted on this monitoring page yet.</p>
    </div>}
  </section>
}
