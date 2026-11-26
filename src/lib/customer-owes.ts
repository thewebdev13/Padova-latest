/**
 * Plan Phase 4 — Customers list: what each customer owes Padova.
 * Sum of positive booking AR only. Unknown balance stays incomplete — never invent $0.
 */

export type CustomerOwesInput = {
  customer_id?: string | null;
  customer_balance?: number | null;
  reservation_status?: string | null;
};

export type CustomerOwesResult = {
  /** Sum of positive known balances; null only when every linked booking balance is Unknown. */
  owed_cents: number | null;
  incomplete: boolean;
  open_booking_count: number;
};

/**
 * What this billed customer still owes across their bookings.
 * Cancelled bookings skipped. Negative/zero balances ignored (credit/refund liability is separate).
 */
export function partyCustomerOwes(
  bookings: CustomerOwesInput[],
  partyId: string,
): CustomerOwesResult {
  let owed = 0;
  let anyKnown = false;
  let incomplete = false;
  let open = 0;
  for (const b of bookings) {
    if (String(b.customer_id || '') !== partyId) continue;
    if (b.reservation_status === 'Cancelled') continue;
    open += 1;
    if (b.customer_balance == null || !Number.isFinite(Number(b.customer_balance))) {
      incomplete = true;
      continue;
    }
    anyKnown = true;
    const bal = Math.trunc(Number(b.customer_balance));
    if (bal > 0) owed += bal;
  }
  if (!anyKnown && incomplete)
    return { owed_cents: null, incomplete: true, open_booking_count: open };
  return { owed_cents: owed, incomplete, open_booking_count: open };
}

/** Compact list label — Incomplete when all Unknown; append note when partial Unknown. */
export function customerOwesListLabel(
  result: CustomerOwesResult,
  formatMoney: (cents: number) => string,
): string {
  if (result.owed_cents == null) return 'Incomplete';
  const base = formatMoney(result.owed_cents);
  return result.incomplete ? `${base} · Incomplete` : base;
}
