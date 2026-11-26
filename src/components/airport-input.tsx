'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fixedMenuStyleFromRect } from '@/lib/fixed-menu-style';
import { searchableDropdownOpensFor } from '@/lib/searchable-dropdown-policy';
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const input = useRef<HTMLInputElement>(null);
  const blurClose = useRef<number | null>(null);
  const choices = airports
    .filter(
      ([code, name]) => !searching || `${code} ${name}`.toLowerCase().includes(value.toLowerCase()),
    )
    .sort((a, b) => Number(b[0] === value) - Number(a[0] === value));
  useLayoutEffect(() => {
    if (!open || !input.current) {
      setMenuStyle(undefined);
      return;
    }
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle(fixedMenuStyleFromRect(rect));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, value]);
  useEffect(() => {
    return () => {
      if (blurClose.current != null) window.clearTimeout(blurClose.current);
    };
  }, []);
  return (
    <div className={`form-field search-select${open ? ' is-open' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-airports`}
        autoComplete="off"
        placeholder="Airport code or name"
        value={value}
        onFocus={(e) => {
          if (blurClose.current != null) window.clearTimeout(blurClose.current);
          // Plan Do-now: do not open on tab-focus alone (same as SearchableSelect).
          e.target.select();
          setSearching(false);
          if (searchableDropdownOpensFor('focus')) setOpen(true);
        }}
        onClick={(e) => {
          e.currentTarget.select();
          setSearching(false);
          if (searchableDropdownOpensFor('click')) setOpen(true);
        }}
        onBlur={() => {
          blurClose.current = window.setTimeout(() => setOpen(false), 250);
        }}
        onChange={(e) => {
          setSearching(true);
          if (searchableDropdownOpensFor('change')) setOpen(true);
          onChange(e.target.value.toUpperCase());
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (searchableDropdownOpensFor('arrow')) setOpen(true);
          }
          if (e.key === 'Escape' && open) {
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
        <div
          className="search-select-results"
          id={`${id}-airports`}
          role="listbox"
          style={menuStyle}
        >
          {choices.map(([code, name]) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (blurClose.current != null) window.clearTimeout(blurClose.current);
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
