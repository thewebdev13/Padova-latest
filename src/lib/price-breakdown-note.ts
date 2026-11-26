/**
 * Plan: one booking · one customer price.
 * A per-traveler or per-flight breakdown is an optional note only —
 * never required, never shown by default, never invents dollars or splits sale.
 */

/** Normalize optional breakdown text; blank → null (do not invent). */
export function priceBreakdownNote(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  return s ? s.slice(0, 1000) : null;
}

/** True when a note should appear on booking detail (never on list by default). */
export function priceBreakdownNoteVisible(raw: string | null | undefined): boolean {
  return priceBreakdownNote(raw) != null;
}
