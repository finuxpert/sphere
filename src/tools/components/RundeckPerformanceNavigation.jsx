import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { APP_DISPLAY_VERSION, APP_BUILD_LABEL } from '../../app/version.js'
import { PRIMARY_PERFORMANCE_VIEWS } from './RundeckPerformanceNavigationState.js'

export default function RundeckPerformanceNavigation({ activeView = 'performance', sourceFreshness = null, onNavigate, onOpenCollection, onManualUpload }) {
  // Full labels are the normal desktop experience, compact icons are optional.
  // Old route IDs continue to work even when absent from the primary nav.
  const [collapsed, setCollapsed] = React.useState(false)
  return <nav className={'spherePerformanceSidebar' + (collapsed ? ' is-collapsed' : ' is-expanded') + ' d-flex flex-column nav-pills'}
    aria-label="SPHERE navigation" data-sidebar-state={collapsed ? 'collapsed' : 'expanded'}>
    <div className="spherePerformanceSidebarBrand">
      <button type="button" className="spherePerformanceSidebarToggle btn btn-sm"
        aria-label={collapsed ? 'Expand SAP Operations navigation' : 'Collapse SAP Operations navigation'}
        aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(value => !value)}>
        <SphereIcon name="activity" />
        <strong>Menu</strong>
        <span aria-hidden="true" className="sphereSidebarToggleGlyph">{collapsed ? '›' : '‹'}</span>
      </button>
    </div>
    {PRIMARY_PERFORMANCE_VIEWS.map(item => {
      const selected = activeView === item.id ||
        (item.id === 'performance' && ['events','sap-checks','infrastructure'].includes(activeView))
      return <a key={item.id}
        className={'spherePerformanceNavLink nav-link' + (selected ? ' is-active' : '')}
        href={item.id === 'performance' ? '#/tool/logs' : '#/tool/logs/' + item.id}
        aria-label={item.label} title={collapsed ? item.label : undefined}
        aria-current={activeView === item.id ? 'page' : undefined}
        onClick={() => onNavigate?.(item.id)}>
        <SphereIcon name={item.icon} /><span>{item.label}</span>
      </a>
    })}
    <div className="sphereSidebarInsights" aria-label="System operations status">
      <div className="sphereSidebarHealthSlot" aria-label="System Status and Data Collection" />
      <section className="sphereSidebarFreshness" aria-label="Data Freshness">
        <strong className="sphereSidebarInsightHeading">Data Freshness</strong>
        <div className="sphereSidebarDataLine" title={sourceFreshness?.title || 'Checking source collection timestamps'}>
          <span>Data Sync</span>
          <strong className={'is-' + String(sourceFreshness?.status || 'CHECKING').toLowerCase()}>{sourceFreshness?.status === 'ALIGNED' ? 'Aligned' : sourceFreshness?.status === 'CHECKING' ? 'Checking' : sourceFreshness?.status === 'FRESH' ? 'Updated' : sourceFreshness?.status === 'PARTIAL' ? 'Partial' : 'Unverified'}</strong>
        </div>
        <div className="sphereSidebarDataLine" title="Age of last verified performance observation">
          <span>Performance</span>
          <strong>{sourceFreshness?.performanceAgeMinutes == null ? 'Unknown' : Math.max(0, sourceFreshness.performanceAgeMinutes) + 'm ago'}</strong>
        </div>
        <div className="sphereSidebarDataLine" title="Age of last observed availability sample; freshness is independent of performance">
          <span>Availability</span>
          <strong>{sourceFreshness?.availabilityAgeMinutes == null ? 'Unknown' : Math.max(0, sourceFreshness.availabilityAgeMinutes) + 'm ago'}</strong>
        </div>
      </section>
    </div>
    <div className="sphereSidebarUtilities d-flex flex-column gap-1" role="group" aria-label="Collection tools">
      <button type="button" className="btn btn-sm text-start" onClick={onOpenCollection} title="Collector status, history and token details"><SphereIcon name="database" /><span>Collector</span></button>
      <button type="button" className="btn btn-sm text-start" onClick={onManualUpload} title="Upload WP-SCOUT or Daily Check data"><SphereIcon name="upload" /><span>Upload Data</span></button>
    </div>
    <div className="sphereSidebarRelease" aria-label={APP_BUILD_LABEL} title={APP_BUILD_LABEL}>
      {APP_DISPLAY_VERSION}
    </div>
  </nav>
}
