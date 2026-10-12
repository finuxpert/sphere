/** Preserve zero counts and distinguish a missing process-count sample from one process. */
export function processCount(details = {}) {
  const raw = details?.process_count
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}
