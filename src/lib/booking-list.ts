/**
 * Plan v1 — Bookings home list “at a glance” fields.
 * Never invent how-booked or cost; blank stays blank / Incomplete ≠ $0.
 */

import {
  isActiveReservationStatus,
  isCompletedReservationStatus,
} from './booking-status';

/** Plan Bookings row columns (money columns gated by permissions in UI). */
export const PLAN_BOOKING_LIST_COLUMNS = [
  'Date booked',
  'Trip / booking',
  'Customer / traveler',
  'Travel date',
  'PNR',
  'How booked',
  'Status',
  'Price / balance',
  'Cost',
  'Confirmed / expected',
] as const;

/**
 * Plan Bookings list: PNR / confirmation visible at a glance.
 * Blank stays null (UI shows Unknown) — never invent a code from booking number.
 */
export function bookingListPnr(booking: {
  confirmations?: string | null;
}): string | null {
  const raw = booking.confirmations;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

export function bookingListHowBooked(booking: {
  itinerary?: { operational_entry?: { how_booked?: string | null } | null } | null;
}): string | null {
  const raw = booking.itinerary?.operational_entry?.how_booked;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

/** Plan How booked filter label — blank stays Unknown (never invent a method). */
export function bookingListHowBookedFilterValue(booking: {
  itinerary?: { operational_entry?: { how_booked?: string | null } | null } | null;
}): string {
  return bookingListHowBooked(booking) || 'Unknown';
}

/** Distinct How booked values present on the list (Unknown last when present). */
export function bookingListHowBookedOptions(
  bookings: ReadonlyArray<{
    itinerary?: { operational_entry?: { how_booked?: string | null } | null } | null;
  }>,
): string[] {
  const seen = new Set<string>();
  let hasUnknown = false;
  for (const b of bookings) {
    const v = bookingListHowBooked(b);
    if (v) seen.add(v);
    else hasUnknown = true;
  }
  const known = [...seen].sort((a, b) => a.localeCompare(b));
  return hasUnknown ? [...known, 'Unknown'] : known;
}

export function bookingMatchesHowBookedFilter(
  booking: {
    itinerary?: { operational_entry?: { how_booked?: string | null } | null } | null;
  },
  filter: string,
): boolean {
  if (!filter || filter === 'All') return true;
  return bookingListHowBookedFilterValue(booking) === filter;
}

export function bookingListIsCancelled(booking: {
  reservation_status?: string | null;
}): boolean {
  return String(booking.reservation_status || '') === 'Cancelled';
}

/** Plan Held PNRs — count for Bookings home quick filter (Unknown status ≠ Held). */
export function bookingListHeldCount(
  bookings: ReadonlyArray<{ reservation_status?: string | null }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (String(b.reservation_status || '') === 'Held') n += 1;
  }
  return n;
}

/** Toggle Held filter: Held ↔ All (never invents other statuses). */
export function toggleBookingHeldFilter(current: string): string {
  return current === 'Held' ? 'All' : 'Held';
}

/** Plan cancelled rows — count for Bookings home quick filter. */
export function bookingListCancelledCount(
  bookings: ReadonlyArray<{ reservation_status?: string | null }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (bookingListIsCancelled(b)) n += 1;
  }
  return n;
}

/** Toggle Cancelled filter: Cancelled ↔ All (never invents other statuses). */
export function toggleBookingCancelledFilter(current: string): string {
  return current === 'Cancelled' ? 'All' : 'Cancelled';
}

/** Plan refund-pending bookings — count for Bookings home quick filter. */
export function bookingListRefundPendingCount(
  bookings: ReadonlyArray<{ reservation_status?: string | null }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (String(b.reservation_status || '') === 'Refund Pending') n += 1;
  }
  return n;
}

/** Toggle Refund Pending filter: Refund Pending ↔ All (never invents other statuses). */
export function toggleBookingRefundPendingFilter(current: string): string {
  return current === 'Refund Pending' ? 'All' : 'Refund Pending';
}

/**
 * Plan mock “Owed to me”: known positive customer_balance only.
 * Unknown / blank / ≤0 → not owed (never invent AR).
 * Cancelled skipped.
 */
