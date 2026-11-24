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

/** Cost-panel label: expected amount on the booking (not a posted receivable). */
export function expectedCommissionPanelLabel(kind: 'primary' | 'secondary'): string {
  return kind === 'primary'
    ? 'Primary IATA / partner commission expected'
    : 'Secondary commission expected';
}

export function receivableCommissionLabel(
  row: { payer_id?: string; notes?: string | null; is_iata_partner?: boolean | null },
  operational?: OperationalEntry,
  siblings: { payer_id?: string; is_iata_partner?: boolean | null }[] = [],
): string {
  if (row.is_iata_partner === true)
    return 'Primary IATA / partner commission · recorded receivable';
  if (row.is_iata_partner === false && siblings.some((s) => s.is_iata_partner === true))
    return 'Secondary commission · recorded receivable';

  const notes = String(row.notes ?? '');
  if (/\[secondary\]/i.test(notes) || /secondary expected commission/i.test(notes))
    return 'Secondary commission · recorded receivable';
  if (/\[primary\]/i.test(notes) || /primary iata/i.test(notes))
    return 'Primary IATA / partner commission · recorded receivable';

  const secondaryPayer = operational?.secondary_commission?.payer_id;
  const primaryPayer = operational?.commission?.payer_id;
  if (
    secondaryPayer &&
    row.payer_id === secondaryPayer &&
    (!primaryPayer || secondaryPayer !== primaryPayer)
  )
    return 'Secondary commission · recorded receivable';
  if (primaryPayer && row.payer_id === primaryPayer)
    return 'Primary IATA / partner commission · recorded receivable';

  if (siblings.length === 2) {
    const ordered = siblings;
    if (ordered[1]?.payer_id === row.payer_id && ordered[0]?.payer_id !== row.payer_id)
      return 'Secondary commission · recorded receivable';
    if (ordered[0]?.payer_id === row.payer_id)
      return 'Primary IATA / partner commission · recorded receivable';
  }
  return 'Commission · recorded receivable';
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

/** True when booking entry notes an expected commission that is not “No”. */
export function hasExpectedCommissionOnBooking(operational?: OperationalEntry): boolean {
  const primary = expectedCommissionDisplay(operational?.commission);
  const secondary = expectedCommissionDisplay(operational?.secondary_commission);
  return primary.status !== 'none' || secondary.status !== 'none';
}

/**
 * Empty-state copy for the Commissions card.
 * Expected (entry) ≠ recorded receivable ≠ cash received.
 */
export function bookingCommissionsEmptyMessage(opts: {
  hasRecordedReceivable: boolean;
  hasReferral: boolean;
  hasRefund: boolean;
  hasExpectedOnBooking: boolean;
}): string | null {
  if (opts.hasRecordedReceivable || opts.hasReferral || opts.hasRefund) return null;
  if (opts.hasExpectedOnBooking)
    return 'No recorded receivable or receipt yet, expected amounts above are not received. Use Add commission to post.';
  return 'No recorded commission receivables, referrals, or refunds yet.';
}

/** Sum recorded receivable nets split by primary / secondary labels. */
export function recordedCommissionTotals(
  rows: {
    payer_id?: string;
    notes?: string | null;
    is_iata_partner?: boolean | null;
    gross?: number | null;
    retained?: number | null;
  }[],
  operational?: OperationalEntry,
): { primaryCents: number | null; secondaryCents: number | null } {
  if (!rows.length) return { primaryCents: null, secondaryCents: null };
  let primary = 0;
  let secondary = 0;
  let hasPrimary = false;
  let hasSecondary = false;
  for (const row of rows) {
    const label = receivableCommissionLabel(row, operational, rows);
    const net = Number(row.gross ?? 0) - Number(row.retained ?? 0);
    if (/primary/i.test(label)) {
      primary += net;
      hasPrimary = true;
    } else if (/secondary/i.test(label)) {
      secondary += net;
      hasSecondary = true;
    } else if (!hasPrimary && rows.length === 1) {
      primary += net;
      hasPrimary = true;
    } else {
      secondary += net;
      hasSecondary = true;
    }
  }
  return {
    primaryCents: hasPrimary ? primary : null,
    secondaryCents: hasSecondary ? secondary : null,
  };
}
