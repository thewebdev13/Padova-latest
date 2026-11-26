/**
 * Plan v1 — extras sold separately (seats, bags) on the same booking.
 * Customer price and cost are both optional; missing stays Unknown (never invent $0).
 */

export const BOOKING_EXTRA_CATEGORIES = ['Seat', 'Bag', 'Other'] as const;
export type BookingExtraCategory = (typeof BOOKING_EXTRA_CATEGORIES)[number];

export function bookingExtraChargeKind(category: BookingExtraCategory): string {
  return `Extra: ${category}`;
}

export function isBookingExtraChargeKind(kind: unknown): boolean {
  return /^Extra:\s*(Seat|Bag|Other)\b/i.test(String(kind || ''));
}

export function bookingExtraLabel(input: {
  category: BookingExtraCategory;
  description?: string | null;
}): string {
  const desc = String(input.description || '').trim();
  return desc ? `${input.category} · ${desc}` : input.category;
}
