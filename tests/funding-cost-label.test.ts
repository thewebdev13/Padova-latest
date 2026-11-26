import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingCostKindLabel, fundingVoucherNote } from '../src/lib/funding-cost-label';

test('Plan cost-line kinds map to display labels', () => {
  assert.equal(fundingCostKindLabel({ kind: 'Card' }), 'Card payment');
  assert.equal(fundingCostKindLabel({ kind: 'Capital One credit' }), 'Cap1 credit used');
  assert.equal(fundingCostKindLabel({ kind: 'Points' }), 'Points batch used');
  assert.equal(fundingCostKindLabel({ kind: 'Voucher' }), 'Voucher used');
  assert.equal(
    fundingCostKindLabel({ kind: 'Seller-funded reservation' }),
    "Seller's agreed price",
  );
  assert.equal(fundingCostKindLabel({ kind: 'Other', notes: 'Sruly fee $50/PNR' }), 'Sruly fee');
  assert.equal(fundingCostKindLabel({ kind: '' }), 'Other');
});

test('voucher / airline credit / gift card labeled Voucher used via asset kind', () => {
  assert.equal(
    fundingCostKindLabel({ kind: 'Airline credit', asset_kind: 'Airline credit' }),
    'Voucher used',
  );
  assert.equal(
    fundingCostKindLabel({ kind: 'Gift card', asset_kind: 'Gift card' }),
    'Voucher used',
  );
  assert.equal(
    fundingCostKindLabel({ kind: 'Card', asset_kind: 'Capital One credit' }),
    'Cap1 credit used',
  );
});

test('paid with a previous voucher note only on voucher lines', () => {
  assert.equal(
    fundingVoucherNote({ kind: 'Voucher', asset_id: 'a1', asset_kind: 'Voucher' }),
    'Paid with a previous voucher',
  );
  assert.equal(
    fundingVoucherNote({ kind: 'Hotel credit', asset_kind: 'Hotel credit' }),
    'Paid with a previous voucher',
  );
  assert.equal(fundingVoucherNote({ kind: 'Card' }), null);
  assert.equal(fundingVoucherNote({ kind: 'Points' }), null);
  assert.equal(fundingVoucherNote({ kind: 'Capital One credit' }), null);
});
