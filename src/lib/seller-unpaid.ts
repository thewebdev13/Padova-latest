/**
 * Plan v1 — Supplier payments: sellers are paid right away.
 * Unpaid recorded seller obligations stay on follow-up / to-do until settled.
 * Never invent amounts; blank / Unknown stays Unknown ≠ $0.
 */

export const SELLER_UNPAID_KIND = 'Seller unpaid';
export const SELLER_UNPAID_STATUS = 'Pay ASAP';

export function sellerNamesLabel(sellerNames: Array<string | null | undefined>): string {
  const names = [
    ...new Set(
      sellerNames
        .map((n) => String(n ?? '').trim())
        .filter(Boolean),
    ),
  ];
  return names.length ? names.join(', ') : 'Seller';
}

export function buildSellerUnpaidAttention(input: {
  bookingId: string;
  code: string;
  amountCents: number;
  sellerNames?: Array<string | null | undefined>;
}): {
  key: string;
  fingerprint: string;
  title: string;
  detail: string;
  amount: number;
  booking_id: string;
  kind: string;
} {
  const amount = Math.trunc(Number(input.amountCents));
  const who = sellerNamesLabel(input.sellerNames ?? []);
  return {
    // Keep stable key so existing attention_resolutions continue to match.
    key: `supplier:${input.bookingId}`,
    fingerprint: String(amount),
    title: `${input.code} · Pay seller ASAP`,
    detail: `Plan: sellers are paid right away. ${who} still has a recorded unpaid obligation.`,
    amount,
    booking_id: input.bookingId,
    kind: SELLER_UNPAID_KIND,
  };
}

export function isSellerUnpaidAttention(item: {
  key?: string | null;
  kind?: string | null;
  title?: string | null;
  status?: string | null;
}): boolean {
  if (item.kind === SELLER_UNPAID_KIND) return true;
  if (item.status === SELLER_UNPAID_STATUS) return true;
  if (String(item.key || '').startsWith('supplier:')) return true;
  return /Pay seller ASAP|Seller unpaid/i.test(String(item.title || ''));
}

/** Entry hint when Outside seller / Other cost line is still unpaid. */
export function sellerUnpaidEntryHint(paymentStatus: string | null | undefined): string | null {
  const status = String(paymentStatus || '').trim();
  if (!status || status === 'Paid') return null;
  if (status === 'Unpaid' || status === 'Partial' || status === 'Unknown') {
    return 'Plan: pay the seller right away — unpaid stays on the to-do list until settled.';
  }
  return null;
}

export function sellerUnpaidOperationalStatus(costIncomplete: boolean | null | undefined): string {
  if (costIncomplete) return 'Pay ASAP · total cost incomplete';
  return SELLER_UNPAID_STATUS;
}
