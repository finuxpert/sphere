import React from 'react'
import { shortHost, formatWib } from './sapUiFormat.js'
import { filesystemResourceState } from './rundeckStatusSemantics.js'
import { infrastructureTelemetryFreshness } from './infrastructureFreshness.js'
import './RundeckStorageSummary.css'

const API = import.meta.env.BASE_URL + 'api/infra'
const MOUNTS = [
  { label: 'OS Root', mount: '/', root: true },
  { label: 'INTF', mount: '/INTF' },
  { label: 'INTF AOQ', mount: '/INTF_AOQ' },
  { label: 'SAP Archive', mount: '/SAP_ARCH' },
  { label: 'Archive INTF', mount: '/ArchiveINTF' },
]
const number = value => value == null || value === '' || !Number.isFinite(Number(value))
  ? null : Number(value)
const ageVerified = (host, items) =>
  infrastructureTelemetryFreshness(host?.snapshot_ts, host?.collection_id, items, Date.now()) === 'FRESH'
async function read(url, signal) {
  const response = await fetch(url, { cache:'no-store', signal })
  if (!response.ok) throw new Error('Storage source unavailable (' + response.status + ')')
  return response.json()
}
export default function RundeckStorageSummary({ refreshToken = '', onOpenDetails }) {
  const [snapshot, setSnapshot] = React.useState({ hosts: [], rows: [], error: '', loading: true })
  React.useEffect(() => {
    const controller = new AbortController()
    setSnapshot(previous => ({...previous, loading:true}))
    Promise.allSettled([read(API + '/hosts',controller.signal),
      read(API + '/filesystems?primary_only=false',controller.signal)]).then(([hostResult,fsResult])=>{
      if(controller.signal.aborted)return
      setSnapshot({
        hosts:hostResult.status === 'fulfilled' ? hostResult.value.items || [] : [],
        rows:fsResult.status === 'fulfilled' ? fsResult.value.items || [] : [],
        error:[hostResult,fsResult].some(item=>item.status==='rejected') ? 'Collection unavailable' : '',
        loading:false,
      })
    })
    return ()=>controller.abort()
  },[refreshToken])
  const hosts=snapshot.hosts.filter(host=>/^APP[1-5]$/i.test(shortHost(host.host)))
  const app1=hosts.find(host=>shortHost(host.host)==='APP1')
  // Only current host/collection pairs can be shown as a latest reading.
  const verifiedRows=host=>snapshot.rows.filter(row=>
    String(row.host||'').toUpperCase()===String(host?.host||'').toUpperCase() &&
    Boolean(host?.collection_id) && String(row.collection_id||'')===String(host.collection_id))
  const values=MOUNTS.map(item=>{
    const candidates=item.root ? hosts : app1 ? [app1] : []
    const readings=candidates.flatMap(host=>{
      const hostRows=verifiedRows(host)
      if(!ageVerified(host,hostRows))return []
      return hostRows.filter(row=>String(row.mount_point||'').toUpperCase()===item.mount.toUpperCase())
        .filter(row=>number(row.used_pct)!==null)
        .map(row=>({host:shortHost(host.host),mount:item.mount,value:number(row.used_pct),sample:row.collected_at}))
    })
    readings.sort((a,b)=>b.value-a.value)
    const highest=readings[0]||null
    return {...item, highest, status:highest ? filesystemResourceState(highest.value) : 'UNKNOWN'}
  })
  return <section className="sphereStorageSummary col-12 col-xl-7" aria-label="Storage Summary">
    <header className="sphereStorageSummaryHead">
      <h3>Storage Summary</h3>
      <button type="button" onClick={onOpenDetails} className="btn btn-sm sphereStorageDetails">View details</button>
    </header>
    <div className="sphereStorageRows">
      {values.map(item=><div key={item.mount} className="sphereStorageRow"
        title={item.highest
          ? item.highest.host+' · '+item.highest.mount+' · '+item.highest.value+'% · '+formatWib(item.highest.sample,true)+' WIB'
          : 'No fresh, matching filesystem collection'}>
        <div className="sphereStorageLabel"><strong>{item.label}</strong>
          <small>{item.highest ? item.highest.host+' · '+item.mount : 'Not Collected'}</small></div>
        <div className="sphereStorageTrack" role="meter" aria-label={item.label+' used capacity'}
          aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={item.highest?.value}
          aria-valuetext={item.highest ? item.highest.value+' percent used' : 'Not collected'}>
          {item.highest && <i className={'is-'+item.status.toLowerCase()} style={{width:Math.max(0,Math.min(100,item.highest.value))+'%'}}/>}
        </div>
        <strong className={'sphereStoragePercent is-'+item.status.toLowerCase()}>{item.highest ? item.highest.value.toFixed(1)+'%' : '—'}</strong>
      </div>)}
    </div>
    {snapshot.error && <small className="sphereStorageError" role="status">{snapshot.error}</small>}
    {snapshot.loading && <small className="sphereStorageError" role="status">Checking storage…</small>}
  </section>
}
