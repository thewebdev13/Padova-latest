import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCommissionIataPartner,
  defaultHotelCommissionPayerId,
  isHotelCommissionBooking,
  suggestSruly9010RetainedDollars,
} from '../src/lib/hotel-commission-defaults';

test('Plan Change: hotel commission booking detection', () => {
  assert.equal(isHotelCommissionBooking(null), false);
  assert.equal(isHotelCommissionBooking({ product: 'Flight' }), false);
  assert.equal(isHotelCommissionBooking({ product: 'Hotel' }), true);
  assert.equal(
    isHotelCommissionBooking({
      product: 'Other',
      itinerary: { operational_entry: { how_booked: 'Hotel with commission' } },
    }),
    true,
  );
});

test('Plan Change: IATA partner off by default; hotel does not flip it on', () => {
  assert.equal(defaultCommissionIataPartner(undefined), false);
  assert.equal(defaultCommissionIataPartner(null), false);
  assert.equal(defaultCommissionIataPartner(false), false);
  assert.equal(defaultCommissionIataPartner(true), true);
});

test('Plan: hotels seed Sruly payer when known; 90/10 retained only when gross known', () => {
  assert.equal(
    defaultHotelCommissionPayerId({
      hotelBooking: true,
      srulyPartyId: 'sruly-1',
    }),
    'sruly-1',
  );
  assert.equal(
    defaultHotelCommissionPayerId({
      hotelBooking: true,
      explicitPayerId: 'hotel-direct',
      srulyPartyId: 'sruly-1',
    }),
    'hotel-direct',
  );
  assert.equal(
    defaultHotelCommissionPayerId({ hotelBooking: false, srulyPartyId: 'sruly-1' }),
    '',
  );
  assert.equal(
    defaultHotelCommissionPayerId({ hotelBooking: true, srulyPartyId: null }),
    '',
  );

  assert.equal(
    suggestSruly9010RetainedDollars({
      shouldSeed: true,
      grossRaw: '100',
      retainedRaw: '',
    }),
    '10.00',
  );
  assert.equal(
    suggestSruly9010RetainedDollars({
      shouldSeed: true,
      grossRaw: '100',
      retainedRaw: '5',
    }),
    null,
  );
  assert.equal(
    suggestSruly9010RetainedDollars({
      shouldSeed: false,
      grossRaw: '100',
      retainedRaw: '',
    }),
    null,
  );
  assert.equal(
    suggestSruly9010RetainedDollars({
      shouldSeed: true,
      grossRaw: '',
      retainedRaw: '',
    }),
    null,
  );
});
