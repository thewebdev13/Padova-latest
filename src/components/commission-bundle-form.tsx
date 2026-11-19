'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import SearchableSelect from './searchable-select';

type R = Record<string, any>;

type PayerRow = {
  payer_id: string;
  collector_id: string;
  gross: string;
  retained: string;
  due_on: string;
  is_iata_partner: boolean;
};

const emptyPayer = (): PayerRow => ({
  payer_id: '',
  collector_id: '',
  gross: '',
  retained: '',
  due_on: '',
  is_iata_partner: false,
});

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function parseUsd(raw: string): number | undefined {
  const t = String(raw ?? '').trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error('Enter exact dollar amounts');
  return Math.round(n * 100);
}

/** Add commission — Owner sample layout (multi-payer + optional referrer). */
export default function CommissionBundleForm({
  config,
  state,
  onClose,
  onSubmit,
  onCreateParty,
}: {
  config: R;
  state: R;
  onClose: () => void;
  onSubmit: (d: R) => Promise<void>;
  onCreateParty?: (d: R, key: string) => Promise<R>;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [bookingId, setBookingId] = useState(String(config.defaults?.booking_id || ''));
  const existingReferral = Boolean(
    bookingId &&
      (state.referrals ?? []).some((r: R) => r.booking_id === bookingId && !r.archived_at),
  );
  const [date, setDate] = useState(
    String(config.defaults?.date || state.today || new Date().toISOString().slice(0, 10)),
  );
  const [payers, setPayers] = useState<PayerRow[]>([
    {
      ...emptyPayer(),
      is_iata_partner: true,
      payer_id: String(config.defaults?.payer_id || ''),
      gross:
        config.defaults?.gross != null ? (Number(config.defaults.gross) / 100).toFixed(2) : '',
    },
  ]);
  const [referral, setReferral] = useState({
    referrer_id: String(config.defaults?.referrer_id || ''),
    basis: 'fixed' as 'percentage' | 'fixed',
    rate_bps: '20',
    fixed_amount: '',
    percentage_basis: 'profit',
    due_on: '',
    reason: 'Affiliate share on this booking',
    payable_when: 'After travel',
    earned: true,
  });

  useEffect(() => {
    if (existingReferral) {
      setReferral((r) => ({ ...r, referrer_id: '', fixed_amount: '' }));
    }
  }, [existingReferral]);

  const parties = (state.parties ?? []).filter((p: R) => !p.archived_at);
  const partyOptions = parties.map((p: R) => ({ value: p.id, label: p.name }));
  const bookingOptions = (state.bookings ?? []).map((b: R) => ({
    value: b.id,
    label: `${b.code} · ${b.summary || b.customer || ''}`.trim(),
  }));
  const orgOptions = (state.referralOrganizations ?? []).map((r: R) => ({
    value: r.accounting_party_id || r.id,
    label: `${r.name}${r.location ? ` · ${r.location}` : ''}`,
  }));

  const updatePayer = (index: number, patch: Partial<PayerRow>) => {
    setPayers((rows) =>
      rows.map((row, i) => {
        if (i !== index) {
          if (patch.is_iata_partner === true) return { ...row, is_iata_partner: false };
          return row;
        }
        return { ...row, ...patch };
      }),
    );
  };

  const payOutActive =
    !existingReferral &&
    Boolean(referral.referrer_id) &&
    Boolean(String(referral.fixed_amount || '').trim());

  const saveCount = payers.length + (payOutActive ? 1 : 0);

  const summary = (() => {
    try {
      let incoming = 0;
      for (const p of payers) incoming += parseUsd(p.gross) ?? 0;
      let payable = 0;
      if (payOutActive) payable = parseUsd(referral.fixed_amount) ?? 0;
      return { incoming, payable, keeps: incoming - payable };
    } catch {
      return null;
    }
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (!bookingId) throw new Error('Choose the booking');
      if (!date) throw new Error('Effective date defaults to today — enter a date');
      const built = payers.map((p, i) => {
        if (!p.payer_id) throw new Error(`Choose payer ${i + 1}`);
        const gross = parseUsd(p.gross);
        if (gross == null || gross <= 0)
          throw new Error(`Enter gross commission for payer ${i + 1}`);
        if (!p.due_on) throw new Error(`Enter expected by date for payer ${i + 1}`);
        const retained = parseUsd(p.retained) ?? 0;
        if (retained > gross) throw new Error('Collector retention exceeds commission');
        return {
          payer_id: p.payer_id,
          collector_id: p.collector_id || null,
          gross,
          retained,
          due_on: p.due_on || undefined,
          is_iata_partner: Boolean(p.is_iata_partner),
        };
      });
      const payload: R = {
        booking_id: bookingId,
        date,
        payers: built,
      };
      if (payOutActive) {
        if (!referral.reason.trim()) throw new Error('Enter the reason / agreement source');
        const amt = parseUsd(referral.fixed_amount);
        if (amt == null || amt <= 0) throw new Error('Enter amount Padova owes');
        payload.referral = {
          referrer_id: referral.referrer_id,
          basis: 'fixed',
          rate_bps: 0,
          fixed_amount: amt,
          percentage_basis: referral.percentage_basis,
          due_on: referral.due_on || date,
          reason: referral.reason.trim(),
          payable_when: referral.payable_when,
          earned: referral.earned,
          cancellation_rule: 'Realized economics',
          after_receipt: true,
        };
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const addPayerParty = async (index: number) => {
    if (!onCreateParty) return;
    const name = window.prompt('New commission payer name');
    if (!name?.trim()) return;
    const created = await onCreateParty(
      {
        name: name.trim(),
        kind: 'company',
        roles: ['commission_payer'],
        date: state.today,
      },
      crypto.randomUUID(),
    );
    updatePayer(index, { payer_id: created.id });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        ref={dialog}
        className="modal commission-bundle"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-bundle-title"
      >
        <div className="modal-head commission-bundle-head">
          <div>
            <h2 id="commission-bundle-title">Add commission</h2>
            <p>
              Who owes Padova (receivable). Affiliate payout is separate — set Referring
              organization on the booking when possible.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body commission-bundle-body">
          <label className="commission-field">
            <span>
              Booking <abbr title="required">*</abbr>
            </span>
            <SearchableSelect
              id="commission-booking"
              label="Booking"
              value={bookingId}
              options={bookingOptions}
              onChange={setBookingId}
              required
            />
          </label>

          <p className="commission-model-hint">
            <strong>IATA partner</strong> = agency that keeps supplier commission and owes Padova
            ~90% of profit (mark the checkbox). <strong>Secondary</strong> = another party that also
            owes Padova on this booking (add another payer, leave IATA unchecked).{' '}
            <strong>Referring org</strong> = Padova owes them — prefer booking affiliate field, not
            a second payout here.
          </p>

          <div className="commission-payer-stack">
            {payers.map((p, index) => (
              <article key={index} className="commission-payer-card">
                <header className="commission-payer-card-head">
                  <strong className="commission-payer-title">
                    {p.is_iata_partner
                      ? `PAYER ${index + 1} · IATA PARTNER`
                      : index === 0
                        ? `PAYER ${index + 1}`
                        : `PAYER ${index + 1} · SECONDARY`}
                  </strong>
                  {payers.length > 1 && index > 0 && (
                    <button
                      type="button"
                      className="commission-remove-link"
                      onClick={() => setPayers((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </header>

                <label className="commission-iata-toggle">
                  <input
                    type="checkbox"
                    checked={p.is_iata_partner}
                    onChange={(e) =>
                      updatePayer(index, { is_iata_partner: e.target.checked })
                    }
                  />
                  <span>IATA partner (owes Padova the partner split — usually ~90%)</span>
                </label>

                <div className="commission-payer-row commission-payer-row--inline">
                  <label className="commission-field commission-field--payer">
                    <span>
                      Commission payer <abbr title="required">*</abbr>
                    </span>
                    <SearchableSelect
                      id={`commission-payer-${index}`}
                      label="Commission payer"
                      value={p.payer_id}
                      options={[
                        ...partyOptions,
                        ...(onCreateParty
                          ? [{ value: '__add__', label: '+ Add new payer' }]
                          : []),
                      ]}
                      onChange={(id) => {
                        if (id === '__add__') void addPayerParty(index);
                        else updatePayer(index, { payer_id: id });
                      }}
                      required
                    />
                  </label>
                  <label className="commission-field commission-field--gross">
                    <span>
                      Gross commission <abbr title="required">*</abbr>
                    </span>
                    <div className="commission-money-input">
                      <span aria-hidden>$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        inputMode="decimal"
                        value={p.gross}
                        onChange={(e) => updatePayer(index, { gross: e.target.value })}
                        aria-label={`Gross commission payer ${index + 1}`}
                      />
                    </div>
                  </label>
                  <label className="commission-field commission-field--due">
                    <span>
                      Expected by <abbr title="required">*</abbr>
                    </span>
                    <input
                      type="date"
                      required
                      value={p.due_on}
                      onChange={(e) => updatePayer(index, { due_on: e.target.value })}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            className="btn commission-add-payer"
            onClick={() =>
              setPayers((rows) => [
                ...rows,
                { ...emptyPayer(), is_iata_partner: false },
              ])
            }
          >
            + Add secondary commission payer
          </button>

          {existingReferral ? (
            <p className="commission-note">
              This booking already has a referring-org payable. Record who owes Padova here only —
              do not post a second referrer payout.
            </p>
          ) : (
            <section className="commission-payer-card commission-payer-card--payout">
              <header className="commission-payer-card-head">
                <strong className="commission-payer-title">
                  PAY OUT TO REFERRER · OPTIONAL
                </strong>
              </header>
              <label className="commission-field">
                <span>Referrer</span>
                <SearchableSelect
                  id="commission-referrer"
                  label="Referrer"
                  value={referral.referrer_id}
                  options={[
                    { value: '', label: 'None' },
                    ...(orgOptions.length ? orgOptions : partyOptions),
                  ]}
                  onChange={(id) => setReferral((r) => ({ ...r, referrer_id: id }))}
                />
              </label>
              <label className="commission-field">
                <span>Amount Padova owes</span>
                <div className="commission-money-input">
                  <span aria-hidden>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={referral.fixed_amount}
                    onChange={(e) =>
                      setReferral((r) => ({
                        ...r,
                        basis: 'fixed',
                        fixed_amount: e.target.value,
                      }))
                    }
                  />
                </div>
                <small>Saved as a Commission payable on the same booking.</small>
              </label>
            </section>
          )}

          {summary && (
            <div className="commission-summary-bar" aria-live="polite">
              <span>
                Commission in {money(summary.incoming)} · out {money(summary.payable)}
              </span>
              <span className="commission-summary-keeps">
                Padova keeps <strong>{money(summary.keeps)}</strong>
              </span>
            </div>
          )}

          <details
            className="commission-more"
            open={showMore}
            onToggle={(e) => setShowMore(e.currentTarget.open)}
          >
            <summary>
              <span>
                More options{' '}
                <span className="commission-more-hint">
                  (Paid through / collecting agency · Collector keeps · Effective date (today))
                </span>
              </span>
              <ChevronDown size={16} aria-hidden className="commission-more-chevron" />
            </summary>
            <div className="commission-more-panel">
              {payers.map((p, index) => (
                <div key={index} className="commission-more-grid">
                  <p className="commission-more-payer-label">Payer {index + 1}</p>
                  <label className="commission-field">
                    <span>Paid through / collecting agency</span>
                    <SearchableSelect
                      id={`commission-collector-${index}`}
                      label="Collector"
                      value={p.collector_id}
                      options={[{ value: '', label: 'None' }, ...partyOptions]}
                      onChange={(id) => updatePayer(index, { collector_id: id })}
                    />
                  </label>
                  <label className="commission-field">
                    <span>Collector keeps</span>
                    <div className="commission-money-input">
                      <span aria-hidden>$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={p.retained}
                        onChange={(e) => updatePayer(index, { retained: e.target.value })}
                      />
                    </div>
                  </label>
                </div>
              ))}
              <label className="commission-field">
                <span>Effective date (today)</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              {!existingReferral && (
                <label className="commission-field">
                  <span>Referrer reason / agreement source</span>
                  <textarea
                    value={referral.reason}
                    onChange={(e) => setReferral((r) => ({ ...r, reason: e.target.value }))}
                    rows={2}
                  />
                </label>
              )}
            </div>
          </details>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-footer commission-bundle-foot">
          <div className="commission-bundle-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : `Save ${saveCount} item${saveCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
