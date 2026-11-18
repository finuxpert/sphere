import { useEffect, useState } from 'react'
import JumpHostWorkspace from './JumpHostWorkspace.jsx'

const API_BASE = `${import.meta.env.BASE_URL}api/v1/auth`

async function authRequest(path, method = 'GET', payload = null, csrfToken = '') {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-Jumphost-CSRF': csrfToken } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  let body = null
  try { body = await response.json() } catch { /* error responses may not include JSON */ }
  if (!response.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `HTTP ${response.status}`)
  }
  return body
}

function AuthForm({ isRotating, session, onLogin, onChangePassword, busy, error }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (isRotating) {
      if (newPassword !== confirm) return
      await onChangePassword(password, newPassword)
    } else {
      await onLogin(username, password)
      setPassword('')
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><div className="brand-mark">S</div><div><strong>SPHERE</strong><span>Remote · Admin Access</span></div></div>
        <span className="eyebrow">RESTRICTED ACCESS</span>
        <h1>{isRotating ? 'Ubah Password Awal' : 'Admin Login'}</h1>
        <p>{isRotating
          ? `Akun ${session?.username} masih memakai password bootstrap DEV. Wajib diganti sebelum fitur remote dapat digunakan.`
          : 'Masuk untuk mengakses workspace SSH Terminal dan Internal Browser.'}</p>
        <form onSubmit={submit}>
          {!isRotating && (
            <label className="field" htmlFor="admin-username"><span>Username</span><input id="admin-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={64} /></label>
          )}
          <label className="field" htmlFor="admin-password"><span>{isRotating ? 'Password Saat Ini' : 'Password'}</span><input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRotating ? 'current-password' : 'current-password'} required maxLength={256} /></label>
          {isRotating && <>
            <label className="field" htmlFor="admin-new-password"><span>Password Baru (min. 12 karakter, huruf & angka)</span><input id="admin-new-password" type="password" minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
            <label className="field" htmlFor="admin-confirm-password"><span>Konfirmasi Password Baru</span><input id="admin-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
            {newPassword !== confirm && confirm && <p className="auth-error" role="alert">Konfirmasi password tidak sama.</p>}
          </>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="connect" type="submit" disabled={busy || (isRotating && newPassword !== confirm)}>{busy ? 'Memproses…' : isRotating ? 'Simpan & Login Ulang' : 'Login'} <span aria-hidden="true">→</span></button>
        </form>
        <p className="auth-footnote">DEV bootstrap harus diaktifkan secara eksplisit. Tidak ada password default untuk PROD.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    authRequest('/me').then((data) => { if (live) setSession(data) })
      .catch(() => { if (live) setSession(null) })
      .finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [])

  async function login(username, password) {
    setBusy(true); setError('')
    try { setSession(await authRequest('/login', 'POST', { username, password })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function rotate(currentPassword, newPassword) {
    setBusy(true); setError('')
    try {
      await authRequest('/change-password', 'POST', { current_password: currentPassword, new_password: newPassword }, session.csrf_token)
      setSession(null)
      setError('Password berhasil diubah. Login kembali menggunakan password baru.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true); setError('')
    try { await authRequest('/logout', 'POST', null, session.csrf_token) }
    catch (err) { setError(err.message) }
    finally { setSession(null); setBusy(false) }
  }

  if (checking) return <div className="auth-shell"><div className="auth-panel" role="status">Memeriksa sesi administrator…</div></div>
  if (!session || session.must_change_password) return <AuthForm isRotating={Boolean(session?.must_change_password)} session={session} onLogin={login} onChangePassword={rotate} busy={busy} error={error} />
  return <div className="authenticated-app"><div className="auth-toolbar"><span>Authenticated: <strong>{session.username}</strong></span><button type="button" onClick={logout} disabled={busy}>Logout</button></div><JumpHostWorkspace /></div>
}
