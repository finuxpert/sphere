import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import RundeckWorkloadHealth from './RundeckWorkloadHealth.jsx'

export default function RundeckJobsProgramsWorkspace({ currentContent = null, reviewContent = null, refreshToken = '', performanceVerified = false, onOpenEvaluatedWorkload = null }) {
  const [mode, setMode] = React.useState('live')
  const [reviewJumpToken, setReviewJumpToken] = React.useState(0)
  const [reviewJumpHealth, setReviewJumpHealth] = React.useState('REVIEW')
  const tabId = React.useId()
  const tabs = ['live', 'review', 'search']
  const tabRefs = React.useRef({})
  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = tabs.indexOf(mode)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    setMode(next)
    tabRefs.current[next]?.focus()
  }
  const live = React.isValidElement(currentContent)
    ? React.cloneElement(currentContent, { embedded: true })
    : currentContent
  const review = React.isValidElement(reviewContent)
    ? React.cloneElement(reviewContent, {
        embedded: true,
        forceSearch: mode === 'search',
        hideSearchButton: true,
        reviewJumpToken,
        reviewJumpHealth,
      })
    : reviewContent

  return <section className="rundeckJobsProgramsWorkspace" aria-label="Jobs and Programs workspace">
    <header className="rundeckJobsProgramsWorkspaceHead">
      <div className="rundeckJobsProgramsIdentity">
        <h3><SphereIcon name="workload" /> Jobs & Programs</h3>
        <div className="rundeckJobsProgramsModes" role="tablist" aria-label="Jobs and Programs mode">
        <button type="button" ref={(node) => { tabRefs.current.live = node }} id={`${tabId}-live`} role="tab" aria-controls={`${tabId}-panel`} aria-selected={mode === 'live'} tabIndex={mode === 'live' ? 0 : -1} className={mode === 'live' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setMode('live')}>Current</button>
        <button type="button" ref={(node) => { tabRefs.current.review = node }} id={`${tabId}-review`} role="tab" aria-controls={`${tabId}-panel`} aria-selected={mode === 'review'} tabIndex={mode === 'review' ? 0 : -1} className={mode === 'review' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setMode('review')}>Review</button>
        <button type="button" ref={(node) => { tabRefs.current.search = node }} id={`${tabId}-search`} role="tab" aria-controls={`${tabId}-panel`} aria-selected={mode === 'search'} tabIndex={mode === 'search' ? 0 : -1} className={mode === 'search' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setMode('search')}>Search</button>
        </div>
      </div>
    </header>
    <div className="rundeckJobsProgramsSplit">
      <div key={mode} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${mode}`} className={`rundeckJobsProgramsWorkspaceBody is-${mode}`}>
        {mode === 'live' ? live : review}
      </div>
      <aside className="rundeckJobsProgramsHealthSide" aria-label="Workload health overview">
        <RundeckWorkloadHealth refreshToken={refreshToken} performanceVerified={performanceVerified} onSelectWorkload={onOpenEvaluatedWorkload} onReview={(category = 'REVIEW') => {
          setReviewJumpHealth(['REVIEW','ATTENTION','UNKNOWN','NORMAL'].includes(category) ? category : 'REVIEW')
          setReviewJumpToken(token => token + 1)
          setMode('review')
        }} />
      </aside>
    </div>
  </section>
}
