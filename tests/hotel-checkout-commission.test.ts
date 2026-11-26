import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingExpectsHotelCommission,
  buildHotelCheckoutCommissionReminders,
  hotelCheckoutOn,
} from '../src/lib/hotel-checkout-commission';
import { expectedCommissionFollowUps } from '../src/lib/expected-commissions';

test('hotel checkout date from travel_end only when valid', () => {
  assert.equal(hotelCheckoutOn({ travel_end: '2026-11-20' }), '2026-11-20');
  assert.equal(hotelCheckoutOn({ travel_end: null }), null);
  assert.equal(hotelCheckoutOn({ itinerary: { travel_end: '2026-12-01' } }), '2026-12-01');
});

test('expects hotel commission for Hotel with commission; not FHR / cancelled', () => {
  assert.equal(
    bookingExpectsHotelCommission({
      product: 'Hotel',
      itinerary: {
        operational_entry: {
          how_booked: 'Hotel with commission',
          commission: { expected: 'Yes' },
        },
      },
    }),
    true,
  );
  assert.equal(
    bookingExpectsHotelCommission({
      product: 'Hotel',
      itinerary: {
        operational_entry: {
          how_booked: 'Hotel at program rate (FHR)',
          commission: { expected: 'No' },
        },
      },
    }),
    false,
  );
  assert.equal(
    bookingExpectsHotelCommission({
      product: 'Hotel',
      reservation_status: 'Cancelled',
      itinerary: {
        operational_entry: {
          how_booked: 'Hotel with commission',
          commission: { expected: 'Yes' },
        },
      },
    }),
    false,
  );
});

test('checkout reminders after checkout until posted or settled', () => {
  const today = '2026-11-25';
  const bookings = [
    {
      id: 'b1',
      code: 'H-1',
      product: 'Hotel',
      travel_end: '2026-11-20',
      itinerary: {
        operational_entry: {
          how_booked: 'Hotel with commission',
          commission: { expected: 'Yes' },
        },
      },
    },
    {
      id: 'b2',
      code: 'H-2',
      product: 'Hotel',
      travel_end: '2026-12-31',
      itinerary: {
        operational_entry: {
          how_booked: 'Hotel with commission',
          commission: { expected: 'Yes' },
        },
      },
    },
  ];
  const unposted = buildHotelCheckoutCommissionReminders(bookings, [], today);
  assert.equal(unposted.length, 1);
  assert.equal(unposted[0].booking_id, 'b1');
  assert.equal(unposted[0].urgency, 'overdue');

  const settled = buildHotelCheckoutCommissionReminders(
    bookings,
    [{ id: 'c1', booking_id: 'b1', gross: 9000, retained: 0, received: 9000 }],
    today,
  );
  assert.equal(settled.length, 0);

  const outstanding = buildHotelCheckoutCommissionReminders(
    bookings,
    [{ id: 'c1', booking_id: 'b1', gross: 9000, retained: 0, received: 0 }],
    today,
  );
  assert.equal(outstanding.length, 1);
  assert.match(outstanding[0].detail, /Outstanding commission/);
});

test('expected list sorts past checkout first and exposes checkout_on', () => {
  const rows = expectedCommissionFollowUps(
    [
      {
        id: 'b-future',
        code: 'Z-FUT',
        customer: 'A',
        product: 'Hotel',
        travel_end: '2026-12-31',
        itinerary: {
          operational_entry: {
            how_booked: 'Hotel with commission',
            commission: { expected: 'Yes', amount: 1000 },
          },
        },
      },
      {
        id: 'b-past',
        code: 'A-PAST',
        customer: 'B',
        product: 'Hotel',
        travel_end: '2026-11-20',
        itinerary: {
          operational_entry: {
            how_booked: 'Hotel with commission',
            commission: { expected: 'Yes', amount: 2000 },
          },
        },
      },
    ],
    [],
    '2026-11-25',
  );
  assert.equal(rows[0].booking_id, 'b-past');
  assert.equal(rows[0].checkout_urgency, 'overdue');
  assert.equal(rows[1].checkout_on, '2026-12-31');
});
