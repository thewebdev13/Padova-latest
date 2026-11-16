import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  derivedTravel,
  travelDateLabels,
  originalConfirmedRate,
  directCardOwner,
} from '../src/lib/booking-derived';
import { bookingProductDetails } from '../src/lib/booking-entry-state';
import { financialDatabase, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { fulfillmentSchemas } from '../src/lib/fulfillment';
import { effectiveTravelComponents } from '../src/lib/fulfillment';

test('structured travel derives the summary and dates without duplicating employee input', () => {
  assert.deepEqual(travelDateLabels('Flight'), { start: 'Departure Date', end: undefined });
  const flight = derivedTravel(
    {
      product: 'Flight',
      trip_type: 'One Way',
      route: 'JFK–TLV',
      travel_start: '2027-02-01',
      travel_end: '2027-02-10',
    },
    'EL AL',
  );
  assert.equal(flight.end, '2027-02-01');
  assert.equal(flight.summary, 'EL AL · JFK–TLV · 2027-02-01');
  const segments = [
    { origin: 'JFK', destination: 'LHR', date: '2027-02-01', flight_number: 'BA1' },
    { origin: 'LHR', destination: 'TLV', date: '2027-02-03', flight_number: 'BA2' },
  ];
  const multi = derivedTravel({
    product: 'Flight',
    trip_type: 'Multi-City',
    segments,
    travel_start: '1999-01-01',
  });
  assert.equal(multi.start, segments[0].date);
  assert.equal(multi.end, segments[1].date);
  assert.match(multi.summary, /2027-02-03/);
  assert.deepEqual(
    bookingProductDetails({ product: 'Flight', trip_type: 'Multi-City', segments }).flight_numbers,
    ['BA1', 'BA2'],
  );
  assert.equal(
    derivedTravel(
      {
        product: 'Hotel',
        location: 'London',
        travel_start: '2027-03-01',
        travel_end: '2027-03-04',
      },
      'Test Hotel',
    ).summary,
    'Test Hotel · London · 2027-03-01 – 2027-03-04',
  );
  const car = {
    product: 'Car',
    pickup_location: 'JFK',
    dropoff_location: 'EWR',
    travel_start: '2027-03-01',
    travel_end: '2027-03-02',
    pickup_time: '09:30',
  };
  assert.equal(bookingProductDetails(car).departure_local, '2027-03-01T09:30');
  assert.match(derivedTravel(car, 'Rental Co').summary, /JFK → EWR/);
  assert.equal(travelDateLabels('Other').start, 'Start date');
  assert.deepEqual(bookingProductDetails({ product: 'Other', description: 'Museum visit' }), {
    description: 'Museum visit',
  });
  const saved = fulfillmentSchemas.travel_component.parse({
    booking_id: randomUUID(),
    product: 'Flight',
    summary: flight.summary,
    travel_start: flight.start,
    travel_end: flight.end,
    details: {
      summary_generated: true,
      reservation_summary_generated: true,
      reservation_summary: flight.summary,
    },
  });
  assert.equal(saved.details.reservation_summary_generated, true);
  assert.equal(directCardOwner({}, 'customer'), 'customer');
  assert.equal(directCardOwner({ owner_id: 'traveler' }, 'customer'), 'traveler');
  assert.equal(
    originalConfirmedRate({
      itinerary: { operational_entry: { components: [{ type: 'Owned value', cost: 400 }] } },
    }),
    undefined,
  );
});

test('price-match requests inherit immutable original amount/profile, require explained overrides, and receipt remains separate and replay safe', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any, id = randomUUID()) =>
    execute(db, testOwner, { id, kind, data });
  const date = '2026-10-31';
  try {
    const customer = await run('party', {
      name: 'Derived booking customer',
      kind: 'person',
      roles: ['customer'],
    });
    const traveler = await run('party', {
      name: 'Traveler With No Contact',
      kind: 'person',
      roles: ['traveler'],
    });
    assert.ok(!traveler.email);
    const method = (
      await db.query("SELECT * FROM booking_source_methods WHERE name='Capital One Travel'")
    ).rows[0];
    const profile = await run('booking_source_profile', {
      name: 'Derived profile',
      source_method_id: method.id,
      provider: method.name,
    });
    const b = await run('booking', {
      customer_id: customer.id,
      traveler_ids: [traveler.id],
      product: 'Flight',
      channel: method.name,
      summary: 'Derived flight',
      booked_on: date,
      travel_start: '2027-02-01',
      travel_end: '2027-02-01',
      sale: 100000,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Derived flight',
          travel_start: '2027-02-01',
          travel_end: '2027-02-01',
          details: {
            trip_type: 'One Way',
            end_date_known: false,
            summary_generated: true,
            reservation_summary_generated: true,
            reservation_summary: 'Derived flight',
          },
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        trip_type: 'One Way',
        source_method_id: method.id,
        source_profile_id: profile.id,
        components: [{ type: 'Padova payment', cost: 79060, method: 'Cash', date }],
      },
    });
    const originalTravel = (
      await db.query('SELECT * FROM travel_components WHERE booking_id=$1', [b.id])
    ).rows[0];
    const journalBeforeTravel = (await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n;
    const segments = [
      { origin: 'JFK', destination: 'LHR', date: '2027-02-02' },
      { origin: 'LHR', destination: 'TLV', date: '2027-02-04' },
    ];
    const multiSummary = derivedTravel({
      product: 'Flight',
      trip_type: 'Multi-City',
      segments,
    }).summary;
    await run('revise_travel', {
      booking_id: b.id,
      travel_component_id: originalTravel.id,
      expected_version: 0,
      product: 'Flight',
      summary: multiSummary,
      travel_start: '2027-02-02',
      travel_end: '2027-02-04',
      details: {
        trip_type: 'Multi-City',
        segments,
        end_date_known: true,
        summary_generated: true,
        reservation_summary_generated: true,
        reservation_summary: multiSummary,
      },
      date,
      reason: 'Structured segment revision',
    });
    assert.equal(
      (await db.query('SELECT summary FROM bookings WHERE id=$1', [b.id])).rows[0].summary,
      multiSummary,
    );
    await run('revise_travel', {
      booking_id: b.id,
      travel_component_id: originalTravel.id,
      expected_version: 1,
      product: 'Flight',
      summary: 'JFK–TLV · 2027-02-05',
      travel_start: '2027-02-05',
      travel_end: '2027-02-05',
      details: {
        trip_type: 'One Way',
        segments: null,
        end_date_known: false,
        summary_generated: true,
        reservation_summary_generated: true,
        reservation_summary: 'JFK–TLV · 2027-02-05',
      },
      date,
      reason: 'One Way derives its range and clears effective segments',
    });
    const revisedTravel = (await effectiveTravelComponents(db, b.id))[0];
    assert.equal(revisedTravel.details.segments, null);
    assert.equal(revisedTravel.travel_start, revisedTravel.travel_end);
    assert.equal(
      (await db.query('SELECT summary FROM bookings WHERE id=$1', [b.id])).rows[0].summary,
      'JFK–TLV · 2027-02-05',
    );
    assert.equal(
      (await db.query('SELECT * FROM travel_components WHERE id=$1', [originalTravel.id])).rows[0]
        .travel_start,
      originalTravel.travel_start,
    );
    assert.equal(
      (await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n,
      journalBeforeTravel,
    );
    const request = await run('price_match_event', {
      booking_id: b.id,
      status: 'Pending',
      requested_amount: 19792,
      expected_credit: 19792,
      final_rate: 59268,
      date,
      reason: 'Lower comparison found',
    });
    let history = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id])).rows[0]
      .itinerary.price_match_history;
    assert.equal(history[0].original_rate, 79060);
    assert.equal(history[0].profile_id, profile.id);
    assert.equal((await economics(db, b.id)).generated_value, 0);
    await assert.rejects(
      run('price_match_event', {
        booking_id: b.id,
        status: 'Pending',
        original_rate: 99999,
        date,
        reason: 'Unexplained replacement',
      }),
      /override requires/,
    );
    await run('price_match_event', {
      booking_id: b.id,
      status: 'Pending',
      original_rate: 80000,
      original_rate_reason: 'Confirmed separate portal rate includes provider tax',
      date,
      reason: 'Exception is explicitly recorded',
    });
    const receiptKey = randomUUID();
    const receipt = {
      booking_id: b.id,
      request_id: request.id,
      status: 'Received',
      received_amount: 19792,
      received_on: date,
      date,
      reference: 'DERIVED-RECEIPT',
      reason: 'Credit visible in account',
    };
    await run('price_match_event', receipt, receiptKey);
    const before = (await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n;
    await run('price_match_event', receipt, receiptKey);
    assert.equal((await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n, before);
    assert.equal((await economics(db, b.id)).generated_value, 19792);
    history = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id])).rows[0]
      .itinerary.price_match_history;
    assert.equal(history.at(-1).original_rate, 79060);
    assert.equal(
      history[1].original_rate_reason,
      'Confirmed separate portal rate includes provider tax',
    );
  } finally {
    await db.close();
  }
});
