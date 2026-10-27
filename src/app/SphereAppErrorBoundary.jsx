import React from 'react'

// Render failures must be visible to operators, not a silent empty app shell.
// This boundary does not disguise failed SAP availability or collector readings.
export default class SphereAppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('SPHERE frontend render error', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main role="alert" aria-live="assertive" style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#10151c', color: '#e9edf2', padding: 24,
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      }}>
        <section style={{ maxWidth: 480, width: '100%', padding: 28,
          background: '#1b242e', border: '1px solid #33404e', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#9baabb', letterSpacing: '.06em' }}>SPHERE · SYSTEM MESSAGE</div>
          <h1 style={{ fontSize: 22, lineHeight: 1.35, margin: '12px 0' }}>Dashboard could not be displayed</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#b5c0cc' }}>
            The SPHERE interface encountered an error. This message does not indicate SAP system downtime.
            Reload the page to retry. If it continues, ask the SPHERE administrator to inspect the browser console.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{
            marginTop: 12, padding: '10px 16px', background: '#294763',
            color: '#e9edf2', border: '1px solid #567a98', borderRadius: 5,
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>Reload dashboard</button>
        </section>
      </main>
    )
  }
}
