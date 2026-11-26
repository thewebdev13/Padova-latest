/**
 * Plan Phase 4 — booking shows customer card fee charged, Padova processor
 * cost, and the difference as profit. Unknown stays Incomplete ≠ $0.
 */

export type BookingCardFeeSpread = {
  customer_charged_cents: number | null;
  padova_cost_cents: number | null;
  /** Customer charged − Padova cost when both known. */
  spread_cents: number | null;
  incomplete: boolean;
  has_any: boolean;
};

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function isCustomerCardFeeKind(kind: unknown): boolean {
  return /card\s*fee|card\s*charge|processor\s*fee/i.test(String(kind || ''));
}

/** Sum Card fee charge rows for a booking (customer pass-through). */
export function sumCustomerCardFeeCharges(
  charges: Array<{ kind?: unknown; amount?: unknown }>,
): number | null {
  let sum = 0;
  let any = false;
  for (const c of charges) {
    if (!isCustomerCardFeeKind(c.kind)) continue;
    const amt = asCents(c.amount);
    if (amt == null) return null;
    sum += amt;
    any = true;
  }
  return any ? sum : 0;
}

/**
 * Spread display for one booking.
 * customer_charged from Card fee charges; padova_cost from payment command results.
 * Blank/missing padova with customer charges → incomplete (do not invent processor cost).
 */
export function bookingCardFeeSpread(input: {
  customer_charged_cents?: unknown;
  padova_cost_cents?: unknown;
}): BookingCardFeeSpread {
  const customer = asCents(input.customer_charged_cents);
  const padova = asCents(input.padova_cost_cents);
  const has_any = (customer != null && customer !== 0) || (padova != null && padova !== 0);
  if (customer == null && padova == null)
    return {
      customer_charged_cents: null,
      padova_cost_cents: null,
      spread_cents: null,
      incomplete: true,
      has_any: false,
    };
  if (customer == null || padova == null)
    return {
      customer_charged_cents: customer,
      padova_cost_cents: padova,
      spread_cents: null,
      incomplete: true,
      has_any,
    };
  return {
    customer_charged_cents: customer,
    padova_cost_cents: padova,
    spread_cents: customer - padova,
    incomplete: false,
    has_any: customer !== 0 || padova !== 0,
  };
}
