type Values = Record<string, any>;

/** Presentation facts derived from the same structured itinerary used for posting. */
export function derivedTravel(v: Values, provider = '') {
  const multi = v.product === 'Flight' && v.trip_type === 'Multi-City';
  const segments: Values[] = multi ? (v.segments ?? []) : [];
  const start = multi ? segments[0]?.date : v.travel_start;
  // Never invent checkout/return from start — missing stays missing (Plan Do-now).
  const end = multi
    ? segments.at(-1)?.date
    : v.product === 'Flight' && v.trip_type === 'One Way'
      ? start
      : v.travel_end || undefined;
  const route = multi
    ? segments.map((s) => [s.origin, s.destination].filter(Boolean).join('–')).join(' / ')
    : v.route || [v.origin, v.destination].filter(Boolean).join('–');
  const place =
    v.product === 'Flight'
      ? route
      : v.product === 'Hotel'
        ? v.location || v.hotel_address
        : v.product === 'Car'
          ? [v.pickup_location, v.dropoff_location].filter(Boolean).join(' → ')
          : v.description;
  const dates = multi
    ? segments.map((s) => [s.origin, s.destination, s.date].filter(Boolean).join(' · ')).join(' / ')
    : [start, end !== start ? end : undefined].filter(Boolean).join(' – ');
  const summary =
    [provider, multi ? dates : place, multi ? undefined : dates].filter(Boolean).join(' · ') ||
    `${v.product} reservation`;
  return { start, end, route, summary };
}

export function travelDateLabels(product: string, tripType = 'One Way') {
  return product === 'Flight'
    ? { start: 'Departure Date', end: tripType === 'Round Trip' ? 'Return Date' : undefined }
    : product === 'Hotel'
      ? { start: 'Check-in date', end: 'Check-out date' }
      : product === 'Car'
        ? { start: 'Pickup date', end: 'Drop-off date' }
        : { start: 'Start date', end: 'End date (optional)' };
}

/**
 * Plan Do-now: hotel needs check-out; round trip needs return; car needs drop-off.
 * One Way / Multi-City / Other do not invent an end date.
 */
export function bookingTravelEndRequired(v: {
  product?: string | null;
  trip_type?: string | null;
}): boolean {
  const product = String(v.product || '');
  if (product === 'Hotel' || product === 'Car') return true;
  return product === 'Flight' && String(v.trip_type || '') === 'Round Trip';
}

/** Missing end date message — never treat blank as complete. */
export function bookingTravelEndMissingMessage(v: {
  product?: string | null;
  trip_type?: string | null;
  travel_end?: string | null;
}): string | null {
  if (!bookingTravelEndRequired(v)) return null;
  if (String(v.travel_end || '').trim()) return null;
  const labels = travelDateLabels(String(v.product || 'Other'), String(v.trip_type || 'One Way'));
  const endLabel = labels.end || 'end date';
  return `Enter ${endLabel}, or use Save Draft.`;
}

/** Client/server-shared: end before start. Returns staff-facing message or null. */
export function travelDateOrderIssue(v: {
  product?: string;
  trip_type?: string;
  travel_start?: string;
  travel_end?: string;
}): string | null {
  if (v.product === 'Flight' && v.trip_type === 'One Way') return null;
  if (v.product === 'Flight' && v.trip_type === 'Multi-City') return null;
  const start = String(v.travel_start || '').trim();
  const end = String(v.travel_end || '').trim();
  if (!start || !end) return null;
  if (end >= start) return null;
  const labels = travelDateLabels(v.product || 'Other', v.trip_type || 'One Way');
  return `${labels.end || 'End'} is before ${labels.start}. Fix the dates before saving.`;
}

/** A direct customer payment identifies its owner unless an exception is entered. */
export function directCardOwner(component: Values, customerID: string) {
  return component.owner_id || customerID;
}

/** Original entry is immutable; received credits never reduce this comparison base. */
export function originalConfirmedRate(booking: Values | undefined): number | undefined {
  if (!booking) return undefined;
  const components = booking.itinerary?.operational_entry?.components;
  if (components?.length) {
    if (
      components.some(
        (c: Values) =>
          !['Padova payment', 'Customer card', 'Outside seller', 'Other'].includes(c.type) ||
          !Number.isSafeInteger(c.cost) ||
          (c.type === 'Outside seller' &&
            c.supplied !== 'Complete Booking / Ticket' &&
            c.supplied !== 'Hotel Booking / Stay'),
      )
    )
      return undefined;
    return components.reduce((sum: number, c: Values) => sum + c.cost, 0);
  }
  return booking.cost_incomplete === false && booking.funding_cost != null
    ? Number(booking.funding_cost)
    : undefined;
}
