import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedTransferQuantity,
  formatCentsPerPoint,
  pointsReceivedWithBonus,
  proportionalTransferBasisCents,
  transferLotCostPerPointCents,
  transferSpreadSummary,
  transferBonusPlanHint,
} from '../src/lib/points-transfer-bonus';

test('100k + 30% → exactly 130k received; inexact bonus stays null', () => {
  assert.equal(pointsReceivedWithBonus(100_000, 3000), 130_000);
  assert.equal(pointsReceivedWithBonus(100_000, 0), 100_000);
  // 1 point × 33% is not whole: 1 * 13300 / 10000
  assert.equal(pointsReceivedWithBonus(1, 3300), null);
  assert.equal(pointsReceivedWithBonus(0, 3000), null);
  assert.equal(pointsReceivedWithBonus(100_000, -1), null);
});

test('expected transfer quantity matches ratio × bonus exactness', () => {
  assert.equal(
    expectedTransferQuantity({ quantitySent: 100_000, bonusBps: 3000 }),
    130_000,
  );
  assert.equal(
    expectedTransferQuantity({
      quantitySent: 50_000,
      ratioNumerator: 1,
      ratioDenominator: 1,
      bonusBps: 0,
    }),
    50_000,
  );
  assert.equal(
    expectedTransferQuantity({
      quantitySent: 40_000,
      ratioNumerator: 3,
      ratioDenominator: 2,
      bonusBps: 0,
    }),
    60_000,
  );
  // Incomplete ratio pair
  assert.equal(
    expectedTransferQuantity({
      quantitySent: 10_000,
      ratioNumerator: 2,
      ratioDenominator: null,
    }),
    null,
  );
});

test('cost spreads over all points received; Unknown basis stays Unknown', () => {
  assert.equal(transferLotCostPerPointCents(130_000, 130_000), 1);
  assert.equal(transferLotCostPerPointCents(130_000, 100_000), 1);
  assert.equal(transferLotCostPerPointCents(null, 130_000), null);
  assert.equal(proportionalTransferBasisCents(130_000, 100_000, 50_000), 65_000);
  assert.equal(proportionalTransferBasisCents(null, 100_000, 50_000), null);
  assert.equal(formatCentsPerPoint(1), '1 ¢/pt');
  assert.equal(formatCentsPerPoint(null), 'Unknown ¢/pt');
});

test('transfer spread summary shows bonus and ¢/pt without inventing basis', () => {
  const withBasis = transferSpreadSummary({
    quantitySent: 100_000,
    quantityReceived: 130_000,
    remainingBasisCents: 130_000,
    remainingQuantity: 100_000,
    feesCents: 0,
  });
  assert.match(String(withBasis), /100,000 → 130,000/);
  assert.match(String(withBasis), /\+30,000 bonus/);
  assert.match(String(withBasis), /1 ¢\/pt/);

  const unknown = transferSpreadSummary({
    quantitySent: 100_000,
    quantityReceived: 130_000,
    remainingBasisCents: null,
    remainingQuantity: 100_000,
  });
  assert.match(String(unknown), /Unknown/);
  assert.match(transferBonusPlanHint(), /100,000 \+ 30%/);
});
