/**
 * Plan: new referrers can be added from inside a booking (Money Back).
 * Seeds referral command defaults — never invents a % when person rate Unknown.
 */

import { partyReferralRateBps, type PartyLike } from './referrer-defaults';

export type AddReferrerDefaults = {
  booking_id: string;
  basis: 'percentage';
  percentage_basis: 'profit';
  payable_when: 'After commission confirmed';
  cancellation_rule: 'Realized economics';
  /** Percent string for form field when known; omit when Unknown. */
  rate_bps?: string;
  referrer_id?: string;
};

/** Defaults for Add referrer on a booking. Optional party seeds its stored %. */
export function buildAddReferrerDefaults(
  bookingId: string,
  referrer?: PartyLike | null,
): AddReferrerDefaults {
  const out: AddReferrerDefaults = {
    booking_id: bookingId,
    basis: 'percentage',
    percentage_basis: 'profit',
    payable_when: 'After commission confirmed',
    cancellation_rule: 'Realized economics',
  };
  if (referrer?.id) out.referrer_id = String(referrer.id);
  const bps = partyReferralRateBps(referrer);
  if (bps != null) {
    const pct = bps / 100;
    out.rate_bps = Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
  }
  return out;
}
