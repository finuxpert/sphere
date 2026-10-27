export const PERFORMANCE_VIEWS = [
  { id: 'performance', label: 'Performance', icon: 'activity', group: 'Monitoring' },
  { id: 'jobs', label: 'Jobs & Programs', icon: 'workload', group: 'Operational Checks' },
  { id: 'events', label: 'Related Events', icon: 'history' },
  { id: 'sap-checks', label: 'SAP Checks', icon: 'activity' },
  { id: 'infrastructure', label: 'Infrastructure', icon: 'server' },
  { id: 'system-data', label: 'System Data', icon: 'database' },
  { id: 'monthly-review', label: 'Monthly Review', icon: 'history' },
]

export function performanceViewFromHash() {
  if (typeof window === 'undefined') return 'performance'
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'tool' && parts[1] === 'logs' && PERFORMANCE_VIEWS.some(item => item.id === parts[2])
    ? parts[2] : 'performance'
}

