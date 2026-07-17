import { useState } from 'react';
import type { AuthState } from '../data/useAccess';

/** Shown when the user arrives via a password-reset email link. */
export default function SetNewPassword({ auth }: { auth: AuthState }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2 || pw.length < 8) return;
    setBusy(true);
    const r = await auth.updatePassword(pw);
    setBusy(false);
    if (!r.error) setDone(true);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-badge">M_</div>
          <div>
            <div className="brand-name">MAINFRAME</div>
            <div className="brand-sub">FESTIVAL OPERATIONS SYSTEM</div>
          </div>
        </div>

        <h1 className="auth-h">Set a new password</h1>
        <p className="auth-sub">You're signed in via a reset link{auth.email ? ` as ${auth.email}` : ''}. Choose a new password.</p>

        {auth.error && <div className="auth-error">{auth.error}</div>}
        {done ? (
          <div>
            <div className="auth-error" style={{ color: 'var(--green)', borderColor: 'color-mix(in oklab, var(--green) 40%, var(--panel-line))', background: 'color-mix(in oklab, var(--green) 8%, var(--panel))' }}>
              Password updated. You're signed in.
            </div>
            <button className="auth-btn" onClick={() => window.location.reload()}>Continue to MAINFRAME</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="auth-field">
              <label htmlFor="pw">New password (min 8 characters)</label>
              <input id="pw" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="auth-field">
              <label htmlFor="pw2">Confirm password</label>
              <input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            {mismatch && <div className="auth-error">Passwords don't match.</div>}
            <button className="auth-btn" type="submit" disabled={busy || pw.length < 8 || pw !== pw2}>
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
