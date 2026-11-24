'use client';
import { useEffect, useState } from 'react';
import { FieldError, FormAlert, ReqMark, formFieldClass } from './form-feedback';
import {
  isEmptyFieldValue,
  mapErrorMessageToFields,
  requiredFieldMessage,
  type FieldErrorMap,
} from '@/lib/form-field-errors';

export default function AuthScreen({
  onLogin,
}: {
  onLogin: () => Promise<void>;
  /** Kept for callers; login UI no longer shows a synthetic banner. */
  synthetic?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'request' | 'reset' | 'code'>('login'),
    [token, setToken] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({}),
    [attempted, setAttempted] = useState(false),
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
  const clearField = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const resetFeedback = () => {
    setError('');
    setFieldErrors({});
    setAttempted(false);
    setMessage('');
  };
  if (codes.length)
    return (
      <div className="login">
        <div className="login-card">
          <RecoveryCodes codes={codes} />
          <button
            className="btn primary"
            onClick={() => {
              setCodes([]);
              setMode('login');
            }}
          >
            I saved my codes. Continue to sign in
          </button>
        </div>
      </div>
    );
  return (
    <div className="login">
      <div className="login-card">
        <div className="eyebrow">PADOVA TRAVEL · INDIVIDUAL ACCESS</div>
        <h1>
          {mode === 'login'
            ? 'Welcome back.'
            : mode === 'request'
              ? 'Forgot your password?'
              : mode === 'code'
                ? 'Use a recovery code.'
                : 'Set your new password.'}
        </h1>
        <p className="subtitle">
          {mode === 'login'
            ? 'Sign in with your staff email and password.'
            : mode === 'request'
              ? 'Enter your staff email. We will send a single-use reset link if the account exists.'
              : mode === 'code'
                ? 'Enter your email, one unused personal recovery code, and a new password.'
                : 'Choose a new password. Previous sessions will be signed out.'}
        </p>
        <form
          key={mode}
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setAttempted(true);
            setError('');
            setMessage('');
            const f = new FormData(e.currentTarget);
            const email = String(f.get('email') ?? '');
            const password = String(f.get('password') ?? '');
            const confirm = String(f.get('confirm') ?? '');
            const code = String(f.get('code') ?? '');
            const next: FieldErrorMap = {};
            if (mode !== 'reset' && isEmptyFieldValue(email))
              next.email = requiredFieldMessage('Staff email');
            if (mode === 'code' && isEmptyFieldValue(code))
              next.code = requiredFieldMessage('Personal recovery code');
            if (mode !== 'request' && isEmptyFieldValue(password))
              next.password = requiredFieldMessage(
                mode === 'reset' || mode === 'code' ? 'New password' : 'Password',
              );
            else if (
              (mode === 'reset' || mode === 'code') &&
              password &&
              password.length < 14
            )
              next.password = 'Use at least 14 characters';
            if ((mode === 'reset' || mode === 'code') && isEmptyFieldValue(confirm))
              next.confirm = requiredFieldMessage('Confirm new password');
            else if ((mode === 'reset' || mode === 'code') && password !== confirm)
              next.confirm = 'Passwords do not match';
            if (Object.keys(next).length) {
              setFieldErrors(next);
              setBusy(false);
              return;
            }
            setFieldErrors({});
            try {
              const endpoint = mode === 'login' ? '/api/auth' : '/api/auth/recovery';
              const data =
                mode === 'login'
                  ? { email, password }
                  : mode === 'request'
                    ? { action: 'request', email }
                    : mode === 'code'
                      ? {
                          action: 'backup_code',
                          email,
                          code,
                          password,
                        }
                      : { action: 'reset', token, password };
              const r = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                }),
                result = await r.json();
              if (!r.ok) throw new Error(result.error);
              if (mode === 'login') await onLogin();
              else if (mode === 'request') {
                const qaUrl =
                  typeof result.qa_reset_url === 'string' ? result.qa_reset_url.trim() : '';
                setMessage(
                  qaUrl
                    ? `${result.message}\n\nOpen reset link: ${qaUrl}`
                    : result.message,
                );
              }
              else {
                setToken('');
                setCodes(result.recovery_codes ?? []);
                setMode('login');
                setMessage(
                  'Password saved. All previous sessions have been signed out. Sign in with your new password.',
                );
              }
            } catch (err) {
              const msg = (err as Error).message || 'Unable to continue';
              const mapped = mapErrorMessageToFields(msg, [
                'email',
                'password',
                'confirm',
                'code',
              ]);
              if (/password|credential|invalid|incorrect/i.test(msg) && !mapped.fieldErrors.password)
                mapped.fieldErrors.password = msg;
              if (/email|user|account/i.test(msg) && !Object.keys(mapped.fieldErrors).length)
                mapped.fieldErrors.email = msg;
              setFieldErrors(mapped.fieldErrors);
              setError(
                mapped.leftover || (Object.keys(mapped.fieldErrors).length ? '' : msg),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode !== 'reset' && (
            <div className={formFieldClass('form-field', attempted && !!fieldErrors.email)}>
              <label htmlFor="email">
                Staff email
                <ReqMark />
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                onChange={() => clearField('email')}
              />
              {attempted ? <FieldError>{fieldErrors.email}</FieldError> : null}
            </div>
          )}
          {mode === 'code' && (
            <div className={formFieldClass('form-field', attempted && !!fieldErrors.code)}>
              <label htmlFor="recovery-code">
                Personal single-use recovery code
                <ReqMark />
              </label>
              <input
                id="recovery-code"
                name="code"
                type="password"
                maxLength={80}
                autoComplete="off"
                onChange={() => clearField('code')}
              />
              {attempted ? <FieldError>{fieldErrors.code}</FieldError> : null}
            </div>
          )}
          {mode !== 'request' && (
            <div className={formFieldClass('form-field', attempted && !!fieldErrors.password)}>
              <label htmlFor="password">
                {mode === 'reset' || mode === 'code' ? 'New password' : 'Password'}
                <ReqMark />
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={mode === 'reset' || mode === 'code' ? 14 : undefined}
                maxLength={500}
                autoComplete={
                  mode === 'reset' || mode === 'code' ? 'new-password' : 'current-password'
                }
                onChange={() => clearField('password')}
              />
              {(mode === 'reset' || mode === 'code') && !fieldErrors.password && (
                <small>Use at least 14 characters.</small>
              )}
              {attempted ? <FieldError>{fieldErrors.password}</FieldError> : null}
            </div>
          )}
          {(mode === 'reset' || mode === 'code') && (
            <div className={formFieldClass('form-field', attempted && !!fieldErrors.confirm)}>
              <label htmlFor="confirm">
                Confirm new password
                <ReqMark />
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                minLength={14}
                maxLength={500}
                autoComplete="new-password"
                onChange={() => clearField('confirm')}
              />
              {attempted ? <FieldError>{fieldErrors.confirm}</FieldError> : null}
            </div>
          )}
          <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
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
                  ? 'Send reset link'
                  : 'Save new password'}
          </button>
        </form>
        <button
          className="btn ghost"
          style={{ marginTop: 18 }}
          onClick={() => {
            setMode(mode === 'login' ? 'request' : 'login');
            resetFeedback();
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
              resetFeedback();
            }}
          >
            I have a personal recovery code
          </button>
        )}
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
        for your individual account. These replace your previous codes and are shown only now.
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
