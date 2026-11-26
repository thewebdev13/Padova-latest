'use client';
import { useState } from 'react';
import ListPager, { pageSlice } from '@/components/list-pager';
import { dateLabel } from '@/lib/display-date';
import { buildPayReferralPaymentDefaults } from '@/lib/referrer-payout-defaults';
type Row = Record<string, any>;
const PAGE_SIZE = 12;
const money = (v: any) =>
  v == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Number(v) / 100,
      );
export default function CommissionPayables({
  rows,
  payments,
  history,
  adjustments,
  canManage,
  enabled,
  action,
  today,
  openBooking,
  copyBookingLink,
  embedded = false,
  hidePager = false,
  page: controlledPage,
  onPage,
}: {
  rows: Row[];
  payments: Row[];
  history: Row[];
  adjustments: Row[];
  canManage: boolean;
  enabled: boolean;
  today?: string;
  action: (kind: string, defaults?: Row) => void;
  openBooking?: (id: string) => void;
  /** Plan shareable booking URL — blank id → no button. */
  copyBookingLink?: (bookingId: string) => void | Promise<void>;
  embedded?: boolean;
  hidePager?: boolean;
  page?: number;
  onPage?: (page: number) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const page = controlledPage ?? internalPage;
  const setPage = onPage ?? setInternalPage;
  const pager = pageSlice(rows, page, PAGE_SIZE);
  return (
    <div className="list-block">
    <section className={embedded ? 'commissions-payable-embed' : 'card'}>
      {!embedded && (
        <div className="card-header">
          <h2>Commission Payable</h2>
          {canManage && (
            <button className="btn ghost" disabled={!enabled} onClick={() => action('referral')}>
              Add Commission Payable
            </button>
          )}
        </div>
      )}
      {!enabled && (
        <p className="empty">
          Commission Payable extension requires deployment before new agreements can be recorded.
        </p>
      )}
      {!rows.length ? (
        <p className="empty">No commissions owed to agents, referrers or partners.</p>
      ) : (
        <div className="table-wrap commissions-compact">
          <table>
            <thead>
              <tr>
                <th>Payee / booking</th>
                <th>Agreement</th>
                <th className="money">Outstanding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pager.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.referrer}
                    {r.booking_id && openBooking ? (
                      <small>
                        <button
                          type="button"
                          className="booking-code"
                          onClick={() => openBooking(String(r.booking_id))}
                        >
                          {r.code || 'Open booking'}
                        </button>
                      </small>
                    ) : (
                      <small>{r.code}</small>
                    )}
                    <small>
                      Expected {money(r.expected_due)} · paid {money(r.paid)} · accrued{' '}
                      {money(r.accrued)}
                    </small>
                  </td>
                  <td>
                    {r.calculation === 'fixed'
                      ? money(r.fixed_amount)
                      : `${r.rate_bps / 100}% of ${String(r.percentage_basis || '').replaceAll('_', ' ')}`}
                    <small>{r.reason}</small>
                    <small>
                      {r.payable_when} · earliest{' '}
                      {r.due_on ? dateLabel(r.due_on) : 'Unknown'}
                    </small>
                  </td>
                  <td
                    className={`money ${Number(r.outstanding) > 0 ? 'text-amber outstanding-amt' : ''}`}
                  >
                    {money(r.outstanding)}
                  </td>
                  <td className="row-actions">
                    <button
                      className="btn small"
                      disabled={!canManage || !(r.payable_now > 0)}
                      title={
                        r.hold_reason || 'Record an actual payment, including a partial payment'
                      }
                      onClick={() => {
                        const seeded = buildPayReferralPaymentDefaults({
                          referral_id: r.id,
                          payable_now: r.payable_now,
                          outstanding: r.outstanding,
                          today,
                        });
                        action(
                          'pay_referral',
                          seeded
                            ? {
                                referral_id: seeded.referral_id,
                                amount: seeded.amount,
                                date: seeded.date,
                              }
                            : { referral_id: r.id },
                        );
                      }}
                    >
                      Mark paid
                    </button>
                    {copyBookingLink && r.booking_id ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-label="Copy shareable link"
                        onClick={() => void copyBookingLink(String(r.booking_id))}
                      >
                        Copy link
                      </button>
                    ) : null}
                    {canManage && enabled && r.active !== false && (
                      <div className="row-more">
                        <button
                          type="button"
                          className="btn small ghost"
                          aria-label="More actions"
                          aria-expanded={menuFor === r.id}
                          onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                        >
                          ···
                        </button>
                        {menuFor === r.id && (
                          <div className="row-more-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                action('revise_referral', {
                                  ...r,
                                  referral_id: r.id,
                                  basis: r.calculation === 'fixed' ? 'fixed' : 'percentage',
                                });
                              }}
                            >
                              Correct terms
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                action('reverse_referral', {
                                  referral_id: r.id,
                                  revision: r.revision,
                                });
                              }}
                            >
                              Reverse agreement
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <details>
                      <summary>Payments and history</summary>
                      {payments
                        .filter((p) => p.referral_id === r.id)
                        .map((p) => (
                          <p key={p.id}>
                            {p.paid_on ? dateLabel(p.paid_on) : 'Unknown date'} · {p.method} ·{' '}
                            {p.reference || 'No reference'} · originally {money(p.amount)}, net{' '}
                            {money(p.current_amount)}{' '}
                            {canManage && Number(p.current_amount) > 0 && (
                              <button
                                className="btn small ghost"
                                onClick={() =>
                                  action('reverse_referral_payment', {
                                    payment_id: p.id,
                                    referral_id: r.id,
                                  })
                                }
                              >
                                Reverse payout
                              </button>
                            )}
                          </p>
                        ))}
                      {history
                        .filter((h) => h.referral_id === r.id)
                        .map((h) => (
                          <p key={h.id}>
                            {h.effective_on ? dateLabel(h.effective_on) : 'Unknown date'} ·{' '}
                            {h.actor_name} · terms {h.revision} · {h.reason}
                            {h.active === false ? ' · agreement reversed' : ''}
                          </p>
                        ))}
                      {adjustments
                        .filter((a) => a.referral_id === r.id)
                        .map((a) => (
                          <p key={a.id}>
                            {a.effective_on ? dateLabel(a.effective_on) : 'Unknown date'} ·{' '}
                            {a.actor_name} · payout correction {money(a.delta)} · {a.reason}
                          </p>
                        ))}
                      <small>
                        Booking Notes &amp; Activity retains the related events and staff
                        attribution.
                      </small>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
      {!hidePager && rows.length > 0 ? (
        <ListPager
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          onPage={setPage}
          label="payables"
        />
      ) : null}
    </div>
  );
}
