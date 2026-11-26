/**
 * Plan v1 — mark referrer share paid with date and method when commission is confirmed.
 * Seeds existing `pay_referral` from payable_now (never invent; blank/0 → null).
 */

export type PayReferralDefaults = {
  referral_id: string;
  /** Dollars string for money form field (same pattern as commission Record receipt). */
  amount: string;
  amount_cents: number;
  date: string;
};

export function buildPayReferralPaymentDefaults(input: {
  referral_id?: string | null;
  payable_now?: unknown;
  outstanding?: unknown;
  today?: string | null;
}): PayReferralDefaults | null {
  const referral_id = String(input.referral_id || '').trim();
  if (!referral_id) return null;
  const raw =
    input.payable_now != null && input.payable_now !== ''
      ? Number(input.payable_now)
      : Number(input.outstanding);
  if (!Number.isFinite(raw)) return null;
  const amount_cents = Math.trunc(raw);
  if (amount_cents <= 0) return null;
  const today = String(input.today || '').trim().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(today)
    ? today
    : new Date().toISOString().slice(0, 10);
  return {
    referral_id,
    amount_cents,
    amount: (amount_cents / 100).toFixed(2),
    date,
  };
}
