import React from 'react'
import SphereIcon from './SphereIcon.jsx'

export default function RundeckJobsProgramsWorkspace({ currentContent = null, reviewContent = null }) {
  const [mode, setMode] = React.useState('live')
  const live = React.isValidElement(currentContent)
    ? React.cloneElement(currentContent, { embedded: true })
    : currentContent
  const review = React.isValidElement(reviewContent)
    ? React.cloneElement(reviewContent, { embedded: true, forceSearch: mode === 'search' })
    : reviewContent

  return <section className="rundeckJobsProgramsWorkspace" aria-label="Jobs and Programs workspace">
    <header className="rundeckJobsProgramsWorkspaceHead">
      <div>
        <h3><SphereIcon name="workload" /> Jobs & Programs</h3>
        <span>{mode === 'live' ? 'Current workload observations' : mode === 'review' ? 'Historical Basis review priority' : 'Historical job / program search'}</span>
      </div>
      <div className="rundeckJobsProgramsModes" role="tablist" aria-label="Jobs and Programs mode">
        <button type="button" role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'is-active' : ''} onClick={() => setMode('live')}>Live</button>
        <button type="button" role="tab" aria-selected={mode === 'review'} className={mode === 'review' ? 'is-active' : ''} onClick={() => setMode('review')}>Review</button>
        <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'is-active' : ''} onClick={() => setMode('search')}>Search</button>
      </div>
    </header>
    <div className="rundeckJobsProgramsWorkspaceBody">
      {mode === 'live' ? live : review}
    </div>
  </section>
}
