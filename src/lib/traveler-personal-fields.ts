/**
 * Plan: passport, DOB, frequent flyer / loyalty, KTN, seat, etc. stay collapsed.
 * Legal first + last name remain primary on traveler edit.
 */

export const TRAVELER_PERSONAL_OPTIONAL_KEYS = [
  'middle_name',
  'dob',
  'sex',
  'nationality',
  'redress',
  'ktn',
  'seat',
  'loyalty_program',
  'loyalty_program_custom',
  'loyalty_number',
  'passport_number',
  'passport_country',
  'passport_expiry',
] as const;

export type TravelerPersonalOptionalKey = (typeof TRAVELER_PERSONAL_OPTIONAL_KEYS)[number];

/** True when any optional personal field already has a value (Unknown ≠ invent). */
export function travelerPersonalOptionalShouldOpen(values: Record<string, unknown>): boolean {
  for (const key of TRAVELER_PERSONAL_OPTIONAL_KEYS) {
    const v = values[key];
    if (typeof v === 'string' && v.trim()) return true;
    if (typeof v === 'number' && Number.isFinite(v)) return true;
  }
  return false;
}
