/**
 * Plan v1 — card fee refunded? Default no. Retained card fee stays booking profit.
 * Customer due uses proportional refund when supplier return + original cost are known.
 */

import { suggestProportionalCustomerDueCents } from './proportional-refund';

export type ChargeLike = { kind: string; amount: number };

export function isCardFeeChargeKind(kind: string): boolean {
  return /card\s*fee|card\s*charge|processor\s*fee/i.test(String(kind || ''));
}

/** Sum of Card fee charges still on the booking (positive amounts only). */
export function cardFeeChargesCents(charges: ChargeLike[] | null | undefined): number {
  if (!charges?.length) return 0;
  let sum = 0;
  for (const c of charges) {
    if (!isCardFeeChargeKind(c.kind)) continue;
    const n = Number(c.amount);
    if (Number.isFinite(n) && n > 0) sum += Math.trunc(n);
  }
  return sum;
}

/**
 * Suggest customer refund / charge reduction.
 * When refundCardFee is false (Plan default), exclude card-fee charges so Padova keeps them.
 * Customer due is proportional to paid (less retained fee), scaled by supplier return / original cost.
 * Unknown paid / sale / scale stays null or unscaled — never invent $0.
 */
export function suggestCancelRefundAmounts(input: {
  paid_cents: number | null | undefined;
  sale_cents: number | null | undefined;
  prior_customer_due_cents?: number | null;
  charges?: ChargeLike[] | null;
  refund_card_fee?: boolean;
  /** Supplier return amount (USD cents or points units treated as whole). */
  supplier_expected_cents?: number | null;
  /** Original funding cost / face being returned against. */
  original_cost_cents?: number | null;
}): {
  customer_due_cents: number | null;
  charge_reduction_cents: number | null;
  retained_card_fee_cents: number;
} {
  const refundCardFee = input.refund_card_fee === true;
  const cardFees = cardFeeChargesCents(input.charges);
  const retained = refundCardFee ? 0 : cardFees;
  const prior = Number(input.prior_customer_due_cents ?? 0) || 0;

  const customer_due_cents = suggestProportionalCustomerDueCents({
    paid_cents: input.paid_cents,
    prior_customer_due_cents: prior,
    retained_card_fee_cents: retained,
    supplier_expected_cents: input.supplier_expected_cents,
    original_cost_cents: input.original_cost_cents,
  });

  let charge_reduction_cents: number | null = null;
  if (input.sale_cents != null && Number.isFinite(Number(input.sale_cents))) {
    const sale = Math.max(0, Math.trunc(Number(input.sale_cents)));
    // Scale charge reduction the same way when supplier return known.
    if (
      input.supplier_expected_cents != null &&
      input.original_cost_cents != null &&
      Number.isFinite(Number(input.supplier_expected_cents)) &&
      Number.isFinite(Number(input.original_cost_cents))
    ) {
      charge_reduction_cents = suggestProportionalCustomerDueCents({
        paid_cents: sale,
        retained_card_fee_cents: 0,
        supplier_expected_cents: input.supplier_expected_cents,
        original_cost_cents: input.original_cost_cents,
      });
    } else {
      charge_reduction_cents = sale;
    }
  }

  return { customer_due_cents, charge_reduction_cents, retained_card_fee_cents: retained };
}

export function cardFeeRefundReasonSuffix(refundCardFee: boolean, retainedCents: number): string {
  if (refundCardFee) return 'Card fee refunded: yes.';
  if (retainedCents > 0)
    return `Card fee refunded: no (retained $${(retainedCents / 100).toFixed(2)}).`;
  return 'Card fee refunded: no.';
}

/** Form defaults for cancel modal (dollar strings). Plan: refund_card_fee defaults false. */
export function cancelFormMoneyDefaults(
  booking: {
    paid?: number | null;
    sale?: number | null;
    card_fee_charges?: number | null;
    refund_due?: number | null;
  },
  scale?: {
    supplier_expected_cents?: number | null;
    original_cost_cents?: number | null;
    /** When original is points/count, supplier + original are whole units (not USD cents). */
    quantity_unit?: 'money' | 'points' | 'count';
  },
): {
  refund_card_fee: false;
  customer_due: string;
  charge_reduction: string;
  retained_card_fee_cents: number;
} {
  const unit = scale?.quantity_unit ?? 'money';
  const suggested = suggestCancelRefundAmounts({
    paid_cents: booking.paid == null ? null : Number(booking.paid),
    sale_cents: booking.sale == null ? null : Number(booking.sale),
    prior_customer_due_cents: booking.refund_due == null ? 0 : Number(booking.refund_due),
    charges: [
      {
        kind: 'Card fee',
        amount: Number(booking.card_fee_charges ?? 0),
      },
    ],
    refund_card_fee: false,
    // Proportional scale only when both sides are money (USD cents). Points returns stay unscaled here.
    ...(unit === 'money'
      ? {
          supplier_expected_cents: scale?.supplier_expected_cents ?? null,
          original_cost_cents: scale?.original_cost_cents ?? null,
        }
      : {}),
  });
  return {
    refund_card_fee: false,
    customer_due:
      suggested.customer_due_cents == null
        ? ''
        : (suggested.customer_due_cents / 100).toFixed(2),
    charge_reduction:
      suggested.charge_reduction_cents == null
        ? ''
        : (suggested.charge_reduction_cents / 100).toFixed(2),
    retained_card_fee_cents: suggested.retained_card_fee_cents,
  };
}

export type RetainedCardFeeProfit = {
  /** Padova keeps this as booking profit when card fee not refunded. */
  retained_cents: number | null;
  /** True when cancel/refund chose to refund the card fee. */
  refunded: boolean;
  visible: boolean;
  incomplete: boolean;
};

/**
 * Plan: money Padova keeps when it does not refund the card fee is visible
 * on the booking as profit. Prefer cancel command result; fall back to still-
 * present Card fee charges on cancelled / refund-pending bookings.
 */
export function retainedCardFeeProfit(input: {
  reservation_status?: string | null;
  /** From cancel command result when known. */
  retained_card_fee_cents?: unknown;
  refund_card_fee?: boolean | null;
  /** Card fee charges still on the booking (USD cents). */
  card_fee_charges_cents?: unknown;
}): RetainedCardFeeProfit {
  const status = String(input.reservation_status || '');
  const cancelledLike = ['Cancelled', 'Refund Pending'].includes(status);
  const refunded = input.refund_card_fee === true;

  if (refunded) {
    return { retained_cents: 0, refunded: true, visible: cancelledLike, incomplete: false };
  }

  const fromCancel =
    input.retained_card_fee_cents == null || input.retained_card_fee_cents === ''
      ? null
      : Number(input.retained_card_fee_cents);
  if (fromCancel != null && Number.isFinite(fromCancel)) {
    const retained = Math.trunc(fromCancel);
    return {
      retained_cents: retained,
      refunded: false,
      visible: retained > 0 || cancelledLike,
      incomplete: false,
    };
  }

  if (!cancelledLike)
    return { retained_cents: null, refunded: false, visible: false, incomplete: false };

  const charges =
    input.card_fee_charges_cents == null || input.card_fee_charges_cents === ''
      ? null
      : Number(input.card_fee_charges_cents);
  if (charges == null || !Number.isFinite(charges))
    return { retained_cents: null, refunded: false, visible: true, incomplete: true };

  const retained = Math.trunc(charges);
  return {
    retained_cents: retained,
    refunded: false,
    visible: retained > 0,
    incomplete: false,
  };
}
