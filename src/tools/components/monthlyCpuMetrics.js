/** Core-based WP/process CPU is distinct from host CPU utilization.
 * 100% observed WP CPU corresponds to one logical CPU core-equivalent.
 * Do not infer host-capacity share without a sourced, time-valid CPU count.
 */
export function wpCpuCoreEquivalent(cpuPct) {
  if (cpuPct === null || cpuPct === undefined || cpuPct === '') return null
  const value = Number(cpuPct)
  return Number.isFinite(value) && value >= 0 ? value / 100 : null
}
