'use client';
import { useState } from 'react';
import { dateLabel } from '@/lib/display-date';

type R = Record<string, any>;
const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));
function cents(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter dollars with up to two decimal places, or leave Unknown.');
  const [whole, fraction = ''] = value.trim().split('.');
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(result)) throw new Error('Amount is too large.');
  return result;
}

export default function HistoricalRecordEditor({
  record,
  save,
}: {
  record: R;
  save: (data: R, key: string) => Promise<unknown>;
}) {
  const initial = record.review.values;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [sale, setSale] = useState(dollars(initial.sale_cents));
  const [cost, setCost] = useState(dollars(initial.cost_cents));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState<R | null>(null);
  const field = (name: string, value: unknown) => setValues((v: R) => ({ ...v, [name]: value }));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const data = submitted ?? {
        source_key: `historical-draft:${record.id}`,
        source_locator: { draft_id: record.id },
        issue_type: 'Historical record correction',
        status: 'Proposed',
        decision: reason.trim(),
        proposed_mapping: {
          format: 'historical-draft-facts-v1',
          fingerprint: record.review.fingerprint,
          facts: { ...values, sale_cents: cents(sale), cost_cents: cents(cost) },
        },
      };
      setSubmitted(data);
      await save(data, key);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="card-header">
        <h2>Record details</h2>
        {!editing && (
          <button
            className="btn"
            onClick={() => {
              setValues(record.review.values);
              setSale(dollars(record.review.values.sale_cents));
              setCost(dollars(record.review.values.cost_cents));
              setReason('');
              setError('');
              setSubmitted(null);
              setKey(crypto.randomUUID());
              setEditing(true);
            }}
          >
            Edit details
          </button>
        )}
      </div>
      <div className="section-body">
        <p>
          Edit the details here. Changes retain their history; payments are reconciled separately.
        </p>
        {!editing ? (
          record.review.values.notes ? (
            <p style={{ whiteSpace: 'pre-wrap' }}>{record.review.values.notes}</p>
          ) : null
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={busy || !!submitted} style={{ border: 0, padding: 0 }}>
              <div className="form-grid">
                <label className="form-field full">
                  Description
                  <input
                    required
                    value={values.summary}
                    onChange={(e) => field('summary', e.target.value)}
                  />
                </label>
                {!/^Voucher\s+ending/i.test(record.entry?.summary ?? '') && (
                  <>
                    <label className="form-field full">
                      Travelers
                      <textarea
                        value={values.traveler_names ?? ''}
                        onChange={(e) => field('traveler_names', e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      Route / trip details
                      <input
                        value={values.travel_details ?? ''}
                        onChange={(e) => field('travel_details', e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      Recorded travel dates
                      <textarea
                        value={values.travel_dates ?? ''}
                        onChange={(e) => field('travel_dates', e.target.value)}
                      />
                    </label>
                  </>
                )}
                <label className="form-field">
                  Date certainty
                  <select
                    value={values.date_certainty}
                    onChange={(e) => {
                      field('date_certainty', e.target.value);
                      if (e.target.value === 'Unknown') field('booked_on', null);
                    }}
                  >
                    {['Unknown', 'Approximate', 'Confirmed'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {values.date_certainty !== 'Unknown' && (
                  <label className="form-field">
                    Booking / sale date
                    <input
                      type="date"
                      required
                      value={values.booked_on ?? ''}
                      onChange={(e) => field('booked_on', e.target.value || null)}
                      onInput={(e) => field('booked_on', e.currentTarget.value || null)}
                    />
                  </label>
                )}
                <label className="form-field">
                  Customer price (USD)
                  <input
                    inputMode="decimal"
                    placeholder="Unknown"
                    value={sale}
                    onChange={(e) => setSale(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  Original cost (USD)
                  <input
                    inputMode="decimal"
                    placeholder="Unknown"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                  <small>Leave blank if unknown.</small>
                </label>
                <label className="form-field full">
                  What happened / additional information
                  <textarea value={values.notes} onChange={(e) => field('notes', e.target.value)} />
                </label>
                <label className="form-field full">
                  Reason for correction
                  <input required value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
            </fieldset>
            {error && <p role="alert">{error}</p>}
            {submitted && error && (
              <p>
                Your submitted correction is retained. Retry checks the same save without adding a
                duplicate.
              </p>
            )}
            <div className="toolbar">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : submitted ? 'Retry save' : 'Save corrections'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Close
              </button>
            </div>
          </form>
        )}
        {record.review.events.length > 0 && (
          <details>
            <summary>Correction history ({record.review.events.length})</summary>
            {record.review.events.map((event: R) => (
              <div key={event.id} className="section-body">
                <strong>
                  {event.actor_name || 'Owner'} · {dateLabel(event.created_at.slice(0, 10))}
                </strong>
                <p>{event.decision}</p>
                {event.proposed_mapping.facts && (
                  <>
                    <p>{event.proposed_mapping.facts.summary}</p>
                    <p>
                      Date: {event.proposed_mapping.facts.booked_on ?? 'Unknown'} ·{' '}
                      {event.proposed_mapping.facts.date_certainty}
                    </p>
                    <p>
                      Price:{' '}
                      {event.proposed_mapping.facts.sale_cents == null
                        ? 'Unknown'
                        : `$${dollars(event.proposed_mapping.facts.sale_cents)}`}{' '}
                      · Original cost:{' '}
                      {event.proposed_mapping.facts.cost_cents == null
                        ? 'Unknown'
                        : `$${dollars(event.proposed_mapping.facts.cost_cents)}`}
                    </p>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{event.proposed_mapping.facts.notes}</p>
                  </>
                )}
              </div>
            ))}
          </details>
        )}
      </div>
    </section>
  );
}
