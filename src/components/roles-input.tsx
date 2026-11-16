'use client';
import { useState } from 'react';
import { PARTY_ROLES, parseList } from '@/lib/entry-options';
export default function RolesInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (roles: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const selected = parseList(value);
  const choices = [...new Set([...PARTY_ROLES, ...selected])];
  return (
    <div>
      <div className="role-choices" role="group" aria-label="Roles">
        {choices.map((role) => (
          <button
            key={role}
            type="button"
            className={`btn small ${selected.includes(role) ? 'selected' : ''}`}
            aria-pressed={selected.includes(role)}
            onClick={() =>
              onChange(
                selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role],
              )
            }
          >
            {role.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
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
              onChange(parseList([...selected, ...parseList(custom)]));
              setCustom('');
            }}
          >
            Add role
          </button>
        </div>
      </details>
    </div>
  );
}
