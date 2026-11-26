/**
 * Plan v1 — customer balance (wallet): money Padova holds for a person
 * (deposit before booking, or unallocated overpayment). Apply via allocate;
 * return as payment out (return_customer_credit).
 *
 * Ledger = unallocated direction='customer' receipts on customer_credit.
 * Distinct from booking customer_balance (AR owed on one booking).
 */

import { paymentUnallocatedCents } from './expected-commissions';

export type WalletPayment = {
  id: string;
  party_id?: string | null;
  direction?: string;
  paid_on?: string | null;
  current_amount?: unknown;
  allocated?: unknown;
  commission_allocated?: unknown;
  reference?: string | null;
  method?: string | null;
};

/** Held credit for one party in integer cents; 0 when none (never invent). */
export function heldCustomerCreditCents(
  payments: WalletPayment[],
  partyId: string,
): number {
  let total = 0;
  for (const p of payments) {
    if (String(p.party_id) !== String(partyId)) continue;
    if (p.direction !== 'customer') continue;
    const left = paymentUnallocatedCents(p);
    if (left == null || left <= 0) continue;
    total += left;
  }
  return total;
}

/** Oldest-first unallocated slices for FIFO return (never invent amounts). */
export function unallocatedCustomerSlices(
  payments: WalletPayment[],
  partyId: string,
): Array<{ payment_id: string; unallocated: number; paid_on: string }> {
  return payments
    .filter((p) => String(p.party_id) === String(partyId) && p.direction === 'customer')
    .map((p) => ({
      payment_id: String(p.id),
      unallocated: paymentUnallocatedCents(p) ?? 0,
      paid_on: String(p.paid_on || ''),
    }))
    .filter((s) => s.unallocated > 0)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.payment_id.localeCompare(b.payment_id));
}

/**
 * Plan: apply held wallet credit to a booking that still owes.
 * Seeds existing `allocate` (FIFO oldest unallocated customer receipt).
 * Returns null when held or booking balance is not positive — never invent.
 */
export function buildApplyHeldCreditDefaults(input: {
  payments: WalletPayment[];
  partyId: string;
  bookingId: string;
  /** Booking AR remaining (customer_balance) in integer cents. */
  bookingBalanceCents: number | null | undefined;
}): {
  payment_id: string;
  booking_id: string;
  amount_cents: number;
  /** Dollars for money form fields (same pattern as Correct payment). */
  amount: number;
} | null {
  const balance = Math.trunc(Number(input.bookingBalanceCents));
  if (!Number.isSafeInteger(balance) || balance <= 0) return null;
  const slices = unallocatedCustomerSlices(input.payments, input.partyId);
  if (!slices.length) return null;
  const take = Math.min(slices[0].unallocated, balance);
  if (!Number.isSafeInteger(take) || take <= 0) return null;
  return {
    payment_id: slices[0].payment_id,
    booking_id: String(input.bookingId),
    amount_cents: take,
    amount: take / 100,
  };
}

/** First related booking that still owes the customer (for person-detail Apply). */
export function pickBookingForHeldCreditApply(
  bookings: Array<{ id?: unknown; customer_balance?: unknown; booked_on?: string | null }>,
): { id: string; balance_cents: number } | null {
  const open = bookings
    .map((b) => ({
      id: String(b.id ?? ''),
      balance_cents: Math.trunc(Number(b.customer_balance)),
      booked_on: String(b.booked_on || ''),
    }))
    .filter((b) => b.id)
    .filter((b) => Number.isSafeInteger(b.balance_cents) && b.balance_cents > 0)
    .sort(
      (a, b) =>
        a.booked_on.localeCompare(b.booked_on) || a.id.localeCompare(b.id),
    );
  const first = open[0];
  return first ? { id: first.id, balance_cents: first.balance_cents } : null;
}

/** FIFO plan: which payment_adjustments to post for a return amount. */
export function planCustomerCreditReturn(
  slices: Array<{ payment_id: string; unallocated: number }>,
  amountCents: number,
): Array<{ payment_id: string; reduce_by: number }> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new Error('Return amount must be a positive whole-cent amount');
  const held = slices.reduce((a, s) => a + s.unallocated, 0);
  if (amountCents > held)
    throw new Error(
      `Return exceeds held customer credit (${held} cents available; requested ${amountCents})`,
    );
  let left = amountCents;
  const plan: Array<{ payment_id: string; reduce_by: number }> = [];
  for (const s of slices) {
    if (!left) break;
    const take = Math.min(left, s.unallocated);
    if (take > 0) {
      plan.push({ payment_id: s.payment_id, reduce_by: take });
      left -= take;
    }
  }
  if (left !== 0) throw new Error('Could not cover return from held credit slices');
  return plan;
}
