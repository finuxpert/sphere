// A single decorative 3-channel Temporal Data Braid, driven only by existing ECharts samples.
// No SAP fetching, synthetic telemetry, threshold changes, or event interception.
// Preserve every explicit null, APP-specific missing bucket and collection gap.
export function retainedVortexSamples(series = [], limit = 36) {
  if (!Array.isArray(series)) return []
  const max = Math.max(2, Math.min(48, Math.floor(Number(limit) || 36)))
  return series.map((entry, seriesIndex) => {
    const raw = Array.isArray(entry?.data) ? entry.data : []
    const contiguous = []
    let segment = []
    const flush = () => { if (segment.length) contiguous.push(segment); segment = [] }
    raw.forEach((item, index) => {
      const value = Array.isArray(item) ? item : item?.value
      const valid = !item?.gap && Array.isArray(value) && value.length >= 2 &&
        value[0] !== null && value[0] !== undefined &&
        value[1] !== null && value[1] !== undefined && value[1] !== '' &&
        Number.isFinite(Number(value[1]))
      if (!valid) { flush(); return }
      segment.push({ value, t: raw.length <= 1 ? 0 : index / (raw.length - 1) })
    })
    flush()
    // A bounded, time-spread representation: keep the first and last segment
    // even when gaps are numerous. Never draw a connector across discarded gaps.
    const groupCount = Math.min(max, contiguous.length)
    const groupIndices = groupCount <= 1
      ? (groupCount ? [0] : [])
      : Array.from({ length: groupCount }, (_, i) =>
        Math.round(i * (contiguous.length - 1) / (groupCount - 1)))
    const shown = groupIndices.map(i => contiguous[i])
    const counts = shown.map(() => 1)
    let budget = max - shown.length
    // Allocate remaining samples by segment density, with a hard upper bound.
    while (budget > 0) {
      let chosen = -1
      let priority = -1
      shown.forEach((points, i) => {
        if (counts[i] >= points.length) return
        const score = points.length / counts[i]
        if (score > priority) { chosen = i; priority = score }
      })
      if (chosen < 0) break
      counts[chosen]++
      budget--
    }
    const segments = shown.map((points, i) => {
      const size = counts[i]
      if (size === 1) return [points[Math.floor((points.length - 1) / 2)]]
      const indices = Array.from({ length: size }, (_, index) =>
        Math.round(index * (points.length - 1) / (size - 1)))
      return indices.map(index => points[index])
    })
    return {
      seriesIndex, name: String(entry?.name || ''),
      color: typeof entry?.lineStyle?.color === 'string' ? entry.lineStyle.color : '#8298a3',
      segments, values: segments.flatMap(points => points.map(point => point.value)),
    }
  }).filter(row => row.values.length > 0)
}

// Normalize the two host identities exposed by SAP APP traces and history rows.
export function vortexAppLabel(host) {
  const raw = String(host || '').trim().toUpperCase()
  const full = /^AOPH([1-5])PAPPDC$/.exec(raw)
  if (full) return 'APP' + full[1]
  const short = /^APP([1-5])$/.exec(raw)
  return short ? 'APP' + short[1] : ''
}

// Bucket-scoped highest observation, never live SAP state. Focus is fail-closed:
// an APP-specific peak must have an explicitly matching host identity.
export function savedVortexPeak(trend, mode = 'max', focusedHost = '') {
  if (!Array.isArray(trend?.items)) return null
  const selected = vortexAppLabel(focusedHost)
  if (focusedHost && !selected) return null
  const key = mode === 'avg' ? 'avg_value' : 'max_value'
  let peak = null
  for (const item of trend.items) {
    const host = vortexAppLabel(item?.host || item?.source_host || item?.app)
    if (selected && host !== selected) continue
    const value = item?.[key]
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) continue
    if (!peak || Number(value) > peak.value) {
      peak = {
        value: Number(value), bucket: String(item.bucket || ''),
        unit: String(trend.unit || ''), host,
      }
    }
  }
  return peak
}

