import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BookingEntry from '../src/components/booking-entry';
import CommandForm from '../src/components/command-form';
import TravelerRecords from '../src/components/traveler-records';
const person = { id: 'person-1', kind: 'person', name: 'Synthetic Traveler', roles: ['traveler'] };
const state = {
  today: '2026-11-04',
  actor: { role: 'OWNER', permissions: [] },
  parties: [person],
  assets: [],
  bookings: [],
  paymentAccounts: [],
  bookingSourceMethods: [],
  bookingSourceProfiles: [],
  programs: [],
};
const form = (kind: string, defaults: Record<string, any> = {}) =>
  renderToStaticMarkup(
    createElement(CommandForm, {
      config: { kind, defaults },
      state,
      onClose() {},
      async onSubmit() {},
    }),
  );
test('selected canonical traveler has independent details and remove actions within booking', () => {
  const html = renderToStaticMarkup(
    createElement(BookingEntry, {
      config: { defaults: { traveler_ids: [person.id] } },
      state,
      onClose() {},
      async onSubmit() {},
      async onInlineCommand() {
        return {};
      },
    }),
  );
  assert.match(html, /Edit or add full traveler details for Synthetic Traveler/);
  assert.match(html, /Remove traveler Synthetic Traveler from this booking/);
  assert.doesNotMatch(html, /name="(?:passport|dob|ktn)"/);
});
test('normal new source uses Person or Organization and never preselects Partner', () => {
  const html = form('party', {
    kind: 'person',
    roles: ['seller'],
    entry_context: 'Sources & Brokers',
  });
  assert.match(html, /Add source \/ broker/);
  assert.match(html, /Add source<svg/);
  assert.match(html, /What do they sell/);
  assert.match(html, /aria-pressed="true"[^>]*>Person/);
  assert.doesNotMatch(html, /<option value="(?:partner|supplier|family)"/);
  assert.match(html, />Partner<\/button>/);
  assert.doesNotMatch(html, /aria-pressed="true"[^>]*>Partner/);
  assert.doesNotMatch(html, /<input[^>]*type="email"[^>]*required/);
});
test('legacy identity choices remain available for explicit legacy context and required financial date stays visible', () => {
  assert.match(form('party', { kind: 'family' }), /<option value="family"/);
  const html = form('payment');
  assert.match(html, /Record payment/);
  assert.match(html, /id="f-date"[^>]*required/);
  assert.match(html, /Customer paid Padova/);
  assert.match(html, /Padova paid seller/);
  assert.match(form('cancel'), />Keep booking<\/button>/);
});
test('traveler profile supports multiple saved documents and memberships without replacing arrays', () => {
  const html = renderToStaticMarkup(
    createElement(TravelerRecords, {
      memberships: [
        { program: 'United', number: 'SYNTHETIC-1' },
        { program: 'Delta', number: 'SYNTHETIC-2' },
      ],
      documents: [{ type: 'passport', number: 'SYNTHETIC-P1', country: 'United States' }],
      onMemberships() {},
      onDocuments() {},
    }),
  );
  assert.match(html, /SYNTHETIC-1/);
  assert.match(html, /SYNTHETIC-2/);
  assert.match(html, /SYNTHETIC-P1/);
  assert.match(html, /Add loyalty membership/);
  assert.match(html, /Add travel document/);
});
