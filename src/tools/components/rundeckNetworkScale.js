/** Source-preserving Network Y-axis zoom for saved AOP Infrastructure samples.
 * This never changes observed Mbps, peak timestamps, or NIC identity.
 * Full always remains available. Typical is only a viewport crop when spikes dominate.
 */
export function networkTrendScale(items = [], mode = 'max') {
  const key = mode === 'avg' ? 'avg_value' : 'max_value'
  const samples = (Array.isArray(items) ? items : []).filter(row =>
    row && row[key] !== null && row[key] !== undefined && row[key] !== '' &&
    Number.isFinite(Number(row[key])) && Number(row[key]) >= 0
  ).map(row => ({
    value: Number(row[key]),
    host: String(row.host || ''),
    at: row[key === 'max_value' ? 'peak_at' : 'latest_at'] || row.bucket || '',
    interface: String(row.peak_interface || ''),
  }))
  if (!samples.length) return {axisMax:null,peak:null,peakHost:'',peakAt:'',peakInterface:'',outliers:0}
  const high = samples.reduce((best,row) => row.value > best.value ? row : best, samples[0])
  const original = {peak:high.value,peakHost:high.host,peakAt:high.at,peakInterface:high.interface}
  if (samples.length < 10) return {axisMax:null,...original,outliers:0}
  const sorted = samples.map(row=>row.value).sort((a,b)=>a-b)
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)]
  const rawLimit = Math.max(1, p90 * 1.25)
  const magnitude = 10 ** Math.floor(Math.log10(rawLimit))
  const step = magnitude / 2
  const typicalMax = Math.ceil(rawLimit / step) * step
  if (!(high.value > typicalMax * 1.5)) return {axisMax:null,...original,outliers:0}
  return {
    axisMax:typicalMax,
    ...original,
    outliers:samples.filter(row=>row.value > typicalMax).length,
  }
}