export function bookingListIsOwed(booking: {
  customer_balance?: number | null;
  reservation_status?: string | null;
}): boolean {
  if (bookingListIsCancelled(booking)) return false;
  if (booking.customer_balance == null || !Number.isFinite(Number(booking.customer_balance)))
    return false;
  return Math.trunc(Number(booking.customer_balance)) > 0;
}

/** Count bookings with known positive customer balance for Bookings home. */
export function bookingListOwedCount(
  bookings: ReadonlyArray<{
    customer_balance?: number | null;
    reservation_status?: string | null;
  }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (bookingListIsOwed(b)) n += 1;
  }
  return n;
}

/**
 * Plan mock “Total owed to me”: sum of known positive customer balances.
 * Unknown AR on any open booking → incomplete note; never invent those as $0.
 */
export function bookingListOwedTotal(
  bookings: ReadonlyArray<{
    customer_balance?: number | null;
    reservation_status?: string | null;
  }>,
): { owed_cents: number; incomplete: boolean; count: number } {
  let owed = 0;
  let incomplete = false;
  let count = 0;
  for (const b of bookings) {
    if (bookingListIsCancelled(b)) continue;
    if (b.customer_balance == null || !Number.isFinite(Number(b.customer_balance))) {
      incomplete = true;
      continue;
    }
    const bal = Math.trunc(Number(b.customer_balance));
    if (bal > 0) {
      owed += bal;
      count += 1;
    }
  }
  return { owed_cents: owed, incomplete, count };
}

/** Compact Bookings toolbar label for total owed. */
export function bookingListOwedTotalLabel(
  total: { owed_cents: number; incomplete: boolean },
  formatMoney: (cents: number) => string,
): string {
  const base = formatMoney(total.owed_cents);
  return total.incomplete ? `${base} · Incomplete` : base;
}

/** Toggle Owed filter on/off (independent of reservation status chips). */
export function toggleBookingOwedFilter(current: boolean): boolean {
  return !current;
}

/** Plan Active (stored Booked) — count for Bookings home quick filter. */
export function bookingListActiveCount(
  bookings: ReadonlyArray<{ reservation_status?: string | null }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (isActiveReservationStatus(b.reservation_status)) n += 1;
  }
  return n;
}

/** Toggle Active filter using stored Booked status. */
export function toggleBookingActiveFilter(current: string): string {
  return current === 'Booked' ? 'All' : 'Booked';
}

/** Plan Completed (stored Traveled) — count for Bookings home quick filter. */
export function bookingListCompletedCount(
  bookings: ReadonlyArray<{ reservation_status?: string | null }>,
): number {
  let n = 0;
  for (const b of bookings) {
    if (isCompletedReservationStatus(b.reservation_status)) n += 1;
  }
  return n;
}

/** Toggle Completed filter using stored Traveled status. */
export function toggleBookingCompletedFilter(current: string): string {
  return current === 'Traveled' ? 'All' : 'Traveled';
}

