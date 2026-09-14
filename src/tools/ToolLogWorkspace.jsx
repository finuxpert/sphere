import React from 'react'
import './SphereWorkspaceV153.css'
import './SphereWorkspaceV154.css'
import './SphereWorkspaceV155.css'
import './SphereWorkspaceV156.css'
import './components/RundeckOperationalClarity.css'
import './components/RundeckAvailabilityPolishV1206.css'
import './components/RundeckReleaseCandidatePolish.css'
import './components/RundeckUiFreezeV1207.css'
import './components/RundeckFreshCollectionIdentityV122.css'
import './components/RundeckOperationalUxV1221.css'
import './components/RundeckOperatorDensityV1222.css'
import './components/RundeckLeanOpsV123.css'
import './components/RundeckOperatorClarityV1231.css'
import './components/RundeckOperatorClarityV1231Patch.css'
import './components/RundeckWorkspaceV1236.css'

const LogAutoSphereV5 = React.lazy(() => import('./ToolLogAutoSphereV5.jsx'))

export default function ToolLogWorkspace() {
  return <React.Suspense fallback={<section className="container section"><div className="card">Loading LOG analysis…</div></section>}><LogAutoSphereV5 /></React.Suspense>
}