// Three interlaced time ribbons share one central field, with space for
// real CPU/RAM/Technical labels. No fabricated y-values: this is presentation.
export function unifiedVortexOrigin({ width, height, t, metric, host, phase = 0 }) {
  const progress = Math.min(1, Math.max(0, Number(t) || 0))
  const edge = Math.sin(progress * Math.PI)
  const lane = Number.isFinite(Number(host)) ? Number(host) - 2 : 0
  const theta = phase + progress * Math.PI * 3.6 + metric * Math.PI * 2 / 3 + lane * .095
  return {
    x: width * (.245 + .51 * progress) + Math.cos(theta) * width * .006 * edge,
    y: height * .64 + Math.sin(theta) * height * (.205 + .025 * edge) +
      lane * height * .009,
  }
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
  const compact=window.matchMedia?.('(max-width:1280px)')
  const coarse=window.matchMedia?.('(hover: none), (pointer: coarse)')
  let disabled=Boolean(reduce?.matches||compact?.matches||coarse?.matches)
  let raf=0, stopped=false, intersecting=true
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
    // A partial or replaced ECharts source must never leave the idle mask active.
    grid.dataset.vortexReady = 'false'
    const nodes=[...grid.querySelectorAll('.rundeckTrendChart')]
    if(nodes.length!==3)return
    const origin=grid.getBoundingClientRect()
    nodes.forEach((node,metric)=>{
      const chart=getChart(node)
      if(!chart || chart.isDisposed?.()) return
      let option
      try{option=chart.getOption?.()}catch{return}
      const series=retainedVortexSamples(option?.series, 26)
      if(!series.length)return
      const box=node.getBoundingClientRect()
      const left=box.left-origin.left, top=box.top-origin.top
      series.forEach(row => {
        row.segments.forEach(segment => {
          const points = []
          segment.forEach(({ value, t }) => {
            let xy
            try { xy = chart.convertToPixel({ seriesIndex: row.seriesIndex }, value) } catch { return }
            if (!Array.isArray(xy) || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return
            if (xy[0] < 0 || xy[1] < 0 || xy[0] > box.width || xy[1] > box.height) return
            points.push({ t, destX: left + xy[0], destY: top + xy[1] })
          })
          if (points.length) groups.push({ metric, host: row.seriesIndex, color: row.color, points })
        })
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
  const makeOrigin=(t,metric,host)=>
    unifiedVortexOrigin({ width, height, t, metric, host, phase: angle })
  const paint=time=>{
    raf=0
    if(stopped||disabled||!intersecting||document.hidden||!grid.isConnected)return
    if(grid.dataset.vortexReady !== 'true') { ctx.clearRect(0,0,width,height); return }
    if(last && time-last<39){wake();return}
    const dt=last?Math.min((time-last)/1000,.085):.04
    last=time
    const target=expandedRef?.current?1:0
    morph+=(target-morph)*(1-Math.exp(-dt*(target?7.2:3.6)))
    if(Math.abs(target-morph)<.003)morph=target
    if(!target)angle+=dt*.14
    ctx.clearRect(0,0,width,height)
    const p=morph*morph*morph*(morph*(morph*6-15)+10)
    const ambientAlpha=(1-p)
    if(ambientAlpha>.015){
      // Three quiet helical guides, rather than flattened concentric rings.
      // The guides trace presentation coordinates only, not extra measurements.
      const channelColors=['#78b6a4','#98aac9','#c2a57b']
      for(let metric=0;metric<3;metric++){
        ctx.beginPath()
        for(let k=0;k<72;k++){
          const at=unifiedVortexOrigin({ width, height, t:k/71, metric, host:2, phase:angle })
          if(k)ctx.lineTo(at.x,at.y);else ctx.moveTo(at.x,at.y)
        }
        ctx.globalAlpha=ambientAlpha*.12
        ctx.strokeStyle=channelColors[metric]
        ctx.lineWidth=.72
        ctx.stroke()
      }
    }
    for(const row of groups){
      const placed=row.points.map(point=>{
        const origin=makeOrigin(point.t,row.metric,row.host)
        return vortexDestination({originX:origin.x,originY:origin.y,destX:point.destX,destY:point.destY},p)
      })
      const channelInk=['#78b6a4','#98aac9','#c2a57b'][row.metric] || '#90aab7'
      if(placed.length>1){
        // Midpoint quadratic interpolation rounds corners without bridging gaps:
        // each row is one verified contiguous collection segment.
        ctx.beginPath()
        ctx.moveTo(placed[0].x,placed[0].y)
        for(let i=1;i<placed.length-1;i++){
          const point=placed[i],next=placed[i+1]
          ctx.quadraticCurveTo(point.x,point.y,(point.x+next.x)*.5,(point.y+next.y)*.5)
        }
        const tail=placed[placed.length-1]
        ctx.lineTo(tail.x,tail.y)
        ctx.strokeStyle=p>.95?row.color:channelInk
        ctx.globalAlpha=(.25*(1-p)+.055*p)
        ctx.lineWidth=.90;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke()
      }
      const stride=p>.95?4:3
      for(let i=0;i<placed.length;i+=stride){
        const pt=placed[i]
        hex(pt.x,pt.y,1.9*(1-p)+1.4*p,p>.95?row.color:channelInk,.26*(1-p)+.10*p)
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
    disabled=Boolean(reduce?.matches||compact?.matches||coarse?.matches)
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
  coarse?.addEventListener?.('change',onMedia)
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
      coarse?.removeEventListener?.('change',onMedia)
      delete grid.dataset.vortexReady
      ctx.clearRect(0,0,width,height)
    }
  }
}
