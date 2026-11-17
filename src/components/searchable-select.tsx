'use client';
import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
type Option = {
  value: string;
  label: string;
  keywords?: string[];
  detail?: string;
  badge?: string;
};
export default function SearchableSelect({
  id,
  options,
  value,
  required,
  autoFocus,
  label: accessibleLabel,
  onChange,
  onSearch,
  onAdd,
  addLabel,
  addDisabled,
  emptyLabel,
  hideCount = false,
}: {
  id: string;
  options: Option[];
  value: string;
  required?: boolean;
  autoFocus?: boolean;
  label?: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  onAdd?: (query: string) => void;
  addLabel?: (query: string) => string;
  addDisabled?: boolean;
  emptyLabel?: string;
  hideCount?: boolean;
}) {
  const frequencies = new Map<string, number>();
  for (const option of options)
    frequencies.set(option.label, (frequencies.get(option.label) ?? 0) + 1);
  const choices = options.map((option) => ({
    ...option,
    label:
      (frequencies.get(option.label) ?? 0) > 1
        ? `${option.label} · ${option.value.slice(-6)}`
        : option.label,
  }));
  const label = (key: string) => choices.find((option) => option.value === key)?.label ?? '';
  const selectedLabel = label(value);
  const [text, setText] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const committed = useRef(value);
  const blurClose = useRef<number | null>(null);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      // Do not wipe the field to blank when the id arrives before the option row —
      // intake continue-draft used to flash empty until a slow directory fetch finished.
      if (selectedLabel || !value) setText(selectedLabel);
      input.current?.setCustomValidity('');
      return;
    }
    // Intake may set the id before the matching option row is merged in.
    if (value && selectedLabel && !open) {
      setText((prev) => (prev === selectedLabel ? prev : selectedLabel));
    }
  }, [value, selectedLabel, open]);
  useLayoutEffect(() => {
    if (!open || !input.current) {
      setMenuStyle(undefined);
      return;
    }
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = Math.min(280, Math.max(120, window.innerHeight - rect.bottom - 12));
      const width = Math.max(rect.width, 220);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left,
        width,
        maxHeight,
        zIndex: 1200,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, text, choices.length]);
  useEffect(() => {
    return () => {
      if (blurClose.current != null) window.clearTimeout(blurClose.current);
    };
  }, []);
  const query = text === selectedLabel ? '' : text.trim().toLocaleLowerCase();
  const matches = choices.filter((option) =>
    [option.label, option.detail ?? '', ...(option.keywords ?? [])].some((term) =>
      term.toLocaleLowerCase().includes(query),
    ),
  );
  const visible = matches.slice(0, 50);
  const pick = (option: Option) => {
    if (blurClose.current != null) window.clearTimeout(blurClose.current);
    committed.current = option.value;
    setText(option.label);
    input.current?.setCustomValidity('');
    onChange(option.value);
    setOpen(false);
  };
  return (
    <div className={`search-select${open ? ' is-open' : ''}`}>
      <div className="search-select-control">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-label={accessibleLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={open && visible[active] ? `${id}-option-${active}` : undefined}
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          required={required}
          value={text}
          title={text || undefined}
          placeholder="Search and select…"
          onFocus={(e) => {
            if (blurClose.current != null) window.clearTimeout(blurClose.current);
            e.target.select();
            onSearch?.('');
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            // Delay close so option onMouseDown/onClick can commit the selection.
            blurClose.current = window.setTimeout(() => {
              const activeEl = document.activeElement;
              if (results.current?.contains(activeEl)) return;
              setOpen(false);
            }, 180);
          }}
          onClick={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => {
            const next = e.target.value;
            onSearch?.(next);
            const found = choices.find((option) => option.label === next);
            setText(next);
            setOpen(true);
            setActive(0);
            committed.current = found?.value ?? '';
            e.target.setCustomValidity(
              next && !found ? 'Select a record from the results below.' : '',
            );
            onChange(found?.value ?? '');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    visible.length - (onAdd ? 0 : 1),
                    index + (e.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              // Exact typing already committed this record. Keep it instead of
              // replacing it with the first unfiltered option on Enter.
              if (value && text === label(value)) {
                setOpen(false);
                return;
              }
              if (visible[active]) pick(visible[active]);
              else if (onAdd && !addDisabled) {
                onAdd(query ? text.trim() : '');
                setOpen(false);
              }
            }
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="search-select-toggle"
          aria-label={`Show choices for ${accessibleLabel ?? id.replace('f-', '').replaceAll('_', ' ')}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next = !open;
            input.current?.focus();
            setOpen(next);
          }}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="search-select-results" ref={results} style={menuStyle}>
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={`${accessibleLabel ?? 'Matching records'} choices`}
          >
            {visible.map((option, index) => (
              <button
                key={`${option.value || 'empty'}:${option.label}:${index}`}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={value === option.value}
                className={index === active ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                <span className="select-option-copy">
                  <span>
                    {value === option.value ? '✓ ' : ''}
                    {option.label}
                  </span>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {option.badge && <strong className="select-option-badge">{option.badge}</strong>}
              </button>
            ))}
          </div>
          {onAdd && (
            <button
              type="button"
              className="select-add-action"
              disabled={addDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAdd(query ? text.trim() : '');
                setOpen(false);
              }}
            >
              + {addLabel?.(query ? text.trim() : '') ?? 'Add new'}
            </button>
          )}
          {(!hideCount || !matches.length) && (
            <div className="search-select-hint" role="status">
              {matches.length
                ? `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > 50 ? ' · showing 50; type to narrow' : ''}`
                : emptyLabel ||
                  (options.length
                    ? 'No matching records. Try another name.'
                    : 'No records yet. Add the required record first.')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
