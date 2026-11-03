import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rowMetric,
  selectObservationEpisode,
  episodeStats,
  durationText,
  chartAxisText,
  chartAxisSplitNumber,
  temporalText,
  nearestRow,
  metricSeriesData,
  chartProfile,
} from '../../src/tools/components/rundeckJobHistoryData.js'

const observations = [
  {
    collected_at: '2026-11-03T01:00:00Z',
    cpu_pct: 10,
    details: { total_pss_gb: 2, total_read_mib_s: 0, process_count: 2, wps: ['WP1'] },
    host_wp_critical: 1,
  },
  {
    collected_at: '2026-11-03T01:05:00Z',
    cpu_pct: 30,
    details: { total_pss_gb: 4, total_read_mib_s: 8, process_count: 4, wps: ['WP1', 'WP2'] },
    host_wp_critical: 2,
  },
  {
    collected_at: '2026-11-03T02:00:00Z',
    cpu_pct: 40,
    details: { total_pss_gb: 6, process_count: 3, wps: [] },
    host_wp_critical: 0,
  },
]

test('nullable SAP metrics preserve numeric and detail fallback semantics', () => {
  assert.equal(rowMetric({ cpu_pct: '' }, 'cpu'), null)
  assert.equal(rowMetric({ cpu_pct: '12.5' }, 'cpu'), 12.5)
  assert.equal(rowMetric({ details: { pss_gb: '3' } }, 'pss'), 3)
  assert.equal(rowMetric({ details: { pids: ['A', 'B'] } }, 'processes'), 2)
  assert.equal(rowMetric({ details: { wps: [] } }, 'wp'), 0)
  assert.equal(rowMetric({}, 'read'), null)
})

test('episode selection retains 25-minute gap boundary and latest/default behavior', () => {
  const first = selectObservationEpisode([...observations].reverse(), observations[0].collected_at)
  assert.deepEqual(first.map((row) => row.collected_at), observations.slice(0, 2).map((row) => row.collected_at))
  assert.deepEqual(selectObservationEpisode(observations), [observations[2]])
  assert.deepEqual(selectObservationEpisode([], ''), [])
})

test('statistics preserve averages, peaks, timestamps and critical WP meaning', () => {
  const stats = episodeStats(observations.slice(0, 2))
  assert.equal(stats.avgCpu, 20)
  assert.equal(stats.peakCpu, 30)
  assert.equal(stats.peakCpuAt, observations[1].collected_at)
  assert.equal(stats.avgPss, 3)
  assert.equal(stats.peakPss, 4)
  assert.equal(stats.avgProcesses, 3)
  assert.equal(stats.peakCriticalWp, 2)
  assert.equal(episodeStats([]).peakCpu, null)
})

test('chart series retain null separators for gaps instead of connecting samples', () => {
  const series = metricSeriesData(observations, 'cpu')
  assert.equal(series.length, 5)
  assert.deepEqual(series.map((item) => item[1]), [10, 30, null, null, 40])
  assert.equal(series[0][0], observations[0].collected_at)
  assert.equal(series.at(-1)[0], observations[2].collected_at)
})

test('time labels remain WIB and axis/issue durations remain unchanged', () => {
  assert.match(chartAxisText('2026-11-03T01:00:00Z', 0, 3600000), /08:00/)
  assert.equal(chartAxisSplitNumber(0, 3 * 60 * 60 * 1000), 6)
  assert.equal(durationText('2026-11-03T01:00:00Z', '2026-11-03T02:05:00Z'), '1h 5m')
  assert.equal(durationText('', ''), '—')
  assert.match(temporalText('2026-11-03T00:00:00Z', '2026-11-03T01:00:00Z'), /after issue start/)
})

test('profile and nearest-observation selection preserve source-backed values', () => {
  const profile = chartProfile(observations)
  assert.equal(profile.hasPss, true)
  assert.equal(profile.hasIo, true)
  assert.equal(profile.hasWp, true)
  assert.equal(profile.wpVariable, true)
  assert.equal(profile.hasCritical, true)
  assert.equal(profile.criticalSamples, 2)
  assert.equal(profile.totalSamples, 3)
  assert.equal(nearestRow(observations, '2026-11-03T01:04:00Z'), observations[1])
})
