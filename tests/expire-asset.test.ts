import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPIRE_ASSET_REASON,
  buildExpireAssetDefaults,
  canExpireAsset,
  expireAssetLossLabel,
  isCap1CreditAsset,
} from '../src/lib/expire-asset';

test('Cap1 credits do not expire; points/vouchers with balance can', () => {
  assert.equal(isCap1CreditAsset({ kind: 'Capital One credit' }), true);
  assert.equal(canExpireAsset({ kind: 'Capital One credit', balance: 5000, ownership: 'Padova' }), false);
  assert.equal(canExpireAsset({ kind: 'Points', balance: 100000, ownership: 'Padova' }), true);
  assert.equal(canExpireAsset({ kind: 'Voucher', balance: 0, ownership: 'Padova' }), false);
  assert.equal(canExpireAsset({ kind: 'Points', balance: 1000, ownership: 'Customer' }), false);
});

test('expire defaults seed remaining quantity; loss Unknown when basis missing', () => {
  const points = buildExpireAssetDefaults({
    id: 'a1',
    kind: 'Points',
    unit: 'points',
    balance: 60000,
    remaining_basis: 78000,
  });
  assert.equal(points.asset_id, 'a1');
  assert.equal(points.quantity, '60000');
  assert.equal(points.loss_basis_cents, 78000);
  assert.equal(points.reason, EXPIRE_ASSET_REASON);

  const moneyAsset = buildExpireAssetDefaults({
    id: 'a2',
    kind: 'Voucher',
    unit: 'money',
    balance: 15050,
    remaining_basis: null,
  });
  assert.equal(moneyAsset.quantity, '150.50');
  assert.equal(moneyAsset.loss_basis_cents, null);
  assert.match(expireAssetLossLabel(null, (c) => `$${c}`), /Unknown/);
  assert.equal(expireAssetLossLabel(78000, (c) => `$${(c / 100).toFixed(2)}`), 'Loss: $780.00 (remaining cost)');
});
