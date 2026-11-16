'use client';
import { useState } from 'react';
const airports = [
  ['EWR', 'Newark'],
  ['JFK', 'New York JFK'],
  ['LGA', 'New York LaGuardia'],
  ['TLV', 'Tel Aviv'],
  ['LHR', 'London Heathrow'],
  ['CDG', 'Paris Charles de Gaulle'],
  ['MAD', 'Madrid'],
  ['FCO', 'Rome Fiumicino'],
  ['MXP', 'Milan Malpensa'],
  ['HKG', 'Hong Kong'],
  ['DXB', 'Dubai'],
  ['MIA', 'Miami'],
  ['LAX', 'Los Angeles'],
  ['ORD', 'Chicago O’Hare'],
  ['BOS', 'Boston'],
  ['AMS', 'Amsterdam'],
  ['ZRH', 'Zurich'],
];
export default function AirportInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const choices = airports
    .filter(
      ([code, name]) => !searching || `${code} ${name}`.toLowerCase().includes(value.toLowerCase()),
    )
    .sort((a, b) => Number(b[0] === value) - Number(a[0] === value));
  return (
    <div className="form-field search-select">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-airports`}
        autoComplete="off"
        placeholder="Airport code or name"
        value={value}
        onFocus={(e) => {
          e.target.select();
          setSearching(false);
          setOpen(true);
        }}
        onClick={(e) => {
          e.currentTarget.select();
          setSearching(false);
          setOpen(true);
        }}
        onBlur={() => {
          // Delay close so option onMouseDown/onClick can commit the selection.
          window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          setSearching(true);
          setOpen(true);
          onChange(e.target.value.toUpperCase());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (choices[0]) onChange(choices[0][0]);
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="search-select-results" id={`${id}-airports`} role="listbox">
          {choices.map(([code, name]) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(code);
                setOpen(false);
              }}
            >
              {code === value ? '✓ ' : ''}
              {code} · {name}
            </button>
          ))}
          <small className="search-select-hint">Search or enter another airport code.</small>
        </div>
      )}
    </div>
  );
}
