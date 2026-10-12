// A saved performance row is not a Rundeck execution or an SAP SM37 job.
export function observationIdentityCounts(rows = []) {
  const observations = Array.isArray(rows) ? rows : []
  const collections = new Set(observations.map(row => {
    const id = row?.collection_id
    return id === null || id === undefined || String(id).trim() === '' ? null : String(id)
  }).filter(Boolean))
  return {
    performanceObservations: observations.length,
    rundeckCollections: collections.size || null,
    sm37Executions: null, // Requires its own authoritative SM37 source.
  }
}
