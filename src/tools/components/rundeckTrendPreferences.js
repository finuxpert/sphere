// The three chart slots share metrics, but their selections are independent.
export const SERVER_TREND_METRICS = [
  'cpu', 'ram', 'iowait', 'wp', 'availability',
  'load', 'swap', 'network', 'hana', 'replication', 'ssh', 'web',
]

export function resolveServerTrendMetrics(saved = {}) {
  const valid = metric => SERVER_TREND_METRICS.includes(metric)
  return {
    first: valid(saved.serverMetric1) ? saved.serverMetric1 : valid(saved.serverMetric) ? saved.serverMetric : 'cpu',
    second: valid(saved.serverMetric2) ? saved.serverMetric2 : 'ram',
  }
}
