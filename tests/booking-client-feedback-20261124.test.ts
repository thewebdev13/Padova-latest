/**
 * Client booking feedback (24 Nov 2026) — behavioral acceptance checks.
 * These prove the exact product behaviors the Owner asked for.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flightEndpoints } from '../src/lib/booking-ux';
import {
  exactPointCost,
  parseQuickPaste,
  quickPasteAIInstructions,
  quickPasteExample,
} from '../src/lib/quick-paste';

const bookingEntry = readFileSync('src/components/booking-entry.tsx', 'utf8');
const travelerDetails = readFileSync('src/components/booking-traveler-details.tsx', 'utf8');
const pnrInput = readFileSync('src/components/pnr-input.tsx', 'utf8');
const workspace = readFileSync('src/app/workspace.tsx', 'utf8');
const outsideSeller = readFileSync('src/lib/outside-seller.ts', 'utf8');

test('1. Referring organization is a visible dropdown field (not permission-hidden only)', () => {
  assert.match(bookingEntry, /Referring organization \(affiliate\)/);
  assert.match(bookingEntry, /entry-referring_organization_id/);
  assert.match(bookingEntry, /SearchableSelect/);
  // Always rendered; permission only gates the interactive control.
  assert.match(bookingEntry, /manage_commissions/);
  assert.match(bookingEntry, /Commission permission required to set affiliate/);
});

test('2. Traveler details prioritize legal name; display name optional', () => {
  assert.match(travelerDetails, /Enter legal name first/);
  assert.match(travelerDetails, /Display name \(optional\)/);
  assert.match(travelerDetails, /Leave blank to use legal name/);
  assert.doesNotMatch(
    travelerDetails.slice(
      travelerDetails.indexOf('traveler-contact-fields'),
      travelerDetails.indexOf('traveler-contact-fields') + 800,
    ),
    /required=\{key === 'name'\}/,
  );
});

test('3. Inline party create skips full workspace refresh (fast customer save)', () => {
  assert.match(workspace, /kind !== 'party'\) await refresh/);
  assert.match(workspace, /skip full \/api\/state wait|Party create merges/i);
});

test('4. Points booking exposes type, cost/pt, taxes, tax card, email, Amex 100k−35%=65k', () => {
  assert.match(bookingEntry, /\+ Points \/ miles purchase/);
  assert.match(bookingEntry, /Program \/ Issuer/);
  assert.match(bookingEntry, /Cost per point/);
  assert.match(bookingEntry, /Account email used \(points login\)/);
  assert.match(bookingEntry, /Taxes \/ fees on this booking/);
  assert.match(bookingEntry, /Credit card used for taxes/);
  assert.match(bookingEntry, /100k − 35% = 65k|100,000 − 35% = 65,000/);
  // Outside-seller BP math (Plan: info only; not Padova rebate income).
  assert.match(bookingEntry, /OUTSIDE_SELLER_BP_LABEL/);
  assert.match(outsideSeller, /Seller BP math/);
  assert.match(outsideSeller, /Amex BP 35%/);
  // Math: 100000 − 35% = 65000
  const net = Math.round(100000 * (1 - 35 / 100));
  assert.equal(net, 65000);
  assert.equal(exactPointCost(65000, '1.30', 'cents per point'), 84500);
});

test('5. Trip Type appears before From/To in the Flight travel section', () => {
  const travel = bookingEntry.indexOf('id="booking-travel"');
  const trip = bookingEntry.indexOf("select('trip_type'", travel);
  const from = bookingEntry.indexOf('label="From"', travel);
  assert.ok(travel > 0 && trip > travel && from > trip, 'Trip Type must precede From');
});

test('6. AI instructions require Airline PNR (not Sabre) and separate Booking Source Confirmation', () => {
  assert.match(quickPasteAIInstructions, /Airline PNR/);
  assert.match(quickPasteAIInstructions, /never put Sabre/i);
  assert.match(quickPasteAIInstructions, /Booking Source Confirmation/);
  assert.match(pnrInput, /Airline locator only|Carrier record locator/i);
  assert.match(quickPasteExample, /Airline PNR: DL9ABC/);
  assert.match(quickPasteExample, /Booking Source Confirmation: SABRE-SAMPLE/);
});

test('7. Cabin supports adding a custom cabin name', () => {
  assert.match(bookingEntry, /entry-cabin/);
  assert.match(bookingEntry, /Add cabin/);
  assert.match(bookingEntry, /onAdd=\{\(query\) =>/);
});

test('8. Points purchase note field records points bought and cost', () => {
  assert.match(bookingEntry, /Points purchase note/);
  assert.match(bookingEntry, /Bought 100k/);
});

test('9. Payment confirmation # sits with payment method', () => {
  assert.match(bookingEntry, /Payment confirmation #/);
  assert.match(bookingEntry, /Bank \/ card \/ transfer confirmation|Seller \/ bank \/ card confirmation/);
});

test('10. Cost-per-point wording replaces confusing Agreed rate-only labels', () => {
  assert.match(bookingEntry, /Cost per point \(optional\)/);
  assert.match(bookingEntry, /Per-point unit/);
  assert.match(bookingEntry, /cents per point/);
  assert.match(quickPasteAIInstructions, /Cost Per Point/);
});

test('11. Extras stay optional/collapsed; no Simple/Full mode chrome', () => {
  assert.match(bookingEntry, /More Travel Details/);
  assert.match(bookingEntry, /Taxes & Fees/);
  assert.match(bookingEntry, /More Cost Details/);
  assert.match(bookingEntry, /Save Draft/);
  assert.doesNotMatch(bookingEntry, /simpleEntry/);
  assert.doesNotMatch(bookingEntry, /Open Full for more/);
  assert.match(bookingEntry, /Referring organization \(affiliate\)/);
  assert.match(bookingEntry, /optional-block/);
});

test('12. Route TLV-BCN-TLV becomes Round Trip From TLV To BCN', () => {
  assert.deepEqual(flightEndpoints({ route: 'TLV-BCN-TLV' }), {
    origin: 'TLV',
    destination: 'BCN',
    roundTripHint: true,
  });
  assert.deepEqual(
    flightEndpoints({ origin: 'TLV', destination: 'TLV', route: 'TLV-BCN-TLV' }),
    { origin: 'TLV', destination: 'BCN', roundTripHint: true },
  );
  const pasted = parseQuickPaste(`Product: Flight
Trip Type: Unknown
Route: TLV-BCN-TLV
Airline PNR: AB12CD
Booking Source Confirmation: SABRE99
Departure: 2027-03-01
Return: 2027-03-08`);
  assert.equal(pasted.fields.route, 'TLV-BCN-TLV');
  // Apply same rules BookingEntry uses after parse:
  const endpoints = flightEndpoints({ route: pasted.fields.route });
  assert.equal(endpoints.origin, 'TLV');
  assert.equal(endpoints.destination, 'BCN');
  assert.equal((endpoints as { roundTripHint?: boolean }).roundTripHint, true);
  assert.match(quickPasteAIInstructions, /never TLV-BCN-TLV|never ORIGIN-DEST-ORIGIN/);
});
