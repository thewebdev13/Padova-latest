import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  appendTripSharedCharge,
  collectTripSharedChargesFromFamily,
  tripSharedChargeSummary,
  tripSharedExtraLabel,
  visibleTripSharedCharges,
} from '../src/lib/trip-shared-charges';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';

test('trip shared label + summary never invent $0', () => {
  assert.equal(tripSharedExtraLabel('Transfer fee'), 'Trip shared · Transfer fee');
  assert.equal(tripSharedExtraLabel('Trip shared · X'), 'Trip shared · X');
  const summary = tripSharedChargeSummary({
    id: '1',
    label: 'Trip shared · Resort fee',
    customer_amount_cents: null,
    cost_amount_cents: 4500,
    posted_booking_id: 'b1',
    posted_booking_code: 'PDV-1',
    effective_on: '2026-11-26',
  });
  assert.match(summary, /customer Unknown/);
  assert.match(summary, /cost \$45\.00/);
  assert.match(summary, /on PDV-1/);
});

test('append + collect across family dedupes by id', () => {
  const op = appendTripSharedCharge(null, {
    id: 'c1',
    label: 'Trip shared · Parking',
    customer_amount_cents: 2000,
    cost_amount_cents: null,
    posted_booking_id: 'a',
    posted_booking_code: 'A',
    effective_on: '2026-11-26',
  });
  assert.equal(visibleTripSharedCharges(op).length, 1);
  const list = collectTripSharedChargesFromFamily([
    { id: 'a', code: 'A', itinerary: { operational_entry: op } },
    { id: 'b', code: 'B', itinerary: { operational_entry: op } },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'c1');
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for trip shared charge tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Trip Shared Owner',
    email: 'trip-shared-owner@example.invalid',
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

test('booking_extra trip_shared posts money once and records trip_shared_charges', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'Trip Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'Trip Airline', roles: ['seller'] },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Flight',
      channel: 'Direct',
      summary: 'JFK-MIA',
      booked_on: date,
      travel_start: date,
      travel_end: date,
      sale: 80_000,
    },
  });
  const before = await economics(db, booking.id);
  await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking_extra',
    data: {
      booking_id: booking.id,
      category: 'Other',
      description: 'Resort fee',
      customer_amount: 3500,
      cost_amount: 3500,
      payee_id: supplier.id,
      date,
      trip_shared: true,
      reason: 'Shared hotel fee for trip',
    },
  });
  const after = await economics(db, booking.id);
  assert.equal(Number(after.sale) - Number(before.sale), 3500);
  const row = await one(db, 'SELECT itinerary, code FROM bookings WHERE id=$1', [booking.id]);
  const charges = visibleTripSharedCharges(row.itinerary?.operational_entry);
  assert.equal(charges.length, 1);
  assert.match(charges[0].label, /Trip shared/);
  assert.equal(charges[0].customer_amount_cents, 3500);
  assert.equal(charges[0].cost_amount_cents, 3500);
  assert.equal(charges[0].posted_booking_id, booking.id);
});
