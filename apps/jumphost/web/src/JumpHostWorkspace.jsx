import { useEffect, useRef, useState } from 'react'

const API = import.meta.env.BASE_URL + 'api/v1/browser'
const EMPTY_SSH = { host: '', port: '22', username: '' }
const KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

async function apiRequest(path, method = 'GET', body = null, csrf = '', binary = false) {
  const res = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(csrf ? { 'X-Jumphost-CSRF': csrf } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    let detail = 'HTTP ' + res.status
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  if (binary) return res.blob()
  if (res.status === 204) return null
  return res.json()
}

function Field({ label, id, ...props }) {
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} {...props} /></label>
}

function TerminalPlaceholder() {
  return (
    <div className="stage terminal" aria-label="Pratinjau terminal tanpa sesi aktif">
      <div className="stage-title"><span className="led neutral" /> Terminal · belum terhubung <span className="stage-tag">STANDBY</span></div>
      <pre>{'SPHERE REMOTE v0.3\nSSH_ENGINE=NOT_IMPLEMENTED\nSESSION=NOT_STARTED\n\nWeb SSH masih dinonaktifkan.\nHanya Browser DEV yang tersedia setelah persetujuan keamanan.'}</pre>
    </div>
  )
}

function BrowserView({ browserSession, frame, browserUrl, onClick, onKeyDown, onWheel }) {
  return (
    <div className="stage browser-stage" aria-label="Remote browser view">
      <div className="browser-chrome">
        <span aria-hidden="true">◎</span>
        <span className="browser-address">{browserUrl || 'https://alamat-internal.example/'}</span>
      </div>
      {browserSession ? (
        <div className="remote-screen" role="application" tabIndex={0}
          aria-label="Remote Chromium — klik untuk fokus, kemudian ketik"
          onKeyDown={onKeyDown} onWheel={onWheel}>
          {frame
            ? <img src={frame} alt="Tampilan Chromium di server SPHERE" draggable={false} onClick={onClick} />
            : <p className="browser-pending">Mengambil tampilan Chromium…</p>}
        </div>
      ) : (
        <div className="browser-empty">
          <div className="browser-illustration" aria-hidden="true">◎</div>
          <strong>Remote Browser belum aktif</strong>
          <p>Masukkan target HTTPS yang sudah diizinkan. Sesi hanya dapat dibuka jika worker DEV dan security gate diaktifkan.</p>
        </div>
      )}
    </div>
  )
}

