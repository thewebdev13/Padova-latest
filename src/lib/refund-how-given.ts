/**
 * Plan: customer refund how given — original method, credit, voucher, or other.
 * Cash out and customer-credit wallet already ship; voucher / other complete the set.
 */

export const REFUND_HOW_GIVEN = [
  'original_method',
  'customer_credit',
  'voucher',
  'other',
] as const;

export type RefundHowGiven = (typeof REFUND_HOW_GIVEN)[number];

/** Movement kinds that settle customer_due on a refund (DB check constraint). */
export const REFUND_CUSTOMER_SETTLED_KINDS = [
  'customer_paid',
  'customer_credit_handed_over',
] as const;

/** Voucher how-given posts customer_paid with this form (no new kind — constraint safe). */
export const REFUND_VOUCHER_FORM = 'Voucher';

export function refundHowGivenLabel(how: string | null | undefined): string {
  const s = String(how || '').trim();
  if (s === 'original_method') return 'Original payment method';
  if (s === 'customer_credit') return 'Customer credit (wallet)';
  if (s === 'voucher') return 'Voucher';
  if (s === 'other') return 'Other';
  return s;
}

export function refundHowGivenPlanHint(): string {
  return 'Plan: pay by the original method, keep as Padova-held customer credit, issue a customer voucher, or record another settlement.';
}

export function isCashOutHowGiven(how: string | null | undefined): boolean {
  const s = String(how || 'original_method').trim() || 'original_method';
  return s === 'original_method' || s === 'other';
}

export function defaultRefundVoucherName(bookingCode: string | null | undefined): string {
  const code = String(bookingCode || '').trim();
  return code ? `Refund voucher — ${code}` : 'Refund voucher';
}

/** SQL IN-list fragment for settled customer refund movements (safe static). */
export const REFUND_CUSTOMER_SETTLED_SQL = REFUND_CUSTOMER_SETTLED_KINDS.map(
  (k) => `'${k}'`,
).join(',');
