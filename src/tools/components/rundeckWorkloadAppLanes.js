import { workloadHealthLevel } from './rundeckWorkloadHealthState.js'

export const EVALUATION_APPS = Object.freeze(['APP1', 'APP2', 'APP3', 'APP4', 'APP5'])
const LEVELS = ['review', 'attention', 'unknown', 'normal']

/** Only explicitly named AOP SAP APP hosts qualify; don't infer host from CPU/WP or numeric host_observations. */
export function evaluationAppKey(raw) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase().split('.')[0] : ''
  const match = /^(?:AOPH([1-5])PAPPDC|APP([1-5]))$/.exec(value)
  return match ? 'APP' + (match[1] || match[2]) : ''
}

export function evaluationHostKeys(row = {}) {
  const evidence = Array.isArray(row.hosts) ? row.hosts : []
  const candidates = [...evidence, row.host]
  const keys = new Set()
  candidates.forEach(candidate => {
    const host = typeof candidate === 'string' ? candidate : candidate && typeof candidate.host === 'string' ? candidate.host : ''
    const key = evaluationAppKey(host)
    if (key) keys.add(key)
  })
  return EVALUATION_APPS.filter(key => keys.has(key))
}

export function groupEvaluationsByApp(rows = []) {
  const buckets = new Map([...EVALUATION_APPS, 'UNVERIFIED'].map(key => [key, []]))
  let multiHost = 0
  let linkedUnique = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const keys = evaluationHostKeys(row)
    if (keys.length > 1) multiHost++
    if (keys.length) linkedUnique++
    for (const key of keys.length ? keys : ['UNVERIFIED']) buckets.get(key).push(row)
  }
  const lanes = [...EVALUATION_APPS, 'UNVERIFIED'].map(key => {
    const items = buckets.get(key)
    const counts = Object.fromEntries(LEVELS.map(level => [level, 0]))
    for (const item of items) counts[workloadHealthLevel(item)]++
    return { key, label: key === 'UNVERIFIED' ? 'Host Unverified' : key, rows: items, counts, total: items.length }
  })
  return {
    lanes,
    linkedUnique,
    multiHost,
    unverified: buckets.get('UNVERIFIED').length,
    memberships: lanes.slice(0, 5).reduce((total, lane) => total + lane.total, 0),
  }
}
