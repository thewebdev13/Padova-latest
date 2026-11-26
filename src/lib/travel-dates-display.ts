import { dateLabel } from '@/lib/display-date';

type TravelLike = {
  product?: string;
  travel_start?: string | null;
  travel_end?: string | null;
  itinerary?: {
    trip_type?: string;
    end_date_known?: boolean;
    operational_entry?: { trip_type?: string };
  };
  details?: { trip_type?: string; end_date_known?: boolean };
};

/** Plan Do-now: missing checkout / return must read as missing, never as a complete span. */
export function travelEndKnown(travel: TravelLike | null | undefined): boolean | undefined {
  if (!travel) return undefined;
  if (typeof travel.details?.end_date_known === 'boolean') return travel.details.end_date_known;
  if (typeof travel.itinerary?.end_date_known === 'boolean') return travel.itinerary.end_date_known;
  return undefined;
}

export function travelTripType(travel: TravelLike | null | undefined): string | undefined {
  return (
    travel?.details?.trip_type ||
    travel?.itinerary?.trip_type ||
    travel?.itinerary?.operational_entry?.trip_type
  );
}

export function travelDatesDisplay(
  booking: TravelLike,
  primaryTravel?: TravelLike | null,
): { label: string; missing?: string } {
  const start = booking.travel_start;
  if (!start) return { label: 'No date', missing: 'Travel date missing' };

  const product = primaryTravel?.product || booking.product || '';
  const tripType = travelTripType(primaryTravel) || travelTripType(booking) || '';
  const endKnown = travelEndKnown(primaryTravel) ?? travelEndKnown(booking);
  const end = primaryTravel?.travel_end ?? booking.travel_end;
  const needsExplicitEnd =
    product === 'Hotel' ||
    product === 'Car' ||
    (product === 'Flight' && tripType === 'Round Trip');

  if (needsExplicitEnd && endKnown === false) {
    return {
      label: dateLabel(start),
      missing:
        product === 'Hotel'
          ? 'Check-out missing'
          : product === 'Car'
            ? 'Drop-off missing'
            : 'Return date missing',
    };
  }

  if (end && end !== start && endKnown !== false) {
    return { label: `${dateLabel(start)} – ${dateLabel(end)}` };
  }
  return { label: dateLabel(start) };
}
