import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import {
  bootstrapOwner,
  login,
  sessionActor,
  createUser,
  issueRecovery,
  completeRecovery,
} from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for booking change tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Change Owner',
    email: 'change-owner@example.invalid',
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

async function cmd(kind: string, data: Record<string, unknown>, id = randomUUID()) {
  return execute(db, owner, { id, kind: kind as any, data });
}

async function setupBooking(sale = 100000) {
  const customer = await cmd('party', {
    kind: 'person',
    name: `Change Customer ${randomUUID().slice(0, 8)}`,
    roles: ['customer', 'traveler'],
  });
  const supplier = await cmd('party', {
    kind: 'supplier',
    name: `Change Airline ${randomUUID().slice(0, 8)}`,
    roles: ['seller'],
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'JFK-TLV UA100',
    booked_on: date,
    travel_start: '2026-12-01',
    travel_end: '2026-12-10',
    sale,
  });
  return { customer, supplier, booking };
}

test('fee-only change posts same ledgers as revise without new itinerary revision', async () => {
  const { booking, supplier } = await setupBooking();
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 80000,
    cost: 80000,
    seller_id: supplier.id,
    date,
    settled: false,
  });
  const beforeRevs = Number(
    (await one(db, 'SELECT count(*)::int AS n FROM itinerary_revisions WHERE booking_id=$1', [
      booking.id,
    ])).n,
  );
  const id = randomUUID();
  const result = await cmd(
    'booking_change',
    {
      booking_id: booking.id,
      date: '2026-12-01',
      reason: 'Passenger date move — fees only',
      fare_difference: 10000,
      supplier_change_fee: 2500,
      padova_change_fee: 5000,
      additional_customer_charge: 17500,
      change_seller_id: supplier.id,
    },
    id,
  );
  assert.equal(result.envelope_changed, false);
  assert.equal(result.fees_posted, true);
  const afterRevs = Number(
    (await one(db, 'SELECT count(*)::int AS n FROM itinerary_revisions WHERE booking_id=$1', [
      booking.id,
    ])).n,
  );
  assert.equal(afterRevs, beforeRevs);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.sale), 117500);
  assert.equal(Number(eco.funding_cost), 92500);
  const charges = (
    await db.query('SELECT kind,amount FROM charges WHERE command_id=$1 ORDER BY kind', [id])
  ).rows;
  assert.deepEqual(
    charges.map((r) => [r.kind, Number(r.amount)]),
    [
      ['Change fare / customer adjustment', 12500],
      ['Padova change fee', 5000],
    ],
  );
});

test('summary/date change writes itinerary revision; fees optional', async () => {
  const { booking } = await setupBooking();
  const beforeRev = Number(
    (await one(db, 'SELECT revision FROM bookings WHERE id=$1', [booking.id])).revision,
  );
  const result = await cmd('booking_change', {
    booking_id: booking.id,
    date,
    reason: 'New return date',
    summary: 'JFK-TLV UA102',
    travel_start: '2026-12-02',
    travel_end: '2026-12-12',
  });
  assert.equal(result.envelope_changed, true);
  assert.equal(result.fees_posted, false);
  const row = await one(db, 'SELECT summary, travel_start, travel_end, revision FROM bookings WHERE id=$1', [
    booking.id,
  ]);
  assert.equal(row.summary, 'JFK-TLV UA102');
  assert.equal(String(row.travel_start).slice(0, 10), '2026-12-02');
  assert.equal(String(row.travel_end).slice(0, 10), '2026-12-12');
  assert.equal(Number(row.revision), beforeRev + 1);
});

test('Padova fee cannot exceed customer total; funding permission required', async () => {
  const { booking, supplier } = await setupBooking();
  await assert.rejects(
    () =>
      cmd('booking_change', {
        booking_id: booking.id,
        date,
        reason: 'bad fee split',
        padova_change_fee: 5000,
        additional_customer_charge: 4000,
      }),
    /must include the Padova fee/,
  );
  const created = await createUser(db, owner, {
    name: 'Change Worker',
    email: `change-worker-${randomUUID().slice(0, 8)}@example.invalid`,
    permissions: ['operations', 'edit_customer_charges', 'edit_payments'],
    role: 'EMPLOYEE',
  });
  const recovery = await issueRecovery(db, owner, created.id);
  const password = 'Synthetic change worker password only';
  await completeRecovery(db, { token: recovery.token, password });
  const staff = (await sessionActor(
    db,
    (await login(db, { email: created.email, password })).token,
  ))!;
  await assert.rejects(
    () =>
      execute(db, staff, {
        id: randomUUID(),
        kind: 'booking_change',
        data: {
          booking_id: booking.id,
          date,
          reason: 'needs funding grant',
          fare_difference: 1000,
          change_seller_id: supplier.id,
        },
      }),
    /Permission required: manage_funding/,
  );
});
