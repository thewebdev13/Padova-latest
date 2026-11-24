'use client';
import { useEffect, useState } from 'react';
import { PERMISSIONS, EMPLOYEE_PERMISSIONS } from '@/lib/permissions';
import { RecoveryCodes } from './auth-screen';
import { FieldError, FormAlert, ReqMark, formFieldClass } from './form-feedback';
import {
  isEmptyFieldValue,
  requiredFieldMessage,
  type FieldErrorMap,
} from '@/lib/form-field-errors';
type R = Record<string, any>;
export default function UserAdministration() {
  const [state, setState] = useState<R | null>(null),
    [editing, setEditing] = useState<R | null>(null),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({}),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(''),
    [message, setMessage] = useState('');
  const load = async () => {
    const r = await fetch('/api/users', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setState(data);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const post = async (data: R) => {
    const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
      result = await r.json();
    if (!r.ok) throw new Error(result.error);
    return result;
  };
  const issue = async (id: string) => {
    setBusy(true);
    setError('');
    setLink('');
    try {
      const r = await post({ action: 'recovery', id });
      setLink(`${window.location.origin}/w/dashboard#reset=${r.token}`);
      setMessage(
        `Single-use link expires ${new Date(r.expires_at).toLocaleTimeString()}. Copy and deliver privately after verifying the recipient. It is not stored in audit history.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="card-header">
        <h2>Individual users & permissions</h2>
        <button
          className="btn primary"
          onClick={() => {
            setEditing({
              name: '',
              email: '',
              role: 'EMPLOYEE',
              permissions: [...EMPLOYEE_PERMISSIONS],
              active: true,
              reason: '',
            });
            setLink('');
          }}
        >
          Add individual user
        </button>
      </div>
      <div className="section-body">
        <p className="subtitle">
          Owner/Admin has full access. Employee/Worker starts with operational access and customer
          payment entry. Financial visibility and additional actions require explicit grants.
        </p>
        <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
        {link && (
          <div className="note">
            <strong>Private setup / recovery link</strong>
            <p style={{ fontSize: 12, marginTop: 8 }}>{message}</p>
            <input
              aria-label="Private single-use recovery link"
              readOnly
              value={link}
              style={{ width: '100%', marginTop: 12, padding: 9 }}
            />
            <button
              className="btn small"
              style={{ marginTop: 10 }}
              onClick={() => navigator.clipboard.writeText(link)}
            >
              Copy private link
            </button>
            <button className="btn small" style={{ margin: 10 }} onClick={() => setLink('')}>
              Hide link
            </button>
          </div>
        )}
        {editing && (
          <form
            style={{ margin: '22px 0' }}
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setAttempted(true);
              setError('');
              setLink('');
              const next: FieldErrorMap = {};
              if (isEmptyFieldValue(editing.name))
                next.name = requiredFieldMessage('Full name');
              if (isEmptyFieldValue(editing.email))
                next.email = requiredFieldMessage('Individual email');
              else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(editing.email)))
                next.email = 'Enter a valid email address';
              if (Object.keys(next).length) {
                setFieldErrors(next);
                return;
              }
              setFieldErrors({});
              setBusy(true);
              try {
                const user = await post({ action: editing.id ? 'update' : 'create', ...editing });
                setEditing(null);
                setAttempted(false);
                setMessage('User saved. Existing sessions are revoked after access changes.');
                await load();
                if (!editing.id && user.active) await issue(user.id);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <div
                className={formFieldClass('form-field', attempted && !!fieldErrors.name)}
              >
                <label htmlFor="staff-name">
                  Full name
                  <ReqMark />
                </label>
                <input
                  id="staff-name"
                  value={editing.name}
                  onChange={(e) => {
                    setFieldErrors((p) => {
                      const n = { ...p };
                      delete n.name;
                      return n;
                    });
                    setEditing({ ...editing, name: e.target.value });
                  }}
                />
                {attempted ? <FieldError>{fieldErrors.name}</FieldError> : null}
              </div>
              <div
                className={formFieldClass('form-field', attempted && !!fieldErrors.email)}
              >
                <label htmlFor="staff-email">
                  Individual email
                  <ReqMark />
                </label>
                <input
                  id="staff-email"
                  type="email"
                  value={editing.email}
                  onChange={(e) => {
                    setFieldErrors((p) => {
                      const n = { ...p };
                      delete n.email;
                      return n;
                    });
                    setEditing({ ...editing, email: e.target.value });
                  }}
                />
                {attempted ? <FieldError>{fieldErrors.email}</FieldError> : null}
              </div>
              <div className="form-field">
                <label htmlFor="staff-role">Role</label>
                <select
                  id="staff-role"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      role: e.target.value,
                      permissions:
                        e.target.value === 'EMPLOYEE'
                          ? [...EMPLOYEE_PERMISSIONS]
                          : editing.permissions,
                    })
                  }
                >
                  <option value="OWNER">Owner / Admin, full access</option>
                  <option value="EMPLOYEE">Employee / Worker, explicit permissions</option>
                </select>
              </div>
              <div className="form-field">
                <label>
                  <input
                    type="checkbox"
                    style={{ width: 16, marginRight: 8 }}
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  Active account
                </label>
                <small>
                  Deactivation preserves history and immediately revokes sessions and recovery
                  links.
                </small>
              </div>
            </div>
            <fieldset
              style={{
                border: '1px solid #e1e8e2',
                borderRadius: 6,
                padding: 15,
                margin: '18px 0',
              }}
            >
              <legend>Individually allowed permissions</legend>
              <div className="permission-grid">
                {Object.entries(PERMISSIONS).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={editing.role === 'OWNER'}
                      checked={editing.role === 'OWNER' || editing.permissions.includes(key)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          permissions: e.target.checked
                            ? [...editing.permissions, key]
                            : editing.permissions.filter((p: string) => p !== key),
                        })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {editing.id && (
              <div className="form-field">
                <label htmlFor="staff-reason">Reason for access change</label>
                <input
                  id="staff-reason"
                  required
                  minLength={3}
                  value={editing.reason ?? ''}
                  onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn primary" disabled={busy}>
                Save user & permissions
              </button>
              <button className="btn" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {!state ? (
          <p className="subtitle">Loading accounts…</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Individual</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.users.map((u: R) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>{u.role === 'OWNER' ? 'Owner / Admin' : 'Employee / Worker'}</td>
                      <td>{u.active ? 'Active' : 'Deactivated'}</td>
                      <td>
                        {u.role === 'OWNER'
                          ? 'Full system access'
                          : `${u.permissions.length} explicit grants`}
                      </td>
                      <td>
                        <button
                          className="btn small"
                          disabled={busy}
                          onClick={() => {
                            setEditing({ ...u, reason: '' });
                            setLink('');
                          }}
                        >
                          Edit access / deactivate
                        </button>
                        {u.active && (
                          <button
                            className="btn small"
                            disabled={busy}
                            onClick={() => issue(u.id)}
                            style={{ margin: 5 }}
                          >
                            Issue setup / reset link
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 style={{ margin: '25px 0 10px' }}>Pending recovery requests</h3>
            {state.recoveryRequests.length ? (
              state.recoveryRequests.map((r: R) => (
                <div className="note" key={r.id}>
                  {r.name} · {r.email} · {new Date(r.requested_at).toLocaleString()}
                  <button
                    className="btn small"
                    disabled={busy}
                    style={{ marginLeft: 12 }}
                    onClick={() => issue(r.staff_id)}
                  >
                    Verify identity & issue link
                  </button>
                </div>
              ))
            ) : (
              <p className="subtitle">No pending requests.</p>
            )}
            <h3 style={{ margin: '25px 0 10px' }}>Security & user administration history</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actual actor</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {state.audit.map((a: R) => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                      <td>{a.actor_name}</td>
                      <td>{a.action.replaceAll('_', ' ')}</td>
                      <td>
                        <details>
                          <summary>View changes</summary>
                          <pre style={{ maxWidth: 450, whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(
                              { before: a.before_value, after: a.after_value },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
export function PasswordChange() {
  const [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({}),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false);
  const clear = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  return (
    <section className="card">
      <div className="card-header">
        <h2>Your password</h2>
      </div>
      <form
        className="section-body"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setAttempted(true);
          setError('');
          const f = new FormData(e.currentTarget);
          const current = String(f.get('current') ?? '');
          const password = String(f.get('password') ?? '');
          const confirm = String(f.get('confirm') ?? '');
          const next: FieldErrorMap = {};
          if (isEmptyFieldValue(current))
            next.current = requiredFieldMessage('Current password');
          if (isEmptyFieldValue(password))
            next.password = requiredFieldMessage('New password');
          else if (password.length < 14) next.password = 'Use at least 14 characters';
          if (isEmptyFieldValue(confirm))
            next.confirm = requiredFieldMessage('Confirm new password');
          else if (password !== confirm) next.confirm = 'Passwords do not match';
          if (Object.keys(next).length) {
            setFieldErrors(next);
            return;
          }
          setFieldErrors({});
          setBusy(true);
          try {
            const r = await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'change_password',
                current_password: current,
                password,
              }),
            });
            if (!r.ok) throw new Error((await r.json()).error);
            window.location.assign('/');
          } catch (err) {
            const msg = (err as Error).message || 'Unable to change password';
            if (/current|incorrect|invalid/i.test(msg))
              setFieldErrors({ current: msg });
            else setError(msg);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <div className={formFieldClass('form-field', attempted && !!fieldErrors.current)}>
            <label htmlFor="current-pw">
              Current password
              <ReqMark />
            </label>
            <input
              id="current-pw"
              name="current"
              type="password"
              autoComplete="current-password"
              maxLength={500}
              onChange={() => clear('current')}
            />
            {attempted ? <FieldError>{fieldErrors.current}</FieldError> : null}
          </div>
          <div className={formFieldClass('form-field', attempted && !!fieldErrors.password)}>
            <label htmlFor="new-pw">
              New password (14+ characters)
              <ReqMark />
            </label>
            <input
              id="new-pw"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={500}
              onChange={() => clear('password')}
            />
            {attempted ? <FieldError>{fieldErrors.password}</FieldError> : null}
          </div>
          <div className={formFieldClass('form-field', attempted && !!fieldErrors.confirm)}>
            <label htmlFor="confirm-pw">
              Confirm new password
              <ReqMark />
            </label>
            <input
              id="confirm-pw"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={500}
              onChange={() => clear('confirm')}
            />
            {attempted ? <FieldError>{fieldErrors.confirm}</FieldError> : null}
          </div>
        </div>
        <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
        <button className="btn primary" disabled={busy} style={{ marginTop: 16 }}>
          Change password & sign out all sessions
        </button>
      </form>
    </section>
  );
}

export function PersonalRecoveryCodes() {
  const [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <div className="card-header">
        <h2>Your personal recovery codes</h2>
      </div>
      <form
        className="section-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            const r = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'recovery_codes',
                  current_password: f.get('password'),
                }),
              }),
              data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setCodes(data.recovery_codes);
            form.reset();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="subtitle">
          Your codes recover only your own account. Replacing them invalidates prior codes and
          outstanding reset links. Verify your current password to continue.
        </p>
        <div className="form-field" style={{ marginTop: 15 }}>
          <label htmlFor="recovery-current-password">Current password</label>
          <input
            id="recovery-current-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={500}
          />
        </div>
        <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
        <button className="btn" disabled={busy} style={{ marginTop: 15 }}>
          Generate / replace my recovery codes
        </button>
        {codes.length > 0 && (
          <>
            <RecoveryCodes codes={codes} />
            <button className="btn small" type="button" onClick={() => setCodes([])}>
              I saved my codes, hide them
            </button>
          </>
        )}
      </form>
    </section>
  );
}
