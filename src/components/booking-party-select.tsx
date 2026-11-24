'use client';
import { useEffect, useState, useRef } from 'react';
import SearchableSelect from './searchable-select';

type R = Record<string, any>;

export type PartyCreateExtras = {
  phone?: string;
  email?: string;
  notes?: string;
};

export default function BookingPartySelect({
  id,
  label,
  value,
  initial,
  role = 'customer',
  allowedIds,
  createDefaults,
  onChange,
  onCreate,
}: {
  id: string;
  label: string;
  value: string;
  initial: R[];
  role?: string;
  allowedIds?: string[];
  /** Prefill optional contact fields when opening Add (e.g. intake paste). */
  createDefaults?: PartyCreateExtras;
  onChange: (v: string) => void;
  onCreate?: (
    name: string,
    key: string,
    kind?: 'person' | 'company',
    extras?: PartyCreateExtras,
  ) => Promise<R>;
}) {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState<R[]>(initial.slice(0, 30));
  const [creating, setCreating] = useState(false),
    [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState(''),
    [email, setEmail] = useState(''),
    [notes, setNotes] = useState('');
  const creation = useRef<{ name: string; key: string } | null>(null);
  const [searching, setSearching] = useState(false),
    [lookupFailed, setLookupFailed] = useState(false);
  const initialRef = useRef(initial);
  const valueRef = useRef(value);
  initialRef.current = initial;
  valueRef.current = value;
  const contactRoles = ['customer', 'traveler', 'seller', 'contact'].includes(role);
  const resetContactFields = (seed?: PartyCreateExtras) => {
    setPhone(seed?.phone?.trim() ?? '');
    setEmail(seed?.email?.trim() ?? '');
    setNotes(seed?.notes?.trim() ?? '');
  };
  const create = async (kind?: 'person' | 'company') => {
    if (!onCreate || creating) return;
    const name = query.trim();
    if (!name) return;
    if (lookupFailed) {
      setError('Lookup unavailable. Re-enter the name to retry before creating.');
      return;
    }
    const identity = JSON.stringify([
      name,
      kind,
      phone.trim(),
      email.trim(),
      notes.trim(),
    ]);
    const normalize = (v: string) =>
      v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const exact = [...initial, ...rows].filter(
      (r, i, all) =>
        all.findIndex((v) => v.id === r.id) === i && normalize(r.name) === normalize(name),
    );
    if (exact.length === 1) {
      onChange(exact[0].id);
      setAdding(false);
      setQuery('');
      resetContactFields();
      return;
    }
    if (exact.length > 1) {
      setError('More than one matching record exists. Cancel and choose the correct record.');
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email, or leave email blank.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      if (creation.current?.name !== identity)
        creation.current = { name: identity, key: crypto.randomUUID() };
      const extras: PartyCreateExtras = {
        phone: phone.trim() || undefined,
        email: trimmedEmail || undefined,
        notes: notes.trim() || undefined,
      };
      const row = await onCreate(name, creation.current!.key, kind, extras);
      setRows((old) => [...old, row]);
      onChange(row.id);
      setQuery('');
      resetContactFields();
      setAdding(false);
      creation.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setCreating(false);
    }
  };
  useEffect(() => {
    // Keep intake/auto-created parties visible in the select options.
    setRows((old) => {
      const byId = new Map<string, R>();
      for (const row of [...initial, ...old]) if (row?.id) byId.set(row.id, row);
      if (value && byId.has(value)) {
        const selectedRow = byId.get(value)!;
        return [selectedRow, ...[...byId.values()].filter((r) => r.id !== value)].slice(0, 40);
      }
      return [...byId.values()].slice(0, 40);
    });
  }, [initial, value]);
  useEffect(() => {
    // While the add panel is open the select is hidden — skip directory fetch so
    // typing the new name does not toggle searching/rows and flicker the buttons.
    if (adding) {
      setSearching(false);
      return;
    }
    const term = query.trim();
    // Empty query: show seeded/local rows only. Never hit directory with q="" —
    // that loads LIMIT 30 by name and can omit the intake-selected party until a
    // slow round-trip finishes (blank Customer label on QA/server).
    if (!term) {
      if (allowedIds) {
        setRows(initialRef.current.filter((r) => allowedIds.includes(r.id)));
      } else if (role === 'contact') {
        setRows(initialRef.current.slice(0, 30));
      }
      setSearching(false);
      return;
    }
    if (allowedIds) {
      setRows(initialRef.current.filter((r) => allowedIds.includes(r.id)));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/directory?role=${encodeURIComponent(role)}&q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r) => {
          setRows((old) => {
            const selectedId = valueRef.current;
            const selectedRow =
              (selectedId &&
                (initialRef.current.find((row) => row.id === selectedId) ||
                  old.find((row) => row.id === selectedId))) ||
              undefined;
            const next = selectedRow
              ? [selectedRow, ...r.results.filter((row: R) => row.id !== selectedId)]
              : r.results;
            return next;
          });
          setSearching(false);
          setLookupFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
            setLookupFailed(true);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, role, allowedIds?.join(','), adding]);
  const selected = initial.find((r) => r.id === value) || rows.find((r) => r.id === value),
    all = selected ? [selected, ...rows.filter((r) => r.id !== value)] : rows;
  return (
    <>
      {!adding && (
        <SearchableSelect
          id={id}
          label={label}
          value={value}
          options={all.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(id) => {
            onChange(id);
            if (id) setQuery('');
          }}
          onSearch={(q) => {
            setQuery(q);
            setSearching(!!q.trim());
            setLookupFailed(false);
          }}
          hideCount
          onAdd={
            onCreate
              ? (name) => {
                  setQuery(name);
                  resetContactFields(createDefaults);
                  setAdding(true);
                  setError('');
                  setLookupFailed(false);
                }
              : undefined
          }
          addLabel={(name) => (name ? `Add “${name}” as a new ${role}` : `Add new ${role}`)}
          emptyLabel={`No matching ${role}. Search another name or add one below.`}
        />
      )}
      {adding && (
        <div
          className="inline-add-panel"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setAdding(false);
            }
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
              void create();
            }
          }}
        >
          <div className="inline-add-head">
            <strong>Add new {role}</strong>
            <button
              type="button"
              className="inline-add-close"
              aria-label={`Close add ${role}`}
              onClick={() => setAdding(false)}
            >
              ×
            </button>
          </div>
          <div className="inline-add-fields">
            <div className="inline-add-field">
              <label htmlFor={`${id}-new`}>
                {label} name <span className="req">required</span>
              </label>
              <input
                id={`${id}-new`}
                autoFocus
                aria-label={`New ${role} name`}
                placeholder={`Full ${label.toLowerCase()} name`}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLookupFailed(false);
                  setError('');
                }}
              />
            </div>
            {contactRoles && (
              <>
                <div className="inline-add-field">
                  <label htmlFor={`${id}-phone`}>
                    Phone <span className="opt">optional</span>
                  </label>
                  <input
                    id={`${id}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-label={`${label} phone`}
                    placeholder="Phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="inline-add-field">
                  <label htmlFor={`${id}-email`}>
                    Email <span className="opt">optional</span>
                  </label>
                  <input
                    id={`${id}-email`}
                    type="email"
                    autoComplete="email"
                    aria-label={`${label} email`}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="inline-add-field full">
                  <label htmlFor={`${id}-notes`}>
                    Notes <span className="opt">optional</span>
                  </label>
                  <textarea
                    id={`${id}-notes`}
                    rows={2}
                    aria-label={`${label} notes`}
                    placeholder="Small notes, preferences, how to reach, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <div className="inline-add-actions">
            <button
              type="button"
              className="btn"
              disabled={creating}
              onClick={() => {
                setAdding(false);
                resetContactFields();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn primary inline-add-save"
              disabled={!query.trim() || creating || lookupFailed}
              onClick={() => void create()}
            >
              {creating ? 'Saving…' : `Add ${role}`}
            </button>
            {['customer', 'seller'].includes(role) && (
              <button
                type="button"
                className="btn"
                disabled={!query.trim() || creating || lookupFailed}
                onClick={() => void create('company')}
              >
                Add organization
              </button>
            )}
          </div>
          <small className="inline-add-hint inline-add-hint-stable" aria-live="polite">
            {lookupFailed
              ? 'Lookup unavailable, re-enter the name to retry.'
              : !query.trim()
                ? `Enter a name to enable Add ${role}.`
                : '\u00a0'}
          </small>
        </div>
      )}
      {lookupFailed && (
        <p role="alert">Lookup unavailable. Re-enter the name to retry before creating.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
