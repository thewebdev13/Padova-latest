/**
 * Plan triage Change: "IATA partner on by default" → off.
 * Hotels still default to Sruly as payer with ~90% Padova / 10% retained seed.
 * Never invents a payer or retained amount when facts are missing.
 */

export type HotelCommissionBookingLike = {
  product?: unknown;
  itinerary?: { operational_entry?: { how_booked?: unknown } } | null;
} | null | undefined;

export function isHotelCommissionBooking(booking: HotelCommissionBookingLike): boolean {
  if (!booking) return false;
  if (String(booking.product || '') === 'Hotel') return true;
  return (
    String(booking.itinerary?.operational_entry?.how_booked || '') === 'Hotel with commission'
  );
}

/** IATA checkbox: off unless staff/confirm flow set it explicitly. Hotel ≠ IATA on. */
export function defaultCommissionIataPartner(
  explicit: boolean | null | undefined,
): boolean {
  if (explicit == null) return false;
  return Boolean(explicit);
}

export function defaultHotelCommissionPayerId(input: {
  hotelBooking: boolean;
  explicitPayerId?: string | null;
  srulyPartyId?: string | null;
}): string {
  const explicit = String(input.explicitPayerId || '').trim();
  if (explicit) return explicit;
  if (input.hotelBooking && input.srulyPartyId) return String(input.srulyPartyId);
  return '';
}

/**
 * When gross is known and retained blank: seed 10% collector keep (Sruly hotel path).
 * Returns dollar string for the form, or null when not applicable.
 */
export function suggestSruly9010RetainedDollars(input: {
  shouldSeed: boolean;
  grossRaw: string;
  retainedRaw: string;
}): string | null {
  if (!input.shouldSeed) return null;
  if (String(input.retainedRaw || '').trim() !== '') return null;
  const t = String(input.grossRaw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const grossCents = Math.round(n * 100);
  if (grossCents <= 0) return null;
  return ((grossCents * 0.1) / 100).toFixed(2);
}