export default function JumpHostWorkspace({ session }) {
  const [mode, setMode] = useState('ssh')
  const [ssh, setSsh] = useState(EMPTY_SSH)
  const [browserUrl, setBrowserUrl] = useState('')
  const [browserSession, setBrowserSession] = useState(null)
  const [frame, setFrame] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const imageRef = useRef(null)
  const csrf = session?.csrf_token || ''

  useEffect(() => {
    if (!browserSession || mode !== 'browser') return undefined
    let live = true
    let inFlight = false
    const fetchFrame = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const blob = await apiRequest('/sessions/' + encodeURIComponent(browserSession.session_id) + '/frame',
          'GET', null, '', true)
        if (!live) return
        const next = URL.createObjectURL(blob)
        if (imageRef.current) URL.revokeObjectURL(imageRef.current)
        imageRef.current = next
        setFrame(next)
      } catch (err) {
        if (live) setError('Frame browser: ' + err.message)
      } finally {
        inFlight = false
      }
    }
    fetchFrame()
    const timer = setInterval(fetchFrame, 1200)
    return () => { live = false; clearInterval(timer) }
  }, [browserSession, mode])

  useEffect(() => () => {
    if (imageRef.current) URL.revokeObjectURL(imageRef.current)
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (mode !== 'browser') {
      setNotice('Web SSH masih nonaktif. Tidak ada koneksi SSH yang dibuat.')
      return
    }
    if (browserSession) return
    setBusy(true)
    try {
      const created = await apiRequest('/sessions', 'POST', { url: browserUrl }, csrf)
      setBrowserSession(created)
      setNotice('Sesi Chromium berjalan. Klik layar browser untuk mengendalikan mouse dan keyboard.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function startDemo() {
    if (browserSession || mode !== 'browser') return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await apiRequest('/demo', 'POST', null, csrf)
      setBrowserSession({ ...created, demo: true })
      setNotice('Demo Chromium aktif. Klik input di layar lalu ketik, atau klik tombol. Halaman ini tidak mengakses DPA.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function action(payload) {
    if (!browserSession) return
    try {
      await apiRequest('/sessions/' + encodeURIComponent(browserSession.session_id) + '/actions',
        'POST', payload, csrf)
    } catch (err) { setError(err.message) }
  }

  function handleClick(e) {
    e.currentTarget.parentElement.focus()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1279, Math.floor((e.clientX - rect.left) * 1280 / rect.width)))
    const y = Math.max(0, Math.min(719, Math.floor((e.clientY - rect.top) * 720 / rect.height)))
    action({ type: 'click', x, y })
  }

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key.length === 1) {
      e.preventDefault()
      action({ type: 'text', text: e.key })
    } else if (KEYS.has(e.key)) {
      e.preventDefault()
      action({ type: 'key', key: e.key })
    }
  }

  function handleWheel(e) {
    action({ type: 'scroll', delta_y: Math.max(-1000, Math.min(1000, Math.round(e.deltaY))) })
  }

  async function closeBrowser() {
    if (!browserSession) return
    setBusy(true)
    setError('')
    try {
      await apiRequest('/sessions/' + encodeURIComponent(browserSession.session_id),
        'DELETE', null, csrf)
      setBrowserSession(null)
      setFrame(null)
      if (imageRef.current) URL.revokeObjectURL(imageRef.current)
      imageRef.current = null
      setNotice('Sesi Chromium ditutup.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SPHERE</strong><span>Remote Access Portal</span></div></div>
        <div className="top-actions"><span className="status-pill"><span className="led neutral" /> {browserSession ? 'CHROMIUM SESSION' : 'GATED DEV'}</span></div>
      </header>
      <main className="workspace">
        <div className="intro">
          <div><span className="eyebrow">ACCESS WORKSPACE / V0.3 DEV</span><h1>SPHERE Remote</h1>
            <p>Browser internal menggunakan Chromium terisolasi di jaringan SPHERE. Web SSH belum tersedia.</p></div>
          <span className="environment">DEV ONLY</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Tipe koneksi">
          <button role="tab" aria-selected={mode === 'ssh'} className={mode === 'ssh' ? 'tab active' : 'tab'} onClick={() => setMode('ssh')}> &gt;_ SSH Terminal</button>
          <button role="tab" aria-selected={mode === 'browser'} className={mode === 'browser' ? 'tab active' : 'tab'} onClick={() => setMode('browser')}> ◎ Internal Browser</button>
        </div>
        <div className="content">
          <section className="connection-panel">
            <div className="panel-heading"><h2>{mode === 'ssh' ? 'SSH Connection' : 'Browser Connection'}</h2>
              <p>{mode === 'ssh' ? 'Belum tersedia di v0.3' : 'Hanya origin HTTPS yang diizinkan oleh server'}</p></div>
            <form onSubmit={submit}>
              {mode === 'ssh' ? <>
                <Field label="IP Address / Hostname" id="ssh-host" value={ssh.host} onChange={e => setSsh(s => ({ ...s, host: e.target.value }))} required />
                <div className="two-cols">
                  <Field label="Port" id="ssh-port" type="number" value={ssh.port} min="1" max="65535" onChange={e => setSsh(s => ({ ...s, port: e.target.value }))} required />
                  <Field label="Username" id="ssh-user" value={ssh.username} onChange={e => setSsh(s => ({ ...s, username: e.target.value }))} required />
                </div>
              </> : <Field label="Website Address" id="browser-url" type="url"
                placeholder="https://10.x.x.x:port" value={browserUrl}
                onChange={e => setBrowserUrl(e.target.value)} disabled={Boolean(browserSession)}
                required maxLength={2048} />}
              {mode === 'browser' && browserSession
                ? <button type="button" className="connect" disabled={busy} onClick={closeBrowser}>Tutup Browser Session</button>
                : <button className="connect" type="submit" disabled={busy}>{busy ? 'Menghubungkan…' : mode === 'ssh' ? 'Preview SSH Request' : 'Open Remote Browser'}</button>}
            </form>
            {mode === 'browser' && !browserSession &&
              <button className="connect demo-button" type="button" disabled={busy} onClick={startDemo}>Coba Demo Browser (Offline)</button>}
            {notice && <p className="notice" role="status">{notice}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <div className="safety-note"><strong>Security gate</strong>
              <p>Browser hanya berfungsi setelah disetujui dan diaktifkan di DEV. Download dinonaktifkan; satu target internal dan satu sesi aktif.</p></div>
          </section>
          <section className="preview-panel">
            <div className="preview-head"><div><span className="eyebrow">SESSION VIEW</span><h2>{mode === 'ssh' ? 'Terminal Preview' : 'Remote Browser'}</h2></div>
              <span className="ready-tag">{mode === 'browser' && browserSession ? 'ACTIVE' : 'INACTIVE'}</span></div>
            {mode === 'ssh' ? <TerminalPlaceholder /> : <BrowserView browserSession={browserSession} frame={frame}
              browserUrl={browserSession?.demo ? 'SPHERE Offline Demo — tanpa akses jaringan' : browserUrl} onClick={handleClick} onKeyDown={handleKeyDown} onWheel={handleWheel} />}
            <div className="preview-foot"><span>Isolated worker · HTTPS through SPHERE</span>
              <span>{mode === 'browser' ? 'Chromium sandbox · screenshot polling' : 'SSH disabled'}</span></div>
          </section>
        </div>
        <footer>SPHERE Remote DEV · Monitoring and PROD not modified</footer>
      </main>
    </div>
  )
}
