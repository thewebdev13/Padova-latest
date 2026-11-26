/**
 * Plan v1 — referrer share is owed when the booking commission is confirmed
 * (receivable recorded), not when the customer pays, and not only when cash arrives.
 */

import { isMoneyBackVoided } from './money-back-void';

export const REFERRAL_PAYABLE_WHEN = [
  'When earned',
  'After travel',
  'After customer paid',
  'After commission confirmed',
  'After commission received',
  'On date',
] as const;

export type ReferralPayableWhen = (typeof REFERRAL_PAYABLE_WHEN)[number];

/** Plan default for new referrer agreements. */
export const PLAN_REFERRAL_PAYABLE_WHEN: ReferralPayableWhen = 'After commission confirmed';

export function resolveReferralPayableWhen(input: {
  payable_when?: string | null;
  after_receipt?: boolean | null;
}): ReferralPayableWhen {
  const raw = String(input.payable_when || '').trim();
  if ((REFERRAL_PAYABLE_WHEN as readonly string[]).includes(raw))
    return raw as ReferralPayableWhen;
  // Legacy referrals: after_receipt meant wait for cash.
  if (input.after_receipt === true) return 'After commission received';
  return PLAN_REFERRAL_PAYABLE_WHEN;
}

/** Confirmed = non-voided commission receivable exists on the booking. */
export function commissionConfirmedOnBooking(input: {
  commissions: Array<{ id: string; booking_id?: string }>;
  operational?: unknown;
  bookingId: string;
}): boolean {
  for (const c of input.commissions) {
    if (c.booking_id && c.booking_id !== input.bookingId) continue;
    if (isMoneyBackVoided(input.operational, 'commission', String(c.id))) continue;
    return true;
  }
  return false;
}

export function referralHoldForPayableWhen(input: {
  rule: ReferralPayableWhen;
  commissionConfirmed: boolean;
  commissionIncomplete: boolean;
  expectedCommission: number;
  receivedCommission: number;
  customerBalance: number | null;
  travelEnd: string | null | undefined;
  today: string;
}): string {
  const rule = input.rule;
  if (rule === 'After travel' && input.travelEnd && String(input.travelEnd) > input.today)
    return 'Travel not completed';
  if (
    rule === 'After customer paid' &&
    (input.customerBalance == null || Number(input.customerBalance) > 0)
  )
    return 'Customer payment pending';
  if (rule === 'After commission confirmed' && !input.commissionConfirmed)
    return 'Commission not confirmed yet';
  if (
    rule === 'After commission received' &&
    (input.commissionIncomplete ||
      Number(input.expectedCommission) > Number(input.receivedCommission))
  )
    return 'Commission receipt pending';
  return '';
}
