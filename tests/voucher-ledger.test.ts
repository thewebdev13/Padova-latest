import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAssetExpired,
  isVoucherAsset,
  soldQuantityFromMovements,
  voucherLedgerStatus,
} from '../src/lib/voucher-ledger';

test('voucher kinds detected; Cap1 excluded', () => {
  assert.equal(isVoucherAsset('Voucher'), true);
  assert.equal(isVoucherAsset('Airline credit'), true);
  assert.equal(isVoucherAsset('Hotel credit'), true);
  assert.equal(isVoucherAsset('Gift card'), true);
  assert.equal(isVoucherAsset('Capital One credit'), false);
  assert.equal(isVoucherAsset('Points'), false);
});

test('voucher status held / partly used / used / sold / expired', () => {
  assert.equal(
    voucherLedgerStatus({ kind: 'Voucher', balance: 10000, opening_quantity: 10000 }),
    'held',
  );
  assert.equal(
    voucherLedgerStatus({ kind: 'Voucher', balance: 4000, opening_quantity: 10000 }),
    'partly used',
  );
  assert.equal(
    voucherLedgerStatus({ kind: 'Voucher', balance: 0, opening_quantity: 10000 }),
    'used',
  );
  assert.equal(
    voucherLedgerStatus({
      kind: 'Voucher',
      balance: 0,
      opening_quantity: 10000,
      sold_quantity: 10000,
    }),
    'sold',
  );
  assert.equal(
    voucherLedgerStatus({
      kind: 'Voucher',
      balance: 5000,
      opening_quantity: 10000,
      expired: true,
    }),
    'expired',
  );
  assert.equal(
    voucherLedgerStatus({ kind: 'Voucher', balance: 2500, opening_quantity: null }),
    'held',
  );
  assert.equal(voucherLedgerStatus({ kind: 'Capital One credit', balance: 100 }), null);
  assert.equal(voucherLedgerStatus({ kind: 'Voucher', balance: null }), null);
});

test('sold and expire helpers from movements', () => {
  assert.equal(
    soldQuantityFromMovements([
      { kind: 'sale', quantity: 3000 },
      { kind: 'sale', quantity: 2000 },
      { kind: 'booking_use', quantity: 1000 },
    ]),
    5000,
  );
  assert.equal(isAssetExpired([{ kind: 'expiration' }]), true);
  assert.equal(isAssetExpired([{ kind: 'sale' }]), false);
});
