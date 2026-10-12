import React from 'react'
import { createPortal } from 'react-dom'
import './RundeckWorkspaceDrawer.css'

export default function RundeckWorkspaceDrawer({ title, subtitle = '', onClose, onBack = null, backLabel = 'Back', children, actions = null, navigation = null, size = 'default', presentation = 'modal' }) {
  const drawerRef = React.useRef(null)
  const portalRef = React.useRef(null)
  const isModal = true // All analysis overlays now share one accessible modal/focus contract.

  React.useLayoutEffect(() => {
    // Use the visible viewport, not an expanded mobile layout viewport.
    const updateViewport = () => {
      const root = portalRef.current
      if (!root) return
      const vp = window.visualViewport
      const width = vp?.width || document.documentElement.clientWidth
      const height = vp?.height || document.documentElement.clientHeight
      if (!(width > 0 && height > 0)) return
      root.style.setProperty('--sphere-dialog-viewport-x', `${vp?.offsetLeft || 0}px`)
      root.style.setProperty('--sphere-dialog-viewport-y', `${vp?.offsetTop || 0}px`)
      root.style.setProperty('--sphere-dialog-viewport-w', `${width}px`)
      root.style.setProperty('--sphere-dialog-viewport-h', `${height}px`)
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

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

    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector('.rundeckWorkspaceClose')?.focus({ preventScroll: true }))

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
      previousFocus?.focus?.({ preventScroll: true })
    }
  }, [isModal])

  return createPortal(<div ref={portalRef} className="rundeckWorkspacePortal">
    {isModal && <div className="rundeckWorkspaceModalBackdrop" aria-hidden="true" onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }} />}
    <aside ref={drawerRef} className={`rundeckWorkspaceDrawer is-${size}${presentation === 'workspace' ? ' is-workspace' : ''}`} role="dialog" aria-modal={isModal} aria-label={title}>
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
      {navigation && <div className="rundeckWorkspaceDrawerNavigation">{navigation}</div>}
      <div className="rundeckWorkspaceDrawerBody">{children}</div>
      {actions && <footer>{actions}</footer>}
    </aside>
  </div>, document.body)
}
