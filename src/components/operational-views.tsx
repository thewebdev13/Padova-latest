'use client';
import { useEffect, useState } from 'react';
import ListPager, { pageSlice } from '@/components/list-pager';

type Row = Record<string, any>;
const names = [
  'Customer Owes',
  'Padova Owes Sellers',
  'Commission Receivable',
  'Commission Payable',
  'Pending Refunds',
  'Pending Credits',
  'Missing Cost',
  'Needs Attention',
];
const PAGE_SIZE = 20;

export default function OperationalViews({
  views,
  open,
  compact = false,
  initialSelected = 'Needs Attention',
  viewAll,
}: {
  compact?: boolean;
  initialSelected?: string;
  viewAll?: (selected: string) => void;
  views: Record<string, Row[]>;
  open: (item: Row) => void;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const [page, setPage] = useState(1);
  const rows = views[selected] ?? [];
  const pager = pageSlice<Row>(rows, page, PAGE_SIZE);
  const labels: Record<string, string> = {
    'Needs Attention': 'Needs attention',
    'Customer Owes': 'Customer owes',
    'Padova Owes Sellers': 'Owed to sellers',
    'Commission Receivable': 'Commission in',
    'Commission Payable': 'Commission out',
    'Pending Refunds': 'Refunds',
    'Pending Credits': 'Pending credits',
    'Missing Cost': 'Final cost pending',
  };

  useEffect(() => {
    setPage(1);
  }, [selected]);

  useEffect(() => {
    if (page > pager.totalPages) setPage(pager.totalPages);
  }, [page, pager.totalPages]);

  const visible = compact ? rows.slice(0, 5) : pager.items;

  return (
    <div className="list-block">
      <section className="card operational-followup">
        <div className="card-header">
          <h2>{compact ? 'Needs attention' : 'Operational follow-up'}</h2>
          {compact && (
            <button className="btn ghost" onClick={() => viewAll?.(selected)}>
              View all
            </button>
          )}
        </div>
        <div className="followup-tabs">
          {[names[7], ...names.slice(0, 7)].map((n) => (
            <button
              key={n}
              className={`btn small ${n === selected ? 'primary' : 'ghost'} ${!(views[n] ?? []).length ? 'empty-filter' : ''}`}
              aria-pressed={n === selected}
              onClick={() => setSelected(n)}
            >
              {labels[n]} <span>{(views[n] ?? []).length}</span>
            </button>
          ))}
        </div>
        {!rows.length ? (
          <p className="empty">No visible exceptions in {selected}.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking / record</th>
                  <th>Follow-up</th>
                  <th>Amount / quantity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={() => (r.booking_id || r.record_id) && open(r)}
                  >
                    <td>
                      <button
                        className="text-link"
                        disabled={!r.booking_id && !r.record_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r);
                        }}
                      >
                        {r.code ?? String(r.title ?? 'Record').split(' · ')[0]}
                      </button>
                    </td>
                    <td>
                      <strong>
                        {selected === 'Needs Attention'
                          ? r.kind
                            ? String(r.kind).replaceAll('_', ' ')
                            : 'Follow up'
                          : labels[selected]}
                      </strong>
                      <small>{r.detail || (r.title !== (r.code ?? r.title) ? r.title : '')}</small>
                    </td>
                    <td className="money">
                      {r.amount === null ||
                      /^(asset-basis|cost|commission-details|sale-unknown):/.test(r.key ?? '')
                        ? 'Unknown'
                        : r.amount !== undefined
                          ? new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(r.amount / 100)
                          : r.quantity !== undefined
                            ? `${r.quantity} ${r.unit ?? 'units'}`
                            : '—'}
                    </td>
                    <td>
                      <span
                        className={`followup-status status-${String(r.kind ?? selected)
                          .toLowerCase()
                          .replaceAll(' ', '-')}`}
                        title={r.status ?? r.kind}
                      >
                        {r.status ?? r.kind ?? labels[selected]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {compact && rows.length > 5 ? (
          <button className="btn ghost" onClick={() => viewAll?.(selected)}>
            View all {rows.length}
          </button>
        ) : null}
      </section>
      {!compact && rows.length > 0 ? (
        <ListPager
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          from={pager.from}
          to={pager.to}
          onPage={setPage}
          label="follow-ups"
        />
      ) : null}
    </div>
  );
}
