'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ageAtTravel,
  countryNames,
  ticketingValues,
  type Ticketing,
} from '@/lib/traveler-ticketing';
type R = Record<string, any>;
function TravelerRow({
  person,
  date,
  command,
  onFull,
  onDirty,
  cache,
}: {
  cache: Map<string, { saved: Ticketing; value: Ticketing }>;
  person: R;
  date: string;
  command: (kind: string, data: R, key: string) => Promise<R>;
  onFull: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<Ticketing | null>(null),
    [value, setValue] = useState<Ticketing>({ dob: '', sex: '', nationality: '' });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const retry = useRef({ signature: '', key: '' });
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/state?type=person&id=${encodeURIComponent(person.id)}`, {
      cache: 'no-store',
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error('Unable to load saved details.');
        const result = await r.json();
        if (result.person?.id !== person.id || result.privateData === null)
          throw Error('Traveler-details access is unavailable.');
        const next = ticketingValues(result.privateData);
        const pending = cache.get(person.id);
        setSaved(pending?.saved ?? next);
        setValue(pending?.value ?? next);
        setError('');
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [person.id, attempt]);
  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(value);
  useEffect(() => {
    if (dirty && saved) cache.set(person.id, { saved, value });
    else if (saved) cache.delete(person.id);
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, value, saved]);
  const age = ageAtTravel(value.dob, date);
  const change = (key: keyof Ticketing, text: string) =>
    setValue((old) => ({ ...old, [key]: text }));
  return (
    <article className={`ticketing-row${dirty ? ' is-dirty' : ''}`}>
      <header className="ticketing-row-head">
        <div>
          <strong>{person.name}</strong>
          <small>
            {saved ? (dirty ? 'Unsaved changes' : 'From profile') : 'Loading profile…'}
          </small>
        </div>
        <div className="ticketing-row-actions">
          <button className="text-action" type="button" disabled={dirty || busy} onClick={onFull}>
            Full profile
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              const payload = {
                person_id: person.id,
                ticketing_only: true,
                ...value,
                expected: saved,
              };
              const signature = JSON.stringify(payload);
              if (retry.current.signature !== signature)
                retry.current = { signature, key: crypto.randomUUID() };
              try {
                await command('traveler', payload, retry.current.key);
                setSaved(value);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Unable to save');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Saving…' : 'Save to profile'}
          </button>
        </div>
      </header>
      <div className="ticketing-fields">
        <label className="ticketing-field">
          <span>Date of birth</span>
          <input
            type="date"
            aria-label={`Date of birth for ${person.name}`}
            value={value.dob}
            disabled={!saved || busy}
            onInput={(e) => change('dob', e.currentTarget.value)}
            onChange={(e) => change('dob', e.target.value)}
          />
        </label>
        <div className="ticketing-field">
          <span>Age at travel</span>
          <strong className="ticketing-age">{age === null ? 'Unknown' : age}</strong>
          {age !== null && age < 12 && (
            <small>{age < 2 ? 'Infant' : 'Child'} · check fare rules</small>
          )}
        </div>
        <fieldset className="ticketing-field" disabled={!saved || busy}>
          <legend>Sex for travel</legend>
          <div className="ticketing-sex">
            {['F', 'M', 'X'].map((sex) => (
              <button
                className="btn small"
                type="button"
                key={sex}
                aria-label={`${sex} for ${person.name}`}
                aria-pressed={value.sex === sex}
                onClick={() => change('sex', value.sex === sex ? '' : sex)}
              >
                {sex}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="ticketing-field">
          <span>Nationality</span>
          <input
            aria-label={`Nationality for ${person.name}`}
            list="ticketing-countries"
            value={value.nationality}
            disabled={!saved || busy}
            placeholder="Country"
            onFocus={(e) => e.target.select()}
            onChange={(e) => change('nationality', e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="ticketing-error" role="alert">
          <small>{error}</small>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              if (
                !dirty ||
                confirm('Reload saved traveler details and discard these unsaved profile changes?')
              ) {
                cache.delete(person.id);
                setAttempt(attempt + 1);
              }
            }}
          >
            Reload profile
          </button>
        </div>
      )}
    </article>
  );
}
export default function BookingTicketing({
  cache,
  people,
  date,
  state,
  command,
  onFull,
  onDirty,
}: {
  cache: Map<string, { saved: Ticketing; value: Ticketing }>;
  people: R[];
  date: string;
  state: R;
  command: (kind: string, data: R, key: string) => Promise<R>;
  onFull: (id: string) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  if (!people.length) return null;
  if (state.actor.role !== 'OWNER' && !state.actor.permissions.includes('view_traveler_sensitive'))
    return (
      <p className="note full">
        Protected ticketing details require traveler-details access. You can still add travelers by
        name.
      </p>
    );
  return (
    <section className="ticketing-details full" aria-label="Traveler ticketing details">
      <header className="ticketing-details-head">
        <strong>Traveler details</strong>
        <p>
          Optional · saved on the reusable profile. Age uses departure date. Save edits before
          continuing.
        </p>
      </header>
      <datalist id="ticketing-countries">
        {countryNames.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </datalist>
      <div className="ticketing-list">
        {people.map((person) => (
          <TravelerRow
            cache={cache}
            key={person.id}
            person={person}
            date={date}
            command={command}
            onFull={() => onFull(person.id)}
            onDirty={(dirty) => onDirty(person.id, dirty)}
          />
        ))}
      </div>
    </section>
  );
}
