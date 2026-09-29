import React from 'react'
import './RundeckWorkspaceDrawer.css'

export default function RundeckWorkspaceDrawer({ title, subtitle = '', onClose, children, actions = null }) {
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <aside className="rundeckWorkspaceDrawer" role="dialog" aria-modal="false" aria-label={title}>
    <header>
      <div>
        <span>SPHERE Analysis</span>
        <h3>{title}</h3>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close analysis">×</button>
    </header>
    <div className="rundeckWorkspaceDrawerBody">{children}</div>
    {actions && <footer>{actions}</footer>}
  </aside>
}
