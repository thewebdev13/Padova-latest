import type { Row } from './db';
import type { Permission } from './permissions';
import { latestCreditRequests } from './v1-entry';
import { sellerUnpaidOperationalStatus } from './seller-unpaid';
import {
  compareRefundFollowUpDue,
  refundFollowUpDueOn,
  refundFollowUpUrgency,
  refundFollowUpUrgencyLabel,
} from './refund-follow-up-due';

export function operationalViews(input: {
  bookings: Row[];
  sales?: Row[];
  assets: Row[];
  parties: Row[];
  commissions: Row[];
  referrals: Row[];
  refunds: Row[];
  expectedEvents: Row[];
  attention: Row[];
  can: (p: Permission) => boolean;
  today?: string;
}) {
  const {
    bookings,
    sales = [],
    assets,
    parties,
    commissions,
    referrals,
    refunds,
    expectedEvents,
    attention,
    can,
    today,
  } = input;
  const item = (b: Row, amount?: number | null, detail?: string): Row => ({
    id: b.id,
    booking_id: b.id,
    code: b.code,
    title: b.summary,
    detail,
    amount,
  });
  const canCommissions = can('view_commissions') || can('manage_commissions');
  const asOf = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : '';
  const pendingRefunds: Row[] = [];
  if (can('view_refunds') || can('issue_refunds'))
    for (const r of refunds) {
      const supplier = Number(r.supplier_expected) - Number(r.received),
        customer = Number(r.customer_due) - Number(r.paid) - Number(r.handed_over ?? 0);
      const dueOn = refundFollowUpDueOn(r.due_on);
      const urgency = asOf ? refundFollowUpUrgency(dueOn, asOf) : 'none';
      const urgencyLabel = refundFollowUpUrgencyLabel(urgency);
      const dueDetail = [r.reason, dueOn ? `Follow-up ${dueOn}` : null, urgencyLabel]
        .filter(Boolean)
        .join(' · ');
      if (supplier > 0)
        pendingRefunds.push({
          id: r.id + ':supplier',
          booking_id: r.booking_id,
          code: r.code,
          title: 'Supplier return pending',
          detail: dueDetail || r.reason,
          due_on: dueOn,
          urgency,
          ...(['money', undefined, null].includes(r.quantity_unit ?? r.unit)
            ? { amount: supplier }
            : { quantity: supplier, unit: r.quantity_unit ?? r.unit }),
        });
      if (customer > 0)
        pendingRefunds.push({
          id: r.id + ':customer',
          booking_id: r.booking_id,
          code: r.code,
          title: 'Customer repayment pending',
          detail: dueDetail || r.reason,
          due_on: dueOn,
          urgency,
          amount: customer,
        });
    }
  if (asOf)
    pendingRefunds.sort((a, b) =>
      compareRefundFollowUpDue(
        { due_on: a.due_on as string | null, urgency: a.urgency as any },
        { due_on: b.due_on as string | null, urgency: b.urgency as any },
        asOf,
      ),
    );
  const credits: Row[] = [];
  if (can('manage_assets') || can('view_supplier_cost')) {
    for (const b of bookings)
      for (const r of latestCreditRequests(b.itinerary?.price_match_history))
        if (['Attempted', 'Pending', 'Approved'].includes(r.status))
          credits.push({
            ...item(
              b,
              can('view_supplier_cost') ? (r.expected_credit ?? r.requested_amount) : undefined,
              'Credit not yet received',
            ),
            id: r.request_id,
            status: r.status,
          });
    for (const e of expectedEvents)
      if (['Requested', 'Pending'].includes(e.status))
        credits.push({
          id: e.id,
          booking_id: e.booking_id,
          title: e.kind,
          status: e.status,
          detail: 'Expected value; not spendable inventory',
          ...(can('view_supplier_cost')
            ? { quantity: e.quantity_expected, unit: e.quantity_unit ?? e.unit }
            : {}),
        });
  }
  return {
    'Customer Owes': can('view_sale_price')
      ? [
          ...bookings
            .filter((b) => b.customer_balance != null && b.customer_balance > 0)
            .map((b) => item(b, Number(b.customer_balance), b.customer)),
          ...(can('manage_assets') || can('view_asset_basis')
            ? sales
                .filter(
                  (s) =>
                    s.proceeds != null &&
                    s.received != null &&
                    Number(s.proceeds) > Number(s.received),
                )
                .map((s) => ({
                  id: `sale:${s.id}`,
                  sale_id: s.id,
                  record_type: 'asset',
                  record_id: s.asset_id,
                  title: s.asset ?? 'Voucher sale',
                  detail: s.buyer,
                  amount: Number(s.proceeds) - Number(s.received),
                  status: 'Unpaid sale',
                }))
            : []),
        ]
      : [],
    'Padova Owes Sellers': can('view_supplier_cost')
      ? [
          ...bookings
            .filter((b) => b.recorded_supplier_balance > 0)
            .map((b) => ({
              ...item(
                b,
                Number(b.recorded_supplier_balance),
                b.supplier ?? 'Recorded booking sellers',
              ),
              status: sellerUnpaidOperationalStatus(Boolean(b.cost_incomplete)),
              kind: 'Seller unpaid',
            })),
          ...assets
            .filter((a) => a.acquisition_due > 0)
            .map((a) => ({
              id: a.id,
              title: a.name,
              detail: parties.find((p) => p.id === a.seller_id)?.name,
              amount: a.acquisition_due,
              status: 'Pay ASAP · inventory purchase',
              kind: 'Seller unpaid',
              record_type: 'asset',
              record_id: a.id,
            })),
        ]
      : [],
    'Commission Receivable': canCommissions
      ? [
          ...commissions
            .filter((c) => Number(c.gross) - Number(c.retained) > Number(c.received))
            .map((c) => ({
              id: c.id,
              booking_id: c.booking_id,
              code: c.code,
              title: c.payer,
              amount: Number(c.gross) - Number(c.retained) - Number(c.received),
              status: c.due_on ? 'Awaiting receipt' : 'Due date unknown',
            })),
          ...bookings
            .filter((b) => b.commission_incomplete)
            .map((b) => ({
              ...item(b, null, 'Commission terms need confirmation'),
              id: b.id + ':unknown-commission',
              status: 'Amount or payer unknown',
            })),
        ]
      : [],
    'Commission Payable': canCommissions
      ? referrals
          .filter(
            (r) =>
              r.expected_due == null ||
              Number(r.expected_due) > Number(r.paid) ||
              Number(r.recovery_due) > 0,
          )
          .map((r) => ({
            id: r.id,
            booking_id: r.booking_id,
            code: r.code,
            title: r.referrer,
            detail: Number(r.recovery_due) > 0 ? `Recover excess payout · ${r.reason}` : r.reason,
            amount:
              Number(r.recovery_due) > 0
                ? r.recovery_due
                : r.expected_due == null
                  ? null
                  : r.outstanding,
            status: r.status,
          }))
      : [],
    'Pending Refunds': pendingRefunds,
    'Pending Credits': credits,
    'Missing Cost': can('view_supplier_cost')
      ? bookings
          .filter((b) => b.supplier_cost_incomplete)
          .map((b) => ({
            ...item(b, null, 'Cost remains Unknown; profit is not certified'),
            status: 'Missing cost',
          }))
      : [],
    'Needs Attention': attention.map((a) => ({ ...a, id: a.key, title: a.title })),
  };
}

/**
 * Plan Follow-up / Needs attention row search:
 * code · title · detail · kind · status · booking/record ids.
 * Blank query → match all; empty fields never invent a hit.
 */
export function followupRowMatchesSearch(
  row: {
    id?: string | null;
    key?: string | null;
    code?: string | null;
    title?: string | null;
    detail?: string | null;
    kind?: string | null;
    status?: string | null;
    booking_id?: string | null;
    record_id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    row.code,
    row.title,
    row.detail,
    row.kind,
    row.status,
    row.booking_id,
    row.record_id,
    row.id,
    row.key,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}
