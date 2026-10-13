/** Determine how many complete live workload rows fit above the viewport edge.
 * Reserve room for the pager and footer; never hide observations to fake full coverage.
 */
export function workloadRowsThatFit({
  viewportHeight, tableTop, headerHeight, rowHeight, reserveBelow = 44, maxRows = 5,
} = {}) {
  const values = [viewportHeight, tableTop, headerHeight, rowHeight, reserveBelow, maxRows].map(Number)
  const [height, top, header, row, reserve, max] = values
  if (!values.every(Number.isFinite) || height <= 0 || top < 0 || header < 0 || row <= 0 || reserve < 0 || max < 1) return null
  const available = height - top - header - reserve
  return Math.max(1, Math.min(Math.floor(max), Math.floor(available / row)))
}
