type Travel = {
  id: string;
  product: string;
  travel_start: string | null;
  travel_end: string | null;
  reservation_status?: string;
  status?: string;
  itinerary?: { trip_type?: string; segments?: { date: string }[]; end_date_known?: boolean };
  details?: { trip_type?: string; segments?: { date: string }[]; end_date_known?: boolean };
};
type Component = Travel & { booking_id: string; status?: string };

// Once components exist they define travel dates. Never fill gaps with the
// parent range, or fall back to it when every component has been canceled.
export function travelsBetween(
  booking: Travel,
  components: Component[],
  start: string,
  end = start,
  product = 'All',
) {
  if (['Cancelled', 'Refund Pending'].includes(booking.reservation_status ?? '')) return false;
  const listed = components.filter((component) => component.booking_id === booking.id);
  const candidates = listed.length ? listed : [booking];
  return candidates.some(
    (travel) =>
      !['Cancelled', 'Refund Pending'].includes(travel.status ?? '') &&
      travel.travel_start !== null &&
      travel.travel_end !== null &&
      travel.travel_start <= end &&
      travel.travel_end >= start &&
      (product === 'All' || booking.product === product || travel.product === product),
  );
}

/** Chronological, uncapped dashboard list using the same active component dates as calendar. */
export function nextTravelDate(
  booking: Travel,
  components: Component[],
  today: string,
  end: string,
): string | undefined {
  if (['Traveled', 'Cancelled', 'Refund Pending'].includes(booking.reservation_status ?? ''))
    return;
  const own = components.filter((c) => c.booking_id === booking.id);
  return (own.length ? own : [booking])
    .flatMap((c) => {
      if (['Cancelled', 'Refund Pending'].includes(c.status ?? '')) return [];
      const details = c.details ?? c.itinerary;
      const dates = [c.travel_start];
      if (c.product === 'Flight') {
        if (details?.trip_type === 'Round Trip' && details.end_date_known !== false)
          dates.push(c.travel_end);
        for (const segment of details?.segments ?? []) dates.push(segment.date);
      }
      return dates.filter(
        (date): date is string => typeof date === 'string' && date > today && date <= end,
      );
    })
    .sort()[0];
}

export function upcomingBookings<T extends Travel>(
  bookings: T[],
  components: Component[],
  today: string,
  end: string,
): T[] {
  const next = new Map<string, string>();
  for (const booking of bookings) {
    const date = nextTravelDate(booking, components, today, end);
    if (date) next.set(booking.id, date);
  }
  return bookings
    .filter((b) => next.has(b.id))
    .sort((a, b) => next.get(a.id)!.localeCompare(next.get(b.id)!) || a.id.localeCompare(b.id));
}
