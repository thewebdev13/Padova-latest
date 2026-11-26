import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_LIST_SORT_OPTIONS,
  PLAN_BOOKING_LIST_COLUMNS,
  bookingListActiveCount,
  bookingListBookedOn,
  bookingListBookedYear,
  bookingListColumnCount,
  bookingListExpandFacts,
  bookingListCancelledCount,
  bookingListCompletedCount,
  bookingListHeldCount,
  bookingListHowBooked,
  bookingListHowBookedFilterValue,
  bookingListHowBookedOptions,
  bookingListIsCancelled,
  bookingListIsOwed,
  bookingListOwedCount,
  bookingListOwedTotal,
  bookingListOwedTotalLabel,
  bookingListPnr,
  bookingListRefundPendingCount,
  bookingListTravelStart,
  bookingListYearOptions,
  bookingMatchesHowBookedFilter,
  bookingMatchesYearFilter,
  compareBookingsForList,
  toggleBookingActiveFilter,
  toggleBookingCancelledFilter,
  toggleBookingCompletedFilter,
  toggleBookingHeldFilter,
  toggleBookingOwedFilter,
  toggleBookingRefundPendingFilter,
  toggleExpandedBookingId,
} from '../src/lib/booking-list';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Plan Bookings list starts with Date booked and includes PNR', () => {
  assert.equal(PLAN_BOOKING_LIST_COLUMNS[0], 'Date booked');
  assert.ok(PLAN_BOOKING_LIST_COLUMNS.includes('PNR'));
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /<th>Date booked<\/th>/);
  assert.match(src, /<th>PNR<\/th>/);
  assert.match(src, /booking-booked-on/);
  assert.match(src, /bookingListPnr/);
  assert.match(src, /toggleExpandedBookingId/);
  assert.match(src, /Open booking/);
});

test('Plan: click toggles expand; colspan counts money columns', () => {
  assert.equal(toggleExpandedBookingId(null, 'b1'), 'b1');
  assert.equal(toggleExpandedBookingId('b1', 'b1'), null);
  assert.equal(toggleExpandedBookingId('b1', 'b2'), 'b2');
  assert.equal(bookingListColumnCount({}), 8);
  assert.equal(
    bookingListColumnCount({ canSale: true, canCosts: true, canBookingProfit: true }),
    11,
  );
});

test('Held PNR quick filter counts Held only and toggles All ↔ Held', () => {
  assert.equal(bookingListHeldCount([]), 0);
  assert.equal(
    bookingListHeldCount([
      { reservation_status: 'Held' },
      { reservation_status: 'Booked' },
      { reservation_status: 'Held' },
      { reservation_status: null },
      {},
    ]),
    2,
  );
  assert.equal(toggleBookingHeldFilter('All'), 'Held');
  assert.equal(toggleBookingHeldFilter('Held'), 'All');
  assert.equal(toggleBookingHeldFilter('Booked'), 'Held');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /toggleBookingHeldFilter/);
  assert.match(src, /Filter Held PNRs/);
  const entry = readFileSync(join(process.cwd(), 'src/components/booking-entry.tsx'), 'utf8');
  assert.match(entry, /Flight numbers/);
  assert.match(entry, /Ticket numbers/);
  assert.doesNotMatch(entry, /Flight number\(s\)/);
  assert.doesNotMatch(entry, /Ticket number\(s\)/);
});

test('Cancelled quick filter counts Cancelled only and toggles All ↔ Cancelled', () => {
  assert.equal(bookingListCancelledCount([]), 0);
  assert.equal(
    bookingListCancelledCount([
      { reservation_status: 'Cancelled' },
      { reservation_status: 'Booked' },
      { reservation_status: 'Cancelled' },
      { reservation_status: 'Held' },
      {},
    ]),
    2,
  );
  assert.equal(toggleBookingCancelledFilter('All'), 'Cancelled');
  assert.equal(toggleBookingCancelledFilter('Cancelled'), 'All');
  assert.equal(toggleBookingCancelledFilter('Held'), 'Cancelled');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /toggleBookingCancelledFilter/);
  assert.match(src, /Filter cancelled bookings/);
  // Dashboard To-do also offers Copy link when a record is linked.
  assert.match(src, /page === 'Dashboard'[\s\S]*planTodoRecordUrl[\s\S]*Copy link/);
});

