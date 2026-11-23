'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import CommissionPayables from './commission-payables';
import ListPager, { pageSlice } from '@/components/list-pager';
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

function shortExpected(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PAGE_SIZE = 12;

/** Site Feedback 3 Phase 3 — matches Owner sample commissions list. */
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
        return (
          ad.localeCompare(bd) ||
          String(b.posted_at || '').localeCompare(String(a.posted_at || ''))
        );
      }
      if (sort === 'outstanding') {
        return (
          outstandingOf(b) - outstandingOf(a) ||
          String(b.posted_at || '').localeCompare(String(a.posted_at || ''))
        );
      }
      return (
        String(b.posted_at || '').localeCompare(String(a.posted_at || '')) ||
        String(b.id).localeCompare(String(a.id))
      );
    });
    return rows;
  }, [commissions, search, sort, status]);

  const pager = pageSlice(filtered, page, PAGE_SIZE);
  const shown = pager.items;
  const sortLabel =
    sort === 'due' ? 'expected date' : sort === 'outstanding' ? 'amount outstanding' : 'newest first';

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PADOVA WORKSPACE</div>
          <h1>Commissions</h1>
          <p className="subtitle">
            Who owes Padova (receivable) and who Padova pays out (payable).
          </p>
        </div>
        <div className="heading-actions">{newCommissionButton}</div>
      </div>

      <section className="card commissions-sample">
        <div className="commissions-sample-tabs" role="tablist" aria-label="Commission type">
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'receivable'}
            className={`commissions-sample-tab${lane === 'receivable' ? ' is-active' : ''}`}
            onClick={() => {
              setLane('receivable');
              setPage(1);
              setMenuFor(null);
            }}
          >
            Receivable
            <span className="commissions-sample-count">{receivableCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'payable'}
            className={`commissions-sample-tab${lane === 'payable' ? ' is-active' : ''}`}
            onClick={() => {
              setLane('payable');
              setMenuFor(null);
            }}
          >
            Payable
            <span className="commissions-sample-count">{payableCount}</span>
          </button>
        </div>

        {lane === 'receivable' ? (
          <>
            <div className="commissions-sample-toolbar">
              <label className="commissions-sample-search">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  placeholder="Search booking # or payer…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Search commissions"
                />
              </label>
              <div className="commissions-sample-segment" role="tablist" aria-label="Status">
                {(['All', 'Outstanding', 'Received'] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={status === x ? 'is-active' : undefined}
                    aria-selected={status === x}
                    onClick={() => {
                      setStatus(x);
                      setPage(1);
                    }}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <label className="commissions-sample-sort">
                <span className="visually-hidden">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as typeof sort);
                    setPage(1);
                  }}
                  aria-label="Sort commissions"
                >
                  <option value="newest">Sort: Newest first</option>
                  <option value="due">Sort: Expected date</option>
                  <option value="outstanding">Sort: Amount outstanding</option>
                </select>
                <ChevronDown size={14} aria-hidden className="commissions-sample-sort-icon" />
              </label>
            </div>

            {!filtered.length ? (
              <p className="empty commissions-sample-empty">
                No commission receivables match this filter.
              </p>
            ) : (
              <div className="table-wrap commissions-sample-table">
                <table>
                  <colgroup>
                    <col className="commissions-col-booking" />
                    <col className="commissions-col-payer" />
                    <col className="commissions-col-money" />
                    <col className="commissions-col-money" />
                    <col className="commissions-col-money" />
                    <col className="commissions-col-money" />
                    <col className="commissions-col-money" />
                    <col className="commissions-col-expected" />
                    <col className="commissions-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Payer</th>
                      <th className="money">Gross</th>
                      <th className="money">Retained</th>
                      <th className="money">Padova net</th>
                      <th className="money">Received</th>
                      <th className="money">Outstanding</th>
                      <th>Expected</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c: R) => {
                      const siblings = commissions.filter((x) => x.booking_id === c.booking_id);
                      const due = outstandingOf(c);
                      const label = receivableCommissionLabel(c, null, siblings);
                      return (
                        <tr key={c.id}>
                          <td className="commissions-booking-cell">
                            <button
                              className="booking-code"
                              type="button"
                              title={label || undefined}
                              onClick={() => openBooking(c.booking_id)}
                            >
                              {c.code}
                            </button>
                          </td>
                          <td className="commissions-payer-cell">
                            <span className="commissions-payer-line">
                              <strong title={c.payer}>{c.payer}</strong>
                              {isNew(c, today) ? <span className="tag-new">New</span> : null}
                            </span>
                            {c.collector ? (
                              <small className="commissions-through" title={`Through ${c.collector}`}>
                                Through {c.collector}
                              </small>
                            ) : null}
                          </td>
                          <td className="money">{money(c.gross)}</td>
                          <td className="money">{money(c.retained)}</td>
                          <td className="money">{money(Number(c.gross) - Number(c.retained))}</td>
                          <td className="money">{money(c.received)}</td>
                          <td
                            className={`money${due > 0 ? ' outstanding-amt' : ''}`}
                          >
                            {money(due)}
                          </td>
                          <td>{shortExpected(c.due_on)}</td>
                          <td className="row-actions">
                            {canManage && canEditPayments && due > 0 ? (
                              <button
                                className="btn small commissions-record-btn"
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
                            ) : null}
                            {canManage ? (
                              <div className="row-more">
                                <button
                                  type="button"
                                  className="btn small ghost commissions-more-btn"
                                  aria-label="More actions"
                                  aria-expanded={menuFor === c.id}
                                  onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                                >
                                  ···
                                </button>
                                {menuFor === c.id ? (
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
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > 0 ? (
              <div className="commissions-sample-foot">
                <ListPager
                  page={pager.page}
                  totalPages={pager.totalPages}
                  total={pager.total}
                  from={pager.from}
                  to={pager.to}
                  onPage={setPage}
                  label={`receivables · ${sortLabel}`}
                />
              </div>
            ) : null}
          </>
        ) : (
          <CommissionPayables
            rows={referrals}
            payments={referralPayments}
            history={referralTerms}
            adjustments={referralPaymentAdjustments}
            canManage={canManage}
            enabled={payableTermsEnabled}
            action={action}
            embedded
          />
        )}
      </section>
    </>
  );
}
