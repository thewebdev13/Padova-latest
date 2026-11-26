import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetSaleEconomics } from '../src/lib/asset-sale-economics';

test('points sale shows gain when proceeds exceed cost taken', () => {
  const e = assetSaleEconomics({
    quantity: 40000,
    proceeds: 52000,
    basis: 40000,
  });
  assert.equal(e.gain_loss_cents, 12000);
  assert.equal(e.result_label, 'Gain');
  assert.equal(e.incomplete, false);
  assert.equal(e.sold_below_face, false);
});

test('voucher sold below face is labeled; loss vs cost basis', () => {
  const e = assetSaleEconomics({
    quantity: 1,
    proceeds: 90000,
    basis: 100000,
    face_cents: 100000,
  });
  assert.equal(e.gain_loss_cents, -10000);
  assert.equal(e.result_label, 'Loss');
  assert.equal(e.sold_below_face, true);
});

test('unknown cost stays Incomplete — never invent $0 gain/loss', () => {
  const e = assetSaleEconomics({
    quantity: 10000,
    proceeds: 13000,
    basis: null,
  });
  assert.equal(e.gain_loss_cents, null);
  assert.equal(e.incomplete, true);
  assert.equal(e.result_label, 'Incomplete');
});
