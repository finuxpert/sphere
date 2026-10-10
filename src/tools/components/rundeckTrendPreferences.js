// Keep Server Trends complementary when restoring a legacy saved dashboard.
// Operators can still select any metric after the page has loaded.
export const SERVER_TREND_METRICS = ['cpu', 'ram', 'iowait', 'wp', 'availability']

export function resolveServerTrendMetrics(saved = {}) {
  const requestedFirst = SERVER_TREND_METRICS.includes(saved.serverMetric1)
    ? saved.serverMetric1
    : SERVER_TREND_METRICS.includes(saved.serverMetric)
      ? saved.serverMetric
      : 'cpu'
  const requestedSecond = SERVER_TREND_METRICS.includes(saved.serverMetric2)
    ? saved.serverMetric2
    : 'ram'
  return {
    first: requestedFirst,
    second: requestedSecond === requestedFirst
      ? (requestedFirst === 'cpu' ? 'ram' : 'cpu')
      : requestedSecond,
  }
}
