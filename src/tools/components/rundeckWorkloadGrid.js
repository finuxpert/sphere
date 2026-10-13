/** Fit every saved evaluation hexagon to real panel geometry; never silently clip. */
export function workloadDotLayout({ count = 0, width = 0, height = 0, minSize = 6, maxSize = 10 } = {}) {
  const population = Number(count), w = Number(width), h = Number(height)
  if (!Number.isSafeInteger(population) || population < 0 ||
      !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return { size: 10, gap: 2, fits: population === 0, capacity: 0 }
  for (let size = maxSize; size >= minSize; size--) {
    const gap = size >= 9 ? 2 : 1
    const columns = Math.floor((w + gap) / (size + gap))
    const rows = columns > 0 ? Math.ceil(population / columns) : Infinity
    const capacity = columns * Math.floor((h + gap) / (size + gap))
    if (capacity >= population && (rows === 0 || rows * (size + gap) - gap <= h))
      return { size, gap, fits: true, capacity }
  }
  return { size: minSize, gap: 1, fits: false, capacity: 0 }
}
