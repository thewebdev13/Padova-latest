/**
 * Plan v1 Phase 4 — referrer default % lives on the person (changeable).
 * Typical hint ~20% of profit; never invent a rate when the person has none.
 */

/** Plan wording “about 20%” — UI hint only when creating a new referrer field blank. */
export const PLAN_REFERRER_RATE_HINT_BPS = 2000;

export type PartyLike = {
  id?: string;
  roles?: string[];
  details?: {
    referral_rate_bps?: number | null;
    [key: string]: unknown;
  } | null;
};

/** Stored referral_rate_bps on party.details, or null when Unknown. */
export function partyReferralRateBps(party: PartyLike | null | undefined): number | null {
  if (!party) return null;
  const raw = party.details?.referral_rate_bps;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 10000) return null;
  return n;
}

export function isReferrerParty(party: PartyLike | null | undefined): boolean {
  return Boolean(party?.roles?.includes('referrer'));
}

/** Exact cents for % of profit; null when profit or rate Unknown (never invent $0). */
export function suggestReferrerShareCents(
  profitCents: number | null | undefined,
  rateBps: number | null | undefined,
): number | null {
  if (profitCents == null || rateBps == null) return null;
  if (!Number.isFinite(profitCents) || !Number.isFinite(rateBps)) return null;
  if (profitCents < 0) return null;
  const numerator = BigInt(Math.trunc(profitCents)) * BigInt(Math.trunc(rateBps));
  if (numerator % 10000n !== 0n) return null;
  return Number(numerator / 10000n);
}

export function formatReferralRateLabel(bps: number | null | undefined): string {
  if (bps == null) return 'Unknown';
  const whole = bps / 100;
  return Number.isInteger(whole) ? `${whole}%` : `${(bps / 100).toFixed(2)}%`;
}

/** Parse percent form field (e.g. "20" or "15.5") → bps, or null if blank. */
export function parseReferralRatePercentInput(raw: unknown): number | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Referrer rate must be 0–100%');
  const bps = Math.round(n * 100);
  if (Math.abs(n * 100 - bps) > 1e-9)
    throw new Error('Referrer rate must be whole basis points (two decimal places max)');
  return bps;
}
