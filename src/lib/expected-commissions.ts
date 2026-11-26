/** Plan Phase 3 — expected commissions not yet posted as receivables. */

import { heldDeadlineUrgency } from './held-pnr';
import { hotelCheckoutOn } from './hotel-checkout-commission';
import { isMoneyBackDenied } from './money-back-deny';
import { isMoneyBackVoided } from './money-back-void';

export type ExpectedCommissionRow = {
  booking_id: string;
  code: string;
  customer: string;
  product: string;
  how_booked?: string;
  lane: 'primary' | 'secondary';
  payer_id?: string | null;
  amount: number | null;
  notes?: string;
  /** Hotel checkout (travel_end); null when unknown — never invent. */
  checkout_on?: string | null;
  checkout_urgency?: 'ok' | 'due_soon' | 'due_today' | 'overdue' | 'none';
};

type BookingLike = {
  id: string;
  code?: string;
  customer?: string;
  product?: string;
  travel_end?: string | null;
  itinerary?: {
    travel_end?: string | null;
    operational_entry?: {
      how_booked?: string;
      commission?: {
        expected?: string;
        payer_id?: string | null;
        amount?: number | null;
        notes?: string;
      } | null;
      secondary_commission?: {
        expected?: string;
        payer_id?: string | null;
        amount?: number | null;
        notes?: string;
      } | null;
    } | null;
  } | null;
};

function urgencyRank(u: ExpectedCommissionRow['checkout_urgency']): number {
  if (u === 'overdue') return 0;
  if (u === 'due_today') return 1;
  if (u === 'due_soon') return 2;
  if (u === 'ok') return 3;
  return 4;
}

