/**
 * Retained APP chart series, with an explicit null separator when this APP
 * has no sample for one or more expected buckets.
 * Global collection gaps alone cannot reveal APP-specific missing samples.
 * No synthetic zero / interpolated metric value is ever inserted.
 */
export function buildHostTrendSeries(points = [], bucketIntervalMs = 600000, collectionGapPoints = []) {
  const ordered = [...points].sort((a, b) => new Date(a.value?.[0]).getTime() - new Date(b.value?.[0]).getTime())
  const interval = Number(bucketIntervalMs)
  const canDetect = Number.isFinite(interval) && interval >= 60000
  const complete = []
  let previousAt = null
  for (const point of ordered) {
    const at = new Date(point.value?.[0]).getTime()
    if (canDetect && previousAt !== null && Number.isFinite(at) && at - previousAt > interval * 1.5) {
      // Insert a missing bucket marker for this APP, not a fabricated reading.
      complete.push({ value: [previousAt + interval, null], gap: true, appGap: true })
    }
    complete.push(point)
    if (Number.isFinite(at)) previousAt = at
  }
  return [...complete, ...collectionGapPoints].sort(
    (a, b) => new Date(a.value?.[0]).getTime() - new Date(b.value?.[0]).getTime()
  )
}
