import { workspaceRecordUrl } from './workspace-routes';

type R = Record<string, any>;

/** Plan Calendar shareable booking path — blank id → null (never invents). */
export function calendarBookingSharePath(bookingId: string | null | undefined): string | null {
  const id = String(bookingId ?? '').trim();
  if (!id) return null;
  return workspaceRecordUrl('booking', id);
}

/**
 * Plan Later polish: one short name per booking (product · place).
 * Strips machine date suffixes only; never invents a route from blank fields.
 */
export function tripTitle(b: R): string {
  const i = { ...(b.details ?? {}), ...(b.itinerary ?? {}) };
  const location =
    b.product === 'Flight'
      ? i.route || b.route
      : b.product === 'Hotel'
        ? i.hotel_address || i.location || b.location
        : b.product === 'Car'
          ? i.pickup_location || b.pickup_location
          : '';
  if (location) return `${b.product} · ${location}`;
  // Remove only machine-formatted date suffixes, never arbitrary employee prose.
  return String(b.summary || b.product || 'Booking').replace(
    /\s*[·|]\s*\d{4}-\d{2}-\d{2}(?:\s*[– - -]\s*\d{4}-\d{2}-\d{2})?\s*$/,
    '',
  );
}

/** Alias for Plan “one short name” — same as tripTitle. */
export function bookingShortName(b: R): string {
  return tripTitle(b);
}
export function addDays(day: string, amount: number) {
  return new Date(Date.parse(day + 'T12:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
}
export function calendarEntries(bookings: R[], components: R[], filter: string) {
  return bookings.flatMap((b) => {
    const own = components.filter((c) => c.booking_id === b.id);
    return (own.length ? own : [b])
      .filter((c) => c.travel_start && c.travel_end && (filter === 'All' || c.product === filter))
      .map((c) => ({
        ...c,
        booking_id: b.id,
        code: b.code,
        customer: b.customer,
        travelers: b.travelers,
        summary: c.summary || b.summary,
        cancelled:
          ['Cancelled', 'Refund Pending'].includes(b.reservation_status) ||
          ['Cancelled', 'Refund Pending'].includes(c.status),
        // Missing customer sale alone must not flag supplier cost on the calendar.
        attention: !b.travelers || Boolean(b.supplier_cost_incomplete),
      }));
  });
}

/**
 * Plan Calendar search: booking # · customer · travelers · trip title · summary.
 * Blank query → match all; empty fields never invent a hit.
 */
export function calendarEntryMatchesSearch(
  entry: {
    code?: string | null;
    customer?: string | null;
    travelers?: string | null;
    summary?: string | null;
    product?: string | null;
    booking_id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    entry.code,
    entry.customer,
    entry.travelers,
    entry.summary,
    entry.product,
    entry.booking_id,
    tripTitle(entry as R),
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/**
 * Plan Calendar: cancelled / refund-pending stay visible by default (clearly marked).
 * When hideCancelled is on, those bars are omitted — never invents status.
 */
export function calendarEntryVisibleWithCancelled(
  entry: { cancelled?: boolean | null },
  hideCancelled: boolean,
): boolean {
  if (!hideCancelled) return true;
  return !entry.cancelled;
}
export function calendarLanes(
  entries: R[],
  days: string[],
): (R & { start: number; end: number; lane: number })[] {
  const occupied: number[] = [];
  return entries
    .filter((e) => e.travel_start <= days[6] && e.travel_end >= days[0])
    .sort(
      (a, b) =>
        a.travel_start.localeCompare(b.travel_start) ||
        b.travel_end.localeCompare(a.travel_end) ||
        a.id.localeCompare(b.id),
    )
    .map((e) => {
      const start = Math.max(
        0,
        days.findIndex((d) => d >= e.travel_start),
      );
      const end = Math.max(start, days.filter((d) => d <= e.travel_end).length - 1);
      let lane = occupied.findIndex((last) => last < start);
      if (lane < 0) lane = occupied.length;
      occupied[lane] = end;
      return { ...e, start, end, lane };
    });
}