/** YYYY-MM-DD booked_on for list subline — never invent today. */
export function bookingListBookedOn(booking: { booked_on?: string | null }): string | null {
  const raw = booking.booked_on;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** YYYY-MM-DD travel_start — blank stays null (never invent today). */
export function bookingListTravelStart(booking: {
  travel_start?: string | null;
}): string | null {
  const raw = booking.travel_start;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Plan Bookings list sort: newest booked (default) or soonest travel. */
export type BookingListSort = 'booked_desc' | 'travel_asc';

export const BOOKING_LIST_SORT_OPTIONS: ReadonlyArray<{
  value: BookingListSort;
  label: string;
}> = [
  { value: 'booked_desc', label: 'Date booked (newest)' },
  { value: 'travel_asc', label: 'Travel date (soonest)' },
];

function compareBookedDesc(
  a: { booked_on?: string | null },
  b: { booked_on?: string | null },
): number {
  const ba = bookingListBookedOn(a);
  const bb = bookingListBookedOn(b);
  if (ba && bb) return bb.localeCompare(ba);
  if (ba && !bb) return -1;
  if (!ba && bb) return 1;
  return 0;
}

/** Sort Bookings list rows; blank travel/booked dates sort last ≠ invent. */
export function compareBookingsForList(
  a: { booked_on?: string | null; travel_start?: string | null },
  b: { booked_on?: string | null; travel_start?: string | null },
  sort: BookingListSort,
): number {
  if (sort === 'travel_asc') {
    const ta = bookingListTravelStart(a);
    const tb = bookingListTravelStart(b);
    if (ta && tb) {
      const byTravel = ta.localeCompare(tb);
      return byTravel || compareBookedDesc(a, b);
    }
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return compareBookedDesc(a, b);
  }
  return compareBookedDesc(a, b);
}

/** YYYY from booked_on — blank stays null (never invent this year). */
export function bookingListBookedYear(booking: {
  booked_on?: string | null;
}): string | null {
  const on = bookingListBookedOn(booking);
  return on ? on.slice(0, 4) : null;
}

/** Distinct booked years newest-first for the Bookings Year filter. */
export function bookingListYearOptions(
  bookings: ReadonlyArray<{ booked_on?: string | null }>,
): string[] {
  const years = new Set<string>();
  for (const b of bookings) {
    const y = bookingListBookedYear(b);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

/**
 * Plan Bookings Year filter (date booked).
 * All → match; Unknown → blank booked_on only; YYYY → that year.
 * Never invents a year for blank booked_on.
 */
export function bookingMatchesYearFilter(
  booking: { booked_on?: string | null },
  year: string | null | undefined,
): boolean {
  const y = String(year || '').trim();
  if (!y || y === 'All') return true;
  const bookedYear = bookingListBookedYear(booking);
  if (y === 'Unknown') return bookedYear == null;
  return bookedYear === y;
}

/**
 * Plan: click a Bookings row to expand details (not navigate away).
 * Colspan = fixed Plan columns + optional money + trailing chevron.
 */
export function bookingListColumnCount(flags: {
  canSale?: boolean;
  canCosts?: boolean;
  canBookingProfit?: boolean;
}): number {
  // Date booked · Trip · Customer · Travel · PNR · How booked · Status · chevron
  let n = 8;
  if (flags.canSale) n += 1;
  if (flags.canCosts) n += 1;
  if (flags.canBookingProfit) n += 1;
  return n;
}

export function toggleExpandedBookingId(
  current: string | null | undefined,
  clickedId: string,
): string | null {
  const id = String(clickedId || '').trim();
  if (!id) return current ?? null;
  return current === id ? null : id;
}

/** One Plan expand-panel fact — blank stays Unknown / omitted ≠ invent. */
export type BookingListExpandFact = { label: string; value: string };

/**
 * Plan: click-to-expand shows glance facts without leaving the list.
 * Only includes values the caller already resolved (money gated by permissions).
 */
export function bookingListExpandFacts(input: {
  code?: string | null;
  howBooked?: string | null;
  pnr?: string | null;
  statusLabel?: string | null;
  customer?: string | null;
  travelers?: string | null;
  travelLabel?: string | null;
  bookedOnLabel?: string | null;
  priceLabel?: string | null;
  balanceLabel?: string | null;
  costLabel?: string | null;
}): BookingListExpandFact[] {
  const push = (out: BookingListExpandFact[], label: string, raw: string | null | undefined) => {
    const value = raw == null ? '' : String(raw).trim();
    if (!value) return;
    out.push({ label, value });
  };
  const facts: BookingListExpandFact[] = [];
  push(facts, 'Booking', input.code);
  push(facts, 'Customer', input.customer);
  push(facts, 'Travelers', input.travelers);
  push(facts, 'Travel', input.travelLabel);
  push(facts, 'Date booked', input.bookedOnLabel);
  push(facts, 'PNR', input.pnr ?? 'Unknown');
  push(facts, 'How booked', input.howBooked);
  push(facts, 'Status', input.statusLabel ?? 'Unknown');
  push(facts, 'Price', input.priceLabel);
  push(facts, 'Balance', input.balanceLabel);
  push(facts, 'Cost', input.costLabel);
  return facts;
}
