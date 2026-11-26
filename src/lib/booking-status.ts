/**
 * Plan v1 booking statuses: held, active, cancelled, completed.
 * DB/canonical store remains Held | Booked | Traveled | Cancelled | Refund Pending
 * (constraint + Held→Booked activate). UI shows Plan labels Active / Completed.
 */

import { RESERVATION_STATUSES, type ReservationStatus } from './held-pnr';

/** Plan-facing option labels (values still store canonical status). */
export const PLAN_RESERVATION_STATUS_OPTIONS = [
  'Held',
  'Active',
  'Completed',
  'Cancelled',
  'Refund Pending',
] as const;

export type PlanReservationStatusOption = (typeof PLAN_RESERVATION_STATUS_OPTIONS)[number];

/** Display label for lists/badges. Never invents a status. */
export function reservationStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').trim();
  if (!s) return '';
  if (s === 'Booked') return 'Active';
  if (s === 'Traveled') return 'Completed';
  if (s === 'Active' || s === 'Completed') return s;
  return s;
}

/** Form/select value from stored status (Booked→Active, Traveled→Completed). */
export function reservationStatusForForm(status: string | null | undefined): string {
  return reservationStatusLabel(status) || 'Active';
}

/** Persist Plan label or alias back to DB-canonical status. */
export function toStoredReservationStatus(
  planOrStored: string | null | undefined,
): ReservationStatus | null {
  const s = String(planOrStored || '').trim();
  if (!s) return null;
  if (s === 'Active') return 'Booked';
  if (s === 'Completed') return 'Traveled';
  if ((RESERVATION_STATUSES as readonly string[]).includes(s)) return s as ReservationStatus;
  return null;
}

export function reservationStatusPlanHint(): string {
  return 'Plan: Held (ticketing deadline) → Active when paid and ticketed → Completed after travel. Cancelled / Refund Pending stay as-is.';
}

/** True when status means travel finished (Plan completed). */
export function isCompletedReservationStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim();
  return s === 'Traveled' || s === 'Completed';
}

/** True when status means live/active booking (Plan active). */
export function isActiveReservationStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim();
  return s === 'Booked' || s === 'Active';
}
