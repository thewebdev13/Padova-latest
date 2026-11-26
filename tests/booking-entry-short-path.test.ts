import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOKING_ENTRY_PRIMARY_NAV,
  bookingEntryFhrMoreShouldOpen,
  bookingEntryHeldMoreShouldOpen,
  bookingEntryMoreShouldOpen,
  bookingEntryNotesMoreShouldOpen,
  bookingEntryPrimaryNav,
  bookingFixedMarginShouldOpen,
  bookingPercentPricingShouldOpen,
  bookingTravelMoreShouldOpen,
} from '../src/lib/booking-entry-state';

test('Plan short New Booking nav is five primary steps', () => {
  assert.deepEqual(
    BOOKING_ENTRY_PRIMARY_NAV.map((s) => s.id),
    ['customer', 'travel', 'how', 'money', 'more'],
  );
  assert.deepEqual(
    bookingEntryPrimaryNav().map((s) => s.label),
    ['Customer', 'Travel', 'How booked', 'Price & cost', 'More'],
  );
});

test('More opens only when rare Plan fields are filled', () => {
  assert.equal(bookingEntryMoreShouldOpen({}), false);
  assert.equal(bookingEntryMoreShouldOpen({ notes: '   ' }), false);
  assert.equal(bookingEntryMoreShouldOpen({ referring_organization_id: 'x' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ held_pnr: true }), true);
  assert.equal(bookingEntryMoreShouldOpen({ program_rate_name: 'FHR' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ notes: 'aisle' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ additional_charge: '50' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ additional_charge_note: 'Card fee' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ document_label: 'Itinerary' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ document_url: 'https://x.test' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ extra_income_label: 'Marriott cash' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ extra_income_percent: '10' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ tax_amount: '50' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ tax_bearer: 'Customer' }), true);
  assert.equal(bookingEntryMoreShouldOpen({ tax_bearer: 'Unknown' }), false);
});

test('More Travel Details opens only when rare travel fields are filled', () => {
  assert.equal(bookingTravelMoreShouldOpen({}), false);
  assert.equal(bookingTravelMoreShouldOpen({ cabin: '  ' }), false);
  assert.equal(bookingTravelMoreShouldOpen({ cabin: 'Economy' }), true);
  assert.equal(bookingTravelMoreShouldOpen({ flight_numbers: 'DL100' }), true);
  assert.equal(bookingTravelMoreShouldOpen({ ticket_numbers: '001' }), true);
  assert.equal(bookingTravelMoreShouldOpen({ room_type: 'King' }), true);
  assert.equal(
    bookingTravelMoreShouldOpen({ ticketing_status: 'Not Ticketed / Unknown' }),
    false,
  );
  assert.equal(bookingTravelMoreShouldOpen({ ticketing_status: 'Ticketed' }), true);
});

test('Percent-off pricing stays collapsed until chosen or filled', () => {
  assert.equal(bookingPercentPricingShouldOpen({}), false);
  assert.equal(bookingPercentPricingShouldOpen({ pricing_method: 'Manual Customer Price' }), false);
  assert.equal(
    bookingPercentPricingShouldOpen({
      pricing_method: 'Percentage Off Comparable Online Price',
    }),
    true,
  );
  assert.equal(bookingPercentPricingShouldOpen({ comparable_price: '900' }), true);
  assert.equal(bookingPercentPricingShouldOpen({ discount_percent: '10' }), true);
  assert.equal(bookingPercentPricingShouldOpen({ record_comparable: true }), true);
});

test('Fixed margin stays collapsed until chosen or filled; Same as Cost is separate', () => {
  assert.equal(bookingFixedMarginShouldOpen({}), false);
  assert.equal(bookingFixedMarginShouldOpen({ pricing_method: 'Manual Customer Price' }), false);
  assert.equal(bookingFixedMarginShouldOpen({ pricing_method: 'Same as Cost' }), false);
  assert.equal(bookingFixedMarginShouldOpen({ pricing_method: 'Fixed Margin' }), true);
  assert.equal(bookingFixedMarginShouldOpen({ fixed_margin: '50' }), true);
  assert.equal(bookingFixedMarginShouldOpen({ fixed_margin: '  ' }), false);
  const src = readFileSync(join(process.cwd(), 'src/components/booking-entry.tsx'), 'utf8');
  assert.match(src, /Same as cost/);
  assert.match(src, /Fixed margin over cost/);
  assert.match(src, /fixedMarginPrice/);
  assert.match(src, /bookingFixedMarginShouldOpen/);
});

