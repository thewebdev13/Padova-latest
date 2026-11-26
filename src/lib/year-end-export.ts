/**
 * Plan v1 Phase 4 — on-demand Owner reports.
 * Profit by month (click); year-end pack: bookings, payments, commissions, referrer payments.
 * Incomplete profit stays incomplete (never invent $0). Staff must not get company totals.
 */

import { csvCell } from './csv';

export type ProfitMonthRow = {
  month: string;
  booking_count: number;
  confirmed_profit_usd: string | 'incomplete';
  incomplete_bookings: number;
};

export function buildProfitByMonth(
  bookings: Array<{
    booked_on?: string | null;
    created_at?: string | null;
    profit?: number | null;
    reservation_status?: string | null;
  }>,
): ProfitMonthRow[] {
  type Acc = {
    count: number;
    confirmed: number;
    incomplete: number;
    anyConfirmed: boolean;
  };
  const map = new Map<string, Acc>();
  for (const b of bookings) {
    if (b.reservation_status === 'Cancelled') continue;
    const month = String(b.booked_on || b.created_at || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const acc = map.get(month) ?? {
      count: 0,
      confirmed: 0,
      incomplete: 0,
      anyConfirmed: false,
    };
    acc.count += 1;
    if (b.profit == null) acc.incomplete += 1;
    else {
      acc.anyConfirmed = true;
      acc.confirmed += Number(b.profit);
    }
    map.set(month, acc);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, acc]) => ({
      month,
      booking_count: acc.count,
      confirmed_profit_usd: acc.anyConfirmed
        ? (acc.confirmed / 100).toFixed(2)
        : ('incomplete' as const),
      incomplete_bookings: acc.incomplete,
    }));
}

function centsUsd(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

function inYear(dateLike: unknown, year: number): boolean {
  const s = String(dateLike ?? '');
  return s.startsWith(`${year}-`);
}

export type YearEndPack = {
  year: number;
  bookings: Record<string, string>[];
  payments: Record<string, string>[];
  commissions: Record<string, string>[];
  referrer_payments: Record<string, string>[];
};

/** Simple accountant pack — CSV rows open in Excel. Unknown money stays blank. */
export function buildYearEndExportPack(input: {
  year: number;
  bookings?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  commissions?: Array<Record<string, unknown>>;
  referrals?: Array<Record<string, unknown>>;
  referralPayments?: Array<Record<string, unknown>>;
}): YearEndPack {
  const year = input.year;
  const bookings = (input.bookings ?? [])
    .filter((b) => inYear(b.booked_on || b.created_at, year))
    .map((b) => ({
      code: String(b.code ?? ''),
      customer: String(b.customer ?? ''),
      product: String(b.product ?? ''),
      booked_on: String(b.booked_on ?? ''),
      travel_start: String(b.travel_start ?? ''),
      travel_end: String(b.travel_end ?? ''),
      reservation_status: String(b.reservation_status ?? ''),
      sale_usd: centsUsd(b.sale),
      paid_usd: centsUsd(b.paid),
      funding_cost_usd: centsUsd(b.funding_cost),
      profit_usd: b.profit == null ? '' : centsUsd(b.profit),
      expected_commission_usd: centsUsd(b.expected_commission),
      received_commission_usd: centsUsd(b.received_commission),
    }));

  const payments = (input.payments ?? [])
    .filter((p) => inYear(p.paid_on, year))
    .map((p) => ({
      paid_on: String(p.paid_on ?? ''),
      direction: String(p.direction ?? ''),
      party: String(p.party ?? ''),
      method: String(p.method ?? ''),
      reference: String(p.reference ?? ''),
      amount_usd: centsUsd(p.amount ?? p.current_amount),
      allocated_usd: centsUsd(p.allocated),
    }));

  const commissions = (input.commissions ?? [])
    .filter((c) => inYear(c.due_on || c.created_at || c.effective_on, year))
    .map((c) => ({
      booking_code: String(c.code ?? c.booking_code ?? ''),
      payer: String(c.payer ?? c.payer_name ?? ''),
      collector: String(c.collector ?? c.collector_name ?? ''),
      gross_usd: centsUsd(c.gross ?? c.amount),
      retained_usd: centsUsd(c.retained),
      net_usd: centsUsd(c.net ?? c.outstanding),
      due_on: String(c.due_on ?? ''),
      status: String(c.status ?? ''),
    }));

  const referralById = new Map(
    (input.referrals ?? []).map((r) => [String(r.id), r] as const),
  );
  const referrer_payments = (input.referralPayments ?? [])
    .filter((p) => inYear(p.paid_on, year))
    .map((p) => {
      const ref = referralById.get(String(p.referral_id));
      return {
        paid_on: String(p.paid_on ?? ''),
        referrer: String(ref?.referrer ?? ref?.referrer_name ?? p.party ?? ''),
        booking_id: String(p.booking_id ?? ref?.booking_id ?? ''),
        amount_usd: centsUsd(p.amount ?? p.current_amount),
        method: String(p.method ?? ''),
        reference: String(p.reference ?? ''),
      };
    });

  return { year, bookings, payments, commissions, referrer_payments };
}

export function rowsToCsv(rows: Record<string, string>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return [
    keys.map(csvCell).join(','),
    ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(',')),
  ].join('\r\n');
}

export function yearEndFileNames(year: number): {
  bookings: string;
  payments: string;
  commissions: string;
  referrer_payments: string;
  profit_by_month: string;
} {
  return {
    bookings: `padova-${year}-bookings.csv`,
    payments: `padova-${year}-payments.csv`,
    commissions: `padova-${year}-commissions.csv`,
    referrer_payments: `padova-${year}-referrer-payments.csv`,
    profit_by_month: `padova-profit-by-month.csv`,
  };
}