test('Owed quick filter: known positive balance only; Unknown/cancelled ≠ invent', () => {
  assert.equal(bookingListIsOwed({ customer_balance: 5000, reservation_status: 'Booked' }), true);
  assert.equal(bookingListIsOwed({ customer_balance: 0, reservation_status: 'Booked' }), false);
  assert.equal(bookingListIsOwed({ customer_balance: -100, reservation_status: 'Booked' }), false);
  assert.equal(bookingListIsOwed({ customer_balance: null, reservation_status: 'Booked' }), false);
  assert.equal(
    bookingListIsOwed({ customer_balance: 5000, reservation_status: 'Cancelled' }),
    false,
  );
  assert.equal(
    bookingListOwedCount([
      { customer_balance: 5000, reservation_status: 'Booked' },
      { customer_balance: null, reservation_status: 'Booked' },
      { customer_balance: 0, reservation_status: 'Held' },
      { customer_balance: 1200, reservation_status: 'Cancelled' },
      { customer_balance: 800, reservation_status: 'Traveled' },
    ]),
    2,
  );
  assert.equal(toggleBookingOwedFilter(false), true);
  assert.equal(toggleBookingOwedFilter(true), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /bookingListIsOwed/);
  assert.match(src, /bookingListOwedCount/);
  assert.match(src, /toggleBookingOwedFilter/);
  assert.match(src, /Filter bookings owed to Padova/);
  assert.match(src, /bookingOwedOnly/);
});

test('Bookings total owed: sum known positive; Incomplete when Unknown ≠ invent $0', () => {
  assert.deepEqual(
    bookingListOwedTotal([
      { customer_balance: 5000, reservation_status: 'Booked' },
      { customer_balance: 2500, reservation_status: 'Held' },
      { customer_balance: 0, reservation_status: 'Booked' },
      { customer_balance: 900, reservation_status: 'Cancelled' },
    ]),
    { owed_cents: 7500, incomplete: false, count: 2 },
  );
  assert.deepEqual(
    bookingListOwedTotal([
      { customer_balance: 5000, reservation_status: 'Booked' },
      { customer_balance: null, reservation_status: 'Booked' },
    ]),
    { owed_cents: 5000, incomplete: true, count: 1 },
  );
  assert.equal(
    bookingListOwedTotalLabel({ owed_cents: 5000, incomplete: false }, (c) => `$${(c / 100).toFixed(2)}`),
    '$50.00',
  );
  assert.equal(
    bookingListOwedTotalLabel({ owed_cents: 5000, incomplete: true }, (c) => `$${(c / 100).toFixed(2)}`),
    '$50.00 · Incomplete',
  );
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /bookingListOwedTotal/);
  assert.match(src, /bookingListOwedTotalLabel/);
  assert.match(src, /Total owed/);
});

test('Refund Pending quick filter counts Refund Pending only and toggles', () => {
  assert.equal(bookingListRefundPendingCount([]), 0);
  assert.equal(
    bookingListRefundPendingCount([
      { reservation_status: 'Refund Pending' },
      { reservation_status: 'Cancelled' },
      { reservation_status: 'Refund Pending' },
      { reservation_status: 'Booked' },
      {},
    ]),
    2,
  );
  assert.equal(toggleBookingRefundPendingFilter('All'), 'Refund Pending');
  assert.equal(toggleBookingRefundPendingFilter('Refund Pending'), 'All');
  assert.equal(toggleBookingRefundPendingFilter('Held'), 'Refund Pending');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /toggleBookingRefundPendingFilter/);
  assert.match(src, /Filter refund pending bookings/);
});

test('Active + Completed quick filters count Booked/Traveled and toggle', () => {
  assert.equal(bookingListActiveCount([]), 0);
  assert.equal(bookingListCompletedCount([]), 0);
  assert.equal(
    bookingListActiveCount([
      { reservation_status: 'Booked' },
      { reservation_status: 'Held' },
      { reservation_status: 'Booked' },
      { reservation_status: 'Traveled' },
      {},
    ]),
    2,
  );
  assert.equal(
    bookingListCompletedCount([
      { reservation_status: 'Traveled' },
      { reservation_status: 'Booked' },
      { reservation_status: 'Traveled' },
      { reservation_status: null },
      {},
    ]),
    2,
  );
  assert.equal(toggleBookingActiveFilter('All'), 'Booked');
  assert.equal(toggleBookingActiveFilter('Booked'), 'All');
  assert.equal(toggleBookingActiveFilter('Held'), 'Booked');
  assert.equal(toggleBookingCompletedFilter('All'), 'Traveled');
  assert.equal(toggleBookingCompletedFilter('Traveled'), 'All');
  assert.equal(toggleBookingCompletedFilter('Booked'), 'Traveled');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /toggleBookingActiveFilter/);
  assert.match(src, /Filter active bookings/);
  assert.match(src, /toggleBookingCompletedFilter/);
  assert.match(src, /Filter completed bookings/);
});