test('FHR / Held PNR / Notes stay collapsed inside More until filled', () => {
  assert.equal(bookingEntryFhrMoreShouldOpen({}), false);
  assert.equal(bookingEntryFhrMoreShouldOpen({ program_rate_name: '  ' }), false);
  assert.equal(bookingEntryFhrMoreShouldOpen({ program_rate_name: 'FHR' }), true);
  assert.equal(bookingEntryFhrMoreShouldOpen({ program_perks: 'Breakfast' }), true);
  assert.equal(bookingEntryFhrMoreShouldOpen({ program_benefit_gained: 'points' }), true);

  assert.equal(bookingEntryHeldMoreShouldOpen({}), false);
  assert.equal(bookingEntryHeldMoreShouldOpen({ held_pnr: false }), false);
  assert.equal(bookingEntryHeldMoreShouldOpen({ held_pnr: true }), true);
  assert.equal(bookingEntryHeldMoreShouldOpen({ ticketing_deadline: '2026-12-01' }), true);

  assert.equal(bookingEntryNotesMoreShouldOpen({}), false);
  assert.equal(bookingEntryNotesMoreShouldOpen({ notes: '   ' }), false);
  assert.equal(bookingEntryNotesMoreShouldOpen({ notes: 'aisle' }), true);
  assert.equal(bookingEntryNotesMoreShouldOpen({ price_breakdown_note: '2 pax' }), true);
  assert.equal(bookingEntryNotesMoreShouldOpen({ summary_override: true }), true);
  assert.equal(
    bookingEntryNotesMoreShouldOpen({ reservation_summary: 'Edited summary' }),
    true,
  );
});

test('booking-entry wires Plan short path (money section + rare fees in More)', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/booking-entry.tsx'), 'utf8');
  assert.match(src, /bookingEntryPrimaryNav/);
  assert.match(src, /id=\"booking-money\"/);
  assert.match(src, /Price & cost/);
  assert.match(src, /id=\"booking-more\"[\s\S]*Extra charge \/ fee/);
  assert.match(src, /id=\"booking-more\"[\s\S]*Taxes & Fees/);
  assert.match(src, /id=\"booking-more\"[\s\S]*entry-referring_organization_id/);
  assert.match(src, /id=\"booking-more\"[\s\S]*Document link/);
  assert.match(src, /id=\"booking-more\"[\s\S]*Extra income/);
  assert.match(src, /normalizeEntryDocumentDraft/);
  assert.match(src, /appendBookingDocument/);
  assert.match(src, /normalizeEntryExtraIncomeDraft/);
  assert.match(src, /bookingTravelMoreShouldOpen/);
  assert.match(src, /bookingPercentPricingShouldOpen/);
  assert.match(src, /bookingEntryFhrMoreShouldOpen/);
  assert.match(src, /bookingEntryHeldMoreShouldOpen/);
  assert.match(src, /bookingEntryNotesMoreShouldOpen/);
  assert.match(src, /Percent off comparable online/);
  // Held / FHR / Notes are nested collapsed details inside More, not always-open sections.
  assert.match(src, /id=\"booking-held\"[\s\S]*Held PNR/);
  assert.match(src, /id=\"booking-fhr-more\"[\s\S]*Program rate \(FHR\)/);
  assert.match(src, /id=\"booking-summary\"[\s\S]*Summary & notes/);
  assert.doesNotMatch(
    src,
    /<section className=\"booking-section full form-grid\" id=\"booking-held\">/,
  );
  assert.doesNotMatch(
    src,
    /<section className=\"booking-section full form-grid\" id=\"booking-summary\">/,
  );
  // Cabin is rare — lives under More Travel Details, not primary Flight row beside PNR.
  assert.match(src, /More Travel Details[\s\S]*entry-cabin/);
  assert.doesNotMatch(
    src,
    /PnrInput[\s\S]*entry-cabin[\s\S]*More Travel Details/,
  );
  assert.doesNotMatch(
    src,
    /id=\"booking-price\"[\s\S]*Extra charge \/ fee[\s\S]*id=\"booking-more\"/,
  );
  // Taxes are rare — not under Price & cost primary path.
  assert.doesNotMatch(
    src,
    /id=\"booking-money\"[\s\S]*Taxes & Fees[\s\S]*id=\"booking-more\"/,
  );
  // Pricing Method select is inside the percent-off optional block, not above sale.
  assert.match(
    src,
    /Percent off comparable online[\s\S]*pricing_method[\s\S]*Manual Customer Price/,
  );
  assert.doesNotMatch(src, /id=\"booking-customer\"[\s\S]*entry-referring_organization_id[\s\S]*id=\"booking-travel\"/);
  assert.doesNotMatch(src, /<span>6<\/span>\s*More/);
});
