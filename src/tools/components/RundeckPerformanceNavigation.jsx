import React from 'react'
import SphereIcon from './SphereIcon.jsx'

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

export default function RundeckPerformanceNavigation({ activeView = 'performance', onNavigate }) {
  return <nav className="spherePerformanceSidebar" aria-label="SAP Operations navigation">
    <div className="spherePerformanceSidebarBrand"><SphereIcon name="activity" /><strong>SAP Operations</strong></div>
    {PERFORMANCE_VIEWS.map(item => <React.Fragment key={item.id}>
      {item.group && <div className="spherePerformanceNavGroup">{item.group}</div>}
      <a className={'spherePerformanceNavLink' + (activeView === item.id ? ' is-active' : '')}
        href={item.id === 'performance' ? '#/tool/logs' : '#/tool/logs/' + item.id}
        aria-current={activeView === item.id ? 'page' : undefined}
        onClick={() => onNavigate?.(item.id)}>
        <SphereIcon name={item.icon} /><span>{item.label}</span>
      </a>
    </React.Fragment>)}
    <div className="spherePerformanceSidebarFoot">Saved SAP & Infrastructure observations</div>
  </nav>
}
