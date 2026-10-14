/** Size every saved evaluation against actual panel dimensions.
 * Reserve half a pitch for alternating honeycomb rows; never clip dots offscreen.
 */
export function workloadDotLayout({ count = 0, width = 0, height = 0, minSize = 6, maxSize = 13 } = {}) {
  const population = Number(count), w = Number(width), h = Number(height)
  if (!Number.isSafeInteger(population) || population < 0 ||
      !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return { size: 10, gap: 2, columns: 1, rows: 0, fits: population === 0, capacity: 0 }
  for (let size = maxSize; size >= minSize; size--) {
    const gap = size >= 9 ? 2 : 1
    const pitch = size + gap
    // .rundeckWorkloadDotGrid reserves 1px horizontal padding on both sides.
    const staggerReserve = Math.ceil(pitch / 2) + 2
    const columns = Math.max(0, Math.floor((w - staggerReserve + gap) / pitch))
    const rows = columns > 0 ? Math.ceil(population / columns) : Infinity
    const maxRows = Math.max(0, Math.floor((h + gap - 2) / pitch))
    const capacity = columns * maxRows
    if (capacity >= population && (rows === 0 || rows * pitch - gap + 2 <= h))
      return { size, gap, columns: Math.max(columns, 1), rows, fits: true, capacity }
  }
  return { size: minSize, gap: 1, columns: 1, rows: 0, fits: false, capacity: 0 }
}
