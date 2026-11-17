/** Staff labels for the three independent commission lines on a booking. */

type CommissionTerms = {
  expected?: string;
  payer_id?: string | null;
  amount?: number | null;
};

type OperationalEntry = {
  commission?: CommissionTerms | null;
  secondary_commission?: CommissionTerms | null;
} | null;

export function receivableCommissionLabel(
  row: { payer_id?: string; notes?: string | null; is_iata_partner?: boolean | null },
  operational?: OperationalEntry,
  siblings: { payer_id?: string; is_iata_partner?: boolean | null }[] = [],
): string {
  if (row.is_iata_partner === true) return 'Primary IATA / partner commission receivable';
  if (row.is_iata_partner === false && siblings.some((s) => s.is_iata_partner === true))
    return 'Secondary commission receivable';

  const notes = String(row.notes ?? '');
  if (/\[secondary\]/i.test(notes) || /secondary expected commission/i.test(notes))
    return 'Secondary commission receivable';
  if (/\[primary\]/i.test(notes) || /primary iata/i.test(notes))
    return 'Primary IATA / partner commission receivable';

  const secondaryPayer = operational?.secondary_commission?.payer_id;
  const primaryPayer = operational?.commission?.payer_id;
  if (
    secondaryPayer &&
    row.payer_id === secondaryPayer &&
    (!primaryPayer || secondaryPayer !== primaryPayer)
  )
    return 'Secondary commission receivable';
  if (primaryPayer && row.payer_id === primaryPayer)
    return 'Primary IATA / partner commission receivable';

  if (siblings.length === 2) {
    const ordered = siblings;
    if (ordered[1]?.payer_id === row.payer_id && ordered[0]?.payer_id !== row.payer_id)
      return 'Secondary commission receivable';
    if (ordered[0]?.payer_id === row.payer_id)
      return 'Primary IATA / partner commission receivable';
  }
  return 'Commission receivable';
}

export function expectedCommissionDisplay(terms: CommissionTerms | null | undefined): {
  status: 'none' | 'unknown' | 'yes';
  amount: number | null;
} {
  if (!terms || terms.expected === 'No' || !terms.expected) return { status: 'none', amount: null };
  if (terms.expected === 'Unknown') return { status: 'unknown', amount: null };
  return {
    status: 'yes',
    amount: terms.amount == null ? null : Number(terms.amount),
  };
}
