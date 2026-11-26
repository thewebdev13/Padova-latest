/**
 * Plan Phase 4 — refund customer status: owed | paid.
 * Settled when paid + handed_over covers customer_due. Unknown due → Incomplete ≠ invent $0.
 */

export type CustomerRefundStatus = 'owed' | 'paid' | 'incomplete';

export function customerRefundSettledCents(refund: {
  paid?: unknown;
  handed_over?: unknown;
}): number | null {
  const paid = refund.paid == null || refund.paid === '' ? null : Number(refund.paid);
  const handed =
    refund.handed_over == null || refund.handed_over === ''
      ? 0
      : Number(refund.handed_over);
  if (paid == null || !Number.isFinite(paid)) return null;
  if (!Number.isFinite(handed)) return null;
  return Math.trunc(paid) + Math.trunc(handed);
}

export function customerRefundStatus(refund: {
  customer_due?: unknown;
  paid?: unknown;
  handed_over?: unknown;
}): CustomerRefundStatus {
  const due =
    refund.customer_due == null || refund.customer_due === ''
      ? null
      : Number(refund.customer_due);
  if (due == null || !Number.isFinite(due)) return 'incomplete';
  const settled = customerRefundSettledCents(refund);
  if (settled == null) return 'incomplete';
  return settled >= Math.trunc(due) ? 'paid' : 'owed';
}

export function customerRefundStatusLabel(status: CustomerRefundStatus): string {
  if (status === 'paid') return 'Paid';
  if (status === 'owed') return 'Owed';
  return 'Incomplete';
}

/** Optional Plan chargeback outcome on a refund-type line. */
export const CHARGEBACK_STATUSES = ['disputed', 'won', 'lost'] as const;
export type ChargebackStatus = (typeof CHARGEBACK_STATUSES)[number];

export function chargebackStatusLabel(status: string | null | undefined): string | null {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'disputed') return 'Chargeback disputed';
  if (s === 'won') return 'Chargeback won';
  if (s === 'lost') return 'Chargeback lost';
  return null;
}

/** Parse `Chargeback: disputed|won|lost` from reason / notes (informational). */
export function parseChargebackStatus(
  text: string | null | undefined,
): ChargebackStatus | null {
  const m = String(text || '').match(/\bChargeback:\s*(disputed|won|lost)\b/i);
  if (!m) return null;
  return m[1].toLowerCase() as ChargebackStatus;
}

export function formatChargebackTag(status: ChargebackStatus): string {
  return `Chargeback: ${status}`;
}

export function isChargebackStatus(value: unknown): value is ChargebackStatus {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return (CHARGEBACK_STATUSES as readonly string[]).includes(s);
}

/**
 * Append or replace Plan chargeback marker in refund reason/notes.
 * Blank status strips any prior marker (never invents disputed/won/lost).
 */
export function withChargebackInText(
  text: string | null | undefined,
  status: ChargebackStatus | '' | null | undefined,
): string {
  const cleaned = String(text || '')
    .replace(/\bChargeback:\s*(disputed|won|lost)\b/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!isChargebackStatus(s)) return cleaned;
  const tag = formatChargebackTag(s);
  return cleaned ? `${cleaned}\n${tag}` : tag;
}
