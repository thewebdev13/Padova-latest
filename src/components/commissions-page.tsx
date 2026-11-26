'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import CommissionPayables from './commission-payables';
import ListPager, { pageSlice } from '@/components/list-pager';
import { receivableCommissionLabel } from '@/lib/commission-line-label';
import {
  buildLumpCommissionPaymentDefaults,
  commissionOutstandingCents,
  expectedCommissionFollowUps,
  expectedCommissionMatchesSearch,
} from '@/lib/expected-commissions';
import { buildConfirmCommissionDefaults } from '@/lib/confirm-commission';
import { moneyBackDeductedCents } from '@/lib/money-back-deduct';

type R = Record<string, any>;

const money = (v: any) =>
  v === null
    ? 'Unknown'
    : v === undefined || !Number.isFinite(Number(v))
      ? 'Restricted'
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
          Number(v ?? 0) / 100,
        );

function deductedOf(c: R, bookings: R[]) {
  const booking = bookings.find((b) => b.id === c.booking_id);
  return moneyBackDeductedCents(booking?.itinerary?.operational_entry, 'commission', String(c.id));
}

function outstandingOf(c: R, bookings: R[] = []) {
  return commissionOutstandingCents({ ...c, deducted: deductedOf(c, bookings) });
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
  bookings = [],
  canManage,
  canEditPayments,
  payableTermsEnabled,
  today,
  action,
  openBooking,
  copyBookingLink,
  newCommissionButton,
}: {
  commissions: R[];
  referrals: R[];
  referralPayments: R[];
  referralTerms: R[];
  referralPaymentAdjustments: R[];
  bookings?: R[];
  canManage: boolean;
  canEditPayments: boolean;
  payableTermsEnabled: boolean;
  today: string;
  action: (kind: string, defaults?: R) => void;
  openBooking: (id: string) => void;
  /** Plan shareable booking URL — blank id → no button. */
  copyBookingLink?: (bookingId: string) => void | Promise<void>;
  newCommissionButton: ReactNode;
}) {
  const [lane, setLane] = useState<'receivable' | 'expected' | 'payable'>('receivable');
  const [status, setStatus] = useState<'All' | 'Outstanding' | 'Received'>('All');
  const [payableStatus, setPayableStatus] = useState<'All' | 'Outstanding' | 'Paid'>('All');
  const [sort, setSort] = useState<'newest' | 'due' | 'outstanding'>('newest');
  const [payableSort, setPayableSort] = useState<'newest' | 'due' | 'outstanding'>('outstanding');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [payablePage, setPayablePage] = useState(1);
  const [expectedPage, setExpectedPage] = useState(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const expectedRows = useMemo(
    () =>
      expectedCommissionFollowUps(
        bookings.filter((b) => typeof b?.id === 'string') as Array<{
          id: string;
          code?: string;
          customer?: string;
          product?: string;
          travel_end?: string | null;
          itinerary?: R;
        }>,
        commissions,
        today,
      ),
    [bookings, commissions, today],
  );

  const filteredPayables = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...referrals];
    if (payableStatus === 'Outstanding') rows = rows.filter((r) => Number(r.outstanding) > 0);
    if (payableStatus === 'Paid')
      rows = rows.filter((r) => Number(r.outstanding) <= 0 && Number(r.paid) > 0);
    if (q) {
      rows = rows.filter((r) => {
        const blob = `${r.code ?? ''} ${r.referrer ?? ''} ${r.reason ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => {
      if (payableSort === 'due') {
        return (
          String(a.due_on || '9999-99-99').localeCompare(String(b.due_on || '9999-99-99')) ||
          String(a.code || '').localeCompare(String(b.code || ''))
        );
      }
      if (payableSort === 'outstanding') {
        return (
          Number(b.outstanding) - Number(a.outstanding) ||
          String(a.code || '').localeCompare(String(b.code || ''))
        );
      }
      return String(b.id).localeCompare(String(a.id));
    });
    return rows;
  }, [referrals, search, payableSort, payableStatus]);

  const payablePager = pageSlice(filteredPayables, payablePage, PAGE_SIZE);
  const filteredExpected = useMemo(() => {
    return expectedRows.filter((row) => expectedCommissionMatchesSearch(row, search));
  }, [expectedRows, search]);
  const expectedPager = pageSlice(filteredExpected, expectedPage, PAGE_SIZE);

  const receivableCount = commissions.length;
  const expectedCount = expectedRows.length;
  const payableCount = referrals.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...commissions];
    if (status === 'Outstanding') rows = rows.filter((c) => outstandingOf(c, bookings) > 0);
    if (status === 'Received')
      rows = rows.filter(
        (c) =>
          outstandingOf(c, bookings) <= 0 &&
          (Number(c.received) > 0 || deductedOf(c, bookings) > 0),
      );
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
          outstandingOf(b, bookings) - outstandingOf(a, bookings) ||
          String(b.posted_at || '').localeCompare(String(a.posted_at || ''))
        );
      }
      return (
        String(b.posted_at || '').localeCompare(String(a.posted_at || '')) ||
        String(b.id).localeCompare(String(a.id))
      );
    });
    return rows;
  }, [commissions, bookings, search, sort, status]);

  const pager = pageSlice(filtered, page, PAGE_SIZE);
  const shown = pager.items;
  const sortLabel =
    sort === 'due' ? 'expected date' : sort === 'outstanding' ? 'amount outstanding' : 'newest first';
  const selectedRows = commissions
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => ({ ...c, deducted: deductedOf(c, bookings) }));
  const lumpDefaults = buildLumpCommissionPaymentDefaults(selectedRows);
  const toggleSelected = (id: string, on: boolean) => {
    setSelectedIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PADOVA WORKSPACE</div>
          <h1>Expected commissions</h1>
          <p className="subtitle">
            What each payer owes Padova — expected and confirmed — plus lump received and
            deductions. Payable covers who Padova pays out.
          </p>
        </div>
        <div className="heading-actions">
          {lane === 'receivable' && canManage && canEditPayments && selectedIds.length > 0 ? (
            <button
              type="button"
              className="btn primary"
              disabled={!lumpDefaults}
              title={
                lumpDefaults
                  ? 'One remittance covering the selected Money Back lines'
                  : 'Select outstanding lines that share the same collector/payer'
              }
              onClick={() => {
                if (!lumpDefaults) return;
                action('payment', {
                  direction: lumpDefaults.direction,
                  party_id: lumpDefaults.party_id,
                  amount: (lumpDefaults.amount / 100).toFixed(2),
                  commission_allocations: lumpDefaults.commission_allocations.map((a) => ({
                    commission_id: a.commission_id,
                    amount: (a.amount / 100).toFixed(2),
                  })),
                });
                setSelectedIds([]);
              }}
            >
              Record collector payment ({selectedIds.length})
            </button>
          ) : null}
          {newCommissionButton}
        </div>
      </div>

      <div className="list-block">
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
              setSelectedIds([]);
            }}
          >
            Receivable
            <span className="commissions-sample-count">{receivableCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'expected'}
            className={`commissions-sample-tab${lane === 'expected' ? ' is-active' : ''}`}
            onClick={() => {
              setLane('expected');
              setExpectedPage(1);
              setMenuFor(null);
              setSelectedIds([]);
            }}
          >
            Expected
            <span className="commissions-sample-count">{expectedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'payable'}
            className={`commissions-sample-tab${lane === 'payable' ? ' is-active' : ''}`}
            onClick={() => {
              setLane('payable');
              setPayablePage(1);
              setMenuFor(null);
              setSelectedIds([]);
            }}
          >
            Payable
            <span className="commissions-sample-count">{payableCount}</span>
          </button>
        </div>

        {lane === 'receivable' || lane === 'payable' || lane === 'expected' ? (
          <div className="commissions-sample-toolbar">
            <label className="commissions-sample-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                placeholder={
                  lane === 'payable'
                    ? 'Search booking # or payee…'
                    : lane === 'expected'
                      ? 'Search booking #, customer or how booked…'
                      : 'Search booking # or payer…'
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setPayablePage(1);
                  setExpectedPage(1);
                }}
                aria-label="Search commissions"
              />
            </label>
            {lane === 'expected' ? null : lane === 'receivable' ? (
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
            ) : (
              <div className="commissions-sample-segment" role="tablist" aria-label="Payable status">
                {(['All', 'Outstanding', 'Paid'] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={payableStatus === x ? 'is-active' : undefined}
                    aria-selected={payableStatus === x}
                    onClick={() => {
                      setPayableStatus(x);
                      setPayablePage(1);
                    }}
                  >
                    {x}
                  </button>
                ))}
              </div>
            )}
            {lane === 'expected' ? null : (
              <label className="commissions-sample-sort">
                <span className="visually-hidden">Sort</span>
                <select
                  value={lane === 'payable' ? payableSort : sort}
                  onChange={(e) => {
                    const v = e.target.value as 'newest' | 'due' | 'outstanding';
                    if (lane === 'payable') {
                      setPayableSort(v);
                      setPayablePage(1);
                    } else {
                      setSort(v);
                      setPage(1);
                    }
                  }}
                  aria-label="Sort commissions"
                >
                  <option value="newest">Sort: Newest first</option>
                  <option value="due">Sort: Expected date</option>
                  <option value="outstanding">Sort: Amount outstanding</option>
                </select>
                <ChevronDown size={14} aria-hidden className="commissions-sample-sort-icon" />
              </label>
            )}
          </div>
        ) : null}

        {lane === 'receivable' ? (
          <>

            {!filtered.length ? (
              <p className="empty commissions-sample-empty">
                No commission receivables match this filter.
              </p>
            ) : (
              <div className="table-wrap commissions-sample-table">
                <table>
                  <colgroup>
                    <col className="commissions-col-select" />
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
                      <th aria-label="Select for lump payment" />
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
                      const due = outstandingOf(c, bookings);
                      const label = receivableCommissionLabel(c, null, siblings);
                      return (
                        <tr key={c.id}>
                          <td>
                            {canManage && canEditPayments && due > 0 ? (
                              <input
                                type="checkbox"
                                aria-label={`Select ${c.code} for collector payment`}
                                checked={selectedIds.includes(c.id)}
                                onChange={(e) => toggleSelected(c.id, e.target.checked)}
                              />
                            ) : null}
                          </td>
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
                                onClick={() => {
                                  const one = buildLumpCommissionPaymentDefaults([
                                    { ...c, deducted: deductedOf(c, bookings) },
                                  ]);
                                  if (one) {
                                    action('payment', {
                                      direction: one.direction,
                                      party_id: one.party_id,
                                      amount: (one.amount / 100).toFixed(2),
                                      commission_allocations: one.commission_allocations.map(
                                        (a) => ({
                                          commission_id: a.commission_id,
                                          amount: (a.amount / 100).toFixed(2),
                                        }),
                                      ),
                                    });
                                  } else {
                                    action('payment', {
                                      direction: 'commission',
                                      party_id: c.collector_id ?? c.payer_id,
                                      commission_id: c.id,
                                    });
                                  }
                                }}
                              >
                                Record receipt
                              </button>
                            ) : null}
                            {copyBookingLink && c.booking_id ? (
                              <button
                                type="button"
                                className="btn small ghost"
                                aria-label="Copy shareable link"
                                onClick={() => void copyBookingLink(String(c.booking_id))}
                              >
                                Copy link
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

          </>
        ) : lane === 'expected' ? (
          !filteredExpected.length ? (
            <p className="empty commissions-sample-empty">
              {search.trim()
                ? 'No expected commissions match this search.'
                : 'No expected commissions waiting to be posted. Hotel-with-commission bookings appear here until Add commission creates a receivable.'}
            </p>
          ) : (
            <div className="table-wrap commissions-sample-table">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Customer</th>
                    <th>Lane</th>
                    <th className="money">Expected</th>
                    <th>Checkout</th>
                    <th>How booked</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {expectedPager.items.map((row) => (
                    <tr key={`${row.booking_id}-${row.lane}`}>
                      <td>
                        <button
                          className="booking-code"
                          type="button"
                          onClick={() => openBooking(row.booking_id)}
                        >
                          {row.code}
                        </button>
                        <small>{row.product}</small>
                      </td>
                      <td>{row.customer || '—'}</td>
                      <td>{row.lane === 'primary' ? 'Primary' : 'Secondary'}</td>
                      <td className="money">{money(row.amount)}</td>
                      <td>
                        {row.checkout_on ? shortExpected(row.checkout_on) : '—'}
                        {row.checkout_urgency === 'overdue' ? (
                          <small className="commissions-through">Past checkout</small>
                        ) : row.checkout_urgency === 'due_today' ? (
                          <small className="commissions-through">Checkout today</small>
                        ) : row.checkout_urgency === 'due_soon' ? (
                          <small className="commissions-through">Checkout soon</small>
                        ) : null}
                      </td>
                      <td>
                        {row.how_booked || '—'}
                        {row.notes ? <small>{row.notes}</small> : null}
                      </td>
                      <td className="row-actions">
                        {canManage ? (
                          <button
                            className="btn small commissions-record-btn"
                            type="button"
                            onClick={() => {
                              const booking = bookings.find((b) => b.id === row.booking_id);
                              const op = booking?.itinerary?.operational_entry;
                              action(
                                'commission',
                                buildConfirmCommissionDefaults({
                                  bookingId: row.booking_id,
                                  which: row.lane === 'secondary' ? 'secondary' : 'primary',
                                  commission: op?.commission,
                                  secondary_commission: op?.secondary_commission,
                                }),
                              );
                            }}
                          >
                            Confirm
                          </button>
                        ) : null}
                        {copyBookingLink && row.booking_id ? (
                          <button
                            type="button"
                            className="btn small ghost"
                            aria-label="Copy shareable link"
                            onClick={() => void copyBookingLink(String(row.booking_id))}
                          >
                            Copy link
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !filteredPayables.length ? (
          <p className="empty commissions-sample-empty">
            No commission payables match this filter.
          </p>
        ) : (
          <CommissionPayables
            rows={filteredPayables}
            payments={referralPayments}
            history={referralTerms}
            adjustments={referralPaymentAdjustments}
            canManage={canManage}
            enabled={payableTermsEnabled}
            action={action}
            today={today}
            openBooking={openBooking}
            copyBookingLink={copyBookingLink}
            embedded
            hidePager
            page={payablePage}
            onPage={setPayablePage}
          />
        )}
      </section>
      {lane === 'receivable' && filtered.length > 0 ? (
        <ListPager
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          onPage={setPage}
          label={`receivables · ${sortLabel}`}
        />
      ) : null}
      {lane === 'expected' && filteredExpected.length > 0 ? (
        <ListPager
          page={expectedPager.page}
          totalPages={expectedPager.totalPages}
          total={expectedPager.total}
          from={expectedPager.from}
          to={expectedPager.to}
          onPage={setExpectedPage}
          label="expected commissions"
        />
      ) : null}
      {lane === 'payable' && filteredPayables.length > 0 ? (
        <ListPager
          page={payablePager.page}
          totalPages={payablePager.totalPages}
          total={payablePager.total}
          from={payablePager.from}
          to={payablePager.to}
          onPage={setPayablePage}
          label="payables"
        />
      ) : null}
      </div>
    </>
  );
}
