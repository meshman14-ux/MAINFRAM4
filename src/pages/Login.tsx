import { useState } from 'react';
import type { AuthState } from '../data/useAccess';

export default function Login({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === 'signin') {
      await auth.signIn(email.trim(), password);
    } else {
      const r = await auth.resetPassword(email.trim());
      if (!r.error) setSent(true);
    }
    setBusy(false);
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

        {mode === 'signin' ? (
          <>
            <h1 className="auth-h">Sign in</h1>
            <p className="auth-sub">Operators, crew and clients sign in here.</p>
          </>
        ) : (
          <>
            <h1 className="auth-h">Reset password</h1>
            <p className="auth-sub">We'll email you a link to set a new one.</p>
          </>
        )}

        {auth.error && <div className="auth-error">{auth.error}</div>}
        {sent && mode === 'forgot' && (
          <div className="auth-error" style={{ color: 'var(--green)', borderColor: 'color-mix(in oklab, var(--green) 40%, var(--panel-line))', background: 'color-mix(in oklab, var(--green) 8%, var(--panel))' }}>
            If that address has an account, a reset link is on its way. Check your inbox.
          </div>
        )}

        <form onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode === 'signin' && (
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <button className="auth-btn" type="submit" disabled={busy || !email || (mode === 'signin' && !password)}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
        </form>

        <p className="auth-note">
          {mode === 'signin' ? (
            <>
              <button className="auth-link" onClick={() => { setMode('forgot'); setSent(false); }}>Forgot password?</button>
              {' · '}No account? Ask your operator to invite you.
            </>
          ) : (
            <button className="auth-link" onClick={() => setMode('signin')}>← Back to sign in</button>
          )}
        </p>
      </div>
    </div>
  );
}
