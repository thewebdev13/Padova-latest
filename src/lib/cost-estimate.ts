/**
 * Plan v1 — other currency note + cost estimate.
 * Other currency is information only; it never changes profit math.
 * Estimate = USD not final; stays on follow-up until the real amount is entered.
 * Never invent USD from a foreign amount or rate. Unknown ≠ $0.
 */

export const COST_ESTIMATE_KIND = 'Cost estimate';

export type OtherCurrencyNote = {
  code: string;
  /** Display amount in that currency (not USD cents). */
  amount?: string;
  /** Optional rate note — information only. */
  rate?: string;
};

export type CostEstimateComponent = {
  cost_is_estimate?: boolean | null;
  cost?: number | null;
  other_currency?: OtherCurrencyNote | null;
  type?: string | null;
  seller_id?: string | null;
};

export function normalizeOtherCurrencyNote(input: {
  code?: string | null;
  amount?: string | null;
  rate?: string | null;
}): OtherCurrencyNote | undefined {
  const code = String(input.code ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 12);
  if (!code) return undefined;
  const amount = String(input.amount ?? '').trim().slice(0, 40);
  const rate = String(input.rate ?? '').trim().slice(0, 40);
  return {
    code,
    ...(amount ? { amount } : {}),
    ...(rate ? { rate } : {}),
  };
}

export function componentIsCostEstimate(c: CostEstimateComponent | null | undefined): boolean {
  if (!c) return false;
  if (c.cost_is_estimate) return true;
  // Other-currency note with no USD cost is an open estimate (USD Unknown).
  if (c.other_currency?.code && (c.cost == null || !Number.isFinite(Number(c.cost)))) return true;
  return false;
}

export function listCostEstimateComponents(
  components: Array<CostEstimateComponent> | null | undefined,
): CostEstimateComponent[] {
  return (components ?? []).filter((c) => componentIsCostEstimate(c));
}

export function formatOtherCurrencyLabel(note: OtherCurrencyNote | null | undefined): string {
  if (!note?.code) return '';
  const parts = [note.code];
  if (note.amount) parts.push(note.amount);
  if (note.rate) parts.push(`rate ${note.rate}`);
  return parts.join(' · ');
}

export function buildCostEstimateAttention(input: {
  bookingId: string;
  code: string;
  components?: Array<CostEstimateComponent> | null;
}): {
  key: string;
  fingerprint: string;
  title: string;
  detail: string;
  booking_id: string;
  kind: string;
} | null {
  const estimates = listCostEstimateComponents(input.components);
  if (!estimates.length) return null;
  const currencyBits = estimates
    .map((c) => formatOtherCurrencyLabel(c.other_currency))
    .filter(Boolean);
  const detailParts = [
    'Plan: USD amount is an estimate until the real amount is entered. Other currency never changes profit.',
  ];
  if (currencyBits.length) detailParts.push(currencyBits.join('; '));
  return {
    key: `cost-estimate:${input.bookingId}`,
    fingerprint: String(estimates.length),
    title: `${input.code} · Cost estimate`,
    detail: detailParts.join(' '),
    booking_id: input.bookingId,
    kind: COST_ESTIMATE_KIND,
  };
}

/** Entry hint under cost when estimate is checked. */
export function costEstimateEntryHint(): string {
  return 'Estimate stays on the to-do list until the real USD amount is entered. Other currency is information only — never invents USD.';
}
