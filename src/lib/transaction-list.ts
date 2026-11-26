export type TransactionRecord = {
  id: string;
  booked_on?: string | null;
  effective_on?: string | null;
  created_at?: string | null;
};

/** Only use authorized, recorded balances. An absent/unknown balance is never paid. */
export function transactionIndicators(
  kind: 'booking' | 'sale',
  record: Record<string, any>,
  views: Record<string, Record<string, any>[]>,
  permissions: { sale: boolean; cost: boolean },
) {
  const flags: { label: string; tone: 'red' | 'amber' | 'blue' | 'gray' | 'green' }[] = [];
  const balance =
    kind === 'booking'
      ? record.customer_balance
      : record.proceeds != null && record.received != null
        ? Number(record.proceeds) - Number(record.received)
        : null;
  if (permissions.sale) {
    if (balance == null) flags.push({ label: 'Payment needs review', tone: 'amber' });
    else if (balance > 0)
      flags.push({ label: kind === 'booking' ? 'Balance open' : 'Customer owes', tone: 'red' });
    else if (balance === 0) flags.push({ label: 'Customer paid', tone: 'green' });
    else flags.push({ label: 'Customer credit', tone: 'blue' });
  }
  if (kind === 'booking') {
    if (permissions.cost && record.recorded_supplier_balance > 0)
      flags.push({ label: 'Seller unpaid', tone: 'amber' });
    const names: Record<string, string> = {
      'Commission Receivable': 'Commission due in',
      'Commission Payable': 'Commission due out',
      'Pending Refunds': 'Refund pending',
      'Pending Credits': 'Credit pending',
      'Missing Cost': 'Final cost pending',
    };
    for (const [view, label] of Object.entries(names))
      if (views[view]?.some((item) => item.booking_id === record.id))
        flags.push({ label, tone: 'amber' });
    if (
      views['Needs Attention']?.some((item) => item.booking_id === record.id) &&
      !flags.some((flag) => flag.tone === 'red' || flag.tone === 'amber')
    )
      flags.push({ label: 'Needs attention', tone: 'amber' });
  }
  return flags.length ? flags : [{ label: 'No flagged follow-up', tone: 'gray' as const }];
}

/** Business records only: receipts and refunds remain on their parent record. */
export function transactionList<B extends TransactionRecord, S extends TransactionRecord>(
  bookings: B[],
  sales: S[],
) {
  return [
    ...bookings.map((record) => ({ kind: 'booking' as const, record, date: record.booked_on })),
    ...sales.map((record) => ({ kind: 'sale' as const, record, date: record.effective_on })),
  ].sort(
    (a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      String(b.record.created_at || '').localeCompare(String(a.record.created_at || '')) ||
      a.kind.localeCompare(b.kind) ||
      a.record.id.localeCompare(b.record.id),
  );
}
