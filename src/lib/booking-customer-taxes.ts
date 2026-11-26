/**
 * Plan v1 — optional taxes are part of the customer price (not an extra charge).
 * Used for sale-ex-tax standing deals (e.g. Marriott 10%) and invoice tax lines.
 * Never invent tax amounts; blank stays Unknown.
 */

import { standingDealAmountCents, standingDealBasisCents } from './standing-deals';

export type CustomerTaxesDisplay = {
  amount_cents: number;
  /** Sale minus taxes when both known; null if incomplete. */
  sale_ex_tax_cents: number | null;
  included_in_price: boolean;
};

export function taxAmountCents(taxes: unknown): number | null {
  if (!taxes || typeof taxes !== 'object') return null;
  const amount = Number((taxes as { amount?: unknown }).amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.trunc(amount);
}

export function customerTaxesDisplay(input: {
  taxes?: unknown;
  saleCents?: number | null;
}): CustomerTaxesDisplay | null {
  const amount_cents = taxAmountCents(input.taxes);
  if (amount_cents == null) return null;
  const sale =
    input.saleCents == null || !Number.isFinite(Number(input.saleCents))
      ? null
      : Math.trunc(Number(input.saleCents));
  const sale_ex_tax_cents =
    sale == null ? null : sale - amount_cents < 0 ? null : sale - amount_cents;
  return {
    amount_cents,
    sale_ex_tax_cents,
    included_in_price: true,
  };
}

/** When a sale_ex_tax standing deal is expected but taxes are blank. */
export function standingDealNeedsTaxesHint(
  standingDeals: unknown,
  taxes: unknown,
): string | null {
  if (taxAmountCents(taxes) != null) return null;
  if (!Array.isArray(standingDeals)) return null;
  const needs = standingDeals.some((d) => {
    if (!d || typeof d !== 'object') return false;
    const row = d as { basis?: unknown; amount_cents?: unknown };
    if (row.basis !== 'sale_ex_tax') return false;
    // Unknown expected amount is the signal we need taxes.
    return row.amount_cents == null;
  });
  if (!needs) return null;
  return 'Enter taxes (part of the customer price) to compute the standing deal on sale excluding taxes.';
}

export function standingDealUnknownAmountHint(
  deal: { basis?: unknown; notes?: unknown; amount_cents?: unknown } | null | undefined,
): string | null {
  if (!deal || deal.amount_cents != null) return null;
  if (deal.basis === 'sale_ex_tax') {
    const notes = String(deal.notes || '').trim();
    return (
      notes ||
      'Amount Unknown until taxes (part of customer price) are entered for sale excluding taxes.'
    );
  }
  return String(deal.notes || '').trim() || 'Amount Unknown — sale basis incomplete.';
}

type OpLike = Record<string, unknown> | null | undefined;

/**
 * Set or clear customer sale-side tax amount on operational_entry.
 * Recomputes standing_deal amount_cents when rate/basis/sale known — never invents.
 * Does not change booking sale total (taxes are inside the price).
 */
export function applyCustomerTaxAmount(
  op: OpLike,
  input: { tax_amount_cents: number | null; sale_cents: number | null },
): Record<string, unknown> {
  const base: Record<string, unknown> =
    op && typeof op === 'object' && (op as Record<string, unknown>).version === 1
      ? { ...(op as Record<string, unknown>) }
      : { version: 1, sale_known: true };
  const priorTaxes =
    base.taxes && typeof base.taxes === 'object' && !Array.isArray(base.taxes)
      ? { ...(base.taxes as Record<string, unknown>) }
      : {};
  let taxes: Record<string, unknown> | undefined;
  if (input.tax_amount_cents == null) {
    // Blank = Unknown — drop the taxes object (do not leave bearer-only noise).
    taxes = undefined;
  } else {
    if (!Number.isSafeInteger(input.tax_amount_cents) || input.tax_amount_cents < 0)
      throw new Error('Tax amount must be a non-negative whole-cent amount');
    taxes = {
      ...priorTaxes,
      amount: input.tax_amount_cents,
      bearer: priorTaxes.bearer ?? 'Unknown',
    };
  }
  const taxCents = taxes?.amount != null ? Number(taxes.amount) : null;
  const deals = Array.isArray(base.standing_deals) ? base.standing_deals : [];
  const nextDeals = deals.map((row: unknown) => {
    if (!row || typeof row !== 'object') return row;
    const deal = row as Record<string, unknown>;
    const basis = deal.basis === 'sale' || deal.basis === 'sale_ex_tax' ? deal.basis : null;
    const rate = Number(deal.rate_bps);
    if (!basis || !Number.isFinite(rate)) return deal;
    const basisCents = standingDealBasisCents({
      basis,
      saleCents: input.sale_cents,
      taxCents: Number.isFinite(taxCents) ? taxCents : null,
    });
    const amount = standingDealAmountCents(rate, basisCents);
    return { ...deal, amount_cents: amount };
  });
  const next: Record<string, unknown> = { ...base };
  if (taxes) next.taxes = taxes;
  else delete next.taxes;
  if (deals.length) next.standing_deals = nextDeals;
  return next;
}