test('booking list how booked never invents', () => {
  assert.equal(bookingListHowBooked({}), null);
  assert.equal(bookingListHowBooked({ itinerary: {} }), null);
  assert.equal(
    bookingListHowBooked({
      itinerary: { operational_entry: { how_booked: 'Capital One' } },
    }),
    'Capital One',
  );
});

test('How booked filter options + match; blank → Unknown ≠ invent', () => {
  assert.equal(bookingListHowBookedFilterValue({}), 'Unknown');
  assert.equal(
    bookingListHowBookedFilterValue({
      itinerary: { operational_entry: { how_booked: 'Capital One' } },
    }),
    'Capital One',
  );
  assert.deepEqual(
    bookingListHowBookedOptions([
      { itinerary: { operational_entry: { how_booked: 'Capital One' } } },
      {},
      { itinerary: { operational_entry: { how_booked: 'Cash / GDS' } } },
      { itinerary: { operational_entry: { how_booked: 'Capital One' } } },
    ]),
    ['Capital One', 'Cash / GDS', 'Unknown'],
  );
  assert.equal(bookingMatchesHowBookedFilter({}, 'All'), true);
  assert.equal(bookingMatchesHowBookedFilter({}, 'Unknown'), true);
  assert.equal(bookingMatchesHowBookedFilter({}, 'Capital One'), false);
  assert.equal(
    bookingMatchesHowBookedFilter(
      { itinerary: { operational_entry: { how_booked: 'Capital One' } } },
      'Capital One',
    ),
    true,
  );
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /bookingHowBooked/);
  assert.match(src, /bookingListHowBookedOptions/);
  assert.match(src, /bookingMatchesHowBookedFilter/);
  assert.match(src, /aria-label="How booked"/);
});

test('booking list booked_on, PNR, and cancelled — blank ≠ invent', () => {
  assert.equal(bookingListBookedOn({ booked_on: null }), null);
  assert.equal(bookingListBookedOn({ booked_on: '2026-11-20T12:00:00Z' }), '2026-11-20');
  assert.equal(bookingListIsCancelled({ reservation_status: 'Booked' }), false);
  assert.equal(bookingListIsCancelled({ reservation_status: 'Cancelled' }), true);
  assert.equal(bookingListPnr({}), null);
  assert.equal(bookingListPnr({ confirmations: '' }), null);
  assert.equal(bookingListPnr({ confirmations: '   ' }), null);
  assert.equal(bookingListPnr({ confirmations: 'ABC123 · XYZ789' }), 'ABC123 · XYZ789');
});

