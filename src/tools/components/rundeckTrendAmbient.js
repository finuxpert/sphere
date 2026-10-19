// A single decorative 3-channel vortex, driven exclusively by existing ECharts samples.
// No SAP fetching, synthetic telemetry, threshold changes, or event interception.
export function retainedVortexSamples(series = [], limit = 36) {
  if (!Array.isArray(series)) return []
  const max = Math.max(2, Math.min(48, Math.floor(Number(limit) || 36)))
  return series.map((entry, seriesIndex) => {
    const observed = (Array.isArray(entry?.data) ? entry.data : []).filter(item => {
      const value = item?.value
      return !item?.gap && Array.isArray(value) && value.length >= 2 &&
        value[0] !== null && value[0] !== undefined &&
        value[1] !== null && value[1] !== undefined &&
        value[1] !== '' && Number.isFinite(Number(value[1]))
    })
    const size = Math.min(max, observed.length)
    const indices = size <= 1 ? (size ? [0] : []) :
      [...new Set(Array.from({ length:size }, (_, i) => Math.round(i*(observed.length-1)/(size-1))))]
    return {
      seriesIndex, name: String(entry?.name || ''),
      color: typeof entry?.lineStyle?.color === 'string' ? entry.lineStyle.color : '#8298a3',
      values: indices.map(i => observed[i].value),
    }
  }).filter(row => row.values.length > 1)
}

export function vortexDestination(vortex, progress) {
  const r = Math.min(1, Math.max(0, Number(progress) || 0))
  return { x: vortex.originX * (1-r) + vortex.destX * r, y: vortex.originY * (1-r) + vortex.destY * r }
}

