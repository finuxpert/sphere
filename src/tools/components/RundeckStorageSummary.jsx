import React from 'react'
import { shortHost, formatWib } from './sapUiFormat.js'
import { filesystemResourceState } from './rundeckStatusSemantics.js'
import { infrastructureTelemetryFreshness } from './infrastructureFreshness.js'
import RundeckFilesystemTrend from './RundeckFilesystemTrend.jsx'
import RundeckDiskIoTrend from './RundeckDiskIoTrend.jsx'
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
  const [selectedMount, setSelectedMount] = React.useState('/')
  const [growthRange, setGrowthRange] = React.useState('7d')
  const [storageView, setStorageView] = React.useState('growth')
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
  return <section className="sphereStorageSummary col-12 col-xl-4" aria-label="Storage Summary">
    <header className="sphereStorageSummaryHead">
      <h3>Storage Summary</h3>
      <button type="button" onClick={onOpenDetails} className="btn btn-sm sphereStorageDetails">View details</button>
    </header>
    <div className="sphereStorageRows">
      {values.map(item=><button type="button" key={item.mount}
        onClick={() => setSelectedMount(item.mount)}
        aria-pressed={selectedMount === item.mount}
        className={'sphereStorageRow' + (selectedMount === item.mount ? ' is-selected' : '')}
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
      </button>)}
    </div>
    <div className="sphereStorageAnalysis" aria-label="Storage activity details">
      <div role="tablist" aria-label="Storage history chart" className="sphereStorageChartTabs">
        <button id="sphereStorageGrowthTab" type="button" role="tab"
          aria-selected={storageView === 'growth'} aria-controls="sphereStorageChartPanel"
          onClick={() => setStorageView('growth')}>Filesystem Growth</button>
        <button id="sphereStorageIoTab" type="button" role="tab"
          aria-selected={storageView === 'io'} aria-controls="sphereStorageChartPanel"
          onClick={() => setStorageView('io')}>Disk I/O</button>
      </div>
      <div id="sphereStorageChartPanel" role="tabpanel"
        aria-labelledby={storageView === 'growth' ? 'sphereStorageGrowthTab' : 'sphereStorageIoTab'}
        className="sphereStorageChartPanel">
        {storageView === 'growth' ?
          <div className="sphereStorageGrowth">
            <div className="sphereStorageGrowthHead">
              <span className="sphereStorageChartContext">Filesystem Usage History</span>
              <div role="group" aria-label="Filesystem growth range" className="sphereStorageGrowthRanges">
                {[['7d','7D'],['30d','30D']].map(([value,label]) =>
                  <button key={value} type="button" aria-pressed={growthRange === value}
                    onClick={() => setGrowthRange(value)}>{label}</button>)}
              </div>
            </div>
            <RundeckFilesystemTrend mount={selectedMount} range={growthRange} refreshToken={refreshToken}
              focusedHost={values.find(item=>item.mount===selectedMount)?.highest?.host || ''} />
          </div> :
          <RundeckDiskIoTrend refreshToken={refreshToken} />}
      </div>
    </div>
    {snapshot.error && <small className="sphereStorageError" role="status">{snapshot.error}</small>}
    {snapshot.loading && <small className="sphereStorageError" role="status">Checking storage…</small>}
  </section>
}
