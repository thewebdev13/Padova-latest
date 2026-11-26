import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  commissionConfirmedOnBooking,
  PLAN_REFERRAL_PAYABLE_WHEN,
  referralHoldForPayableWhen,
  resolveReferralPayableWhen,
} from '../src/lib/referrer-payable';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';
import { payableStates } from '../src/lib/commission-payables';
import { businessDate } from '../src/lib/business-date';
import { declareNoSupplierCost } from './helpers';

test('Plan default payable when is After commission confirmed', () => {
  assert.equal(PLAN_REFERRAL_PAYABLE_WHEN, 'After commission confirmed');
  assert.equal(resolveReferralPayableWhen({}), 'After commission confirmed');
  assert.equal(
    resolveReferralPayableWhen({ after_receipt: true }),
    'After commission received',
  );
  assert.equal(
    resolveReferralPayableWhen({ payable_when: 'After travel' }),
    'After travel',
  );
});

test('hold until commission receivable exists; receipt is a separate rule', () => {
  assert.equal(
    referralHoldForPayableWhen({
      rule: 'After commission confirmed',
      commissionConfirmed: false,
      commissionIncomplete: false,
      expectedCommission: 0,
      receivedCommission: 0,
      customerBalance: 0,
      travelEnd: '2026-01-01',
      today: '2026-11-25',
    }),
    'Commission not confirmed yet',
  );
  assert.equal(
    referralHoldForPayableWhen({
      rule: 'After commission confirmed',
      commissionConfirmed: true,
      commissionIncomplete: false,
      expectedCommission: 9000,
      receivedCommission: 0,
      customerBalance: 0,
      travelEnd: '2026-01-01',
      today: '2026-11-25',
    }),
    '',
  );
  assert.equal(
    referralHoldForPayableWhen({
      rule: 'After commission received',
      commissionConfirmed: true,
      commissionIncomplete: false,
      expectedCommission: 9000,
      receivedCommission: 0,
      customerBalance: 0,
      travelEnd: '2026-01-01',
      today: '2026-11-25',
    }),
    'Commission receipt pending',
  );
  assert.equal(
    commissionConfirmedOnBooking({
      bookingId: 'b1',
      commissions: [{ id: 'c1', booking_id: 'b1' }],
      operational: {},
    }),
    true,
  );
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for referrer payable tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Referrer Owner',
    email: 'referrer-pay@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

test('referrer payable_now waits for commission confirmation, not customer payment', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'Ref Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'Ref Sruly', roles: ['seller'] },
  });
  const referrer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'Ref Partner', roles: ['referrer', 'customer'] },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Referrer payable when confirmed',
      booked_on: date,
      travel_start: '2026-10-01',
      travel_end: '2026-10-03',
      sale: 100000,
    },
  });
  await declareNoSupplierCost(db, booking.id, date);
  await execute(db, owner, {
    id: randomUUID(),
    kind: 'referral',
    data: {
      booking_id: booking.id,
      referrer_id: referrer.id,
      basis: 'fixed',
      rate_bps: 0,
      fixed_amount: 2000,
      percentage_basis: 'profit',
      due_on: date,
      date,
      reason: 'Plan confirm timing',
      earned: true,
      payable_when: 'After commission confirmed',
      cancellation_rule: 'Realized economics',
    },
  });
  const today = await businessDate(db);
  const row0 = await one(db, 'SELECT * FROM booking_balances WHERE id=$1', [booking.id]);
  const eco0 = await economics(db, booking.id);
  const before = await payableStates(db, { ...row0, ...eco0 }, today);
  assert.equal(before[0].payable_when, 'After commission confirmed');
  assert.equal(before[0].hold_reason, 'Commission not confirmed yet');
  assert.equal(Number(before[0].payable_now), 0);

  await execute(db, owner, {
    id: randomUUID(),
    kind: 'commission',
    data: {
      booking_id: booking.id,
      payer_id: supplier.id,
      gross: 10000,
      retained: 1000,
      due_on: date,
      date,
    },
  });
  const row1 = await one(db, 'SELECT * FROM booking_balances WHERE id=$1', [booking.id]);
  const eco1 = await economics(db, booking.id);
  const after = await payableStates(db, { ...row1, ...eco1 }, today);
  assert.equal(after[0].hold_reason, '');
  assert.equal(Number(after[0].payable_now), 2000);
  // Customer still owes — Plan: that must not block referrer when commission is confirmed.
  assert.ok(Number(eco1.customer_balance) > 0);
});
