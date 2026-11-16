'use client';
import { useState } from 'react';
import BookingPartySelect from './booking-party-select';
type R = Record<string, any>;

export default function TravelerSourceReview({
  review,
  parties,
  save,
}: {
  review: R;
  parties: R[];
  save: (data: R) => Promise<unknown>;
}) {
  const [query, setQuery] = useState(''),
    [history, setHistory] = useState(false),
    [selected, setSelected] = useState<R | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const rows = review.held.filter(
    (r: R) =>
      (history || r.decision?.status !== 'Resolved') &&
      [r.raw, r.tab, String(r.row)].join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  const decide = async (action: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await save({
        source_key: selected.source_key,
        source_locator: selected.source_locator,
        issue_type: 'Traveler source mapping',
        proposed_mapping: { action },
        destination_ids: { traveler_ids: ids },
        status: action === 'Accept' ? 'Resolved' : action === 'Not Same' ? 'Rejected' : 'Held',
        decision: reason.trim(),
      });
      setSelected(null);
      setIds([]);
      setReason('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="section-body">
      <p>
        {review.uniqueNameCandidates} exact name candidates · {review.splitCells} clearly delimited
        cells split · {review.remaining} open source cells. Prior decisions and original evidence
        remain preserved.
      </p>
      <p className="muted">
        Accept records a source-to-traveler mapping. It does not merge people or post financial
        records. Names alone do not prove identity.
      </p>
      <label htmlFor="traveler-source-search">Find traveler text or source row</label>
      <input id="traveler-source-search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label>
        <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />{' '}
        Include accepted cells
      </label>
      <p className="muted">
        {rows.length} matching cells. Showing up to 30; search to narrow the list.
      </p>
      {!selected &&
        rows.slice(0, 30).map((r: R) => (
          <div className="attention-row" key={r.source_key}>
            <div className="attention-text">
              <strong>{r.raw}</strong>
              <small>
                {r.tab} · row {r.row} · column {r.column} · {r.reason}
              </small>
              {r.decision && (
                <small>
                  {r.decision.proposed_mapping?.action ?? r.decision.status} · {r.decision.decision}{' '}
                  · {r.decision.actor} · {r.decision.created_at}
                </small>
              )}
            </div>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                setSelected(r);
                setIds(
                  r.decision?.status === 'Rejected'
                    ? []
                    : (r.decision?.destination_ids?.traveler_ids ?? []),
                );
                setReason('');
                setError('');
              }}
            >
              Review traveler cell
            </button>
          </div>
        ))}
      {selected && (
        <fieldset>
          <legend>Review: {selected.raw}</legend>
          <p>
            {selected.workbook} · {selected.tab} · row {selected.row} · column {selected.column}
          </p>
          {ids.map((id) => (
            <div key={id}>
              {parties.find((p) => p.id === id)?.name ?? id}{' '}
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => setIds(ids.filter((v) => v !== id))}
              >
                Remove traveler
              </button>
            </div>
          ))}
          <label htmlFor="source-review-traveler">Select traveler for source decision</label>
          <BookingPartySelect
            key={ids.join(',')}
            id="source-review-traveler"
            label="Select traveler for source decision"
            value=""
            initial={parties}
            role="traveler"
            onChange={(id) => {
              if (id && !ids.includes(id)) setIds([...ids, id]);
            }}
          />
          <label htmlFor="traveler-decision-reason">Evidence and reason for decision</label>
          <textarea
            id="traveler-decision-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p role="alert">{error}</p>}
          <div className="toolbar">
            {['Accept', 'Not Same', 'Unsure'].map((action) => (
              <button
                key={action}
                className="btn"
                disabled={busy || !reason.trim() || (action !== 'Unsure' && !ids.length)}
                onClick={() => decide(action)}
              >
                {action}
              </button>
            ))}
            <button className="btn ghost" disabled={busy} onClick={() => setSelected(null)}>
              Close review
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
