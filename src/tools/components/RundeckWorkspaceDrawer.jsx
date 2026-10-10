import React from 'react'
import './RundeckWorkspaceDrawer.css'

export default function RundeckWorkspaceDrawer({ title, subtitle = '', onClose, onBack = null, backLabel = 'Back', children, actions = null, size = 'default' }) {
  const drawerRef = React.useRef(null)
  const isModal = size === 'system-data'

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  React.useEffect(() => {
    if (!isModal) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector('.rundeckWorkspaceClose')?.focus())

    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', trapFocus)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', trapFocus)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [isModal])

  return <>
    {isModal && <div className="rundeckWorkspaceModalBackdrop" aria-hidden="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }} />}
    <aside ref={drawerRef} className={`rundeckWorkspaceDrawer is-${size}`} role="dialog" aria-modal={isModal} aria-label={title}>
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
  </>
}
