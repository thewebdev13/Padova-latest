import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelFormMoneyDefaults,
  cardFeeChargesCents,
  cardFeeRefundReasonSuffix,
  retainedCardFeeProfit,
  suggestCancelRefundAmounts,
} from '../src/lib/refund-card-fee';

test('card fee charges sum positive Card fee lines only', () => {
  assert.equal(
    cardFeeChargesCents([
      { kind: 'sale', amount: 100000 },
      { kind: 'Card fee', amount: 2900 },
      { kind: 'cancellation_credit', amount: -5000 },
    ]),
    2900,
  );
});

test('cancel defaults exclude card fee when not refunding (Plan default)', () => {
  const suggested = suggestCancelRefundAmounts({
    paid_cents: 102900,
    sale_cents: 100000,
    charges: [{ kind: 'Card fee', amount: 2900 }],
    refund_card_fee: false,
  });
  assert.equal(suggested.retained_card_fee_cents, 2900);
  // No supplier scale → full eligible paid (less retained fee).
  assert.equal(suggested.customer_due_cents, 100000);
  assert.equal(suggested.charge_reduction_cents, 100000);

  const scaled = suggestCancelRefundAmounts({
    paid_cents: 102900,
    sale_cents: 100000,
    charges: [{ kind: 'Card fee', amount: 2900 }],
    refund_card_fee: false,
    supplier_expected_cents: 50000,
    original_cost_cents: 100000,
  });
  assert.equal(scaled.customer_due_cents, 50000);
  assert.equal(scaled.charge_reduction_cents, 50000);

  const withFee = suggestCancelRefundAmounts({
    paid_cents: 102900,
    sale_cents: 100000,
    charges: [{ kind: 'Card fee', amount: 2900 }],
    refund_card_fee: true,
  });
  assert.equal(withFee.retained_card_fee_cents, 0);
  assert.equal(withFee.customer_due_cents, 102900);

  assert.equal(suggestCancelRefundAmounts({ paid_cents: null, sale_cents: null }).customer_due_cents, null);
});

test('cancel form money defaults and reason suffix', () => {
  const form = cancelFormMoneyDefaults({
    paid: 102900,
    sale: 100000,
    card_fee_charges: 2900,
    refund_due: 0,
  });
  assert.equal(form.refund_card_fee, false);
  assert.equal(form.customer_due, '1000.00');
  assert.equal(form.charge_reduction, '1000.00');
  assert.match(cardFeeRefundReasonSuffix(false, 2900), /retained \$29\.00/);
  assert.match(cardFeeRefundReasonSuffix(true, 0), /yes/);
});

test('retained card fee shows as booking profit after cancel', () => {
  const kept = retainedCardFeeProfit({
    reservation_status: 'Cancelled',
    retained_card_fee_cents: 2900,
    refund_card_fee: false,
  });
  assert.equal(kept.visible, true);
  assert.equal(kept.retained_cents, 2900);
  assert.equal(kept.refunded, false);

  const refunded = retainedCardFeeProfit({
    reservation_status: 'Cancelled',
    retained_card_fee_cents: 0,
    refund_card_fee: true,
  });
  assert.equal(refunded.visible, true);
  assert.equal(refunded.refunded, true);
  assert.equal(refunded.retained_cents, 0);

  const fallback = retainedCardFeeProfit({
    reservation_status: 'Refund Pending',
    card_fee_charges_cents: 1500,
  });
  assert.equal(fallback.retained_cents, 1500);
  assert.equal(fallback.visible, true);

  const active = retainedCardFeeProfit({
    reservation_status: 'Booked',
    card_fee_charges_cents: 2900,
  });
  assert.equal(active.visible, false);
});
