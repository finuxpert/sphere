// The three chart slots share metrics, but their selections are independent.
export const SERVER_TREND_METRICS = [
  'cpu', 'ram', 'iowait', 'wp', 'availability',
  'load', 'swap', 'network', 'hana', 'replication', 'ssh', 'web',
]

/** Canonical initial four-chart selection. Older browser preferences may
 * repeat CPU in several slots. Repair only the initial saved configuration;
 * users may still explicitly choose the same metric in multiple dropdowns.
 */
export function resolveServerTrendMetrics(saved = {}) {
  const defaults = ['cpu', 'ram', 'network', 'wp']
  const requested = [
    saved.serverMetric1 ?? saved.serverMetric ?? defaults[0],
    saved.serverMetric2 ?? defaults[1],
    saved.technicalMetric ?? defaults[2],
    saved.fourthMetric ?? defaults[3],
  ]
  const selected = []
  for (let index = 0; index < defaults.length; index += 1) {
    const chosen = requested[index]
    const metric = SERVER_TREND_METRICS.includes(chosen) && !selected.includes(chosen)
      ? chosen
      : [defaults[index], ...defaults, ...SERVER_TREND_METRICS].find(item => !selected.includes(item))
    selected.push(metric)
  }
  return {
    first: selected[0], second: selected[1],
    third: selected[2], fourth: selected[3],
  }
}
