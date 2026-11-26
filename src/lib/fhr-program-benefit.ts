/**
 * Plan FHR / Hotel at program rate — More:
 * any Amex credit or points gained (default none, nothing counted as income).
 * Information only — never invents amounts or posts Money Back.
 */

/** Explicit: this note must never be treated as Padova income. */
export const FHR_PROGRAM_BENEFIT_COUNTS_AS_INCOME = false;

/**
 * Display label for the optional benefit note.
 * Blank → None (Plan default); never invent a dollar amount.
 */
export function fhrProgramBenefitLabel(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  return s || 'None';
}

export function fhrProgramBenefitNote(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  return s ? s.slice(0, 500) : null;
}
