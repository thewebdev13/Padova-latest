import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalViews } from '../src/lib/operational-views';

function owes(sales: Record<string, any>[], denied: string[] = []) {
  return operationalViews({
    bookings: [],
    assets: [],
    parties: [],
    commissions: [],
    referrals: [],
    refunds: [],
    expectedEvents: [],
    attention: [],
    sales,
    can: (permission) => !denied.includes(permission),
  })['Customer Owes'];
}

test('unpaid and partially paid voucher sales surface their remaining balance and open their asset', () => {
  const sale = {
    id: 'sale-1',
    asset_id: 'asset-1',
    asset: 'Voucher',
    buyer: 'Buyer',
    proceeds: 50000,
    received: 0,
  };
  assert.deepEqual(owes([sale]), [
    {
      id: 'sale:sale-1',
      sale_id: 'sale-1',
      record_type: 'asset',
      record_id: 'asset-1',
      title: 'Voucher',
      detail: 'Buyer',
      amount: 50000,
      status: 'Unpaid sale',
    },
  ]);
  assert.equal(owes([{ ...sale, received: 20000 }])[0].amount, 30000);
});

test('settled sales and unknown receipt amounts do not become unpaid zeroes', () => {
  assert.deepEqual(
    owes([
      { proceeds: 50000, received: 50000 },
      { proceeds: 50000, received: 60000 },
      { proceeds: 50000, received: null },
      { proceeds: null, received: 0 },
    ]),
    [],
  );
});

test('voucher follow-up respects sale and asset permissions', () => {
  const sales = [{ id: 's', asset_id: 'a', proceeds: 50000, received: 0 }];
  assert.deepEqual(owes(sales, ['view_sale_price']), []);
  assert.deepEqual(owes(sales, ['manage_assets', 'view_asset_basis']), []);
});
