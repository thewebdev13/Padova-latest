/**
 * Plan v1 — Held PNR with ticketing deadline.
 * Remind before deadline; activate (Active / stored Booked) when paid + ticketed;
 * past deadline → attention (no silent cancel). UI labels: see booking-status.ts.
 */

export const RESERVATION_STATUSES = [
  'Held',
  'Booked',
  'Traveled',
  'Cancelled',
  'Refund Pending',
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export function bookingTicketingDeadline(booking: {
  itinerary?: { ticketing_deadline?: string | null; operational_entry?: { ticketing_deadline?: string | null } } | null;
}): string | null {
  const d =
    booking.itinerary?.ticketing_deadline ||
    booking.itinerary?.operational_entry?.ticketing_deadline ||
    null;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return null;
  return String(d);
}

export function heldDeadlineUrgency(
  deadline: string | null | undefined,
  today: string,
): 'ok' | 'due_soon' | 'due_today' | 'overdue' | 'none' {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return 'none';
  if (deadline < today) return 'overdue';
  if (deadline === today) return 'due_today';
  const t = new Date(`${today}T12:00:00Z`).getTime();
  const d = new Date(`${deadline}T12:00:00Z`).getTime();
  const days = Math.round((d - t) / 86400000);
  if (days <= 3) return 'due_soon';
  return 'ok';
}

/** Paid in full (unknown sale → not paid-complete). */
export function isBookingPaidComplete(booking: {
  sale?: number | null;
  paid?: number | null;
  customer_balance?: number | null;
}): boolean {
  if (booking.customer_balance != null && Number.isFinite(Number(booking.customer_balance)))
    return Number(booking.customer_balance) <= 0 && Number(booking.paid ?? 0) > 0;
  if (booking.sale == null) return false;
  return Number(booking.paid ?? 0) >= Number(booking.sale) && Number(booking.sale) >= 0;
}

export function isTicketedStatus(confirmationStatus: string | null | undefined): boolean {
  return /^ticketed$/i.test(String(confirmationStatus || '').trim());
}

/** Held → Active (Booked) when customer has paid and ticketing is Ticketed. */
export function shouldActivateHeld(booking: {
  reservation_status?: string | null;
  confirmation_status?: string | null;
  sale?: number | null;
  paid?: number | null;
  customer_balance?: number | null;
}): boolean {
  if (booking.reservation_status !== 'Held') return false;
  return isBookingPaidComplete(booking) && isTicketedStatus(booking.confirmation_status);
}

export type HeldReminder = {
  key: string;
  fingerprint: string;
  title: string;
  detail: string;
  booking_id: string;
  kind: 'Held PNR deadline';
  due_on: string | null;
  urgency: 'due_soon' | 'due_today' | 'overdue';
};

export function buildHeldPnrReminders(
  bookings: Array<{
    id: string;
    code?: string;
    reservation_status?: string | null;
    confirmation_status?: string | null;
    itinerary?: { ticketing_deadline?: string | null; operational_entry?: { ticketing_deadline?: string | null } } | null;
  }>,
  today: string,
): HeldReminder[] {
  const out: HeldReminder[] = [];
  for (const b of bookings) {
    if (b.reservation_status !== 'Held') continue;
    const deadline = bookingTicketingDeadline(b);
    const urgency = heldDeadlineUrgency(deadline, today);
    if (urgency === 'ok' || urgency === 'none') continue;
    const label =
      urgency === 'overdue'
        ? 'past ticketing deadline'
        : urgency === 'due_today'
          ? 'ticketing deadline today'
          : 'ticketing deadline within 3 days';
    out.push({
      key: `held-deadline:${b.id}`,
      fingerprint: `${deadline || 'unknown'}:${urgency}`,
      title: `${b.code || 'Booking'} · Held PNR ${label}`,
      detail: deadline
        ? `Ticket or cancel before ${deadline}. System does not auto-cancel.`
        : 'Held without a ticketing deadline — set one on the booking.',
      booking_id: b.id,
      kind: 'Held PNR deadline',
      due_on: deadline,
      urgency,
    });
  }
  return out;
}
