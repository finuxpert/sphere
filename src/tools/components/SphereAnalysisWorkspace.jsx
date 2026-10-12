import React from 'react'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'

// Navigation only switches existing operator views. No API calls or generated data.
const WORKSPACES = [
  ['workloads', 'Jobs & Programs'],
  ['issues', 'SAP Checks'],
  ['evidence', 'Correlated Events'],
  ['infrastructure', 'Infrastructure'],
  ['system-data', 'System Data & PDF'],
]

export default function SphereAnalysisWorkspace({
  current, onNavigate, hasSelectedJob = false, hasSystemData = false,
  navigation = null, children, ...drawerProps
}) {
  const selected = current === 'job' ? 'workloads'
    : current === 'availability' ? 'issues'
      : current === 'history' ? 'evidence' : current

  return <RundeckWorkspaceDrawer
    {...drawerProps}
    presentation="workspace"
    navigation={<>
      <nav className="sphereWorkspaceNavigation" aria-label="SPHERE analysis workspaces">
        {WORKSPACES.map(([id, label]) => <button
          key={id}
          type="button"
          className={selected === id ? 'is-active' : ''}
          aria-current={selected === id ? 'page' : undefined}
          disabled={id === 'system-data' && !hasSystemData}
          onClick={() => onNavigate?.(id)}
        >{label}</button>)}
      </nav>
      {navigation}
      {current === 'job' && hasSelectedJob && <span className="sphereWorkspaceContext">Selected Job / Program · detailed evidence</span>}
    </>}
  >{children}</RundeckWorkspaceDrawer>
}
