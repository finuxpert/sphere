import { useState } from 'react'

const EMPTY_SSH = { host: '', port: '22', username: '' }
const EMPTY_BROWSER = { url: '' }

function Field({ label, id, ...props }) {
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} {...props} /></label>
}

function TitleIcon({ type }) {
  return <span className="type-icon" aria-hidden="true">{type === 'ssh' ? '>_' : '◎'}</span>
}

function TerminalPlaceholder() {
  return (
    <div className="stage terminal" aria-label="Pratinjau terminal tanpa sesi aktif">
      <div className="stage-title"><span className="led neutral" /> Terminal · belum terhubung <span className="stage-tag">STANDBY</span></div>
      <pre>{`SPHERE REMOTE v0.2.2
SSH_ENGINE=NOT_IMPLEMENTED
SESSION=NOT_STARTED

Isi host dan username untuk menyusun koneksi.
Tidak ada koneksi SSH yang dibuat oleh scaffold ini.`}</pre>
    </div>
  )
}

function BrowserPlaceholder({ url }) {
  return (
    <div className="stage browser-stage" aria-label="Pratinjau browser tanpa sesi aktif">
      <div className="browser-chrome"><span>‹</span><span>›</span><span>↻</span><span className="browser-address">{url || 'https://alamat-internal.example/'}</span></div>
      <div className="browser-empty"><div className="browser-illustration" aria-hidden="true">◎</div><strong>Remote Browser belum berjalan</strong><p>Halaman ini bukan iframe atau browser internal sungguhan. Engine Chromium terisolasi akan dibuat pada tahap berikutnya.</p></div>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState('ssh')
  const [ssh, setSsh] = useState(EMPTY_SSH)
  const [browser, setBrowser] = useState(EMPTY_BROWSER)
  const [notice, setNotice] = useState('')

  function switchMode(next) {
    setMode(next)
    setNotice('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    setNotice('Scaffold saja: sesi belum bisa dibuka. Integrasi autentikasi, RBAC, allowlist, dan gateway belum diaktifkan.')
  }

  return (
    <div className="app">
      <header className="topbar"><div className="brand"><div className="brand-mark">S</div><div><strong>SPHERE</strong><span>Remote Access Portal</span></div></div><div className="top-actions"><span className="status-pill"><span className="led neutral" /> SCAFFOLD · NO CONNECTION</span></div></header>
      <main className="workspace">
        <div className="intro"><div><span className="eyebrow">ACCESS WORKSPACE / V0.1</span><h1>SPHERE Remote</h1><p>SSH terminal dan browser internal melalui jaringan SPHERE — rancangan awal yang terisolasi dari aplikasi monitoring.</p></div><span className="environment">DEV DESIGN</span></div>
        <div className="tabs" role="tablist" aria-label="Tipe koneksi">
          <button role="tab" aria-selected={mode === 'ssh'} className={mode === 'ssh' ? 'tab active' : 'tab'} onClick={() => switchMode('ssh')}><TitleIcon type="ssh" /> SSH Terminal</button>
          <button role="tab" aria-selected={mode === 'browser'} className={mode === 'browser' ? 'tab active' : 'tab'} onClick={() => switchMode('browser')}><TitleIcon type="browser" /> Internal Browser</button>
        </div>
        <div className="content">
          <section className="connection-panel" aria-label="Konfigurasi koneksi">
            <div className="panel-heading"><h2>{mode === 'ssh' ? 'SSH Connection' : 'Browser Connection'}</h2><p>{mode === 'ssh' ? 'Target server di jaringan internal' : 'Alamat aplikasi web yang diizinkan'}</p></div>
            <form onSubmit={handleSubmit}>
              {mode === 'ssh' ? (
                <><Field label="IP Address / Hostname" id="ssh-host" placeholder="10.14.x.x atau AOPH1PAPPDC" value={ssh.host} onChange={event => setSsh(prev => ({ ...prev, host: event.target.value }))} autoComplete="off" required maxLength={253} />
                  <div className="two-cols"><Field label="Port" id="ssh-port" type="number" min="1" max="65535" value={ssh.port} onChange={event => setSsh(prev => ({ ...prev, port: event.target.value }))} required /><Field label="Username" id="ssh-user" placeholder="user" value={ssh.username} onChange={event => setSsh(prev => ({ ...prev, username: event.target.value }))} autoComplete="username" required maxLength={33} /></div></>
              ) : <Field label="Website Address" id="browser-url" type="url" placeholder="https://web-internal.example.local" value={browser.url} onChange={event => setBrowser({ url: event.target.value })} required maxLength={2048} />}
              <button className="connect" type="submit">{mode === 'ssh' ? 'Preview SSH Request' : 'Preview Browser Request'} <span aria-hidden="true">↗</span></button>
            </form>
            {notice && <p className="notice" role="status">{notice}</p>}
            <div className="safety-note"><strong>Security gate</strong><p>Belum ada koneksi jaringan. Target manual kelak wajib melewati SSO/MFA, role access, dan allowlist.</p></div>
          </section>
          <section className="preview-panel" aria-label="Pratinjau sesi">
            <div className="preview-head"><div><span className="eyebrow">SESSION VIEW</span><h2>{mode === 'ssh' ? 'Terminal Preview' : 'Remote Browser Preview'}</h2></div><span className="ready-tag">INACTIVE</span></div>
            {mode === 'ssh' ? <TerminalPlaceholder /> : <BrowserPlaceholder url={browser.url} />}
            <div className="preview-foot"><span>Integrated interface · Separate backend service</span><span>{mode === 'ssh' ? 'xterm.js · planned' : 'Isolated Chromium · planned'}</span></div>
          </section>
        </div>
        <footer>SPHERE Remote / Standalone Scaffold · Does not modify existing monitoring services</footer>
      </main>
    </div>
  )
}
