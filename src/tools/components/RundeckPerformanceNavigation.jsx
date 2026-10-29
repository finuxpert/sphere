import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { PRIMARY_PERFORMANCE_VIEWS } from './RundeckPerformanceNavigationState.js'

export default function RundeckPerformanceNavigation({ activeView = 'performance', onNavigate, onOpenCollection, onManualUpload }) {
  // Full labels are the normal desktop experience, compact icons are optional.
  // Old route IDs continue to work even when absent from the primary nav.
  const [collapsed, setCollapsed] = React.useState(false)
  return <nav className={'spherePerformanceSidebar' + (collapsed ? ' is-collapsed' : ' is-expanded')}
    aria-label="SPHERE navigation" data-sidebar-state={collapsed ? 'collapsed' : 'expanded'}>
    <div className="spherePerformanceSidebarBrand">
      <button type="button" className="spherePerformanceSidebarToggle"
        aria-label={collapsed ? 'Expand SAP Operations navigation' : 'Collapse SAP Operations navigation'}
        aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(value => !value)}>
        <SphereIcon name="activity" />
        <strong>SPHERE</strong>
        <span aria-hidden="true" className="sphereSidebarToggleGlyph">{collapsed ? '›' : '‹'}</span>
      </button>
    </div>
    {PRIMARY_PERFORMANCE_VIEWS.map(item => {
      const selected = activeView === item.id ||
        (item.id === 'performance' && ['events','sap-checks','infrastructure'].includes(activeView))
      return <a key={item.id}
        className={'spherePerformanceNavLink' + (selected ? ' is-active' : '')}
        href={item.id === 'performance' ? '#/tool/logs' : '#/tool/logs/' + item.id}
        aria-label={item.label} title={collapsed ? item.label : undefined}
        aria-current={activeView === item.id ? 'page' : undefined}
        onClick={() => onNavigate?.(item.id)}>
        <SphereIcon name={item.icon} /><span>{item.label}</span>
      </a>
    })}
    <div className="sphereSidebarUtilities" role="group" aria-label="Collection tools">
      <button type="button" onClick={onOpenCollection} title="Collector status, history and token details"><SphereIcon name="database" /><span>Collector</span></button>
      <button type="button" onClick={onManualUpload} title="Upload WP-SCOUT or Daily Check data"><SphereIcon name="upload" /><span>Upload Data</span></button>
    </div>
  </nav>
}
