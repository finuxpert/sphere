import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { PERFORMANCE_VIEWS } from './RundeckPerformanceNavigationState.js'

export default function RundeckPerformanceNavigation({ activeView = 'performance', onNavigate }) {
  // Compact mode gives the SAP work area the maximum usable width.
  // Expanded mode keeps all seven operational workspaces available.
  const [collapsed, setCollapsed] = React.useState(true)
  return <nav className={'spherePerformanceSidebar' + (collapsed ? ' is-collapsed' : ' is-expanded')}
    aria-label="SAP Operations navigation" data-sidebar-state={collapsed ? 'collapsed' : 'expanded'}>
    <div className="spherePerformanceSidebarBrand">
      <button type="button" className="spherePerformanceSidebarToggle"
        aria-label={collapsed ? 'Expand SAP Operations navigation' : 'Collapse SAP Operations navigation'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(value => !value)}>
        <SphereIcon name="activity" />
        <strong>SAP Operations</strong>
        <span aria-hidden="true" className="sphereSidebarToggleGlyph">{collapsed ? '›' : '‹'}</span>
      </button>
    </div>
    {PERFORMANCE_VIEWS.map(item => <React.Fragment key={item.id}>
      {item.group && <div className="spherePerformanceNavGroup">{item.group}</div>}
      <a className={'spherePerformanceNavLink' + (activeView === item.id ? ' is-active' : '')}
        href={item.id === 'performance' ? '#/tool/logs' : '#/tool/logs/' + item.id}
        aria-label={item.label} title={collapsed ? item.label : undefined}
        aria-current={activeView === item.id ? 'page' : undefined}
        onClick={() => onNavigate?.(item.id)}>
        <SphereIcon name={item.icon} /><span>{item.label}</span>
      </a>
    </React.Fragment>)}
  </nav>
}
