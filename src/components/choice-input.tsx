'use client';
import { useState } from 'react';

export default function ChoiceInput({
  id,
  label,
  value,
  options,
  required,
  autoFocus,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  const [other, setOther] = useState(false);
  const custom = other || (!!value && !options.includes(value));
  return (
    <div className="choice-input">
      <select
        id={id}
        required={required}
        autoFocus={autoFocus}
        value={custom ? '__other__' : value}
        onChange={(e) => {
          const isOther = e.target.value === '__other__';
          setOther(isOther);
          onChange(isOther ? '' : e.target.value);
        }}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__other__">Other, specify</option>
      </select>
      {custom && (
        <input
          aria-label={`${label}, other`}
          placeholder={`Enter ${label.toLowerCase()}`}
          required={required}
          value={value}
          maxLength={2000}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
