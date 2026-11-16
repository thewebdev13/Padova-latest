import { historicalSourceValue } from './historical-source-values';

/** Readable facts from preserved rows, without creating people, dates or financial events. */
export function historicalRecordPresentation(
  entry: Record<string, any>,
  review?: Record<string, any>,
) {
  const fields = (entry.itinerary?.historical_sources ?? []).flatMap(
    (source: Record<string, any>) =>
      Object.entries(source.original_fields ?? {}).map(([name, raw]) => ({
        name: name
          .replace(/^[A-Z]+\s*[—–-]\s*/, '')
          .trim()
          .toLowerCase(),
        value: historicalSourceValue(raw).trim(),
      })),
  );
  const values = (pattern: RegExp): string[] => [
    ...new Set<string>(
      fields
        .filter((f: { name: string; value: string }) => pattern.test(f.name) && f.value)
        .map((f: { value: string }) => f.value),
    ),
  ];
  const routeCandidates = [entry.summary, ...values(/^(route|route\/stay|itinerary)$/)].filter(
    Boolean,
  );
  const routes = [
    ...new Set<string>(
      routeCandidates
        .flatMap((v: string) => v.toUpperCase().match(/\b[A-Z]{3}\s*[-–]\s*[A-Z]{3}\b/g) ?? [])
        .map((v: string) => v.replace(/\s*[-–]\s*/, '–')),
    ),
  ];
  const flights = [
    ...new Set<string>(
      routeCandidates.flatMap((v: string) => v.match(/\b[A-Z]{2}\d{1,4}\b/g) ?? []),
    ),
  ];
  const passengers = values(/^(pax|passengers?|travelers?|travellers?)$/);
  const dates = values(/^(date of travel|travel date|departure date)$/);
  const claims = entry.itinerary?.source_claims ?? {};
  const corrected = review?.values;
  return {
    route: corrected?.travel_details || routes.join(' / ') || '',
    flights: flights.join(' / '),
    travelers: corrected?.traveler_names || passengers.join('\n'),
    travelDates: corrected?.travel_dates || entry.travel_start || dates.join(' / '),
    datesNeedReview: !corrected?.travel_dates && !entry.travel_start && dates.length > 0,
    bookedOn: corrected?.booked_on ?? entry.booked_on ?? null,
    dateCertainty: corrected?.date_certainty ?? (entry.booked_on ? 'Confirmed' : 'Unknown'),
    sale: corrected?.sale_cents ?? claims.customer_sale_cents ?? null,
    recordedSale: values(/^(sale price|customer price)$/).join(' / '),
    cost: corrected?.cost_cents ?? null,
    recordedCost: values(/^cost$/).join(' / '),
    // A spreadsheet Paid column cannot establish a receipt or allocation.
    paymentStatus: 'Needs reconciliation',
  };
}
