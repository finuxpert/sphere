// SAP Issues fetch results are independent: a failed source is not a healthy check.
export const SAP_ISSUE_SOURCE_NAMES = Object.freeze(['incidents', 'hosts', 'availability', 'readiness'])
export const SAP_ISSUE_SOURCE_LABELS = Object.freeze({
  incidents: 'Incident history',
  hosts: 'APP performance',
  availability: 'SAP availability',
  readiness: 'SM37 readiness',
})

export function settleSapIssueSources(results = []) {
  const data = {}
  const failed = []
  SAP_ISSUE_SOURCE_NAMES.forEach((name, index) => {
    const result = results[index]
    const valid = result?.status === 'fulfilled' && result.value != null && typeof result.value === 'object'
    data[name] = valid ? result.value : null
    if (!valid) failed.push(name)
  })
  return { data, failed }
}

export function unavailableSapIssueIndicators(failed = []) {
  return failed.map((name) => ({
    scope: 'Data source',
    indicator: SAP_ISSUE_SOURCE_LABELS[name] || name,
    status: 'UNKNOWN',
    current: 'Unavailable',
    reason: 'Check API response; no current status inferred',
  }))
}
