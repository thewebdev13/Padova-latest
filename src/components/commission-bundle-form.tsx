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
      (state.referrals ?? []).some(
        (r: R) => r.booking_id === bookingId && !r.archived_at,
      ),
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
        // percentage of profit is unknown here without booking economics — show 0 until save.
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
          fixed_amount:
            referral.basis === 'fixed' ? (parseUsd(referral.fixed_amount) ?? 0) : 0,
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
        className="modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-bundle-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="commission-bundle-title">Add commission</h2>
            <p>
              Record who owes Padova (IATA partner and any secondary payer) and optionally who
              Padova pays out to. One save · exact cents · never invents Unknown as zero.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body form-grid">
          <label className="full">
            Booking
            <SearchableSelect
              id="commission-booking"
              label="Booking"
              value={bookingId}
              options={bookingOptions}
              onChange={setBookingId}
              required
            />
          </label>

          {payers.map((p, index) => (
            <fieldset key={index} className="full commission-payer-block">
              <legend>Payer {index + 1}</legend>
              <label>
                Who owes Padova
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
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={p.is_iata_partner}
                  onChange={(e) => updatePayer(index, { is_iata_partner: e.target.checked })}
                />
                IATA partner (primary receivable)
              </label>
              <label>
                Gross commission (USD)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={p.gross}
                  onChange={(e) => updatePayer(index, { gross: e.target.value })}
                />
              </label>
              {showMore && (
                <>
                  <label>
                    Paid through / collecting agency
                    <SearchableSelect
                      id={`commission-collector-${index}`}
                      label="Collector"
                      value={p.collector_id}
                      options={[{ value: '', label: 'None' }, ...partyOptions]}
                      onChange={(id) => updatePayer(index, { collector_id: id })}
                    />
                  </label>
                  <label>
                    Collector keeps (USD)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.retained}
                      onChange={(e) => updatePayer(index, { retained: e.target.value })}
                    />
                  </label>
                  <label>
                    Expected receipt date
                    <input
                      type="date"
                      value={p.due_on}
                      onChange={(e) => updatePayer(index, { due_on: e.target.value })}
                    />
                  </label>
                </>
              )}
              {payers.length > 1 && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setPayers((rows) => rows.filter((_, i) => i !== index))}
                >
                  Remove payer {index + 1}
                </button>
              )}
            </fieldset>
          ))}

          <div className="full">
            <button
              type="button"
              className="btn"
              onClick={() => setPayers((rows) => [...rows, emptyPayer()])}
            >
              + Add another payer
            </button>
          </div>

          {existingReferral ? (
            <p className="full note">
              This booking already has a referring-org Commission Payable from the affiliate on the
              booking. Add IATA / secondary receivables here only — do not post a second referrer
              payout.
            </p>
          ) : (
            <label className="full checkbox-row">
              <input
                type="checkbox"
                checked={payOut}
                onChange={(e) => setPayOut(e.target.checked)}
              />
              Pay out to referrer (Commission Payable Padova owes) — use only when the booking has
              no referring organization deal
            </label>
          )}

          {payOut && !existingReferral && (
            <fieldset className="full">
              <legend>Referrer payout</legend>
              <label>
                Payee
                <SearchableSelect
                  id="commission-referrer"
                  label="Referrer"
                  value={referral.referrer_id}
                  options={orgOptions.length ? orgOptions : partyOptions}
                  onChange={(id) => setReferral((r) => ({ ...r, referrer_id: id }))}
                  required
                />
              </label>
              <label>
                Amount type
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
                <label>
                  Percentage of profit
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
                <label>
                  Fixed amount (USD)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={referral.fixed_amount}
                    onChange={(e) => setReferral((r) => ({ ...r, fixed_amount: e.target.value }))}
                  />
                </label>
              )}
              <label className="full">
                Reason / agreement source
                <textarea
                  value={referral.reason}
                  onChange={(e) => setReferral((r) => ({ ...r, reason: e.target.value }))}
                  required
                />
              </label>
              {showMore && (
                <>
                  <label>
                    Payable when
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
                  <label>
                    Earliest payout date
                    <input
                      type="date"
                      value={referral.due_on}
                      onChange={(e) => setReferral((r) => ({ ...r, due_on: e.target.value }))}
                    />
                  </label>
                </>
              )}
            </fieldset>
          )}

          <details className="full" open={showMore} onToggle={(e) => setShowMore(e.currentTarget.open)}>
            <summary>More options · collector, retained, effective date</summary>
            <label>
              Effective date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              <small>Defaults to today. Blank is not allowed on save — use today if unsure.</small>
            </label>
          </details>

          {summary && (
            <output className="full commission-summary">
              In {money(summary.incoming)} · Collector keeps {money(summary.retained)} · Padova
              keeps {money(summary.keeps)}
              {payOut ? ` · Saved as Commission payable when referrer terms apply` : ''}
            </output>
          )}
          {error && (
            <p className="full error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
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
      </form>
    </div>
  );
}
