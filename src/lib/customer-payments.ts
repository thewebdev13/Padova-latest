/**
 * Plan Phase 4 — customer person: payments with allocations at a glance.
 * Uses payment_balances fields only; never invents amounts.
 */

import {
  paymentAllocationStatus,
  paymentUnallocatedCents,
  type PaymentAllocationStatus,
} from './expected-commissions';

export type CustomerPaymentInput = {
  id?: string;
  party_id?: string | null;
  direction?: string | null;
  paid_on?: string | null;
  method?: string | null;
  reference?: string | null;
  current_amount?: unknown;
  allocated?: unknown;
  commission_allocated?: unknown;
  /** Plan: separate Card fee charge posted with this receipt (USD cents). */
  customer_card_fee_cents?: unknown;
};

/** One booking line on a customer receipt (Plan: visible allocation lines + remainder). */
export type CustomerPaymentAllocationLine = {
  id: string;
  booking_id: string;
  booking_code: string;
  booking_label: string;
  amount_cents: number | null;
};

export type CustomerPaymentAllocationInput = {
  id?: string;
  payment_id?: string | null;
  booking_id?: string | null;
  booking_code?: string | null;
  booking_summary?: string | null;
  booking_product?: string | null;
  net_amount?: unknown;
  amount?: unknown;
};

export type CustomerPaymentRow = {
  id: string;
  paid_on: string | null;
  method: string;
  reference: string;
  amount_cents: number | null;
  allocated_cents: number | null;
  unallocated_cents: number | null;
  status: PaymentAllocationStatus;
  lines: CustomerPaymentAllocationLine[];
  /** Separate card fee line; null = unknown/not recorded; 0 = none. */
  card_fee_cents: number | null;
};

export type CustomerPaymentsSummary = {
  rows: CustomerPaymentRow[];
  received_cents: number | null;
  allocated_cents: number | null;
  unallocated_cents: number | null;
  incomplete: boolean;
  open_count: number;
};

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function bookingLabel(a: CustomerPaymentAllocationInput): string {
  const code = String(a.booking_code || '').trim();
  const product = String(a.booking_product || '').trim();
  const summary = String(a.booking_summary || '').trim();
  if (code && product) return `${code} · ${product}`;
  if (code) return code;
  if (product) return product;
  if (summary) return summary.slice(0, 48);
  return 'Booking';
}

/** Allocation lines for one payment; skip reversed (net 0) and missing ids. */
export function allocationLinesForPayment(
  allocations: CustomerPaymentAllocationInput[],
  paymentId: string,
): CustomerPaymentAllocationLine[] {
  const lines: CustomerPaymentAllocationLine[] = [];
  for (const a of allocations) {
    if (!a.id || String(a.payment_id || '') !== paymentId) continue;
    if (!a.booking_id) continue;
    const amount = asCents(a.net_amount ?? a.amount);
    if (amount === 0) continue; // fully reversed — not a visible line
    lines.push({
      id: String(a.id),
      booking_id: String(a.booking_id),
      booking_code: String(a.booking_code || '').trim() || '—',
      booking_label: bookingLabel(a),
      amount_cents: amount,
    });
  }
  return lines;
}

/** Map payment id → customer card fee cents from payment command results. */
export function cardFeeCentsByPaymentId(
  rows: Array<{ payment_id?: string | null; customer_card_fee_cents?: unknown }>,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const r of rows) {
    if (!r.payment_id) continue;
    out.set(String(r.payment_id), asCents(r.customer_card_fee_cents));
  }
  return out;
}

/** Customer-direction receipts for one party, newest first. */
export function customerPaymentsForParty(
  payments: CustomerPaymentInput[],
  partyId: string,
  allocations: CustomerPaymentAllocationInput[] = [],
  cardFeesByPaymentId: Map<string, number | null> | Record<string, number | null> = new Map(),
): CustomerPaymentsSummary {
  const rows: CustomerPaymentRow[] = [];
  let received = 0;
  let allocated = 0;
  let unallocated = 0;
  let incomplete = false;
  let anyKnown = false;
  let open_count = 0;
  const feeMap =
    cardFeesByPaymentId instanceof Map
      ? cardFeesByPaymentId
      : new Map(Object.entries(cardFeesByPaymentId));

  const filtered = payments
    .filter(
      (p) =>
        String(p.party_id || '') === partyId && String(p.direction || '') === 'customer' && p.id,
    )
    .sort((a, b) => String(b.paid_on || '').localeCompare(String(a.paid_on || '')));

  for (const p of filtered) {
    const amount = asCents(p.current_amount);
    const alloc = asCents(p.allocated);
    const paymentShape = {
      current_amount: p.current_amount,
      allocated: p.allocated,
      commission_allocated: p.commission_allocated,
      direction: p.direction == null ? undefined : String(p.direction),
    };
    const left = paymentUnallocatedCents(paymentShape);
    const status = paymentAllocationStatus(paymentShape);
    const lines = allocationLinesForPayment(allocations, String(p.id));
    const fromInput = asCents(p.customer_card_fee_cents);
    const fromMap = feeMap.has(String(p.id)) ? feeMap.get(String(p.id))! : undefined;
    // Prefer explicit payment input; else command map; else 0 when method known non-card path not required — leave null only if map said null.
    const card_fee_cents =
      fromInput != null ? fromInput : fromMap !== undefined ? fromMap : 0;
    if (amount == null) incomplete = true;
    else {
      anyKnown = true;
      received += amount;
    }
    if (alloc == null && amount != null) incomplete = true;
    else if (alloc != null) allocated += alloc;
    if (left == null && amount != null) incomplete = true;
    else if (left != null) {
      unallocated += left;
      if (left > 0) open_count += 1;
    }
    if (lines.some((l) => l.amount_cents == null)) incomplete = true;
    if (card_fee_cents == null) incomplete = true;
    rows.push({
      id: String(p.id),
      paid_on: p.paid_on ? String(p.paid_on).slice(0, 10) : null,
      method: String(p.method || '—'),
      reference: String(p.reference || '').trim() || 'No reference',
      amount_cents: amount,
      allocated_cents: alloc,
      unallocated_cents: left,
      status,
      lines,
      card_fee_cents,
    });
  }

  if (!rows.length)
    return {
      rows: [],
      received_cents: 0,
      allocated_cents: 0,
      unallocated_cents: 0,
      incomplete: false,
      open_count: 0,
    };

  if (!anyKnown)
    return {
      rows,
      received_cents: null,
      allocated_cents: null,
      unallocated_cents: null,
      incomplete: true,
      open_count,
    };

  return {
    rows,
    received_cents: received,
    allocated_cents: allocated,
    unallocated_cents: unallocated,
    incomplete,
    open_count,
  };
}
