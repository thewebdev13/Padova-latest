/**
 * Plan v1 — customer refund is proportional by default:
 * refund of what the customer paid, scaled by how much the supplier returned.
 * Example: $1,000 cost booking sold for $900 → full supplier return → customer $900.
 * Never invent when paid / original cost / return is Unknown. Unknown ≠ $0.
 */

/** Integer cents: floor(base × returned / original). Null when inputs incomplete/invalid. */
export function proportionalRefundCents(
  baseCents: number,
  returnedCents: number,
  originalCents: number,
): number | null {
  if (!Number.isInteger(baseCents) || baseCents < 0) return null;
  if (!Number.isInteger(returnedCents) || returnedCents < 0) return null;
  if (!Number.isInteger(originalCents) || originalCents <= 0) return null;
  if (returnedCents > originalCents) return null;
  return Number((BigInt(baseCents) * BigInt(returnedCents)) / BigInt(originalCents));
}

/**
 * Eligible customer paid for refund suggestion (after prior refunds / retained card fee).
 * Null when paid Unknown.
 */
export function eligibleCustomerPaidCents(input: {
  paid_cents: number | null | undefined;
  prior_customer_due_cents?: number | null;
  retained_card_fee_cents?: number | null;
}): number | null {
  if (input.paid_cents == null || !Number.isFinite(Number(input.paid_cents))) return null;
  const paid = Math.max(0, Math.trunc(Number(input.paid_cents)));
  const prior = Math.max(0, Math.trunc(Number(input.prior_customer_due_cents ?? 0)) || 0);
  const retained = Math.max(0, Math.trunc(Number(input.retained_card_fee_cents ?? 0)) || 0);
  return Math.max(0, paid - prior - retained);
}

/**
 * Suggest customer_due from proportional rule when supplier return + original cost known.
 * Falls back to full eligible paid when supplier scale Unknown (full cancel of paid).
 */
export function suggestProportionalCustomerDueCents(input: {
  paid_cents: number | null | undefined;
  prior_customer_due_cents?: number | null;
  retained_card_fee_cents?: number | null;
  supplier_expected_cents?: number | null;
  original_cost_cents?: number | null;
}): number | null {
  const eligible = eligibleCustomerPaidCents(input);
  if (eligible == null) return null;
  const returned = input.supplier_expected_cents;
  const original = input.original_cost_cents;
  if (
    returned == null ||
    original == null ||
    !Number.isFinite(Number(returned)) ||
    !Number.isFinite(Number(original))
  ) {
    return eligible;
  }
  const scaled = proportionalRefundCents(
    eligible,
    Math.trunc(Number(returned)),
    Math.trunc(Number(original)),
  );
  return scaled;
}

export function proportionalRefundPlanHint(): string {
  return 'Plan default: customer refund is proportional to what they paid, scaled by the supplier return. Blank stays Unknown — never invent.';
}
