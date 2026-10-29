import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { PRIMARY_PERFORMANCE_VIEWS } from './RundeckPerformanceNavigationState.js'

export default function RundeckPerformanceNavigation({ activeView = 'performance', onNavigate }) {
  // Full labels are the normal desktop experience, compact icons are optional.
  // Old route IDs continue to work even when absent from the primary nav.
  const [collapsed, setCollapsed] = React.useState(false)
  return <nav className={'spherePerformanceSidebar' + (collapsed ? ' is-collapsed' : ' is-expanded')}
    aria-label="SAP Operations navigation" data-sidebar-state={collapsed ? 'collapsed' : 'expanded'}>
    <div className="spherePerformanceSidebarBrand">
      <button type="button" className="spherePerformanceSidebarToggle"
        aria-label={collapsed ? 'Expand SAP Operations navigation' : 'Collapse SAP Operations navigation'}
        aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(value => !value)}>
        <SphereIcon name="activity" />
        <strong>SAP Operations</strong>
        <span aria-hidden="true" className="sphereSidebarToggleGlyph">{collapsed ? '›' : '‹'}</span>
      </button>
    </div>
    {PRIMARY_PERFORMANCE_VIEWS.map(item => {
      const selected = activeView === item.id ||
        (item.id === 'sap-checks' && activeView === 'infrastructure') ||
        (item.id === 'performance' && activeView === 'events')
      return <a key={item.id}
        className={'spherePerformanceNavLink' + (selected ? ' is-active' : '')}
        href={item.id === 'performance' ? '#/tool/logs' : '#/tool/logs/' + item.id}
        aria-label={item.label} title={collapsed ? item.label : undefined}
        aria-current={activeView === item.id ? 'page' : undefined}
        onClick={() => onNavigate?.(item.id)}>
        <SphereIcon name={item.icon} /><span>{item.label}</span>
      </a>
    })}
    <div className="spherePerformanceSidebarAdmin">
      <a href="#/tool/logs/system-data"
        className={'spherePerformanceNavLink' + (activeView === 'system-data' ? ' is-active' : '')}
        aria-label="Administration" title={collapsed ? 'Administration' : undefined}
        aria-current={activeView === 'system-data' ? 'page' : undefined}
        onClick={() => onNavigate?.('system-data')}>
        <SphereIcon name="database"/><span>Administration</span>
      </a>
    </div>
  </nav>
}
