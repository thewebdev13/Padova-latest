import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BookingEntry from '../src/components/booking-entry';
import CommandForm from '../src/components/command-form';
import {
  travelerNames,
  flightEndpoints,
  flightEndpointChange,
  eligibleProfileContact,
  inventoryOption,
} from '../src/lib/booking-ux';
import { derivedTravel } from '../src/lib/booking-derived';

const state = {
  today: '2026-11-03',
  actor: { role: 'OWNER', permissions: [] },
  parties: [],
  assets: [],
  bookings: [],
  paymentAccounts: [],
  bookingSourceMethods: [],
  bookingSourceProfiles: [],
  programs: [],
  sourceProfilesEnabled: true,
};
const render = (defaults: Record<string, any> = {}) =>
  renderToStaticMarkup(
    createElement(BookingEntry, {
      config: { defaults },
      state,
      onClose() {},
      async onSubmit() {},
      async onInlineCommand() {
        return {};
      },
    }),
  );

test('pasted names accept commas/newlines and normalize duplicate input without conflating different people', () => {
  assert.deepEqual(
    travelerNames('Miriam Klein, David Stein\n  Miriam  Klein\r\nDAVID STEIN, Dovid Stein'),
    ['Miriam Klein', 'DAVID STEIN', 'Dovid Stein'],
  );
  assert.deepEqual(travelerNames('  ,\n'), []);
});

test('From/To updates replace legacy route and feed the existing automatic summary', () => {
  const v = {
    product: 'Flight',
    trip_type: 'Round Trip',
    route: 'EWR-TLV',
    travel_start: '2026-12-01',
    travel_end: '2026-12-12',
  };
  assert.deepEqual(flightEndpoints(v), { origin: 'EWR', destination: 'TLV' });
  const changed = flightEndpointChange(v, 'destination', 'HKG');
  assert.equal(changed.route, 'EWR-HKG');
  assert.match(derivedTravel(changed).summary, /EWR-HKG/);
  assert.equal(derivedTravel(changed).end, v.travel_end);
  const multi = {
    ...v,
    trip_type: 'Multi-City',
    segments: [
      { origin: 'EWR', destination: 'HKG', date: '2026-12-01' },
      { origin: 'HKG', destination: 'TLV', date: '2026-12-05' },
    ],
  };
  assert.match(derivedTravel(multi).summary, /HKG · TLV/);
});

test('neutral profile contacts exclude airlines/organizations and need no commercial role', () => {
  assert.equal(eligibleProfileContact({ kind: 'person', roles: [] }), true);
  assert.equal(eligibleProfileContact({ kind: 'person', roles: ['contact'] }), true);
  for (const p of [
    { kind: 'company' },
    { kind: 'supplier' },
    { kind: 'person', roles: ['airline'] },
    { kind: 'person', archived_at: '2026-11-01' },
    { kind: 'person', details: { traveler_review_only: true } },
  ])
    assert.equal(eligibleProfileContact(p), false);
});

test('inventory label separates type/quantity and retains Unknown rather than manufacturing zero', () => {
  const unknown = inventoryOption(
    {
      id: 'a',
      name: 'United MileagePlus',
      issuer: 'United MileagePlus',
      kind: 'Points',
      balance: null,
    },
    'points',
  );
  assert.equal(unknown.label, 'United MileagePlus');
  assert.equal(unknown.detail, 'Points');
  assert.equal(unknown.badge, 'Unknown available');
  assert.equal(
    inventoryOption({ id: 'b', name: 'Voucher', kind: 'Voucher', balance: 0 }, 'money').badge,
    '$0.00',
  );
});

test('one booking form has six clear sections, one traveler input, direct summary editing and explicit Unknown money', () => {
  const html = render();
  assert.equal((html.match(/class="booking-section full form-grid"/g) ?? []).length, 6);
  assert.equal(
    (html.match(/aria-label="Travelers: search, type or paste names"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    html,
    /Add several travelers|Customize reservation summary|Discard unfinished booking/,
  );
  assert.match(html, /Amount owed to Padova<\/dt><dd>Unknown/);
  assert.match(html, /Remaining balance<\/dt><dd>Unknown/);
  assert.match(html, /aria-label="From"/);
  assert.match(html, /aria-label="To"/);
  assert.match(html, /Discard draft/);
});

test('Flight segments stay separate; Hotel/Car/Other never inherit airport inputs', () => {
  const multi = render({ trip_type: 'Multi-City' });
  assert.match(multi, /Segment 1 From/);
  assert.match(multi, /Segment 2 To/);
  for (const product of ['Hotel', 'Car', 'Other'])
    assert.doesNotMatch(render({ product }), /aria-label="(?:From|To)"/);
  assert.match(render({ product: 'Hotel' }), /Check-in date/);
  assert.match(render({ product: 'Hotel' }), /Room type and booking date/);
  assert.doesNotMatch(
    render({ product: 'Hotel' }),
    /Flight numbers, cabin, ticket numbers and booking date/,
  );
  assert.match(render({ product: 'Car' }), /Pickup location/);
  assert.match(render({ product: 'Other' }), /What is it/);
});

test('provider-direct amount remains separate from cash received by Padova', () => {
  const html = render({ sale: '50', components: [{ type: 'Customer card', cost: '900' }] });
  assert.match(html, /Received by Padova<\/dt><dd>\$0.00/);
  assert.match(html, /Customer paid provider directly<\/dt><dd>\$900.00/);
  assert.match(html, /Remaining balance<\/dt><dd>\$50.00/);
});

test('new booking method offers four controlled product buttons instead of free text', () => {
  const html = renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind: 'booking_source_method', defaults: { products: ['Flight'] } },
      state,
      onClose() {},
      async onSubmit() {},
    }),
  );
  assert.match(html, /New Booking Method/);
  assert.match(html, /aria-label="Used for"/);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 4);
  assert.doesNotMatch(html, /Products \(comma separated\)/);
  assert.match(html, /Save booking method/);
});
