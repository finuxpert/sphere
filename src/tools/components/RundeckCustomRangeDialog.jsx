import React from 'react'
import { createPortal } from 'react-dom'

/** Small modal instead of a floating form that overlaps charts and controls. */
export default function RundeckCustomRangeDialog({
  start, end, error, activeLabel, onStart, onEnd, onApply, onClose,
}) {
  const ref = React.useRef(null)
  const closeRef = React.useRef(onClose)
  closeRef.current = onClose
  const descriptionId = React.useId()

  React.useEffect(() => {
    const focusedBefore = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => ref.current?.querySelector('input')?.focus({ preventScroll: true }), 0)
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !ref.current) return
      const nodes = [...ref.current.querySelectorAll('input:not([disabled]),button:not([disabled])')]
      if (!nodes.length) return
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault(); nodes.at(-1).focus()
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault(); nodes[0].focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      focusedBefore?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="rundeckCustomRangeDialogBackdrop" onMouseDown={event => {
      if (event.currentTarget === event.target) closeRef.current()
    }}>
      <section className="rundeckCustomRangeDialog" role="dialog" aria-modal="true"
        aria-label="Choose custom time range" aria-describedby={descriptionId} ref={ref}>
        <header>
          <div><strong>Custom Time Range</strong><small>Asia/Jakarta · WIB</small></div>
          <button type="button" onClick={onClose} aria-label="Close custom range">×</button>
        </header>
        <p id={descriptionId} className="rundeckCustomRangePending">
          Active: {activeLabel || 'current preset'} · new range not applied
        </p>
        <form onSubmit={onApply}>
          <label>From · WIB<input type="datetime-local" step="60" required
            value={start} onChange={event => onStart(event.target.value)} /></label>
          <label>To · WIB<input type="datetime-local" step="60" required
            value={end} onChange={event => onEnd(event.target.value)} /></label>
          {error && <p role="alert" className="rundeckCustomRangeError">{error}</p>}
          <div className="rundeckCustomRangeDialogActions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Apply range</button>
          </div>
        </form>
        <footer>Only saved observations are shown. A missing sample is not zero or downtime.</footer>
      </section>
    </div>, document.body,
  )
}
