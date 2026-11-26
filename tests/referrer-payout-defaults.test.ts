import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayReferralPaymentDefaults } from '../src/lib/referrer-payout-defaults';

test('seeds full payable_now as dollars + date; never invents when zero/blank', () => {
  assert.deepEqual(
    buildPayReferralPaymentDefaults({
      referral_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      payable_now: 12550,
      today: '2026-11-26',
    }),
    {
      referral_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      amount_cents: 12550,
      amount: '125.50',
      date: '2026-11-26',
    },
  );
  assert.equal(
    buildPayReferralPaymentDefaults({
      referral_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      payable_now: 0,
      today: '2026-11-26',
    }),
    null,
  );
  assert.equal(
    buildPayReferralPaymentDefaults({
      referral_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      payable_now: null,
      today: '2026-11-26',
    }),
    null,
  );
  assert.equal(
    buildPayReferralPaymentDefaults({
      referral_id: '',
      payable_now: 1000,
      today: '2026-11-26',
    }),
    null,
  );
});

test('falls back to outstanding when payable_now omitted; truncates cents', () => {
  assert.deepEqual(
    buildPayReferralPaymentDefaults({
      referral_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      outstanding: 999.7,
      today: '2026-11-26',
    }),
    {
      referral_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      amount_cents: 999,
      amount: '9.99',
      date: '2026-11-26',
    },
  );
});

test('partial remaining payable seeds that amount only', () => {
  const seeded = buildPayReferralPaymentDefaults({
    referral_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    payable_now: 4000,
    outstanding: 10000,
    today: '2026-12-01',
  });
  assert.equal(seeded?.amount_cents, 4000);
  assert.equal(seeded?.amount, '40.00');
  assert.equal(seeded?.date, '2026-12-01');
});
