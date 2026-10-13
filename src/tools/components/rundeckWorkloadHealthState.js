/** Use persisted backend review states; grouped multicore CPU is not a red threshold. */
export function workloadHealthLevel(row = {}) {
  const status = String(row?.status || '').toUpperCase()
  if (status === 'REVIEW REQUIRED') return 'review'
  if (['HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING'].includes(status)) return 'attention'
  if (status === 'NORMAL') return 'normal'
  return 'unknown'
}

/** Full report totals are not estimated from the 30 ranked preview hexagons. */
export function workloadHealthPreview(report, maxDots = 30) {
  if (!report || !Array.isArray(report.items) || !report.summary) return null
  const nonnegative = value => value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
  const total = nonnegative(report.summary.workloads)
  const reviewRequired = nonnegative(report.summary.review_required)
  if (total === null || reviewRequired === null || reviewRequired > total) return null
  if (total > 0 && report.items.length === 0) return null
  const limit = Math.max(1, Math.min(30, Math.floor(Number(maxDots) || 30)))
  const sample = report.items.slice(0, Math.min(limit, total))
  const quality = report.quality || {}
  return {
    total, reviewRequired,
    sample: sample.map(row => ({
      key: `${row.consumer_type || 'WORKLOAD'}:${row.consumer_key || ''}`,
      level: workloadHealthLevel(row),
    })),
    limited: String(quality.confidence || '').toUpperCase() === 'LOW' ||
      Number(quality.partial_or_incomplete_checks || 0) > 0,
    end: report.end || '',
  }
}
