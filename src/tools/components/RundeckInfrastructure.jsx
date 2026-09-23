import React from 'react'
import './RundeckInfrastructure.css'
const API=`${import.meta.env.BASE_URL}api/infra`
const metric=(value,suffix='')=>value===null||value===undefined||value===''?'—':`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`
const statusFs=(value)=>Number(value)>=90?'CRITICAL':Number(value)>=80?'ATTENTION':'NORMAL'
export default function RundeckInfrastructure(){
  const [data,setData]=React.useState({hosts:[],fs:[],network:[],storage:[]})
  const [error,setError]=React.useState('')
  React.useEffect(()=>{let live=true; const load=async()=>{try{
    const paths=['hosts','filesystems','network','storage']
    const values=await Promise.all(paths.map(async p=>{const r=await fetch(`${API}/${p}`,{cache:'no-store'}); if(!r.ok) throw new Error(`Infrastructure API ${p} unavailable`); return r.json()}))
    if(live){setData({hosts:values[0].items||[],fs:values[1].items||[],network:values[2].items||[],storage:values[3].items||[]});setError('')}
  }catch(e){if(live)setError(e.message)}};load();const t=setInterval(load,60000);return()=>{live=false;clearInterval(t)}},[])
  const host=data.hosts[0]?.host||'AOQ'
  return <section className="rundeckInfra" aria-label="Infrastructure monitoring">
    <header><div><h3>Infrastructure</h3><p>Filesystem, network and storage I/O supporting evidence. Signals are not automatic root-cause conclusions.</p></div><span>{host}</span></header>
    {error&&<div className="rundeckInfraError">{error}</div>}
    <div className="rundeckInfraGrid">
      <article><h4>Filesystem</h4><table><thead><tr><th>Mount</th><th>Used</th><th>State</th></tr></thead><tbody>{data.fs.map(row=><tr key={row.mount_point}><td>{row.mount_point}</td><td>{metric(row.used_pct,'%')}</td><td><b className={`is-${statusFs(row.used_pct).toLowerCase()}`}>{statusFs(row.used_pct)}</b></td></tr>)}{!data.fs.length&&<tr><td colSpan="3">No filesystem sample.</td></tr>}</tbody></table></article>
      <article><h4>Network</h4><table><thead><tr><th>Interface</th><th>RX</th><th>TX</th><th>Drop Δ</th></tr></thead><tbody>{data.network.map(row=>{const m=row.metrics||{};return <tr key={row.sample_key}><td>{row.sample_key}</td><td>{metric(m.rx_mbps,' Mbps')}</td><td>{metric(m.tx_mbps,' Mbps')}</td><td>{metric(Number(m.rx_dropped_delta||0)+Number(m.tx_dropped_delta||0))}</td></tr>})}{!data.network.length&&<tr><td colSpan="4">No network sample.</td></tr>}</tbody></table></article>
      <article><h4>Storage I/O</h4><table><thead><tr><th>Mount</th><th>Util</th><th>Write IOPS</th><th>Write</th></tr></thead><tbody>{data.storage.map(row=>{const m=row.metrics||{};return <tr key={row.sample_key}><td>{m.mount||row.sample_key}</td><td>{metric(m.util_pct,'%')}</td><td>{metric(m.write_iops)}</td><td>{metric(m.write_mbps,' MB/s')}</td></tr>})}{!data.storage.length&&<tr><td colSpan="4">No storage sample.</td></tr>}</tbody></table></article>
    </div>
  </section>
}
