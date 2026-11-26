type R = Record<string, any>;

function asStringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string' && !!v.trim());
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/**
 * Plan search: PNR / confirmation / booking # / customer / traveler / ticket numbers.
 * Only uses fields on the authorized snapshot — never invents identifiers.
 */
export function bookingSearchTerms(booking: R, state: R): string[] {
  const op = booking.itinerary?.operational_entry ?? {};
  const person = (id: string) => state.parties?.find((p: R) => p.id === id)?.name ?? '';
  const profile = state.bookingSourceProfiles?.find((p: R) => p.id === op.source_profile_id);
  const travelRows = (state.travelComponents ?? []).filter(
    (t: R) => t.booking_id === booking.id,
  );
  const segments = [
    ...(op.segments ?? []),
    ...travelRows.flatMap((t: R) => t.details?.segments ?? []),
  ];
  const ticketNumbers = [
    ...asStringList(booking.itinerary?.ticket_numbers),
    ...asStringList(op.ticket_numbers),
    ...travelRows.flatMap((t: R) => asStringList(t.details?.ticket_numbers)),
  ];
  const confirmations = [
    booking.confirmations,
    booking.booking_source_confirmation,
    op.booking_source_confirmation,
    ...asStringList(booking.itinerary?.confirmations),
    ...travelRows.flatMap((t: R) => asStringList(t.details?.confirmations)),
    ...(op.references ?? []).map((r: R) => r.value),
  ];
  const travelers = [
    ...(booking.traveler_ids ?? []).map((id: string) => person(id)),
    ...asStringList(booking.travelers),
  ];
  return [
    booking.code,
    booking.summary,
    booking.customer,
    person(booking.customer_id),
    ...travelers,
    ...ticketNumbers,
    ...confirmations,
    op.notes,
    booking.search_notes,
    profile?.name,
    profile?.provider,
    person(profile?.holder_id),
    profile?.safe_identifier,
    ...segments.flatMap((s: R) => [s.origin, s.destination, s.date, s.flight_number]),
    ...(state.fundingComponents ?? [])
      .filter((f: R) => f.booking_id === booking.id)
      .flatMap((f: R) => [
        f.reference,
        person(f.seller_id),
        state.paymentAccounts?.find((a: R) => a.id === f.account_id)?.name,
      ]),
  ].filter((v): v is string => typeof v === 'string' && !!v.trim());
}

/**
 * Plan Bookings list search against bookingSearchTerms.
 * Blank query → match all; empty fields never invent a hit.
 */
export function bookingMatchesSearch(
  booking: R,
  state: R,
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return bookingSearchTerms(booking, state).some((t) => t.toLowerCase().includes(q));
}

/**
 * Voucher/asset sale rows on the Bookings list — light match on visible fields.
 * Blank query → match all; empty fields never invent a hit.
 */
export function saleMatchesSearch(
  sale: {
    code?: string | null;
    summary?: string | null;
    customer?: string | null;
    name?: string | null;
    id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [sale.code, sale.summary, sale.customer, sale.name, sale.id]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}
