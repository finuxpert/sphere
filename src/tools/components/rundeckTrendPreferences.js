// The three chart slots share metrics, but their selections are independent.
export const SERVER_TREND_METRICS = [
  'cpu', 'ram', 'iowait', 'wp', 'availability',
  'load', 'swap', 'network', 'hana', 'replication', 'ssh', 'web',
]

/** Legacy independent chart preferences. Preserve exact old contract for callers. */
export function resolveServerTrendMetrics(saved = {}) {
  const valid = metric => SERVER_TREND_METRICS.includes(metric)
  return {
    first: valid(saved.serverMetric1) ? saved.serverMetric1 : valid(saved.serverMetric) ? saved.serverMetric : 'cpu',
    second: valid(saved.serverMetric2) ? saved.serverMetric2 : 'ram',
  }
}

/** Four-chart initial preference normalization is a separate, opt-in contract.
 * Legacy callers continue to support intentional duplicated metrics.
 * Reset charts restores distinct defaults without changing evidence or time range.
 */
export function resolveOverviewTrendMetrics(saved = {}) {
  const defaults = ['cpu', 'ram', 'network', 'wp']
  const old = resolveServerTrendMetrics(saved)
  const requested = [old.first, old.second, saved.technicalMetric ?? defaults[2], saved.fourthMetric ?? defaults[3]]
  const selected = []
  for (let index = 0; index < defaults.length; index += 1) {
    const chosen = requested[index]
    const metric = SERVER_TREND_METRICS.includes(chosen) && !selected.includes(chosen)
      ? chosen
      : [defaults[index], ...defaults, ...SERVER_TREND_METRICS].find(item => !selected.includes(item))
    selected.push(metric)
  }
  return { first: selected[0], second: selected[1], third: selected[2], fourth: selected[3] }
}
