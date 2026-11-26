'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import SearchableSelect from './searchable-select';
import { FieldError, FormAlert } from './form-feedback';
import {
  formatReferralRateLabel,
  partyReferralRateBps,
  suggestReferrerShareCents,
} from '@/lib/referrer-defaults';
import {
  defaultCommissionIataPartner,
  defaultHotelCommissionPayerId,
  isHotelCommissionBooking,
  suggestSruly9010RetainedDollars,
} from '@/lib/hotel-commission-defaults';

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
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
  const selectedBooking = (state.bookings ?? []).find((b: R) => b.id === bookingId);
  const hotelCommissionBooking = isHotelCommissionBooking(selectedBooking);
  const srulyParty = (state.parties ?? []).find(
    (p: R) =>
      !p.archived_at &&
      /sruly/i.test(String(p.name || '')) &&
      (p.roles ?? []).some((r: string) =>
        ['commission_payer', 'partner', 'seller', 'source'].includes(r),
      ),
  );
  const [payers, setPayers] = useState<PayerRow[]>(() => {
    const hotel = isHotelCommissionBooking(
      (state.bookings ?? []).find((b: R) => b.id === String(config.defaults?.booking_id || '')),
    );
    return [
      {
        ...emptyPayer(),
        // Plan Change: IATA off by default (hotel does not flip it on).
        // Confirm-from-expected may set is_iata_partner explicitly (primary vs secondary).
        is_iata_partner: defaultCommissionIataPartner(
          config.defaults?.is_iata_partner as boolean | null | undefined,
        ),
        payer_id: defaultHotelCommissionPayerId({
          hotelBooking: hotel,
          explicitPayerId: config.defaults?.payer_id as string | null | undefined,
          srulyPartyId: srulyParty?.id as string | null | undefined,
        }),
        gross:
          config.defaults?.gross != null ? (Number(config.defaults.gross) / 100).toFixed(2) : '',
        retained:
          config.defaults?.retained != null
            ? (Number(config.defaults.retained) / 100).toFixed(2)
            : '',
        due_on: String(config.defaults?.due_on || ''),
        collector_id: String(config.defaults?.collector_id || ''),
      },
    ];
  });
  const [referral, setReferral] = useState({
    referrer_id: String(config.defaults?.referrer_id || ''),
    basis: 'fixed' as 'percentage' | 'fixed',
    rate_bps: '',
    fixed_amount: '',
    percentage_basis: 'profit',
    due_on: '',
    reason: 'Affiliate share on this booking',
    payable_when: 'After commission confirmed',
    earned: true,
  });

  useEffect(() => {
    if (existingReferral) {
      setReferral((r) => ({ ...r, referrer_id: '', fixed_amount: '' }));
    }
  }, [existingReferral]);

  const [extraParties, setExtraParties] = useState<R[]>([]);
  const parties = [...(state.parties ?? []).filter((p: R) => !p.archived_at), ...extraParties];
  const partyOptions = parties.map((p: R) => ({ value: p.id, label: p.name }));
  const bookingOptions = (state.bookings ?? []).map((b: R) => ({
    value: b.id,
    label: `${b.code} · ${b.summary || b.customer || ''}`.trim(),
  }));
  const orgOptions = (state.referralOrganizations ?? []).map((r: R) => ({
    value: r.accounting_party_id || r.id,
    label: `${r.name}${r.location ? ` · ${r.location}` : ''}`,
  }));
  const referrerOptions = [
    { value: '', label: 'None' },
    ...(orgOptions.length ? orgOptions : []),
    ...partyOptions.filter((o) => !orgOptions.some((g: { value: string }) => g.value === o.value)),
  ];

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const updatePayer = (index: number, patch: Partial<PayerRow>) => {
    for (const key of Object.keys(patch)) clearFieldError(`payer_${index}_${key}`);
    const current = payers[index];
    const merged = current ? { ...current, ...patch } : null;
    const seeded =
      patch.gross !== undefined && merged
        ? suggestSruly9010RetainedDollars({
            shouldSeed: merged.is_iata_partner || hotelCommissionBooking,
            grossRaw: merged.gross,
            retainedRaw: merged.retained,
          })
        : null;
    if (seeded) setShowMore(true);
    setPayers((rows) =>
      rows.map((row, i) => {
        if (i !== index) {
          if (patch.is_iata_partner === true) return { ...row, is_iata_partner: false };
          return row;
        }
        const next = { ...row, ...patch };
        // Sruly hotel / IATA partner: when gross entered, seed 10% retained if blank.
        if (seeded) next.retained = seeded;
        return next;
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

  useEffect(() => {
    if (!attempted || !dialog.current) return;
    const first = dialog.current.querySelector<HTMLElement>('.form-field.has-error, .commission-field.has-error');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [attempted, fieldErrors]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    setError('');
    const nextErrors: Record<string, string> = {};
    if (!bookingId) nextErrors.booking_id = 'Choose the booking';
    if (!date) nextErrors.date = 'Enter the effective date';
    payers.forEach((p, i) => {
      if (!p.payer_id) nextErrors[`payer_${i}_payer_id`] = `Choose payer ${i + 1}`;
      try {
        const gross = parseUsd(p.gross);
        if (gross == null || gross <= 0)
          nextErrors[`payer_${i}_gross`] = `Enter gross commission for payer ${i + 1}`;
        else {
          const retained = parseUsd(p.retained) ?? 0;
          if (retained > gross)
            nextErrors[`payer_${i}_retained`] = 'Collector retention exceeds commission';
        }
      } catch {
        nextErrors[`payer_${i}_gross`] = 'Enter an exact dollar amount';
      }
      if (!p.due_on) nextErrors[`payer_${i}_due_on`] = `Enter expected by date for payer ${i + 1}`;
    });
    if (payOutActive) {
      if (!referral.reason.trim())
        nextErrors.referral_reason = 'Enter the reason / agreement source';
      try {
        const amt = parseUsd(referral.fixed_amount);
        if (amt == null || amt <= 0)
          nextErrors.referral_amount = 'Enter amount Padova owes';
      } catch {
        nextErrors.referral_amount = 'Enter an exact dollar amount';
      }
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const built = payers.map((p) => {
        const gross = parseUsd(p.gross)!;
        const retained = parseUsd(p.retained) ?? 0;
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
        const amt = parseUsd(referral.fixed_amount)!;
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
          after_receipt: referral.payable_when === 'After commission received',
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
    setExtraParties((rows) => [...rows.filter((p) => p.id !== created.id), created]);
    updatePayer(index, { payer_id: created.id });
  };

  const applyReferrerDefaults = (referrerId: string) => {
    if (!referrerId) {
      setReferral((r) => ({ ...r, referrer_id: '', rate_bps: '', fixed_amount: r.fixed_amount }));
      return;
    }
    const party = parties.find((p: R) => p.id === referrerId);
    const rate = partyReferralRateBps(party);
    const profit =
      selectedBooking?.profit == null ? null : Number(selectedBooking.profit);
    const suggested = suggestReferrerShareCents(profit, rate);
    setReferral((r) => ({
      ...r,
      referrer_id: referrerId,
      rate_bps: rate == null ? '' : (rate / 100).toFixed(2),
      percentage_basis: 'profit',
      // Seed fixed amount only when blank so staff edits are preserved.
      fixed_amount:
        String(r.fixed_amount || '').trim() === '' && suggested != null
          ? (suggested / 100).toFixed(2)
          : r.fixed_amount,
    }));
  };

  const addReferrerParty = async () => {
    if (!onCreateParty) return;
    const name = window.prompt('New referrer name');
    if (!name?.trim()) return;
    const created = await onCreateParty(
      {
        name: name.trim(),
        kind: 'person',
        roles: ['referrer'],
        date: state.today,
      },
      crypto.randomUUID(),
    );
    setExtraParties((rows) => [...rows.filter((p) => p.id !== created.id), created]);
    applyReferrerDefaults(created.id);
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
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-bundle-title"
      >
        <div className="modal-head commission-bundle-head">
          <div>
            <h2 id="commission-bundle-title">Add commission</h2>
            <p>
              Who owes Padova (receivable). Affiliate payout is separate, set Referring
              organization on the booking when possible.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body commission-bundle-body">
          <label
            className={`commission-field form-field ${attempted && fieldErrors.booking_id ? 'has-error' : ''}`}
          >
            <span>
              Booking <abbr title="required">*</abbr>
            </span>
            <SearchableSelect
              id="commission-booking"
              label="Booking"
              value={bookingId}
              options={bookingOptions}
              onChange={(id) => {
                clearFieldError('booking_id');
                setBookingId(id);
                const booking = (state.bookings ?? []).find((b: R) => b.id === id);
                if (!isHotelCommissionBooking(booking) || !srulyParty?.id) return;
                setPayers((rows) =>
                  rows.map((row, i) =>
                    i === 0 && !String(row.payer_id || '').trim()
                      ? { ...row, payer_id: String(srulyParty.id) }
                      : row,
                  ),
                );
              }}
            />
            {attempted ? <FieldError>{fieldErrors.booking_id}</FieldError> : null}
          </label>

          <p className="commission-model-hint">
            <strong>IATA partner</strong> = agency that keeps supplier commission and owes Padova
            ~90% (checkbox off by default). <strong>Hotels</strong> default to Sruly ~90% Padova /
            10% retained. <strong>Secondary</strong> = another party that also owes Padova (add
            another payer, leave IATA unchecked). <strong>Referring org</strong> = Padova owes
            them, prefer booking affiliate field, not a second payout here.
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
                  <span>IATA partner (owes Padova the partner split, usually ~90%)</span>
                </label>

                <div className="commission-payer-row commission-payer-row--inline">
                  <label
                    className={`commission-field commission-field--payer form-field ${attempted && fieldErrors[`payer_${index}_payer_id`] ? 'has-error' : ''}`}
                  >
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
                    />
                    {attempted ? (
                      <FieldError>{fieldErrors[`payer_${index}_payer_id`]}</FieldError>
                    ) : null}
                  </label>
                  <label
                    className={`commission-field commission-field--gross form-field ${attempted && fieldErrors[`payer_${index}_gross`] ? 'has-error' : ''}`}
                  >
                    <span>
                      Gross commission <abbr title="required">*</abbr>
                    </span>
                    <div className="commission-money-input">
                      <span aria-hidden>$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={p.gross}
                        onChange={(e) => updatePayer(index, { gross: e.target.value })}
                        aria-label={`Gross commission payer ${index + 1}`}
                      />
                    </div>
                    {attempted ? (
                      <FieldError>{fieldErrors[`payer_${index}_gross`]}</FieldError>
                    ) : null}
                  </label>
                  <label
                    className={`commission-field commission-field--due form-field ${attempted && fieldErrors[`payer_${index}_due_on`] ? 'has-error' : ''}`}
                  >
                    <span>
                      Expected by <abbr title="required">*</abbr>
                    </span>
                    <input
                      type="date"
                      value={p.due_on}
                      onChange={(e) => updatePayer(index, { due_on: e.target.value })}
                    />
                    {attempted ? (
                      <FieldError>{fieldErrors[`payer_${index}_due_on`]}</FieldError>
                    ) : null}
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
              This booking already has a referring-org payable. Record who owes Padova here only  - 
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
                    ...referrerOptions,
                    ...(onCreateParty
                      ? [{ value: '__add_referrer__', label: '+ Add new referrer' }]
                      : []),
                  ]}
                  onChange={(id) => {
                    if (id === '__add_referrer__') void addReferrerParty();
                    else applyReferrerDefaults(id);
                  }}
                />
              </label>
              {referral.referrer_id && (
                <p className="commission-note">
                  Referrer default{' '}
                  {referral.rate_bps
                    ? `${formatReferralRateLabel(Math.round(Number(referral.rate_bps) * 100))} of profit`
                    : 'rate Unknown'}
                  {selectedBooking?.profit == null
                    ? ' · booking profit incomplete — enter amount'
                    : ''}
                  . Edit person profile to change the stored %.
                </p>
              )}
              <label
                className={`commission-field form-field ${attempted && fieldErrors.referral_amount ? 'has-error' : ''}`}
              >
                <span>Amount Padova owes</span>
                <div className="commission-money-input">
                  <span aria-hidden>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={referral.fixed_amount}
                    onChange={(e) => {
                      clearFieldError('referral_amount');
                      setReferral((r) => ({
                        ...r,
                        basis: 'fixed',
                        fixed_amount: e.target.value,
                      }));
                    }}
                  />
                </div>
                {attempted && fieldErrors.referral_amount ? (
                  <FieldError>{fieldErrors.referral_amount}</FieldError>
                ) : (
                  <small>
                    Saved as a Commission payable. Seeded from referrer % × confirmed profit when
                    both are known.
                  </small>
                )}
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

          {Object.keys(fieldErrors).length === 0 ? (
            <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
          ) : null}
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
