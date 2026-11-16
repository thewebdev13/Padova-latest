/** Legacy historical sales were held in booking_drafts, not posted as bookings. */
export function draftKind(draft: { summary?: string; historical_status?: string | null }) {
  return draft.historical_status &&
    /^Voucher\s+ending\s*\d+\s+sold to\s+/i.test(draft.summary ?? '')
    ? 'voucher_sale'
    : draft.historical_status
      ? 'historical_booking'
      : 'booking';
}
