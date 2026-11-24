'use client';
import { useState } from 'react';
import { PARTY_ROLES, parseList } from '@/lib/entry-options';

export default function RolesInput({
  value,
  onChange,
  lockedRoles = [],
  omitRoles = [],
  heading,
  help,
  showLockedChips = true,
}: {
  value: unknown;
  onChange: (roles: string[]) => void;
  /** Always kept selected; user cannot turn these off here. */
  lockedRoles?: string[];
  /** Hide from the chip row (e.g. supplier already shown above). */
  omitRoles?: string[];
  heading?: string;
  help?: string;
  /** When false, locked roles stay in data but are not rendered again. */
  showLockedChips?: boolean;
}) {
  const [custom, setCustom] = useState('');
  const selected = parseList(value);
  const locked = lockedRoles.map((r) => r.toLowerCase());
  const omit = new Set([...omitRoles, ...locked].map((r) => r.toLowerCase()));
  const choices = [...new Set([...PARTY_ROLES, ...selected])].filter(
    (role) => !omit.has(String(role).toLowerCase()),
  );

  const setRoles = (next: string[]) => {
    const merged = [
      ...locked,
      ...next
        .map((r) => String(r).trim().toLowerCase())
        .filter((r) => r && !locked.includes(r)),
    ];
    onChange([...new Set(merged)]);
  };

  return (
    <div className="roles-input">
      {showLockedChips && locked.length > 0 && (
        <div className="roles-locked" aria-label="Fixed roles">
          {locked.map((role) => (
            <span key={role} className="role-choice selected role-locked">
              {role.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          ))}
          <small>Fixed for this contact type</small>
        </div>
      )}
      {heading ? <p className="roles-subhead">{heading}</p> : null}
      <div className="role-choices" role="group" aria-label={heading || 'Roles'}>
        {choices.map((role) => {
          const on = selected.map((r) => r.toLowerCase()).includes(String(role).toLowerCase());
          return (
            <button
              key={role}
              type="button"
              className={`btn small role-choice ${on ? 'selected' : ''}`}
              aria-pressed={on}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRoles(on ? selected.filter((r) => r.toLowerCase() !== role.toLowerCase()) : [...selected, role]);
              }}
            >
              {role.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          );
        })}
      </div>
      <details className="optional-section">
        <summary>+ Other role</summary>
        <div className="inline-entry">
          <input
            aria-label="Other role"
            placeholder="Other role (optional)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button
            type="button"
            className="btn small"
            disabled={!custom.trim()}
            onClick={() => {
              setRoles(parseList([...selected, ...parseList(custom)]));
              setCustom('');
            }}
          >
            Add role
          </button>
        </div>
      </details>
      {help ? <small>{help}</small> : null}
    </div>
  );
}
