import test from 'node:test';
import assert from 'node:assert/strict';
import { travelsBetween, upcomingBookings, nextTravelDate } from '../src/lib/travel-schedule';

test('future return and multi-city dates remain upcoming after the first departure, without inventing an unknown return', () => {
  const b = {
    id: 'trip',
    product: 'Flight',
    travel_start: '2026-11-01',
    travel_end: '2026-11-20',
    itinerary: { trip_type: 'Round Trip' },
  };
  assert.equal(nextTravelDate(b, [], '2026-11-06', '2026-12-06'), '2026-11-20');
  assert.equal(
    nextTravelDate(
      { ...b, itinerary: { ...b.itinerary, end_date_known: false } },
      [],
      '2026-11-06',
      '2026-12-06',
    ),
    undefined,
  );
  assert.equal(
    nextTravelDate(
      {
        ...b,
        itinerary: {
          trip_type: 'Multi-City',
          segments: [{ date: '2026-11-01' }, { date: '2026-11-10' }, { date: '2026-11-20' }],
        },
      },
      [],
      '2026-11-06',
      '2026-12-06',
    ),
    '2026-11-10',
  );
});

test('upcoming includes every matching booking in chronological order and later components of current trips', () => {
  const bookings = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    product: 'Flight',
    travel_start: `2026-11-${String(20 - i).padStart(2, '0')}`,
    travel_end: '2026-11-22',
  }));
  const result = upcomingBookings(bookings, [], '2026-11-05', '2026-12-05');
  assert.equal(result.length, 8);
  assert.equal(result[0].id, '7');
  const components = [
    {
      ...bookings[0],
      id: 'departed',
      booking_id: '0',
      travel_start: '2026-11-01',
      travel_end: '2026-11-05',
    },
    {
      ...bookings[0],
      id: 'next',
      booking_id: '0',
      travel_start: '2026-11-09',
      travel_end: '2026-11-09',
    },
  ];
  assert.equal(upcomingBookings(bookings, components, '2026-11-05', '2026-12-05')[0].id, '0');
  assert.equal(
    upcomingBookings(
      [{ ...bookings[0], reservation_status: 'Cancelled' }],
      components,
      '2026-11-05',
      '2026-12-05',
    ).length,
    0,
  );
  assert.equal(
    upcomingBookings(
      [bookings[0]],
      components.map((c) => ({ ...c, status: 'Cancelled' })),
      '2026-11-05',
      '2026-12-05',
    ).length,
    0,
  );
});

test('calendar uses actual component dates and products, preserves gaps and excludes canceled travel', () => {
  const booking = {
    id: 'trip',
    product: 'Flight + Hotel',
    travel_start: '2026-12-01',
    travel_end: '2026-12-15',
  };
  const components = [
    {
      id: 'flight',
      booking_id: 'trip',
      product: 'Flight',
      travel_start: '2026-12-01',
      travel_end: '2026-12-01',
      status: 'Booked',
    },
    {
      id: 'hotel',
      booking_id: 'trip',
      product: 'Hotel',
      travel_start: '2026-12-10',
      travel_end: '2026-12-15',
      status: 'Booked',
    },
  ];
  assert.equal(travelsBetween(booking, components, '2026-12-05'), false);
  assert.equal(travelsBetween(booking, components, '2026-12-10', '2026-12-10', 'Hotel'), true);
  assert.equal(travelsBetween(booking, components, '2026-12-10', '2026-12-10', 'Flight'), false);
  assert.equal(
    travelsBetween(booking, components, '2026-12-01', '2026-12-01', 'Flight + Hotel'),
    true,
  );
  assert.equal(travelsBetween(booking, components, '2026-12-02', '2026-12-11'), true);
  components[1].status = 'Cancelled';
  assert.equal(travelsBetween(booking, components, '2026-12-10'), false);
  components[0].status = 'Cancelled';
  assert.equal(travelsBetween(booking, components, '2026-12-01', '2026-12-15'), false);
  assert.equal(
    travelsBetween({ ...booking, reservation_status: 'Refund Pending' }, [], '2026-12-01'),
    false,
  );
});

test('legacy bookings retain date fallback without using components belonging to other bookings', () => {
  const booking = {
    id: 'legacy',
    product: 'Hotel',
    travel_start: '2026-12-01',
    travel_end: '2026-12-03',
  };
  assert.equal(travelsBetween(booking, [], '2026-12-02'), true);
  assert.equal(travelsBetween(booking, [], '2026-12-04'), false);
  assert.equal(
    travelsBetween(
      booking,
      [{ ...booking, id: 'other', booking_id: 'other', status: 'Cancelled' }],
      '2026-12-02',
    ),
    true,
  );
});
