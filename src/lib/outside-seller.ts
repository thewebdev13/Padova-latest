/**
 * Plan v1 — Outside seller (e.g. Amex BP Pay with Points).
 * Padova cost = agreed price only. Seller rebate / points are information only —
 * never Padova inventory, revenue, or expected rebate income.
 */

export const OUTSIDE_SELLER_COST_HINT =
  'Padova cost is the agreed price only. Points and any seller rebate (e.g. Amex BP 35%) are information — not Padova income or inventory.';

export const OUTSIDE_SELLER_BP_LABEL = 'Seller BP math (info only: gross − seller rebate %)';

export const OUTSIDE_SELLER_REBATE_LABEL = 'Seller rebate % (info only)';

export const OUTSIDE_SELLER_BP_SUMMARY =
  'Net points are informational for rate math. Padova posts only the agreed dollar cost — no rebate receivable.';

/** Outside seller components must never carry Padova rebate_expected. */
export function stripOutsideSellerRebateExpected<T extends { type?: string; rebate_expected?: unknown }>(
  component: T,
): T {
  if (component.type !== 'Outside seller') return component;
  if (component.rebate_expected == null || component.rebate_expected === '') return component;
  const { rebate_expected: _drop, ...rest } = component;
  return rest as T;
}

export function outsideSellerAllowsRebateExpected(componentType: string | null | undefined): boolean {
  return componentType !== 'Outside seller';
}
