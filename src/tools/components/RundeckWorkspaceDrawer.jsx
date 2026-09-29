import React from 'react'
import './RundeckWorkspaceDrawer.css'

export default function RundeckWorkspaceDrawer({ title, subtitle = '', onClose, onBack = null, backLabel = 'Back', children, actions = null, size = 'default' }) {
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <aside className={`rundeckWorkspaceDrawer is-${size}`} role="dialog" aria-modal="false" aria-label={title}>
    <header>
      <div className="rundeckWorkspaceDrawerIdentity">
        <span>SPHERE Analysis</span>
        <h3>{title}</h3>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="rundeckWorkspaceDrawerHeaderActions">
        {onBack && <button type="button" className="rundeckWorkspaceBack" onClick={onBack} aria-label={backLabel}>← <em>{backLabel}</em></button>}
        <button type="button" className="rundeckWorkspaceClose" onClick={onClose} aria-label="Close analysis">×</button>
      </div>
    </header>
    <div className="rundeckWorkspaceDrawerBody">{children}</div>
    {actions && <footer>{actions}</footer>}
  </aside>
}
