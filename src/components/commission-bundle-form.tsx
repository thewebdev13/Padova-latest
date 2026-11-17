'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
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

/** Site Feedback 3 Phase 2: multi-payer receivable + optional referrer payable in one save. */
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
  const [payOut, setPayOut] = useState(false);
  useEffect(() => {
    if (existingReferral) setPayOut(false);
  }, [existingReferral]);
  const [date, setDate] = useState(String(config.defaults?.date || state.today || ''));
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
    basis: 'percentage' as 'percentage' | 'fixed',
    rate_bps: '20',
    fixed_amount: '',
    percentage_basis: 'profit',
    due_on: '',
    reason: 'Affiliate share on this booking',
    payable_when: 'After travel',
    earned: true,
  });

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
    setPayers((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const summary = (() => {
    try {
      let incoming = 0;
      let retained = 0;
      for (const p of payers) {
        const g = parseUsd(p.gross) ?? 0;
        const r = parseUsd(p.retained) ?? 0;
        incoming += g;
        retained += r;
      }
      let payable = 0;
      if (payOut) {
        if (referral.basis === 'fixed') payable = parseUsd(referral.fixed_amount) ?? 0;
      }
      return { incoming, retained, keeps: incoming - retained, payable };
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
        if (gross == null || gross <= 0) throw new Error(`Enter gross commission for payer ${i + 1}`);
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
      if (payOut && !existingReferral) {
        if (!referral.referrer_id) throw new Error('Choose who Padova pays out to (referrer)');
        if (!referral.reason.trim()) throw new Error('Enter the reason / agreement source');
        const ratePct = Number(referral.rate_bps);
        payload.referral = {
          referrer_id: referral.referrer_id,
          basis: referral.basis,
          rate_bps:
            referral.basis === 'percentage'
              ? Math.round((Number.isFinite(ratePct) ? ratePct : 0) * 100)
              : 0,
          fixed_amount: referral.basis === 'fixed' ? (parseUsd(referral.fixed_amount) ?? 0) : 0,
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

  const hasPrimary = payers.some((row) => row.is_iata_partner);

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
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-bundle-title"
      >
        <div className="modal-head commission-bundle-head">
          <div>
            <p className="commission-bundle-eyebrow">Receivables</p>
            <h2 id="commission-bundle-title">Add commission</h2>
            <p>
              Who owes Padova — IATA primary and any secondary payer. Affiliate payout stays
              separate.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body commission-bundle-body">
          <section className="commission-section">
            <label className="commission-field">
              <span>Booking</span>
              <SearchableSelect
                id="commission-booking"
                label="Booking"
                value={bookingId}
                options={bookingOptions}
                onChange={setBookingId}
                required
              />
            </label>
          </section>

          <section className="commission-section">
            <div className="commission-section-head">
              <h3>Who owes Padova</h3>
              <p>Primary IATA first. Add a second payer only when someone else also owes.</p>
            </div>

            <div className="commission-payer-stack">
              {payers.map((p, index) => {
                const kind = p.is_iata_partner
                  ? 'primary'
                  : hasPrimary
                    ? 'secondary'
                    : 'payer';
                return (
                  <article
                    key={index}
                    className={`commission-payer-card commission-payer-card--${kind}`}
                  >
                    <header className="commission-payer-card-head">
                      <div>
                        <span className={`commission-pill commission-pill--${kind}`}>
                          {kind === 'primary'
                            ? 'IATA / primary'
                            : kind === 'secondary'
                              ? 'Secondary'
                              : `Payer ${index + 1}`}
                        </span>
                        <strong>Payer {index + 1}</strong>
                      </div>
                      {payers.length > 1 && (
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => setPayers((rows) => rows.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      )}
                    </header>

                    <label className="commission-field">
                      <span>Who owes Padova</span>
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

                    <div className="commission-payer-row">
                      <label className="commission-check">
                        <input
                          type="checkbox"
                          checked={p.is_iata_partner}
                          onChange={(e) =>
                            updatePayer(index, { is_iata_partner: e.target.checked })
                          }
                        />
                        <span>
                          <strong>IATA partner</strong>
                          <small>Primary receivable</small>
                        </span>
                      </label>
                      <label className="commission-field commission-field--amount">
                        <span>Gross (USD)</span>
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
                      </label>
                    </div>

                    {showMore && (
                      <div className="commission-more-grid">
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
                          <span>Collector keeps (USD)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={p.retained}
                            onChange={(e) => updatePayer(index, { retained: e.target.value })}
                          />
                        </label>
                        <label className="commission-field">
                          <span>Expected receipt date</span>
                          <input
                            type="date"
                            value={p.due_on}
                            onChange={(e) => updatePayer(index, { due_on: e.target.value })}
                          />
                        </label>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <button
              type="button"
              className="btn commission-add-payer"
              onClick={() => setPayers((rows) => [...rows, emptyPayer()])}
            >
              + Add secondary payer
            </button>
          </section>

          <section className="commission-section">
            {existingReferral ? (
              <p className="commission-note">
                This booking already has a referring-org payable. Record IATA / secondary
                receivables here only — do not post a second referrer payout.
              </p>
            ) : (
              <label className="commission-check commission-check--block">
                <input
                  type="checkbox"
                  checked={payOut}
                  onChange={(e) => setPayOut(e.target.checked)}
                />
                <span>
                  <strong>Pay out to referrer</strong>
                  <small>
                    Commission Payable Padova owes — only when the booking has no referring
                    organization deal
                  </small>
                </span>
              </label>
            )}

            {payOut && !existingReferral && (
              <div className="commission-payer-card commission-payer-card--payout">
                <header className="commission-payer-card-head">
                  <div>
                    <span className="commission-pill commission-pill--payout">Payable</span>
                    <strong>Referrer payout</strong>
                  </div>
                </header>
                <label className="commission-field">
                  <span>Payee</span>
                  <SearchableSelect
                    id="commission-referrer"
                    label="Referrer"
                    value={referral.referrer_id}
                    options={orgOptions.length ? orgOptions : partyOptions}
                    onChange={(id) => setReferral((r) => ({ ...r, referrer_id: id }))}
                    required
                  />
                </label>
                <div className="commission-payer-row">
                  <label className="commission-field">
                    <span>Amount type</span>
                    <select
                      value={referral.basis}
                      onChange={(e) =>
                        setReferral((r) => ({
                          ...r,
                          basis: e.target.value as 'percentage' | 'fixed',
                        }))
                      }
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed dollar</option>
                    </select>
                  </label>
                  {referral.basis === 'percentage' ? (
                    <label className="commission-field commission-field--amount">
                      <span>% of profit</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={referral.rate_bps}
                        onChange={(e) => setReferral((r) => ({ ...r, rate_bps: e.target.value }))}
                      />
                    </label>
                  ) : (
                    <label className="commission-field commission-field--amount">
                      <span>Fixed (USD)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={referral.fixed_amount}
                        onChange={(e) =>
                          setReferral((r) => ({ ...r, fixed_amount: e.target.value }))
                        }
                      />
                    </label>
                  )}
                </div>
                <label className="commission-field">
                  <span>Reason / agreement source</span>
                  <textarea
                    value={referral.reason}
                    onChange={(e) => setReferral((r) => ({ ...r, reason: e.target.value }))}
                    required
                    rows={2}
                  />
                </label>
                {showMore && (
                  <div className="commission-more-grid">
                    <label className="commission-field">
                      <span>Payable when</span>
                      <select
                        value={referral.payable_when}
                        onChange={(e) =>
                          setReferral((r) => ({ ...r, payable_when: e.target.value }))
                        }
                      >
                        <option>When earned</option>
                        <option>After travel</option>
                        <option>After customer paid</option>
                        <option>After commission received</option>
                        <option>On date</option>
                      </select>
                    </label>
                    <label className="commission-field">
                      <span>Earliest payout date</span>
                      <input
                        type="date"
                        value={referral.due_on}
                        onChange={(e) => setReferral((r) => ({ ...r, due_on: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          <details
            className="commission-more"
            open={showMore}
            onToggle={(e) => setShowMore(e.currentTarget.open)}
          >
            <summary>More options · collector, retained, effective date</summary>
            <label className="commission-field">
              <span>Effective date</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              <small>Defaults to today. Use today if unsure — blank is not allowed on save.</small>
            </label>
          </details>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-footer commission-bundle-foot">
          {summary && (
            <div className="commission-summary-bar" aria-live="polite">
              <span>
                In <strong>{money(summary.incoming)}</strong>
              </span>
              <span>
                Collector <strong>{money(summary.retained)}</strong>
              </span>
              <span>
                Padova keeps <strong>{money(summary.keeps)}</strong>
              </span>
              {payOut ? <span className="commission-summary-tag">+ payable</span> : null}
            </div>
          )}
          <div className="commission-bundle-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy
                ? 'Saving…'
                : `Save ${payers.length} receivable${payers.length === 1 ? '' : 's'}${
                    payOut ? ' + payable' : ''
                  }`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
