import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CommandForm from '../src/components/command-form';
import { BOOKING_CHANNELS, decimalUnits, parseList } from '../src/lib/entry-options';

const state = {
  today: '2026-10-28',
  actor: { role: 'OWNER', permissions: [] },
  parties: [],
  bookings: [],
  assets: [],
  payments: [],
  staff: [],
  travelerLinks: [],
  fundingComponents: [],
  paymentAccounts: [],
};
const form = (kind: string, defaults = {}) =>
  renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind, defaults },
      state,
      onClose() {},
      async onSubmit() {},
    }),
  );
test('booking uses channel choices and a required custom alternative; travel dates are not invented', () => {
  const html = form('booking');
  assert.match(html, /<select id="f-channel" required=""/);
  for (const channel of BOOKING_CHANNELS)
    assert.ok(html.includes(`value="${channel.replaceAll('&', '&amp;')}"`));
  assert.match(html, /Other — specify/);
  assert.doesNotMatch(html, /value="Direct Airline" selected/);
  assert.match(html, /id="f-travel_start"[^>]*value=""/);
  assert.match(html, /Search saved travelers/);
  assert.match(
    form('booking', { channel: 'Existing custom channel' }),
    /aria-label="Booking channel — other"[^>]*value="Existing custom channel"/,
  );
});
test('payment workflows use the same method selector and numeric money controls', () => {
  for (const kind of [
    'payment',
    'pay_asset_purchase',
    'receive_asset_sale',
    'pay_referral',
    'pay_refund',
    'sell_asset',
  ]) {
    const html = form(kind, { paid: true });
    assert.match(html, /<select id="f-method"/);
    assert.match(html, /value="Zelle"/);
    assert.match(html, /type="number"[^>]*step="0.01"/);
  }
});
test('person roles and linked notes have structured controls instead of UUID or comma entry', () => {
  assert.match(form('party'), /role="group" aria-label="Roles"/);
  assert.match(form('party'), /aria-pressed="false"/);
  assert.doesNotMatch(form('party'), /comma separated/);
  const note = form('note');
  assert.match(note, /<select id="f-record_type"/);
  assert.match(note, /role="combobox"/);
  assert.match(note, /aria-controls="f-record_id-options"/);
  assert.doesNotMatch(note, /Record UUID/);
  const linked = form('note', {
    record_type: 'booking',
    record_id: '00000000-0000-4000-8000-000000000001',
  });
  assert.match(linked, /id="f-body"/);
  assert.doesNotMatch(linked, /id="f-record_type"|id="f-record_id"/);
});
test('money entry preserves exact cents and rejects fractional cents, unsafe quantities and invalid signs', () => {
  assert.equal(decimalUnits('19.99'), 1999);
  assert.equal(decimalUnits('0'), 0);
  assert.equal(decimalUnits('-0.01', false, true), -1);
  assert.equal(decimalUnits('120000', true), 120000);
  for (const value of ['', '1.001', '-1', '1e3', '9007199254740992'])
    assert.throws(() => decimalUnits(value));
  assert.throws(() => decimalUnits('1.5', true));
});
test('confirmation list preserves reference spelling and accepts lines without duplicate entries', () => {
  assert.deepEqual(parseList('ABC123\n Hotel-AbC, ABC123, '), ['ABC123', 'Hotel-AbC']);
  assert.deepEqual(parseList(['customer', 'traveler', 'customer']), ['customer', 'traveler']);
});

test('booking form exposes structured itinerary and separate funding; financial change fields follow grants', () => {
  const html = form('booking', { product: 'Flight', show_advanced: true });
  for (const key of [
    'origin',
    'destination',
    'airline_id',
    'acquisition_source_id',
    'flight_numbers',
    'ticket_numbers',
  ])
    assert.ok(html.includes(`id="f-${key}"`), key);
  const hotel = form('booking', { product: 'Hotel', show_advanced: true });
  for (const key of ['hotel_name', 'room_type']) assert.ok(hotel.includes(`id="f-${key}"`), key);
  for (const product of ['Flight', 'Hotel', 'Car', 'Other'])
    assert.match(html, new RegExp(`<option value="${product}"`));
  assert.doesNotMatch(html, /<option value="(?:Flight \+ Hotel|Limo|Package)"/);
  assert.match(html, /Add funding source/);
  const edit = form('revise', {
    show_advanced: true,
    itinerary: { origin: 'JFK', flight_numbers: ['UA100', 'UA101'], cost_status: 'Confirmed' },
  });
  assert.match(edit, /id="f-origin"[^>]*value="JFK"/);
  assert.match(edit, /id="f-fare_difference"/);
  assert.match(edit, /id="f-padova_change_fee"/);
  const employee = renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind: 'revise', defaults: {} },
      state: { ...state, actor: { role: 'EMPLOYEE', permissions: ['operations'] } },
      onClose() {},
      async onSubmit() {},
    }),
  );
  assert.doesNotMatch(
    employee,
    /id="f-(cost_status|fare_difference|supplier_change_fee|padova_change_fee|additional_customer_charge)"/,
  );
});

test('normal booking separates travel/source from money, permits typed travelers and incomplete drafts', () => {
  const html = renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind: 'booking', defaults: {} },
      state: { ...state, bookingEntryEnabled: true, bookingSourceMethods: [], programs: [] },
      onClose() {},
      async onSubmit() {},
    }),
  );
  for (const label of [
    'Customer &amp; Travelers',
    'Booked Through',
    'Cost &amp; Payment',
    'Customer Price',
    'Booking notes',
    'Reservation summary',
    'Booking Source Confirmation',
    'Travelers: search, type or paste names',
    'Save Draft',
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Actual supplier|Financially responsible customer|Direct Airline/);
  assert.match(html, /Amount owed to Padova<\/dt><dd>\$0\.00/);
  assert.match(html, /aria-label="Payment type"/);
  assert.match(html, /Points, vouchers or other value/);
  assert.doesNotMatch(
    html,
    /aria-label="Customer Payment Status"|aria-label="Seller payment status"/,
  );
});

test('ordinary Employee has no hidden initial funding or Padova tax controls', () => {
  const html = renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind: 'booking', defaults: {} },
      state: {
        ...state,
        actor: { role: 'EMPLOYEE', permissions: ['operations', 'edit_payments'] },
        bookingEntryEnabled: true,
        bookingSourceMethods: [],
        programs: [],
      },
      onClose() {},
      async onSubmit() {},
    }),
  );
  assert.doesNotMatch(
    html,
    /value="Padova"|aria-label="Funding choice"|aria-label="What seller supplied"|aria-label="Seller payment status"/,
  );
  assert.match(html, /Customer &amp; Travelers/);
});
