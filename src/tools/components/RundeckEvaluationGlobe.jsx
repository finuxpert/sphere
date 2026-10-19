import React from 'react'
import { workloadHealthLevel } from './rundeckWorkloadHealthState.js'
import { globeVisualOrder, nearestEvaluationHex } from './rundeckEvaluationGlobeLayout.js'

const COLORS = {
  review: '#d66973', attention: '#d5ad55', unknown: '#828f9b', normal: '#65ba7f',
}
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// This canvas only animates the source-verified button population underneath it.
// Counts, category, actions and accessibility remain owned by RundeckWorkloadHealth.
export default function RundeckEvaluationGlobe({ rows, layout, expanded, onSelectIndex }) {
  const canvasRef = React.useRef(null)
  const wakeRef = React.useRef(null)
  const hitPositionsRef = React.useRef([])
  const expandedRef = React.useRef(expanded)
  expandedRef.current = expanded
  const levels = React.useMemo(() => rows.map(row => workloadHealthLevel(row)), [rows])
  const { columns, size, gap, fits } = layout

  React.useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    const ctx = canvas?.getContext('2d', { alpha: true })
    if (!ctx || !stage || !levels.length || !fits) return undefined
    let raf = 0
    let last = 0
    let phase = .25
    let morph = 0
    let width = 0
    let height = 0
    let visible = true
    const points = globeVisualOrder(levels.length).map((index, position) => {
      const y = 1 - 2 * (position + .5) / levels.length
      const radius = Math.sqrt(Math.max(0, 1 - y * y))
      const azimuth = position * GOLDEN_ANGLE
      return { x: Math.cos(azimuth) * radius, y, z: Math.sin(azimuth) * radius, color: COLORS[levels[index]] || COLORS.unknown, index }
    })
    const measure = () => {
      const rect = stage.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      wakeRef.current?.()
    }
    const drawHex = (x, y, radius, color, opacity) => {
      ctx.beginPath()
      for (let side = 0; side < 6; side++) {
        const theta = -Math.PI / 2 + Math.PI * side / 3
        const px = x + Math.cos(theta) * radius
        const py = y + Math.sin(theta) * radius
        if (side) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.closePath()
      ctx.globalAlpha = opacity
      ctx.fillStyle = color
      ctx.fill()
    }
    const paint = time => {
      raf = 0
      if (document.hidden || !visible || !stage.isConnected) return
      const dt = last ? Math.min((time - last) / 1000, .07) : .016
      // Cap redraws at approximately 30 FPS for large verified populations.
      if (last && time - last < 32) { raf = requestAnimationFrame(paint); return }
      last = time
      const target = expandedRef.current ? 1 : 0
      morph += (target - morph) * (1 - Math.exp(-dt * 5.5))
      if (Math.abs(morph - target) < .002) morph = target
      if (!expandedRef.current) phase += dt * .19
      const blend = morph * morph * (3 - 2 * morph)
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width * .28, height * .485, 112)
      const columnCount = Math.max(1, columns)
      const rowCount = Math.ceil(points.length / columnCount)
      const pitch = size + gap
      const gridWidth = columnCount * size + (columnCount - 1) * gap
      const gridHeight = rowCount * size + (rowCount - 1) * gap
      const left = Math.max(0, (width - gridWidth) / 2)
      const top = Math.max(0, (height - gridHeight) / 2)
      ctx.clearRect(0, 0, width, height)
      const plotted = points.map(point => {
        const ca = Math.cos(phase)
        const sa = Math.sin(phase)
        const x = point.x * ca + point.z * sa
        const depth = -point.x * sa + point.z * ca
        const projection = 1 + depth * .13
        const orbX = cx + x * radius * projection
        const orbY = cy - point.y * radius * projection
        const row = Math.floor(point.index / columnCount)
        const col = point.index % columnCount
        const gridX = left + col * pitch + size / 2 + (row % 2 ? pitch / 2 : 0)
        const gridY = top + row * pitch + size / 2
        return {
          x: orbX * (1 - blend) + gridX * blend,
          y: orbY * (1 - blend) + gridY * blend,
          depth,
          size: (size * (.60 + .24 * (depth + 1) / 2)) * (1 - blend) + size * .59 * blend,
          color: point.color,
          alpha: (.32 + .68 * (depth + 1) / 2) * (1 - blend) + blend,
          index: point.index,
        }
      })
      hitPositionsRef.current = plotted
      plotted.sort((a, b) => a.depth - b.depth)
      for (const point of plotted) drawHex(point.x, point.y, point.size, point.color, point.alpha)
      ctx.globalAlpha = 1
      if (morph !== 1 || !expandedRef.current) raf = requestAnimationFrame(paint)
    }
    const wake = () => {
      if (!raf && !document.hidden && visible) {
        last = 0
        raf = requestAnimationFrame(paint)
      }
    }
    wakeRef.current = wake
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(stage)
    const viewportObserver = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting)
        if (visible) wake()
        else { cancelAnimationFrame(raf); raf = 0 }
      }, { threshold: 0 })
    viewportObserver?.observe(stage)
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else wake()
    }
    document.addEventListener('visibilitychange', onVisibility)
    measure()
    wake()
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      viewportObserver?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (wakeRef.current === wake) wakeRef.current = null
      hitPositionsRef.current = []
    }
  }, [levels, size, gap, columns, fits])

  React.useEffect(() => { wakeRef.current?.() }, [expanded])
  const selectFromIdleTouch = event => {
    if (event.pointerType !== 'touch' || expandedRef.current) return
    const box = event.currentTarget.getBoundingClientRect()
    const index = nearestEvaluationHex(hitPositionsRef.current, event.clientX - box.left, event.clientY - box.top)
    if (index !== null) {
      event.stopPropagation()
      onSelectIndex?.(index)
    }
  }
  return <canvas ref={canvasRef} className="rundeckEvaluationGlobeCanvas"
    aria-hidden="true" onPointerDown={selectFromIdleTouch} />
}
