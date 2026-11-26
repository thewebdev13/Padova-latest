import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eligibleCustomerPaidCents,
  proportionalRefundCents,
  proportionalRefundPlanHint,
  suggestProportionalCustomerDueCents,
} from '../src/lib/proportional-refund';
import { suggestCancelRefundAmounts } from '../src/lib/refund-card-fee';

test('Plan example: $1000 cost / $900 paid → full supplier return → customer $900', () => {
  assert.equal(proportionalRefundCents(90_000, 100_000, 100_000), 90_000);
  assert.equal(
    suggestProportionalCustomerDueCents({
      paid_cents: 90_000,
      supplier_expected_cents: 100_000,
      original_cost_cents: 100_000,
    }),
    90_000,
  );
});

test('half supplier return scales customer due in half; Unknown scale stays full eligible', () => {
  assert.equal(proportionalRefundCents(90_000, 50_000, 100_000), 45_000);
  assert.equal(
    suggestProportionalCustomerDueCents({
      paid_cents: 90_000,
      supplier_expected_cents: 50_000,
      original_cost_cents: 100_000,
    }),
    45_000,
  );
  assert.equal(
    suggestProportionalCustomerDueCents({ paid_cents: 90_000 }),
    90_000,
  );
  assert.equal(proportionalRefundCents(90_000, 50_000, 0), null);
  assert.equal(eligibleCustomerPaidCents({ paid_cents: null }), null);
});

test('cancel suggestion keeps card-fee retain and applies proportional scale', () => {
  const full = suggestCancelRefundAmounts({
    paid_cents: 92_900,
    sale_cents: 90_000,
    charges: [{ kind: 'Card fee', amount: 2_900 }],
    refund_card_fee: false,
    supplier_expected_cents: 100_000,
    original_cost_cents: 100_000,
  });
  assert.equal(full.retained_card_fee_cents, 2_900);
  assert.equal(full.customer_due_cents, 90_000);
  assert.equal(full.charge_reduction_cents, 90_000);

  const half = suggestCancelRefundAmounts({
    paid_cents: 92_900,
    sale_cents: 90_000,
    charges: [{ kind: 'Card fee', amount: 2_900 }],
    refund_card_fee: false,
    supplier_expected_cents: 50_000,
    original_cost_cents: 100_000,
  });
  assert.equal(half.customer_due_cents, 45_000);
  assert.equal(half.charge_reduction_cents, 45_000);
  assert.match(proportionalRefundPlanHint(), /proportional/);
});