test('transactionTable marks cancelled bookings for Plan red row style', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  assert.match(src, /const transactionTable/);
  assert.match(
    src,
    /transactionTable[\s\S]*bookingListIsCancelled\(r as \{ reservation_status\?[\s\S]*is-cancelled/,
  );
  assert.match(css, /\.booking-table tr\.is-cancelled/);
  assert.match(css, /transaction-description/);
});

test('booking expand facts — glance lines; blank how-booked omitted ≠ invent', () => {
  const sparse = bookingListExpandFacts({
    code: 'PDV-1',
    pnr: null,
    statusLabel: 'Active',
    howBooked: null,
    customer: 'Ada',
  });
  assert.deepEqual(
    sparse.map((f) => f.label),
    ['Booking', 'Customer', 'PNR', 'Status'],
  );
  assert.equal(sparse.find((f) => f.label === 'PNR')?.value, 'Unknown');
  const full = bookingListExpandFacts({
    code: 'PDV-2',
    customer: 'Ada',
    travelers: 'Ada · Bob',
    travelLabel: '12 Dec 2026',
    bookedOnLabel: '1 Nov 2026',
    howBooked: 'Capital One',
    pnr: 'ABC123',
    statusLabel: 'Active',
    priceLabel: '$100.00',
    balanceLabel: '$0.00',
    costLabel: 'Incomplete',
  });
  assert.equal(full.length, 11);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  assert.match(src, /bookingListExpandFacts/);
  assert.match(src, /booking-expand-facts/);
  assert.match(css, /\.booking-expand-facts/);
  // Plan shareable booking address from the expand glance (not only full detail).
  assert.match(
    src,
    /booking-expand-actions[\s\S]*Open booking[\s\S]*workspaceRecordUrl\('booking'[\s\S]*Copy link/,
  );
  assert.match(css, /\.booking-expand-actions/);
});

test('Bookings sort: newest booked (default) or soonest travel; blank dates last ≠ invent', () => {
  assert.equal(bookingListTravelStart({ travel_start: '2026-12-15' }), '2026-12-15');
  assert.equal(bookingListTravelStart({ travel_start: null }), null);
  assert.equal(bookingListTravelStart({ travel_start: '' }), null);
  assert.equal(bookingListBookedOn({ booked_on: '2026-11-01' }), '2026-11-01');

  const a = { booked_on: '2026-11-10', travel_start: '2026-12-20' };
  const b = { booked_on: '2026-11-20', travel_start: '2026-12-10' };
  const blankTravel = { booked_on: '2026-11-25', travel_start: null };
  const blankBooked = { booked_on: null, travel_start: '2026-12-05' };

  assert.ok(compareBookingsForList(a, b, 'booked_desc') > 0); // b newer booked
  assert.ok(compareBookingsForList(b, a, 'booked_desc') < 0);
  assert.ok(compareBookingsForList(a, b, 'travel_asc') > 0); // b sooner travel
  assert.ok(compareBookingsForList(b, a, 'travel_asc') < 0);
  // Blank travel sorts after dated travel
  assert.ok(compareBookingsForList(blankTravel, b, 'travel_asc') > 0);
  assert.ok(compareBookingsForList(b, blankTravel, 'travel_asc') < 0);
  // Blank booked sorts after dated booked
  assert.ok(compareBookingsForList(blankBooked, b, 'booked_desc') > 0);

  const sortedTravel = [a, b, blankTravel, blankBooked].slice().sort((x, y) =>
    compareBookingsForList(x, y, 'travel_asc'),
  );
  assert.deepEqual(
    sortedTravel.map((r) => r.travel_start),
    ['2026-12-05', '2026-12-10', '2026-12-20', null],
  );

  assert.equal(BOOKING_LIST_SORT_OPTIONS[0]?.value, 'booked_desc');
  assert.equal(BOOKING_LIST_SORT_OPTIONS[1]?.value, 'travel_asc');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /compareBookingsForList/);
  assert.match(src, /BOOKING_LIST_SORT_OPTIONS/);
  assert.match(src, /Sort bookings/);
  assert.match(src, /bookingSort/);
});

test('Bookings year filter: date booked year; blank → Unknown ≠ invent', () => {
  assert.equal(bookingListBookedYear({ booked_on: '2026-11-10' }), '2026');
  assert.equal(bookingListBookedYear({ booked_on: null }), null);
  assert.equal(bookingListBookedYear({ booked_on: '' }), null);
  assert.deepEqual(
    bookingListYearOptions([
      { booked_on: '2026-11-10' },
      { booked_on: '2025-01-01' },
      { booked_on: '2026-02-02' },
      { booked_on: null },
    ]),
    ['2026', '2025'],
  );
  assert.equal(bookingMatchesYearFilter({ booked_on: '2026-11-10' }, 'All'), true);
  assert.equal(bookingMatchesYearFilter({ booked_on: '2026-11-10' }, '2026'), true);
  assert.equal(bookingMatchesYearFilter({ booked_on: '2026-11-10' }, '2025'), false);
  assert.equal(bookingMatchesYearFilter({ booked_on: null }, '2026'), false);
  assert.equal(bookingMatchesYearFilter({ booked_on: null }, 'Unknown'), true);
  assert.equal(bookingMatchesYearFilter({ booked_on: '2026-11-10' }, 'Unknown'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /bookingMatchesYearFilter/);
  assert.match(src, /bookingListYearOptions/);
  assert.match(src, /Booked year/);
  assert.match(src, /bookingYear/);
});
