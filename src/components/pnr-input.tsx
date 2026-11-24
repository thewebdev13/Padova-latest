'use client';
import { useState } from 'react';
export default function PnrInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [pending, setPending] = useState('');
  const values = [
    ...new Set(
      value
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const add = (text = pending) => {
    const next = [
      ...new Set([
        ...values,
        ...text
          .split(/[,\n]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ]),
    ];
    onChange(next.join(', '));
    setPending('');
  };
  return (
    <div className="form-field">
      <label htmlFor="entry-pnr">Airline PNR</label>
      <div className="pnr-control">
        {values.map((pnr) => (
          <span className="traveler-chip" key={pnr}>
            {pnr}
            <button
              type="button"
              aria-label={`Remove PNR ${pnr}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(values.filter((v) => v !== pnr).join(', '))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="entry-pnr"
          aria-label="Airline PNR"
          placeholder="Carrier record locator…"
          value={pending}
          onChange={(e) => {
            if (/[,\n]/.test(e.target.value)) add(e.target.value);
            else setPending(e.target.value);
          }}
          onBlur={() => {
            if (pending.trim()) add();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      <small>Airline locator only (not Sabre / GDS).</small>
    </div>
  );
}
