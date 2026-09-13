import React from 'react'
import './SphereWorkspaceV153.css'
import './SphereWorkspaceV154.css'
import './SphereWorkspaceV155.css'
import './SphereWorkspaceV156.css'
import './components/RundeckOperationalClarity.css'
import './components/RundeckWorkspaceCompact.css'
import './components/RundeckWorkspaceFinalPolish.css'
import './components/RundeckWorkspaceRails.css'
import './components/RundeckWorkspaceAlignedBands.css'
import './components/RundeckWorkspaceFlowBands.css'
import './components/RundeckAvailabilityPolishV1206.css'
import './components/RundeckWorkspaceConvergenceV1205.css'
import './components/RundeckReleaseCandidatePolish.css'
import './components/RundeckUiFreezeV1207.css'
import './components/RundeckFreshCollectionIdentityV122.css'

const LogAutoSphereV5 = React.lazy(() => import('./ToolLogAutoSphereV5.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading deterministic LOG analysis v1.14…</div></section>}>
      <LogAutoSphereV5 />
    </React.Suspense>
  )
}