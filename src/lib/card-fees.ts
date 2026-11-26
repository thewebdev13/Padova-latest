import { z } from 'zod';

/** Plan v1 defaults — not hard-coded in UI; editable in Settings. */
export const DEFAULT_CUSTOMER_CARD_FEE_BPS = 290; // 2.9%
export const DEFAULT_PADOVA_CARD_FEE_BPS = 270; // ~2.7%
export const DEFAULT_PADOVA_CARD_FEE_FLAT_CENTS = 30; // +$0.30

const bps = z.number().int().min(0).max(10000);
const flat = z.number().int().min(0).max(9_000_000_000_000);
const cents = z.number().int().min(0).max(9_000_000_000_000);

export type CardFeeSettings = {
  customer_card_fee_bps: number;
  padova_card_fee_bps: number;
  padova_card_fee_flat_cents: number;
};

export const DEFAULT_CARD_FEE_SETTINGS: CardFeeSettings = {
  customer_card_fee_bps: DEFAULT_CUSTOMER_CARD_FEE_BPS,
  padova_card_fee_bps: DEFAULT_PADOVA_CARD_FEE_BPS,
  padova_card_fee_flat_cents: DEFAULT_PADOVA_CARD_FEE_FLAT_CENTS,
};

export const cardFeeSettingsSchema = z.object({
  customer_card_fee_bps: bps,
  padova_card_fee_bps: bps,
  padova_card_fee_flat_cents: flat,
});

/** Customer pass-through fee; half-up to nearest cent (same convention as percentagePrice). */
export function customerCardFeeCents(
  baseCents: number,
  feeBps: number = DEFAULT_CUSTOMER_CARD_FEE_BPS,
): number {
  cents.parse(baseCents);
  bps.parse(feeBps);
  return Number((BigInt(baseCents) * BigInt(feeBps) + 5000n) / 10000n);
}

/** Padova processor cost ≈ % of base + flat cents; half-up on the percent part. */
export function padovaCardCostCents(
  baseCents: number,
  feeBps: number = DEFAULT_PADOVA_CARD_FEE_BPS,
  flatCents: number = DEFAULT_PADOVA_CARD_FEE_FLAT_CENTS,
): number {
  cents.parse(baseCents);
  bps.parse(feeBps);
  flat.parse(flatCents);
  const pct = Number((BigInt(baseCents) * BigInt(feeBps) + 5000n) / 10000n);
  return pct + flatCents;
}

export function bpsToPercentLabel(feeBps: number): string {
  bps.parse(feeBps);
  const whole = Math.trunc(feeBps / 100);
  const frac = feeBps % 100;
  if (frac === 0) return `${whole}%`;
  if (frac % 10 === 0) return `${whole}.${frac / 10}%`;
  return `${whole}.${String(frac).padStart(2, '0')}%`;
}

/** node-pg returns bigint as string; integers may also arrive as strings from JSON/forms. */
function intOrDefault(value: unknown, fallback: number): number {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCardFeeSettings(
  row: Partial<CardFeeSettings> | Record<string, unknown> | null | undefined,
): CardFeeSettings {
  return cardFeeSettingsSchema.parse({
    customer_card_fee_bps: intOrDefault(row?.customer_card_fee_bps, DEFAULT_CUSTOMER_CARD_FEE_BPS),
    padova_card_fee_bps: intOrDefault(row?.padova_card_fee_bps, DEFAULT_PADOVA_CARD_FEE_BPS),
    padova_card_fee_flat_cents: intOrDefault(
      row?.padova_card_fee_flat_cents,
      DEFAULT_PADOVA_CARD_FEE_FLAT_CENTS,
    ),
  });
}

/** Suggest customer pass-through + Padova processor cost for a card receipt (Plan separate line). */
export function suggestPaymentCardFees(
  paymentCents: number,
  settings: Partial<CardFeeSettings> | null | undefined = DEFAULT_CARD_FEE_SETTINGS,
): { customer_card_fee: number; padova_card_cost: number } {
  const s = normalizeCardFeeSettings(settings);
  cents.parse(paymentCents);
  return {
    customer_card_fee: customerCardFeeCents(paymentCents, s.customer_card_fee_bps),
    padova_card_cost: padovaCardCostCents(
      paymentCents,
      s.padova_card_fee_bps,
      s.padova_card_fee_flat_cents,
    ),
  };
}

export function isCardPaymentMethod(method: string | null | undefined): boolean {
  return /^card$/i.test(String(method || '').trim());
}
