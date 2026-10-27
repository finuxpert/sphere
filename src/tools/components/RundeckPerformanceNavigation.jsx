import React from 'react'
import SphereIcon from './SphereIcon.jsx'

import { PERFORMANCE_VIEWS } from './RundeckPerformanceNavigationState.js'

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
