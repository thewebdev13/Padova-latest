type R = Record<string, any>;
/** Search only operational fields supplied by the independently authorized snapshot. */
export function bookingSearchTerms(booking: R, state: R): string[] {
  const op = booking.itinerary?.operational_entry ?? {};
  const person = (id: string) => state.parties?.find((p: R) => p.id === id)?.name ?? '';
  const profile = state.bookingSourceProfiles?.find((p: R) => p.id === op.source_profile_id);
  const segments = [
    ...(op.segments ?? []),
    ...(state.travelComponents ?? [])
      .filter((t: R) => t.booking_id === booking.id)
      .flatMap((t: R) => t.details?.segments ?? []),
  ];
  return [
    op.notes,
    booking.search_notes,
    profile?.name,
    profile?.provider,
    person(profile?.holder_id),
    profile?.safe_identifier,
    ...(op.references ?? []).map((r: R) => r.value),
    ...segments.flatMap((s: R) => [s.origin, s.destination, s.date, s.flight_number]),
    ...(state.fundingComponents ?? [])
      .filter((f: R) => f.booking_id === booking.id)
      .flatMap((f: R) => [
        f.reference,
        person(f.seller_id),
        state.paymentAccounts?.find((a: R) => a.id === f.account_id)?.name,
      ]),
  ].filter((v): v is string => typeof v === 'string' && !!v);
}
