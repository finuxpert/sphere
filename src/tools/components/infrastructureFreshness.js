/** A retained infrastructure measurement is not a live operating state. */
export const INFRA_FRESHNESS_LIMIT_MS = 15 * 60 * 1000

export function infrastructureFreshness(timestamp, nowMs = Date.now()) {
  if (!timestamp || !Number.isFinite(nowMs)) return 'UNKNOWN'
  const collectedMs = Date.parse(timestamp)
  if (!Number.isFinite(collectedMs) || collectedMs > nowMs + 60 * 1000) return 'UNKNOWN'
  return nowMs - collectedMs > INFRA_FRESHNESS_LIMIT_MS ? 'STALE' : 'FRESH'
}

export function infrastructureObservationStatus(rawStatus, freshness) {
  return freshness === 'FRESH' ? rawStatus : freshness
}
