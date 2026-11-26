/**
 * Plan v1 — hotel checkout reminder to check expected commission.
 * After checkout, follow up until receivable is posted or voided/denied.
 * Never invents commission amounts or checkout dates.
 */

import { heldDeadlineUrgency } from './held-pnr';
import { isMoneyBackDenied } from './money-back-deny';
import { isMoneyBackVoided } from './money-back-void';

function outstandingCents(c: {
  gross?: unknown;
  retained?: unknown;
  received?: unknown;
  deducted?: unknown;
}): number {
  const due =
    Number(c.gross ?? 0) -
    Number(c.retained ?? 0) -
    Number(c.received ?? 0) -
    Number(c.deducted ?? 0);
  return Number.isFinite(due) && due > 0 ? due : 0;
}

export type HotelCheckoutReminder = {
  key: string;
  fingerprint: string;
  title: string;
  detail: string;
  booking_id: string;
  kind: 'Hotel checkout commission';
  due_on: string;
  urgency: 'due_soon' | 'due_today' | 'overdue';
};

type Op = {
  how_booked?: string;
  commission?: { expected?: string } | null;
  secondary_commission?: { expected?: string } | null;
} | null;

export function hotelCheckoutOn(booking: {
  travel_end?: string | null;
  itinerary?: { travel_end?: string | null } | null;
}): string | null {
  const raw = booking.travel_end || booking.itinerary?.travel_end || null;
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return null;
  return String(raw).slice(0, 10);
}

/** Hotel Money Back commission still expected (not voided/denied). */
export function bookingExpectsHotelCommission(booking: {
  product?: string | null;
  reservation_status?: string | null;
  itinerary?: { operational_entry?: Op } | null;
}): boolean {
  if (booking.reservation_status === 'Cancelled') return false;
  const op = booking.itinerary?.operational_entry ?? null;
  const how = String(op?.how_booked || '');
  const hotelProduct = String(booking.product || '') === 'Hotel';
  const hotelHow =
    how === 'Hotel with commission' ||
    (hotelProduct && how !== 'Hotel at program rate (FHR)' && how !== 'Hotel at program rate');
  if (!hotelHow && !hotelProduct) return false;
  const primary = op?.commission;
  const secondary = op?.secondary_commission;
  const primaryOpen =
    (primary?.expected === 'Yes' || primary?.expected === 'Unknown') &&
    !isMoneyBackVoided(op, 'expected_primary', 'primary') &&
    !isMoneyBackDenied(op, 'expected_primary', 'primary');
  const secondaryOpen =
    (secondary?.expected === 'Yes' || secondary?.expected === 'Unknown') &&
    !isMoneyBackVoided(op, 'expected_secondary', 'secondary') &&
    !isMoneyBackDenied(op, 'expected_secondary', 'secondary');
  if (how === 'Hotel with commission') return primaryOpen || secondaryOpen || !primary;
  return primaryOpen || secondaryOpen;
}

export function buildHotelCheckoutCommissionReminders(
  bookings: Array<{
    id: string;
    code?: string;
    product?: string | null;
    travel_end?: string | null;
    reservation_status?: string | null;
    itinerary?: { travel_end?: string | null; operational_entry?: Op } | null;
  }>,
  commissions: Array<{
    id?: string;
    booking_id?: string | null;
    gross?: unknown;
    retained?: unknown;
    received?: unknown;
    deducted?: unknown;
  }>,
  today: string,
): HotelCheckoutReminder[] {
  const out: HotelCheckoutReminder[] = [];
  const byBooking = new Map<string, typeof commissions>();
  for (const c of commissions) {
    if (!c.booking_id) continue;
    const list = byBooking.get(c.booking_id) ?? [];
    list.push(c);
    byBooking.set(c.booking_id, list);
  }

  for (const b of bookings) {
    if (!bookingExpectsHotelCommission(b)) continue;
    const checkout = hotelCheckoutOn(b);
    if (!checkout) continue;
    const urgency = heldDeadlineUrgency(checkout, today);
    if (urgency === 'ok' || urgency === 'none') continue;

    const posted = byBooking.get(b.id) ?? [];
    const outstanding = posted.reduce((sum, c) => sum + outstandingCents(c), 0);
    const unposted = posted.length === 0;
    if (!unposted && outstanding <= 0) continue;

    const label =
      urgency === 'overdue'
        ? 'past checkout — confirm commission'
        : urgency === 'due_today'
          ? 'checkout today — confirm commission'
          : 'checkout within 3 days — commission follow-up';
    const detail = unposted
      ? `Checkout ${checkout}. Post the Money Back receivable when confirmed, or mark denied/voided.`
      : `Checkout ${checkout}. Outstanding commission ${outstanding}¢ still expected.`;

    out.push({
      key: `hotel-checkout-commission:${b.id}`,
      fingerprint: `${checkout}:${urgency}:${unposted ? 'unposted' : outstanding}`,
      title: `${b.code || 'Booking'} · ${label}`,
      detail,
      booking_id: b.id,
      kind: 'Hotel checkout commission',
      due_on: checkout,
      urgency,
    });
  }
  return out;
}
