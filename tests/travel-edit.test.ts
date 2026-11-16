import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';

test('travel edits preserve immutable originals, money, history and other components; stale edits roll back', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any, key = randomUUID()) =>
    execute(db, testOwner, { id: key, kind, data });
  try {
    const customer = await run('party', {
      name: 'Travel edit customer',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    });
    const provider = await run('party', {
      name: 'Travel edit airline',
      kind: 'supplier',
      roles: ['seller', 'airline', 'property', 'rental'],
    });
    const newProvider = await run('party', {
      name: 'Replacement travel provider',
      kind: 'supplier',
      roles: ['airline'],
    });
    const traveler = await run('party', {
      name: 'Added travel guest',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    });
    const booking = await run('booking', {
      customer_id: customer.id,
      supplier_id: provider.id,
      product: 'Flight',
      channel: 'Direct Airline',
      summary: 'Independent travel editing',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-01',
      create_initial_travel: true,
      sale: 100000,
      itinerary: { cost_status: 'Confirmed' },
      funding: [{ kind: 'Card', face_amount: 70000, cost: 70000, date: '2026-10-29' }],
    });
    const hotel = await run('travel_component', {
      booking_id: booking.id,
      product: 'Hotel',
      summary: 'Independent hotel',
      travel_start: '2026-12-10',
      travel_end: '2026-12-12',
      details: { hotel: 'Preserved property', confirmations: ['OLD-HOTEL'] },
    });
    await run('confirm_travel_no_cost', {
      booking_id: booking.id,
      travel_component_id: hotel.id,
      date: '2026-10-29',
      reason: 'Synthetic hotel is supplied at no Padova cost',
    });
    const before = await economics(db, booking.id);
    const original = (
      await db.query('SELECT * FROM travel_components WHERE booking_id=$1 AND id<>$2', [
        booking.id,
        hotel.id,
      ])
    ).rows[0];
    const data = {
      booking_id: booking.id,
      travel_component_id: original.id,
      expected_version: 0,
      product: 'Flight',
      summary: 'Reissued flight',
      provider_id: newProvider.id,
      channel: 'Another Agency',
      travel_start: '2026-12-03',
      travel_end: '2026-12-03',
      details: {
        confirmations: ['NEW-PNR'],
        traveler_ids: [traveler.id],
        origin: 'JFK',
        destination: 'ORD',
        flight_numbers: ['UA100'],
        ticket_numbers: ['0001234567890'],
        cabin: 'Business',
        departure_local: '2026-12-03T10:00',
        restrictions: 'Keep original evidence',
      },
      date: '2026-10-30',
      reason: 'Confirmed itinerary reissue, no financial change',
    };
    const key = randomUUID(),
      edited = await run('revise_travel', data, key);
    assert.equal((await run('revise_travel', data, key)).id, edited.id);
    assert.equal(edited.edit_version, 1);
    const state = await snapshot(db, testOwner),
      changed = state.travelComponents.find((t) => t.id === original.id)!;
    assert.equal(changed.provider_id, newProvider.id);
    assert.equal(changed.details.destination, 'ORD');
    assert.equal(changed.travel_start, '2026-12-03');
    assert.equal(
      state.travelComponents.find((t) => t.id === hotel.id)?.details.hotel,
      'Preserved property',
    );
    const after = await economics(db, booking.id);
    assert.equal(after.travel_start, '2026-12-03');
    assert.equal(after.travel_end, '2026-12-12');
    for (const field of ['sale', 'funding_cost', 'customer_balance', 'supplier_balance', 'profit'])
      assert.equal(Number(after[field]), Number(before[field]), field);
    const savedOriginal = (
      await db.query('SELECT * FROM travel_components WHERE id=$1', [original.id])
    ).rows[0];
    assert.equal(savedOriginal.summary, original.summary);
    assert.equal(savedOriginal.travel_start, '2026-12-01');
    const view = await detail(db, testOwner, 'booking', booking.id);
    assert.ok(view.travelers.some((p: any) => p.id === traveler.id));
    assert.ok(
      view.activity.some(
        (a: any) =>
          a.kind === 'revise_travel' &&
          a.actor === testOwner.id &&
          a.before_value.provider_id === provider.id,
      ),
    );
    assert.ok(
      view.revisions.some((r: any) =>
        r.snapshot.travel_components?.some(
          (t: any) => t.id === original.id && t.details?.destination === 'ORD',
        ),
      ),
    );
    await assert.rejects(
      run('revise_travel', { ...data, summary: 'Stale overwrite' }),
      /changed since this form opened/,
    );
    await assert.rejects(
      run('revise_travel', {
        ...data,
        expected_version: 1,
        details: { ...data.details, traveler_ids: [provider.id] },
      }),
      /individual people/,
    );
    assert.equal(
      (await snapshot(db, testOwner)).travelComponents.find((t) => t.id === original.id)?.summary,
      'Reissued flight',
    );
    const employee = await financialEmployee(db);
    await execute(db, employee, {
      id: randomUUID(),
      kind: 'revise_travel',
      data: { ...data, expected_version: 1, summary: 'Employee operational correction' },
    });
    const employeeView = await detail(db, employee, 'booking', booking.id);
    assert.equal(
      employeeView.travelComponents.find((t: any) => t.id === original.id).summary,
      'Employee operational correction',
    );
    assert.equal(employeeView.booking.funding_cost, undefined);
  } finally {
    await db.close();
  }
});
