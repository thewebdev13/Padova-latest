/**
 * Plan v1 — Hotel with commission: how the hotel is paid (four ways).
 * Customer pays at checkout / Padova prepays on customer card → Padova owed $0 for the room
 * (commission still expected; Extra charge optional). Never invent amounts.
 */

export const HOTEL_PAID_BY_OPTIONS = [
  'Padova card',
  'Customer card (Padova prepays)',
  'Customer pays at checkout',
  'Split',
] as const;

export type HotelPaidBy = (typeof HOTEL_PAID_BY_OPTIONS)[number];

export function isHotelPaidBy(value: unknown): value is HotelPaidBy {
  return (HOTEL_PAID_BY_OPTIONS as readonly string[]).includes(String(value || ''));
}

/** Room not collected by Padova — sale owed stays $0 unless staff already entered a price. */
export function hotelPaidBySetsPadovaOwedZero(path: HotelPaidBy | '' | null | undefined): boolean {
  return (
    path === 'Customer pays at checkout' || path === 'Customer card (Padova prepays)'
  );
}

/** Preferred first Cost & Payment type for this path (null = leave unchanged). */
export function hotelPaidByDefaultPaymentType(
  path: HotelPaidBy | '' | null | undefined,
): 'Padova payment' | 'Customer card' | null {
  if (path === 'Padova card') return 'Padova payment';
  if (path === 'Customer card (Padova prepays)') return 'Customer card';
  if (path === 'Customer pays at checkout') return 'Customer card';
  return null;
}

export function hotelPaidByHint(path: HotelPaidBy | '' | null | undefined): string {
  switch (path) {
    case 'Padova card':
      return 'Padova prepays the hotel on its card. Customer sale is what they owe Padova.';
    case 'Customer card (Padova prepays)':
      return 'Padova charges the customer’s card for the hotel. Padova is owed $0 for the room (commission only) unless you add an Extra charge.';
    case 'Customer pays at checkout':
      return 'Customer pays the hotel directly. Padova is owed $0 for the room; commission is still expected.';
    case 'Split':
      return 'Part Padova / part customer. Enter each cost line separately; do not invent a combined amount.';
    default:
      return 'How the hotel is paid: Padova card, customer card (Padova prepays), customer at checkout, or split.';
  }
}
