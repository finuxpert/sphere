/** Preserve zero counts and distinguish a missing process-count sample from one process. */
export function processCount(details = {}) {
  const raw = details?.process_count
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}

/** Explicit CPU signals only. Review, PSS and multi-core >100% are not sufficient. */
export function workloadCpuSignal(row = {}) {
  const details = row.details || {}
  const signals = row.signals || details.signals || {}
  const status = String(row.review_status || row.status || '').trim().toUpperCase()
  const pattern = String(row.resource_pattern || details.resource_pattern || '').trim().toUpperCase()
  return Boolean(signals.sustained_high_cpu || signals.cpu_spike || signals.performance_shift ||
    pattern === 'SUSTAINED_HIGH_CPU' || pattern === 'CPU_SPIKE' ||
    ['HIGH CPU', 'CPU SPIKE', 'INCREASING CPU'].includes(status))
}
