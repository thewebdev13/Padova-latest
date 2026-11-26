import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fundingCostLineSettlement,
  fundingSettlementBadgeTone,
  fundingSettlementSummary,
} from '../src/lib/funding-settlement';

test('seller cost line Unpaid until obligation remaining is zero', () => {
  const unpaid = fundingCostLineSettlement({
    cost_cents: 50_000,
    seller_name: 'Outside Seller',
    effective_on: '2026-11-20',
    obligation_amount_cents: 50_000,
    obligation_remaining_cents: 50_000,
  });
  assert.equal(unpaid.status, 'Unpaid');
  assert.equal(unpaid.paid_on, null);
  assert.equal(unpaid.paid_to, 'Outside Seller');
  assert.equal(fundingSettlementSummary(unpaid), 'Unpaid · Outside Seller');
  assert.equal(fundingSettlementBadgeTone('Unpaid'), 'amber');

  const paid = fundingCostLineSettlement({
    cost_cents: 50_000,
    seller_name: 'Outside Seller',
    effective_on: '2026-11-20',
    obligation_amount_cents: 50_000,
    obligation_remaining_cents: 0,
    paid_on: '2026-11-21',
  });
  assert.equal(paid.status, 'Paid');
  assert.equal(paid.paid_on, '2026-11-21');
  assert.equal(fundingSettlementSummary(paid), 'Paid · 2026-11-21 · Outside Seller');
  assert.equal(fundingSettlementBadgeTone('Paid'), 'green');
});

test('inventory use counts as Paid on effective date — no invent', () => {
  const s = fundingCostLineSettlement({
    cost_cents: 12_000,
    asset_id: 'a1',
    inventory_use: true,
    effective_on: '2026-11-26',
  });
  assert.equal(s.status, 'Paid');
  assert.equal(s.paid_on, '2026-11-26');
  assert.equal(s.paid_to, 'Inventory');
});

test('unknown cost or reversed stays Incomplete ≠ invent Paid', () => {
  assert.equal(
    fundingCostLineSettlement({ cost_cents: null, seller_name: 'Sruly' }).status,
    'Incomplete',
  );
  assert.equal(
    fundingCostLineSettlement({
      cost_cents: 5000,
      reversed: true,
      seller_name: 'Sruly',
      obligation_remaining_cents: 0,
    }).status,
    'Incomplete',
  );
  assert.equal(
    fundingCostLineSettlement({
      cost_cents: 5000,
      seller_name: 'Sruly',
      obligation_amount_cents: 5000,
      // remaining unknown
    }).status,
    'Incomplete',
  );
});
