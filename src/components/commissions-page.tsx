'use client';
import { useMemo, useState, type ReactNode } from 'react';
import CommissionPayables from './commission-payables';
import ListPager, { pageSlice } from './list-pager';
import { receivableCommissionLabel } from '@/lib/commission-line-label';

type R = Record<string, any>;

const money = (v: any) =>
  v === null
    ? 'Unknown'
    : v === undefined || !Number.isFinite(Number(v))
      ? 'Restricted'
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
          Number(v ?? 0) / 100,
        );

function outstandingOf(c: R) {
  return Number(c.gross) - Number(c.retained) - Number(c.received);
}

function isNew(c: R, today: string) {
  const posted = String(c.posted_at || '').slice(0, 10);
  return Boolean(posted && posted === today);
}

/** Site Feedback 3 Phase 3: receivable/payable tabs, search, sort, compact row actions. */
export default function CommissionsPage({
  commissions,
  referrals,
  referralPayments,
  referralTerms,
  referralPaymentAdjustments,
  canManage,
  canEditPayments,
  payableTermsEnabled,
  today,
  action,
  openBooking,
  newCommissionButton,
}: {
  commissions: R[];
  referrals: R[];
  referralPayments: R[];
  referralTerms: R[];
  referralPaymentAdjustments: R[];
  canManage: boolean;
  canEditPayments: boolean;
  payableTermsEnabled: boolean;
  today: string;
  action: (kind: string, defaults?: R) => void;
  openBooking: (id: string) => void;
  newCommissionButton: ReactNode;
}) {
  const [lane, setLane] = useState<'receivable' | 'payable'>('receivable');
  const [status, setStatus] = useState<'All' | 'Outstanding' | 'Received'>('All');
  const [sort, setSort] = useState<'newest' | 'due' | 'outstanding'>('newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const receivableCount = commissions.length;
  const payableCount = referrals.length;
  const outstandingCount = commissions.filter((c) => outstandingOf(c) > 0).length;
  const receivedCount = commissions.filter((c) => Number(c.received) > 0 && outstandingOf(c) <= 0)
    .length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...commissions];
    if (status === 'Outstanding') rows = rows.filter((c) => outstandingOf(c) > 0);
    if (status === 'Received')
      rows = rows.filter((c) => Number(c.received) > 0 && outstandingOf(c) <= 0);
    if (q) {
      rows = rows.filter((c) => {
        const blob = `${c.code ?? ''} ${c.payer ?? ''} ${c.collector ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => {
      if (sort === 'due') {
        const ad = String(a.due_on || '9999-99-99');
        const bd = String(b.due_on || '9999-99-99');
        return ad.localeCompare(bd) || String(b.posted_at || '').localeCompare(String(a.posted_at || ''));
      }
      if (sort === 'outstanding') {
        return outstandingOf(b) - outstandingOf(a) || String(b.posted_at || '').localeCompare(String(a.posted_at || ''));
      }
      // newest
      return String(b.posted_at || '').localeCompare(String(a.posted_at || '')) || String(b.id).localeCompare(String(a.id));
    });
    return rows;
  }, [commissions, search, sort, status]);

  const pager = pageSlice(filtered, page, 20);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PADOVA WORKSPACE</div>
          <h1>Commissions</h1>
          <p className="subtitle">
            Who owes Padova (receivable) and who Padova pays out (payable). Newest first.
          </p>
        </div>
        <div className="heading-actions">{newCommissionButton}</div>
      </div>

      <div className="followup-tabs commissions-lane-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={lane === 'receivable'}
          className={lane === 'receivable' ? 'btn small primary' : 'btn small'}
          onClick={() => {
            setLane('receivable');
            setPage(1);
          }}
        >
          Receivable · {receivableCount}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lane === 'payable'}
          className={lane === 'payable' ? 'btn small primary' : 'btn small'}
          onClick={() => {
            setLane('payable');
            setPage(1);
          }}
        >
          Payable · {payableCount}
        </button>
      </div>

      {lane === 'receivable' ? (
        <section className="card">
          <div className="card-header">
            <h2>Commission receivables</h2>
            <span className="muted">
              {outstandingCount} outstanding · {receivedCount} fully received
            </span>
          </div>
          <div className="toolbar directory-toolbar commissions-toolbar">
            <input
              className="directory-search"
              type="search"
              placeholder="Search booking # or payer"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search commissions"
            />
            <div className="followup-tabs" role="tablist" aria-label="Receivable status">
              {(['All', 'Outstanding', 'Received'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  className={status === x ? 'btn small primary' : 'btn small'}
                  onClick={() => {
                    setStatus(x);
                    setPage(1);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
            <label>
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                aria-label="Sort commissions"
              >
                <option value="newest">Newest first</option>
                <option value="due">Expected date</option>
                <option value="outstanding">Amount outstanding</option>
              </select>
            </label>
          </div>
          {!pager.items.length ? (
            <p className="empty">No commission receivables match this filter.</p>
          ) : (
            <div className="table-wrap commissions-compact">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Payer</th>
                    <th className="money">Padova net</th>
                    <th className="money">Outstanding</th>
                    <th>Expected</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pager.items.map((c: R) => {
                    const siblings = commissions.filter((x) => x.booking_id === c.booking_id);
                    const due = outstandingOf(c);
                    const label = receivableCommissionLabel(c, null, siblings);
                    return (
                      <tr key={c.id}>
                        <td>
                          <button
                            className="booking-code"
                            type="button"
                            onClick={() => openBooking(c.booking_id)}
                          >
                            {c.code}
                          </button>
                          {isNew(c, today) && <span className="tag-new">New</span>}
                          <small>{label}</small>
                        </td>
                        <td>
                          {c.payer}
                          {c.collector ? <small>Through {c.collector}</small> : null}
                        </td>
                        <td className="money">{money(Number(c.gross) - Number(c.retained))}</td>
                        <td className={`money ${due > 0 ? 'text-amber outstanding-amt' : ''}`}>
                          {money(due)}
                        </td>
                        <td>{c.due_on || '—'}</td>
                        <td className="row-actions">
                          {canManage && canEditPayments && due > 0 && (
                            <button
                              className="btn small"
                              type="button"
                              onClick={() =>
                                action('payment', {
                                  direction: 'commission',
                                  party_id: c.collector_id ?? c.payer_id,
                                  commission_id: c.id,
                                })
                              }
                            >
                              Record receipt
                            </button>
                          )}
                          {canManage && (
                            <div className="row-more">
                              <button
                                type="button"
                                className="btn small ghost"
                                aria-label="More actions"
                                aria-expanded={menuFor === c.id}
                                onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                              >
                                ···
                              </button>
                              {menuFor === c.id && (
                                <div className="row-more-menu" role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuFor(null);
                                      action('commission_receipt', { commission_id: c.id });
                                    }}
                                  >
                                    Allocate receipt
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ListPager
            page={pager.page}
            totalPages={pager.totalPages}
            total={pager.total}
            from={pager.from}
            to={pager.to}
            onPage={setPage}
            label="receivables"
          />
        </section>
      ) : (
        <CommissionPayables
          rows={referrals}
          payments={referralPayments}
          history={referralTerms}
          adjustments={referralPaymentAdjustments}
          canManage={canManage}
          enabled={payableTermsEnabled}
          action={action}
        />
      )}
    </>
  );
}
