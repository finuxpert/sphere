/** Source-level invariants span the parent, chart renderer, and shared evidence rules. */
export function trendFeatureSource(read) {
  return [
    'RundeckServerTrend.jsx',
    'RundeckServerTrendChart.jsx',
    'rundeckServerTrendShared.js',
    'rundeckServerTrendGaps.js',
  ].map(read).join('\n')
}
