import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAddReferrerDefaults } from '../src/lib/add-referrer-defaults';

test('buildAddReferrerDefaults seeds Plan payable-when and profit %', () => {
  const d = buildAddReferrerDefaults('b1');
  assert.equal(d.booking_id, 'b1');
  assert.equal(d.basis, 'percentage');
  assert.equal(d.percentage_basis, 'profit');
  assert.equal(d.payable_when, 'After commission confirmed');
  assert.equal(d.cancellation_rule, 'Realized economics');
  assert.equal(d.rate_bps, undefined);
  assert.equal(d.referrer_id, undefined);
});

test('seeds referrer id and stored rate; blank rate stays Unknown', () => {
  const withRate = buildAddReferrerDefaults('b1', {
    id: 'r1',
    roles: ['referrer'],
    details: { referral_rate_bps: 2000 },
  });
  assert.equal(withRate.referrer_id, 'r1');
  assert.equal(withRate.rate_bps, '20');

  const unknown = buildAddReferrerDefaults('b1', {
    id: 'r2',
    roles: ['referrer'],
    details: {},
  });
  assert.equal(unknown.referrer_id, 'r2');
  assert.equal(unknown.rate_bps, undefined);
});
