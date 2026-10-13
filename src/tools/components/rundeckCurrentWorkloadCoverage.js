// Read-only composition of the existing per-APP current-workload endpoint.
// Each host request has a hard API cap of 100 rows. Never call partial data complete.
export function combineCurrentWorkloadResponses(payloads, collectionId) {
  if (!Array.isArray(payloads) || !payloads.length) return { items: [], total: 0, complete: false, coverageScope: '' }
  const items = []
  let total = 0
  const scopes = new Set()
  for (const payload of payloads) {
    if (String(payload?.collection_id || '') !== String(collectionId || '')) {
      throw new Error('Current workload collection changed during fetch')
    }
    const rows = Array.isArray(payload.items) ? payload.items : []
    const host = String(payload.host || '').toUpperCase()
    const reported = Number(payload.total)
    if (!Number.isSafeInteger(reported) || reported < rows.length || reported < 0) {
      throw new Error('Current workload count is inconsistent')
    }
    total += reported
    scopes.add(String(payload.coverage_scope || 'UNKNOWN'))
    for (const row of rows) {
      if (String(row.collection_id || '') !== String(collectionId || '')) throw new Error('Workload sample is from another collection')
      if (host && String(row.host || '').toUpperCase() !== host) throw new Error('Workload APP does not match its query')
      items.push(row)
    }
  }
  return { items, total, complete: items.length === total, coverageScope: scopes.size === 1 ? [...scopes][0] : 'MIXED' }
}
