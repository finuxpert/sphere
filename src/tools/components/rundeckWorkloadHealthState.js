/** Use persisted backend review states; grouped multicore CPU is not a red threshold. */
export function workloadHealthLevel(row = {}) {
  const status = String(row?.status || '').toUpperCase()
  if (status === 'REVIEW REQUIRED') return 'review'
  if (['HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING'].includes(status)) return 'attention'
  if (status === 'NORMAL') return 'normal'
  return 'unknown'
}

/** Full report totals are not estimated from the 28 ranked preview dots. */
export function workloadHealthPreview(report, maxDots = 28) {
  if (!report || !Array.isArray(report.items) || !report.summary) return null
  const nonnegative = value => value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
  const total = nonnegative(report.summary.workloads)
  const reviewRequired = nonnegative(report.summary.review_required)
  if (total === null || reviewRequired === null || reviewRequired > total) return null
  const limit = Math.max(1, Math.min(28, Math.floor(Number(maxDots) || 28)))
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
