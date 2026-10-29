import React from 'react'
import SphereIcon from './SphereIcon.jsx'

// Use the existing Rundeck status and import workflow; never copy monitoring data.
export default function RundeckDataCollection({ systemDataContent, onManualUpload, collectionAction }) {
  const [tab, setTab] = React.useState(() => typeof window !== 'undefined' && window.location.hash.includes('/system-data/history') ? 'history' : 'automatic')
  const [credentialsOpen, setCredentialsOpen] = React.useState(false)
  React.useEffect(() => {
    const updateFromHash = () => {
      if (window.location.hash.includes('/system-data/history')) setTab('history')
    }
    window.addEventListener('hashchange', updateFromHash)
    return () => window.removeEventListener('hashchange', updateFromHash)
  }, [])
  const renderData = (initialTab) => React.isValidElement(systemDataContent)
    ? React.cloneElement(systemDataContent, { key: initialTab, initialTab, hideTabs: true, onOpenPdf: null })
    : <p role="status">Collection data unavailable.</p>
  return <section className="sphereCollectionWorkspace" aria-label="Data Collection">
    <nav className="sphereCollectionTabs" role="tablist" aria-label="Data Collection sections">
      {[['automatic','Automatic'],['manual','Manual Upload'],['history','History']].map(([id,label]) =>
        <button key={id} type="button" role="tab" aria-selected={tab === id}
          className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    {tab === 'automatic' && <div className="sphereCollectionBody" role="tabpanel">
      <div className="sphereCollectionActions"><strong>Rundeck Collector</strong>{collectionAction}</div>
      {renderData('services')}
      <button type="button" className="spherePlainLink" aria-expanded={credentialsOpen}
        onClick={() => setCredentialsOpen(value => !value)}>Token Details</button>
      {credentialsOpen && renderData('tokens')}
    </div>}
    {tab === 'manual' && <div className="sphereCollectionBody sphereManualCollection" role="tabpanel">
      <div><h3>Manual Upload</h3><p>Upload WP-SCOUT or Daily Check logs for analysis.</p></div>
      <button type="button" className="sphereUploadAction" onClick={onManualUpload}>
        <SphereIcon name="upload" /> Open Manual Upload
      </button>
    </div>}
    {tab === 'history' && <div className="sphereCollectionBody" role="tabpanel">{renderData('collections')}</div>}
  </section>
}
