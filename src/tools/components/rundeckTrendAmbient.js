// Presentation-only animation. Never creates or modifies SAP telemetry samples.
export function retainedAmbientPoints(series = [], maxPerSeries = 5) {
  if (!Array.isArray(series)) return []
  const limit = Math.max(1, Math.min(8, Math.floor(Number(maxPerSeries) || 5)))
  return series.flatMap((entry, seriesIndex) => {
    const observed = (Array.isArray(entry?.data) ? entry.data : []).filter(item => {
      const value = item?.value
      const measured = value?.[1]
      return !item?.gap && Array.isArray(value) && value.length >= 2 &&
        measured !== null && measured !== undefined && measured !== '' &&
        Number.isFinite(Number(measured)) && value[0] !== null && value[0] !== undefined
    })
    if (!observed.length) return []
    const count = Math.min(limit, observed.length)
    const indices = [...new Set(Array.from({ length: count }, (_, index) =>
      count === 1 ? 0 : Math.round(index * (observed.length - 1) / (count - 1))))]
    return indices.map(index => ({ seriesIndex, value: observed[index].value }))
  })
}

export function attachTrendAmbient({ canvas, chartNode, chart, series = [], focusedHost = '', disabled = false } = {}) {
  if (!canvas || !chartNode || !chart || disabled || typeof window === 'undefined') return undefined
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const compact = window.matchMedia?.('(max-width:899px)')
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const anchors = retainedAmbientPoints(series, 5)
  if (!anchors.length) return undefined

  const token = name => window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const color = token('--sphere-text-secondary') || '#93a5af'
  const accent = token('--sphere-accent') || '#668f99'
  const focused = Boolean(focusedHost)
  let width = 0
  let height = 0
  let hovered = false
  let visible = true
  let stopped = false
  let phase = 0
  let progress = 0
  let lastPaint = 0
  let raf = 0
  let reduced = Boolean(media?.matches || compact?.matches)

  const drawHex = (x, y, radius, ink, alpha) => {
    ctx.beginPath()
    for (let corner = 0; corner < 6; corner++) {
      const angle = -Math.PI / 2 + corner * Math.PI / 3
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (corner) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = ink
    ctx.globalAlpha = Math.max(0, Math.min(.26, alpha))
    ctx.fill()
  }
  const wake = () => {
    if (!raf && !stopped && !reduced && visible && !document.hidden) {
      raf = window.requestAnimationFrame(paint)
    }
  }
  const measure = () => {
    const box = chartNode.getBoundingClientRect()
    width = Math.max(1, Math.round(box.width))
    height = Math.max(1, Math.round(box.height))
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.max(1, Math.round(width * pixelRatio))
    canvas.height = Math.max(1, Math.round(height * pixelRatio))
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    lastPaint = 0
    wake()
  }
  function paint(time) {
    raf = 0
    if (stopped || reduced || !visible || document.hidden || !chartNode.isConnected) return
    const target = hovered ? 1 : 0
    // Idle redraws <= 12 FPS; hover fades once and then freezes.
    if (!hovered && lastPaint && time - lastPaint < 84) { wake(); return }
    const elapsed = lastPaint ? Math.min((time - lastPaint) / 1000, .12) : .084
    lastPaint = time
    progress += (target - progress) * (1 - Math.exp(-elapsed * 8))
    if (Math.abs(progress - target) < .015) progress = target
    if (!hovered) phase += elapsed * .32
    ctx.clearRect(0, 0, width, height)

    // Low-contrast, background-feeling hexagon orbit; charts stay readable at idle.
    const cx = width * .53
    const cy = height * .51
    const radius = Math.min(width * .19, height * .30, 36)
    for (let i = 0; i < 21; i++) {
      const theta = (i / 21) * Math.PI * 2 + phase
      const depth = .5 + .5 * Math.sin(theta)
      const ring = i % 3 === 0 ? .6 : 1
      drawHex(cx + Math.cos(theta) * radius * ring,
        cy + Math.sin(theta) * radius * .48 * ring,
        1.9 + 1.2 * depth, i % 4 ? color : accent,
        (.055 + .085 * depth) * (1 - progress))
    }

    // During examination, subdued hexes sit on actual retained chart samples.
    // ECharts supplies the coordinates, so axis zoom and missing buckets agree.
    if (progress > .02) {
      for (const point of anchors) {
        const xy = chart.convertToPixel({ seriesIndex: point.seriesIndex }, point.value)
        if (!Array.isArray(xy) || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) continue
        if (xy[0] < 60 || xy[0] > width - 70 || xy[1] < 26 || xy[1] > height - 30) continue
        drawHex(xy[0], xy[1], focused ? 2.8 : 2.2, accent, (focused ? .22 : .13) * progress)
      }
    }
    ctx.globalAlpha = 1
    if (!hovered || progress !== 1) wake()
  }
  const enter = event => {
    if (event.pointerType === 'touch') return
    hovered = true
    lastPaint = 0
    wake()
  }
  const leave = () => { hovered = false; lastPaint = 0; wake() }
  const focusIn = () => { hovered = true; lastPaint = 0; wake() }
  const focusOut = () => { hovered = false; lastPaint = 0; wake() }
  const visibility = () => {
    if (document.hidden) { window.cancelAnimationFrame(raf); raf = 0 }
    else wake()
  }
  const mediaChanged = () => {
    reduced = Boolean(media?.matches || compact?.matches)
    if (reduced) { window.cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, width, height) }
    else wake()
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
  const intersection = typeof IntersectionObserver === 'undefined' ? null :
    new IntersectionObserver(entries => {
      visible = entries.some(item => item.isIntersecting)
      if (visible) wake()
      else { window.cancelAnimationFrame(raf); raf = 0 }
    }, { threshold: 0 })
  chartNode.addEventListener('pointerenter', enter)
  chartNode.addEventListener('pointerleave', leave)
  chartNode.addEventListener('focusin', focusIn)
  chartNode.addEventListener('focusout', focusOut)
  chart.on('datazoom', wake)
  document.addEventListener('visibilitychange', visibility)
  media?.addEventListener?.('change', mediaChanged)
  compact?.addEventListener?.('change', mediaChanged)
  observer?.observe(chartNode)
  intersection?.observe(chartNode)
  measure()
  return () => {
    stopped = true
    window.cancelAnimationFrame(raf)
    observer?.disconnect()
    intersection?.disconnect()
    chartNode.removeEventListener('pointerenter', enter)
    chartNode.removeEventListener('pointerleave', leave)
    chartNode.removeEventListener('focusin', focusIn)
    chartNode.removeEventListener('focusout', focusOut)
    chart.off('datazoom', wake)
    document.removeEventListener('visibilitychange', visibility)
    media?.removeEventListener?.('change', mediaChanged)
    compact?.removeEventListener?.('change', mediaChanged)
    ctx.clearRect(0, 0, width, height)
  }
}