export function attachUnifiedVortex({ canvas, grid, getChart, expandedRef } = {}) {
  if (!canvas || !grid || typeof getChart !== 'function' || typeof window === 'undefined') return undefined
  const ctx=canvas.getContext('2d')
  if (!ctx) return undefined
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const compact=window.matchMedia?.('(max-width:899px)')
  let disabled=Boolean(reduce?.matches||compact?.matches)
  let raf=0, stopped=false, intersecting=true, hovering=false
  let last=0, angle=.18, morph=0, width=1, height=1
  let groups=[]
  const onZoom=()=>{ collect();wake() }
  const registrations=[]
  const hex=(x,y,r,color,alpha)=>{
    if(r<.3)return
    ctx.beginPath()
    for(let k=0;k<6;k++){
      const a=-Math.PI/2+k*Math.PI/3
      const xx=x+Math.cos(a)*r, yy=y+Math.sin(a)*r
      if(k)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)
    }
    ctx.closePath();ctx.fillStyle=color
    ctx.globalAlpha=Math.max(0,Math.min(.65,alpha));ctx.fill()
  }
  const collect=()=>{
    groups=[]
    const nodes=[...grid.querySelectorAll('.rundeckTrendChart')]
    if(nodes.length!==3)return
    const origin=grid.getBoundingClientRect()
    nodes.forEach((node,metric)=>{
      const chart=getChart(node)
      if(!chart || chart.isDisposed?.()) return
      let option
      try{option=chart.getOption?.()}catch{return}
      const series=retainedVortexSamples(option?.series)
      if(!series.length)return
      const box=node.getBoundingClientRect()
      const left=box.left-origin.left, top=box.top-origin.top
      series.forEach((row,host)=>{
        const points=[]
        row.values.forEach((value,i)=>{
          let xy
          try{xy=chart.convertToPixel({seriesIndex:row.seriesIndex},value)}catch{return}
          if(!Array.isArray(xy)||!Number.isFinite(xy[0])||!Number.isFinite(xy[1]))return
          if(xy[0]<0||xy[1]<0||xy[0]>box.width||xy[1]>box.height)return
          const t=(i+.8)/Math.max(2,row.values.length)
          points.push({
            t,originX:0,originY:0,
            destX:left+xy[0],destY:top+xy[1],
          })
        })
        if(points.length>1)groups.push({metric,host,color:row.color,points})
      })
    })
    // If any channel is missing, retain original charts rather than fading them.
    grid.dataset.vortexReady = String([0,1,2].every(metric => groups.some(row => row.metric === metric)))
  }
  const fit=()=>{
    const rect=grid.getBoundingClientRect()
    width=Math.max(1,Math.round(rect.width))
    height=Math.max(1,Math.round(rect.height))
    const dpr=Math.min(window.devicePixelRatio||1,1.6)
    canvas.width=Math.max(1,Math.round(width*dpr))
    canvas.height=Math.max(1,Math.round(height*dpr))
    ctx.setTransform(dpr,0,0,dpr,0,0)
    collect()
    wake()
  }
  const makeOrigin=(t,metric,host)=>{
    const radius=9+Math.pow(t,1.3)*Math.min(width*.36,height*.53)
    const theta=angle + t*Math.PI*5.4 + metric*2.03 + host*Math.PI*2/5
    return {x:width*.5+Math.cos(theta)*radius*1.48,y:height*.54+Math.sin(theta)*radius*.61}
  }
  const paint=time=>{
    raf=0
    if(stopped||disabled||!intersecting||document.hidden||!grid.isConnected)return
    if(grid.dataset.vortexReady !== 'true') { ctx.clearRect(0,0,width,height); return }
    if(last && time-last<38){wake();return}
    const dt=last?Math.min((time-last)/1000,.085):.04
    last=time
    const target=Boolean(expandedRef?.current)?1:0
    morph+=(target-morph)*(1-Math.exp(-dt*6))
    if(Math.abs(target-morph)<.003)morph=target
    if(!target)angle+=dt*.32
    ctx.clearRect(0,0,width,height)
    const p=morph*morph*(3-2*morph)
    const ambientAlpha=(1-p)
    if(ambientAlpha>.015){
      // Nested hexagonal rings make one connected field across all three panels.
      const cx=width*.5,cy=height*.54
      for(let j=1;j<=10;j++){
        const radius=j/10*Math.min(width*.36,height*.54)
        ctx.beginPath()
        for(let k=0;k<6;k++){
          const theta=angle*.22+j*.12+k*Math.PI/3
          const x=cx+Math.cos(theta)*radius*1.48
          const y=cy+Math.sin(theta)*radius*.62
          if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y)
        }
        ctx.closePath()
        ctx.globalAlpha=ambientAlpha*(j%3===0?.20:.09)
        ctx.strokeStyle='#638d98';ctx.lineWidth=.85;ctx.stroke()
      }
      hex(cx,cy,6,'#81adb3',ambientAlpha*.28)
    }
    for(const row of groups){
      const placed=row.points.map(point=>{
        const origin=makeOrigin(point.t,row.metric,row.host)
        return vortexDestination({originX:origin.x,originY:origin.y,destX:point.destX,destY:point.destY},p)
      })
      if(placed.length<2)continue
      ctx.beginPath()
      for(let i=0;i<placed.length;i++){
        const pt=placed[i]
        if(i)ctx.lineTo(pt.x,pt.y);else ctx.moveTo(pt.x,pt.y)
      }
      ctx.strokeStyle=row.color
      ctx.globalAlpha=(.35*(1-p)+.10*p)
      ctx.lineWidth=1.1;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke()
      const stride=p>.95?4:1
      for(let i=0;i<placed.length;i+=stride){
        const pt=placed[i]
        hex(pt.x,pt.y,2.1*(1-p)+1.4*p,row.color,.64*(1-p)+.16*p)
      }
    }
    ctx.globalAlpha=1
    // Hold the finished expanded form until interaction, instead of perpetual motion.
    if(target===0||morph!==target)wake()
  }
  function wake(){
    if(!raf && !stopped && !disabled && intersecting && !document.hidden)raf=window.requestAnimationFrame(paint)
  }
  const onVisible=()=>{
    if(document.hidden){window.cancelAnimationFrame(raf);raf=0;return}
    collect();wake()
  }
  const onMedia=()=>{
    disabled=Boolean(reduce?.matches||compact?.matches)
    if(disabled){window.cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,width,height)}
    else{collect();wake()}
  }
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit)
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
    intersecting=entries.some(item=>item.isIntersecting)
    if(intersecting){collect();wake()}
    else{window.cancelAnimationFrame(raf);raf=0}
  },{threshold:0})
  const register=()=>{
    for(const node of grid.querySelectorAll('.rundeckTrendChart')){
      const chart=getChart(node)
      if(!chart)continue
      chart.on('datazoom',onZoom)
      registrations.push(chart)
    }
  }
  const initialize=()=>{
    if(stopped)return
    fit()
    register()
  }
  const initId=window.requestAnimationFrame(initialize)
  resize?.observe(grid)
  observer?.observe(grid)
  document.addEventListener('visibilitychange',onVisible)
  reduce?.addEventListener?.('change',onMedia)
  compact?.addEventListener?.('change',onMedia)
  return {
    wake,
    dispose:()=>{
      stopped=true
      window.cancelAnimationFrame(initId)
      window.cancelAnimationFrame(raf)
      resize?.disconnect();observer?.disconnect()
      registrations.forEach(chart=>chart.off('datazoom',onZoom))
      document.removeEventListener('visibilitychange',onVisible)
      reduce?.removeEventListener?.('change',onMedia)
      compact?.removeEventListener?.('change',onMedia)
      delete grid.dataset.vortexReady
      ctx.clearRect(0,0,width,height)
    }
  }
}
