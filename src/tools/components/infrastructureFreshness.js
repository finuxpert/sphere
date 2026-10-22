/** A retained infrastructure measurement is not a live operating state. */
export const INFRA_FRESHNESS_LIMIT_MS = 15 * 60 * 1000

export function infrastructureFreshness(timestamp, nowMs = Date.now()) {
  if (!timestamp || !Number.isFinite(nowMs)) return 'UNKNOWN'
  const collectedMs = Date.parse(timestamp)
  if (!Number.isFinite(collectedMs) || collectedMs > nowMs + 60 * 1000) return 'UNKNOWN'
  return nowMs - collectedMs > INFRA_FRESHNESS_LIMIT_MS ? 'STALE' : 'FRESH'
}

/** Never combine a host's latest READY identity with older sample rows. */
export function infrastructureTelemetryFreshness(hostTimestamp, collectionId, rows, nowMs = Date.now()) {
  const hostState = infrastructureFreshness(hostTimestamp, nowMs)
  if (hostState !== 'FRESH') return hostState
  if (!Array.isArray(rows) || rows.length === 0) return 'UNKNOWN'
  for (const row of rows) {
    const rowState = infrastructureFreshness(row?.collected_at, nowMs)
    if (rowState !== 'FRESH') return rowState
    if (collectionId && row.collection_id !== collectionId) return 'UNKNOWN'
  }
  return 'FRESH'
}

export function infrastructureObservationStatus(rawStatus, freshness) {
  return freshness === 'FRESH' ? rawStatus : freshness
}