/** Bookings with expected Money Back commission and no posted receivable yet. */
export function expectedCommissionFollowUps(
  bookings: BookingLike[],
  commissions: Array<{ booking_id?: string | null }>,
  today?: string,
): ExpectedCommissionRow[] {
  const posted = new Set(
    commissions.map((c) => c.booking_id).filter((id): id is string => Boolean(id)),
  );
  const rows: ExpectedCommissionRow[] = [];
  for (const b of bookings) {
    if (posted.has(b.id)) continue;
    const op = b.itinerary?.operational_entry;
    const checkout = hotelCheckoutOn(b);
    const urgency = today ? heldDeadlineUrgency(checkout, today) : 'none';
    const primary = op?.commission;
    if (
      (primary?.expected === 'Yes' || primary?.expected === 'Unknown') &&
      !isMoneyBackVoided(op, 'expected_primary', 'primary') &&
      !isMoneyBackDenied(op, 'expected_primary', 'primary')
    ) {
      rows.push({
        booking_id: b.id,
        code: String(b.code || ''),
        customer: String(b.customer || ''),
        product: String(b.product || ''),
        how_booked: op?.how_booked,
        lane: 'primary',
        payer_id: primary.payer_id,
        amount: primary.amount ?? null,
        notes: primary.notes,
        checkout_on: checkout,
        checkout_urgency: urgency,
      });
    }
    const secondary = op?.secondary_commission;
    if (
      (secondary?.expected === 'Yes' || secondary?.expected === 'Unknown') &&
      !isMoneyBackVoided(op, 'expected_secondary', 'secondary') &&
      !isMoneyBackDenied(op, 'expected_secondary', 'secondary')
    ) {
      rows.push({
        booking_id: b.id,
        code: String(b.code || ''),
        customer: String(b.customer || ''),
        product: String(b.product || ''),
        how_booked: op?.how_booked,
        lane: 'secondary',
        payer_id: secondary.payer_id,
        amount: secondary.amount ?? null,
        notes: secondary.notes,
        checkout_on: checkout,
        checkout_urgency: urgency,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      urgencyRank(a.checkout_urgency) - urgencyRank(b.checkout_urgency) ||
      String(a.checkout_on || '9999-99-99').localeCompare(String(b.checkout_on || '9999-99-99')) ||
      a.code.localeCompare(b.code) ||
      a.lane.localeCompare(b.lane),
  );
}

/**
 * Plan Expected commissions lane search: booking # · customer · how booked · notes · product.
 * Blank query → match all; empty fields never invent a hit.
 */
export function expectedCommissionMatchesSearch(
  row: {
    code?: string | null;
    customer?: string | null;
    product?: string | null;
    how_booked?: string | null;
    notes?: string | null;
    lane?: string | null;
    booking_id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    row.code,
    row.customer,
    row.product,
    row.how_booked,
    row.notes,
    row.lane,
    row.booking_id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/** Unallocated cents; never show Allocate when nothing remains. */
export function paymentUnallocatedCents(payment: {
  current_amount?: unknown;
  allocated?: unknown;
  commission_allocated?: unknown;
  direction?: string;
}): number | null {
  if (!['customer', 'supplier', 'commission'].includes(String(payment.direction || '')))
    return null;
  const left =
    Number(payment.current_amount ?? 0) -
    Number(payment.allocated ?? 0) -
    Number(payment.commission_allocated ?? 0);
  if (!Number.isFinite(left)) return null;
  return left > 0 ? left : 0;
}

/**
 * Plan triage: do not show “Allocate” / $0 left as if work remains.
 * Fully allocated receipts read as cleared — not Pending.
 */
export type PaymentAllocationStatus = 'n/a' | 'open' | 'cleared';

export function paymentAllocationStatus(payment: {
  current_amount?: unknown;
  allocated?: unknown;
  commission_allocated?: unknown;
  direction?: string;
}): PaymentAllocationStatus {
  const left = paymentUnallocatedCents(payment);
  if (left == null) return 'n/a';
  return left > 0 ? 'open' : 'cleared';
}

/** Label for the Unallocated column (never “$0.00” for cleared). */
export function paymentUnallocatedColumnLabel(
  payment: {
    current_amount?: unknown;
    allocated?: unknown;
    commission_allocated?: unknown;
    direction?: string;
  },
  formatMoney: (cents: number) => string,
): string {
  const status = paymentAllocationStatus(payment);
  if (status === 'n/a') return '—';
  if (status === 'cleared') return 'Fully allocated';
  return formatMoney(paymentUnallocatedCents(payment) ?? 0);
}

export function paymentMatchesAllocationFilter(
  payment: {
    current_amount?: unknown;
    allocated?: unknown;
    commission_allocated?: unknown;
    direction?: string;
  },
  filter: 'All' | 'Unallocated' | 'Fully allocated',
): boolean {
  if (filter === 'All') return true;
  const status = paymentAllocationStatus(payment);
  if (filter === 'Unallocated') return status === 'open';
  if (filter === 'Fully allocated') return status === 'cleared';
  return true;
}

/**
 * Plan Payments list search: party · reference · method · verification · id prefix.
 * Blank query → match all; never invents a hit from empty fields alone.
 */
export function paymentMatchesSearch(
  payment: {
    id?: string | null;
    party?: string | null;
    reference?: string | null;
    method?: string | null;
    verification?: string | null;
    direction?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    payment.party,
    payment.reference,
    payment.method,
    payment.verification,
    payment.direction,
    payment.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/** Padova net still outstanding on a posted receivable (never invents amounts). */
export function commissionOutstandingCents(c: {
  gross?: unknown;
  retained?: unknown;
  received?: unknown;
  /** Plan: deducted against remittance / paid less (append-only; not cash). */
  deducted?: unknown;
}): number {
  const due =
    Number(c.gross ?? 0) -
    Number(c.retained ?? 0) -
    Number(c.received ?? 0) -
    Number(c.deducted ?? 0);
  return Number.isFinite(due) && due > 0 ? due : 0;
}

export function commissionCollectorPartyId(c: {
  collector_id?: string | null;
  payer_id?: string | null;
}): string | null {
  return c.collector_id || c.payer_id || null;
}

/**
 * Plan v1 lump remittance: one payment covering many Money Back lines.
 * All selected rows must share the same collector/payer; amounts = outstanding nets.
 */
export function buildLumpCommissionPaymentDefaults(
  selected: Array<{
    id?: string;
    gross?: unknown;
    retained?: unknown;
    received?: unknown;
    deducted?: unknown;
    collector_id?: string | null;
    payer_id?: string | null;
  }>,
): {
  direction: 'commission';
  party_id: string;
  amount: number;
  commission_allocations: Array<{ commission_id: string; amount: number }>;
} | null {
  const lines = selected
    .filter((c): c is typeof c & { id: string } => typeof c.id === 'string' && c.id.length > 0)
    .map((c) => ({
      commission_id: c.id,
      amount: commissionOutstandingCents(c),
      party_id: commissionCollectorPartyId(c),
    }))
    .filter((l) => l.amount > 0 && l.party_id);
  if (!lines.length) return null;
  const party_id = lines[0].party_id!;
  if (lines.some((l) => l.party_id !== party_id)) return null;
  const commission_allocations = lines.map(({ commission_id, amount }) => ({
    commission_id,
    amount,
  }));
  const amount = commission_allocations.reduce((sum, l) => sum + l.amount, 0);
  return { direction: 'commission', party_id, amount, commission_allocations };
}
