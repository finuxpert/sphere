// Decorative order only; the underlying saved evaluation row identity never moves.
// Spread category-sorted workloads across latitudes so the globe reads as a 3D
// population rather than stacked severity stripes.
export function globeVisualOrder(count) {
  const total = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0
  const angle = (Math.sqrt(5) - 1) / 2
  return Array.from({ length: total }, (_, index) => index)
    .sort((a, b) => (((a + .5) * angle) % 1) - (((b + .5) * angle) % 1) || a - b)
}

export function nearestEvaluationHex(points, x, y) {
  if (!Array.isArray(points) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  let nearest = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.hypot(point.x - x, point.y - y)
    if (distance <= Math.max(11, point.size + 5) && distance < bestDistance) {
      nearest = point.index
      bestDistance = distance
    }
  }
  return nearest
}
