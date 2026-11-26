/** Legacy historical sales were held in booking_drafts, not posted as bookings. */
export function draftKind(draft: { summary?: string; historical_status?: string | null }) {
  return draft.historical_status &&
    /^Voucher\s+ending\s*\d+\s+sold to\s+/i.test(draft.summary ?? '')
    ? 'voucher_sale'
    : draft.historical_status
      ? 'historical_booking'
      : 'booking';
}

/**
 * Plan Drafts list search: title · summary · product · source · customer · id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function draftMatchesSearch(
  draft: {
    id?: string | null;
    title?: string | null;
    display_title?: string | null;
    summary?: string | null;
    intake_product?: string | null;
    intake_source?: string | null;
    intake_customer?: string | null;
    customer_name?: string | null;
    kind?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    draft.display_title,
    draft.title,
    draft.summary,
    draft.intake_product,
    draft.intake_source,
    draft.intake_customer,
    draft.customer_name,
    draft.kind,
    draft.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}
