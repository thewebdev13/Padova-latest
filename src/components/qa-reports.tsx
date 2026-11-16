'use client';
import { useState } from 'react';
export default function QAReports({
  owner,
  section,
  booking = '',
}: {
  owner: boolean;
  section: string;
  booking?: string;
}) {
  const [open, setOpen] = useState(false),
    [issues, setIssues] = useState<any[] | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const r = await fetch('/api/qa/issues', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setIssues(data);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div className="detail-section">
      <button
        className="btn"
        onClick={() => {
          setOpen(!open);
          setMessage('');
        }}
      >
        Report a problem
      </button>{' '}
      <button className="btn" onClick={load}>
        {owner ? 'Review QA issues' : 'My reported issues'}
      </button>
      {message && <p role="status">{message}</p>}
      {open && (
        <form
          className="section-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            const form = e.currentTarget;
            try {
              const r = await fetch('/api/qa/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              setMessage('Report saved. Thank you.');
              setOpen(false);
              if (issues) await load();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>Use fake data only. Reports are kept separately from booking notes.</p>
          <label>
            Type{' '}
            <select name="type">
              {['Bug', 'Confusing', 'Missing', 'Too Slow', 'Suggestion'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Page / section <input name="section" required maxLength={200} defaultValue={section} />
          </label>
          <label>
            Booking ID (optional) <input name="booking" maxLength={100} defaultValue={booking} />
          </label>
          <label>
            What you expected <textarea name="expected" required maxLength={4000} />
          </label>
          <label>
            What happened <textarea name="happened" required maxLength={4000} />
          </label>
          <label>
            Notes <textarea name="notes" maxLength={4000} />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Submit report'}
          </button>
        </form>
      )}
      {issues && (
        <div className="section-body">
          <h3>{owner ? 'QA issues' : 'Your QA issues'}</h3>
          <button className="btn" onClick={() => setIssues(null)}>
            Close list
          </button>
          {!issues.length && <p>No reports yet.</p>}
          {issues.map((i) => (
            <article className="note" key={i.id}>
              <strong>
                #{i.id} · {i.type} · {i.section}
              </strong>
              <p>
                {i.booking} · {i.reporter_name} · {new Date(i.created_at).toLocaleString()}
              </p>
              <p>Expected: {i.expected}</p>
              <p>Happened: {i.happened}</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{i.notes}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
