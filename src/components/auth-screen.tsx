'use client';
import { useEffect, useState } from 'react';
export default function AuthScreen({
  onLogin,
  synthetic = false,
}: {
  onLogin: () => Promise<void>;
  synthetic?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'request' | 'reset' | 'code'>('login'),
    [token, setToken] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.hash.slice(1)).get('reset');
      if (value) {
        setToken(value);
        setMode('reset');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  if (codes.length)
    return (
      <div className="login">
        <div className="login-card">
          {synthetic && (
            <strong className="test-dialog-label">TEST / SYNTHETIC — PRACTICE ONLY</strong>
          )}
          <RecoveryCodes codes={codes} />
          <button
            className="btn primary"
            onClick={() => {
              setCodes([]);
              setMode('login');
            }}
          >
            I saved my codes — continue to sign in
          </button>
        </div>
      </div>
    );
  return (
    <div className="login">
      <div className="login-card">
        {synthetic && (
          <strong className="test-dialog-label">TEST / SYNTHETIC — PRACTICE ONLY</strong>
        )}
        <div className="eyebrow">PADOVA TRAVEL · INDIVIDUAL ACCESS</div>
        <h1>
          {mode === 'login'
            ? 'Welcome back.'
            : mode === 'request'
              ? 'Recover your account.'
              : 'Set your password.'}
        </h1>
        <p className="subtitle">
          {mode === 'login'
            ? 'Use your own staff email and password.'
            : mode === 'request'
              ? 'Request a single-use recovery link from your Owner.'
              : 'Use a single-use link or your own personal recovery code. Old sessions will be revoked.'}
        </p>
        <form
          key={mode}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setMessage('');
            const f = new FormData(e.currentTarget);
            try {
              if ((mode === 'reset' || mode === 'code') && f.get('password') !== f.get('confirm'))
                throw new Error('Passwords do not match');
              const endpoint = mode === 'login' ? '/api/auth' : '/api/auth/recovery';
              const data =
                mode === 'login'
                  ? { email: f.get('email'), password: f.get('password') }
                  : mode === 'request'
                    ? { action: 'request', email: f.get('email') }
                    : mode === 'code'
                      ? {
                          action: 'backup_code',
                          email: f.get('email'),
                          code: f.get('code'),
                          password: f.get('password'),
                        }
                      : { action: 'reset', token, password: f.get('password') };
              const r = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                }),
                result = await r.json();
              if (!r.ok) throw new Error(result.error);
              if (mode === 'login') await onLogin();
              else if (mode === 'request') setMessage(result.message);
              else {
                setToken('');
                setCodes(result.recovery_codes ?? []);
                setMode('login');
                setMessage(
                  'Password saved. All previous sessions have been signed out. Sign in with your new password.',
                );
              }
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode !== 'reset' && (
            <div className="form-field">
              <label htmlFor="email">Individual staff email</label>
              <input id="email" name="email" type="email" required autoComplete="username" />
            </div>
          )}
          {mode === 'code' && (
            <div className="form-field">
              <label htmlFor="recovery-code">Personal single-use recovery code</label>
              <input
                id="recovery-code"
                name="code"
                type="password"
                required
                maxLength={80}
                autoComplete="off"
              />
            </div>
          )}
          {mode !== 'request' && (
            <div className="form-field">
              <label htmlFor="password">
                {mode === 'reset' || mode === 'code' ? 'New password' : 'Password'}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === 'reset' || mode === 'code' ? 14 : undefined}
                maxLength={500}
                autoComplete={
                  mode === 'reset' || mode === 'code' ? 'new-password' : 'current-password'
                }
              />
              {(mode === 'reset' || mode === 'code') && <small>Use at least 14 characters.</small>}
            </div>
          )}
          {(mode === 'reset' || mode === 'code') && (
            <div className="form-field">
              <label htmlFor="confirm">Confirm new password</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={14}
                maxLength={500}
                autoComplete="new-password"
              />
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="note" role="status">
              {message}
            </div>
          )}
          <button className="btn primary" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'request'
                  ? 'Request recovery'
                  : 'Save new password'}
          </button>
        </form>
        <button
          className="btn ghost"
          style={{ marginTop: 18 }}
          onClick={() => {
            setMode(mode === 'login' ? 'request' : 'login');
            setError('');
            setMessage('');
          }}
        >
          {mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}
        </button>
        {(mode === 'request' || mode === 'login') && (
          <button
            className="btn ghost"
            style={{ marginTop: 10 }}
            onClick={() => {
              setMode('code');
              setError('');
              setMessage('');
            }}
          >
            Use a personal recovery code
          </button>
        )}
        <p className="subtitle">
          No shared Padova login. Your Owner provisions your individual account. Recovery links must
          be delivered through a verified private channel.
        </p>
      </div>
    </div>
  );
}

export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="note">
      <h2>Save your personal recovery codes</h2>
      <p className="subtitle">
        Store these in your password manager or a protected offline location. Each code works once
        for your individual account, including when no Owner is signed in. These replace your
        previous codes and are shown only now.
      </p>
      <textarea
        aria-label="Your private personal recovery codes"
        readOnly
        rows={8}
        value={codes.join('\n')}
        style={{ width: '100%', fontFamily: 'monospace', padding: 12, margin: '15px 0' }}
      />
      <button
        className="btn small"
        type="button"
        onClick={() => navigator.clipboard.writeText(codes.join('\n'))}
      >
        Copy my private recovery codes
      </button>
    </div>
  );
}
