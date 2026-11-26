/**
 * Plan v1 Phase 4 — customer statement covering several bookings.
 * Preview only (no auto-email). Unknown stays incomplete — never invent $0.
 */

export type StatementEntryInput = {
  date?: string | null;
  label: string;
  debit?: number | null;
  credit?: number | null;
};

export type StatementPreviewLine = {
  date: string;
  label: string;
  charge_cents: number | null;
  payment_cents: number | null;
  balance_cents: number | null;
};

export type CustomerStatementPreview = {
  customer_name: string;
  as_of: string;
  lines: StatementPreviewLine[];
  closing_balance_cents: number | null;
  incomplete: boolean;
};

function centsOrNull(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.trunc(Number(v));
}

/** Build a printable/on-demand statement from ledger rows. */
export function buildCustomerStatementPreview(input: {
  customer_name: string;
  as_of: string;
  entries: StatementEntryInput[];
}): CustomerStatementPreview {
  const lines: StatementPreviewLine[] = [];
  let running: number | null = 0;
  let incomplete = false;

  for (const e of input.entries) {
    const debit = centsOrNull(e.debit);
    const credit = centsOrNull(e.credit);
    if (debit == null && credit == null) {
      incomplete = true;
      lines.push({
        date: e.date || '',
        label: e.label,
        charge_cents: null,
        payment_cents: null,
        balance_cents: running,
      });
      continue;
    }
    const charge = debit ?? 0;
    const payment = credit ?? 0;
    if (running == null) {
      incomplete = true;
      lines.push({
        date: e.date || '',
        label: e.label,
        charge_cents: debit,
        payment_cents: credit,
        balance_cents: null,
      });
      continue;
    }
    running += charge - payment;
    lines.push({
      date: e.date || '',
      label: e.label,
      charge_cents: debit,
      payment_cents: credit,
      balance_cents: running,
    });
  }

  return {
    customer_name: input.customer_name,
    as_of: input.as_of,
    lines,
    closing_balance_cents: incomplete && running == null ? null : running,
    incomplete,
  };
}

function formatStatementCents(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return 'Unknown';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Plan: copy statement text for WhatsApp / email — never auto-sends. */
export function formatCustomerStatementPlainText(preview: CustomerStatementPreview): string {
  const rows = preview.lines.map((line) => {
    const date = line.date || '—';
    const charge = line.charge_cents == null ? '—' : formatStatementCents(line.charge_cents);
    const payment = line.payment_cents == null ? '—' : formatStatementCents(line.payment_cents);
    const balance = formatStatementCents(line.balance_cents);
    return `${date}  ${line.label}  charge ${charge}  paid ${payment}  bal ${balance}`;
  });
  const header = [
    `Statement · ${preview.customer_name}`,
    `As of ${preview.as_of}`,
    preview.incomplete ? 'Status: incomplete (some amounts Unknown)' : null,
    '',
  ].filter((x) => x != null) as string[];
  const footer = [
    '',
    `Closing balance: ${formatStatementCents(preview.closing_balance_cents)}`,
  ];
  return [...header, ...rows, ...footer].join('\n');
}
