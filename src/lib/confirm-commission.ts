/**
 * Plan v1 — Confirm expected Money Back → seed Add commission (receivable).
 * Never invents amounts or dates; blank stays blank until staff enters them.
 */
import {
  grossRetainedFromNet5050,
  notesIndicateSruly5050,
} from '@/lib/gds-commissionable';

export type ConfirmCommissionWhich = 'primary' | 'secondary';

type ExpectedTerms = {
  expected?: string;
  amount?: number | null;
  payer_id?: string | null;
  due_on?: string | null;
  notes?: string | null;
} | null;

/** Detect Plan Sruly ~90% Padova / 10% retained note (hotel default path). */
export function notesIndicateSruly9010(notes: unknown): boolean {
  const s = String(notes ?? '');
  return /90\s*%.*10\s*%|10\s*%.*retain|sruly\s+path\s*~?\s*90/i.test(s);
}

/**
 * When expected amount is Padova net under a known 90/10 split, recover gross + retained
 * in integer cents. Returns null if net cannot map cleanly (never invent).
 */
export function grossRetainedFromNet9010(netCents: number): {
  gross: number;
  retained: number;
} | null {
  if (!Number.isInteger(netCents) || netCents <= 0) return null;
  // gross = net / 0.9 → (net * 10) / 9 must be exact integer cents.
  if ((netCents * 10) % 9 !== 0) return null;
  const gross = (netCents * 10) / 9;
  const retained = gross - netCents;
  if (!Number.isInteger(gross) || retained < 0) return null;
  return { gross, retained };
}

/** Form defaults for `commission` when confirming an expected Money Back line. */
export function buildConfirmCommissionDefaults(input: {
  bookingId: string;
  which: ConfirmCommissionWhich;
  commission?: ExpectedTerms;
  secondary_commission?: ExpectedTerms;
}): {
  booking_id: string;
  payer_id?: string;
  due_on?: string;
  gross?: number;
  retained?: number;
  is_iata_partner: boolean;
  confirm_from: 'expected_primary' | 'expected_secondary';
} {
  const terms =
    input.which === 'secondary' ? input.secondary_commission : input.commission;
  const confirm_from =
    input.which === 'secondary' ? 'expected_secondary' : 'expected_primary';
  const is_iata_partner = input.which === 'primary';
  const payer_id =
    terms?.payer_id != null && String(terms.payer_id).trim()
      ? String(terms.payer_id)
      : undefined;
  const due_on =
    terms?.due_on != null && /^\d{4}-\d{2}-\d{2}/.test(String(terms.due_on).trim())
      ? String(terms.due_on).trim().slice(0, 10)
      : undefined;

  const amountRaw = terms?.amount;
  const amount =
    amountRaw == null
      ? null
      : Number.isFinite(Number(amountRaw))
        ? Math.trunc(Number(amountRaw))
        : null;

  let gross: number | undefined;
  let retained: number | undefined;
  if (amount != null && amount > 0) {
    if (notesIndicateSruly9010(terms?.notes)) {
      const split = grossRetainedFromNet9010(amount);
      if (split) {
        gross = split.gross;
        retained = split.retained;
      } else {
        // Amount present but not clean 90/10 net — seed as gross only; staff adjusts.
        gross = amount;
      }
    } else if (notesIndicateSruly5050(terms?.notes)) {
      const split = grossRetainedFromNet5050(amount);
      if (split) {
        gross = split.gross;
        retained = split.retained;
      } else {
        gross = amount;
      }
    } else {
      gross = amount;
    }
  }

  return {
    booking_id: input.bookingId,
    ...(payer_id ? { payer_id } : {}),
    ...(due_on ? { due_on } : {}),
    ...(gross != null ? { gross } : {}),
    ...(retained != null ? { retained } : {}),
    is_iata_partner,
    confirm_from,
  };
}
