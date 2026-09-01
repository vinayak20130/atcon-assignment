'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type SessionUser, ApiError, api, storeSession } from '@/lib/api';

const DEMO = [
  { email: 'alex@northwind.test', role: 'Recruiter' },
  { email: 'sam@northwind.test', role: 'Recruiter' },
  { email: 'jun@northwind.test', role: 'Interviewer' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('alex@northwind.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<{ accessToken: string; user: SessionUser }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      storeSession(session.accessToken, session.user);
      router.push('/jobs');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-shell" style={{ maxWidth: 380, paddingTop: 88 }}>
      <div className="masthead">
        <div className="eyebrow">Northwind Labs</div>
        <h1>Sign in</h1>
      </div>

      {error && (
        <div className="notice" data-tone="error">
          {error}
        </div>
      )}

      <form onSubmit={signIn}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn" data-variant="primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="card card-tight" style={{ marginTop: 26 }}>
        <div className="eyebrow">Demo accounts · Password123!</div>
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {DEMO.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => setEmail(account.email)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              <span className="mono" style={{ color: 'var(--accent)' }}>
                {account.email.split('@')[0]}
              </span>
              <span style={{ color: 'var(--ink-faint)' }}> — {account.role}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', margin: '10px 0 0' }}>
          Sign in as alex then sam to see that access is scoped per requisition, not org-wide.
        </p>
      </div>
    </div>
  );
}
