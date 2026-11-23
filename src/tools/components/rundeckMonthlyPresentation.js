/** Presentation-only helpers; never infer missing historical evidence as zero. */
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

const savedNumber = value => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null

/** The same metric contract is used for visible bars and their labels. */
export function monthlyRankMetricValue(row, metric) {
  const raw = savedNumber(metric === 'cpu' ? row?.peak_cpu_pct : row?.peak_pss_gb)
  return raw === null ? null : metric === 'cpu' ? wpCpuCoreEquivalent(raw) : raw
}

/** Reporting interval is a bucket aggregation, not an instantaneous host reading. */
export function monthlyTrendIntervalLabel(bucketMinutes) {
  const minutes = savedNumber(bucketMinutes)
  if (minutes === null || minutes <= 0) return 'Saved APP peak per bucket · WIB'
  if (minutes >= 1440 && minutes % 1440 === 0)
    return (minutes / 1440 === 1 ? 'Daily' : minutes / 1440 + '-day') + ' peak per APP · WIB'
  if (minutes >= 60 && minutes % 60 === 0)
    return (minutes / 60 === 1 ? 'Hourly' : minutes / 60 + '-hour') + ' peak per APP · WIB'
  return minutes + '-minute peak per APP · WIB'
}

/** Observed evaluation signals, not a validated SAP tuning recommendation. */
export function monthlyReviewBasis(row) {
  const signals = row?.signals || {}
  const reasons = []
  if (signals.high_memory) reasons.push('Memory signal')
  if (signals.sustained_high_cpu) reasons.push('Sustained WP CPU')
  else if (signals.cpu_spike) reasons.push('WP CPU spike')
  if (signals.baseline_anomaly) reasons.push('Baseline deviation')
  if (signals.performance_shift) reasons.push('Recent CPU shift')
  return reasons.length ? reasons.join(' · ') : 'Evidence review'
}
