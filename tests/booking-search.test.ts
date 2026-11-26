import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bookingMatchesSearch,
  bookingSearchTerms,
  saleMatchesSearch,
} from '../src/lib/booking-search';

test('bookingSearchTerms includes ticket numbers, PNR/confirmations, booking #, people', () => {
  const booking = {
    id: 'b1',
    code: 'PDV-100',
    confirmations: 'ABC123',
    customer: 'Ada Customer',
    customer_id: 'p-customer',
    traveler_ids: ['p-traveler'],
    itinerary: {
      ticket_numbers: ['0012345678901'],
      operational_entry: {
        references: [{ value: 'SRC-99' }],
        ticket_numbers: ['001999'],
      },
    },
  };
  const state = {
    parties: [
      { id: 'p-customer', name: 'Ada Customer' },
      { id: 'p-traveler', name: 'Traveler One' },
    ],
    travelComponents: [
      {
        booking_id: 'b1',
        details: {
          ticket_numbers: ['016555'],
          confirmations: ['HOTEL-CONF'],
        },
      },
    ],
    fundingComponents: [],
    bookingSourceProfiles: [],
    paymentAccounts: [],
  };
  const terms = bookingSearchTerms(booking, state);
  for (const needle of [
    'PDV-100',
    'ABC123',
    '0012345678901',
    '001999',
    '016555',
    'HOTEL-CONF',
    'SRC-99',
    'Ada Customer',
    'Traveler One',
  ]) {
    assert.ok(
      terms.some((t) => t.includes(needle)),
      `expected search terms to include ${needle}, got ${JSON.stringify(terms)}`,
    );
  }
});

test('bookingSearchTerms never invents blank identifiers', () => {
  assert.deepEqual(
    bookingSearchTerms({ id: 'b2', itinerary: {} }, { parties: [], travelComponents: [] }),
    [],
  );
});

test('Bookings list search: PNR · customer · ticket; blank query matches all ≠ invent', () => {
  const booking = {
    id: 'b1',
    code: 'PDV-100',
    confirmations: 'ABC123',
    customer: 'Ada Customer',
    itinerary: { ticket_numbers: ['0012345678901'] },
  };
  const state = { parties: [], travelComponents: [], fundingComponents: [] };
  assert.equal(bookingMatchesSearch(booking, state, ''), true);
  assert.equal(bookingMatchesSearch(booking, state, null), true);
  assert.equal(bookingMatchesSearch(booking, state, 'pdv-100'), true);
  assert.equal(bookingMatchesSearch(booking, state, 'abc123'), true);
  assert.equal(bookingMatchesSearch(booking, state, '001234'), true);
  assert.equal(bookingMatchesSearch(booking, state, 'ada'), true);
  assert.equal(bookingMatchesSearch(booking, state, 'hotel'), false);
  assert.equal(
    bookingMatchesSearch({ id: 'b2', itinerary: {} }, state, 'x'),
    false,
  );
  assert.equal(saleMatchesSearch({ summary: 'Voucher to Bob', code: 'VS-1' }, 'bob'), true);
  assert.equal(saleMatchesSearch({ summary: 'Voucher to Bob' }, 'ada'), false);
  assert.equal(saleMatchesSearch({}, ''), true);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /bookingMatchesSearch/);
  assert.match(src, /saleMatchesSearch/);
  assert.match(src, /bookings-search/);
  assert.match(src, /Search booking #, PNR, customer or ticket/);
});
