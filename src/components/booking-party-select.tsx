'use client';
import { useEffect, useState, useRef } from 'react';
import SearchableSelect from './searchable-select';
type R = Record<string, any>;
export default function BookingPartySelect({
  id,
  label,
  value,
  initial,
  role = 'customer',
  allowedIds,
  onChange,
  onCreate,
}: {
  id: string;
  label: string;
  value: string;
  initial: R[];
  role?: string;
  allowedIds?: string[];
  onChange: (v: string) => void;
  onCreate?: (name: string, key: string, kind?: 'person' | 'company') => Promise<R>;
}) {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState<R[]>(initial.slice(0, 30));
  const [creating, setCreating] = useState(false),
    [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const creation = useRef<{ name: string; key: string } | null>(null);
  const [searching, setSearching] = useState(false),
    [lookupFailed, setLookupFailed] = useState(false);
  const create = async (kind?: 'person' | 'company') => {
    if (!onCreate || creating || searching || lookupFailed) return;
    const name = query.trim(),
      identity = JSON.stringify([name, kind]);
    if (!name) return;
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
      return;
    }
    if (exact.length > 1) {
      setError('More than one matching record exists. Cancel and choose the correct record.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      if (creation.current?.name !== identity)
        creation.current = { name: identity, key: crypto.randomUUID() };
      const row = await onCreate(name, creation.current!.key, kind);
      setRows((old) => [...old, row]);
      onChange(row.id);
      setQuery('');
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
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (role === 'contact' && !query.trim()) {
        setRows(initial.slice(0, 30));
        setSearching(false);
        return;
      }
      if (allowedIds) {
        setRows(initial.filter((r) => allowedIds.includes(r.id)));
        return;
      }
      fetch(`/api/directory?role=${encodeURIComponent(role)}&q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r) => {
          setRows((old) => {
            const selectedRow =
              initial.find((row) => row.id === value) || old.find((row) => row.id === value);
            const next = selectedRow
              ? [selectedRow, ...r.results.filter((row: R) => row.id !== value)]
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
  }, [query, role, allowedIds?.join(','), value, initial]);
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
                  setAdding(true);
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
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
          }}
        >
          <div className="inline-add-head">
            <strong>Add new {role}</strong>
            <button type="button" aria-label={`Close add ${role}`} onClick={() => setAdding(false)}>
              ×
            </button>
          </div>
          <label htmlFor={`${id}-new`}>{label} name</label>

          <input
            id={`${id}-new`}
            autoFocus
            aria-label={`New ${role} name`}
            placeholder={`${label} name`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearching(!!e.target.value.trim());
              setLookupFailed(false);
            }}
          />
          <div className="inline-actions">
            <button
              type="button"
              className="btn"
              disabled={creating}
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!query.trim() || creating || searching || lookupFailed}
              onClick={() => void create()}
            >
              {creating ? 'Saving…' : searching ? 'Checking names…' : `Add ${role}`}
            </button>
            {['customer', 'seller'].includes(role) && (
              <button
                type="button"
                className="btn"
                disabled={!query.trim() || creating || searching || lookupFailed}
                onClick={() => void create('company')}
              >
                Add organization
              </button>
            )}
          </div>
        </div>
      )}
      {lookupFailed && (
        <p role="alert">Lookup unavailable. Re-enter the name to retry before creating.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
