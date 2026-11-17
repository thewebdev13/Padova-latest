'use client';
import { useState } from 'react';
type Row = Record<string, any>;
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
}: {
  rows: Row[];
  payments: Row[];
  history: Row[];
  adjustments: Row[];
  canManage: boolean;
  enabled: boolean;
  action: (kind: string, defaults?: Row) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="card-header">
        <h2>Commission Payable</h2>
        {canManage && (
          <button className="btn ghost" disabled={!enabled} onClick={() => action('referral')}>
            Add Commission Payable
          </button>
        )}
      </div>
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.referrer}
                    <small>{r.code}</small>
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
                      {r.payable_when} · earliest {r.due_on}
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
                      onClick={() => action('pay_referral', { referral_id: r.id })}
                    >
                      Record payout
                    </button>
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
                            {p.paid_on} · {p.method} · {p.reference || 'No reference'} · originally{' '}
                            {money(p.amount)}, net {money(p.current_amount)}{' '}
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
                            {h.effective_on} · {h.actor_name} · terms {h.revision} · {h.reason}
                            {h.active === false ? ' · agreement reversed' : ''}
                          </p>
                        ))}
                      {adjustments
                        .filter((a) => a.referral_id === r.id)
                        .map((a) => (
                          <p key={a.id}>
                            {a.effective_on} · {a.actor_name} · payout correction {money(a.delta)} ·{' '}
                            {a.reason}
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
  );
}
