/**
 * Plan v1 — Money Back deduction (Sruly remittance / paid less).
 * Append-only on booking itinerary; never silent overwrite of commissions.gross/retained.
 */

import { isMoneyBackDenied } from './money-back-deny';
import { isMoneyBackVoided } from './money-back-void';

export type MoneyBackDeductionTargetKind = 'commission';

export type MoneyBackDeductionEntry = {
  target_kind: MoneyBackDeductionTargetKind;
  target_id: string;
  amount_cents: number;
  how_received: 'deducted';
  reason: string;
  deducted_at: string;
  deducted_by?: string;
  command_id?: string;
};

export function listMoneyBackDeductions(operational: unknown): MoneyBackDeductionEntry[] {
  const entry = (operational ?? {}) as { money_back_deductions?: unknown };
  if (!Array.isArray(entry.money_back_deductions)) return [];
  return entry.money_back_deductions.filter(
    (v): v is MoneyBackDeductionEntry =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as MoneyBackDeductionEntry).target_kind === 'string' &&
      typeof (v as MoneyBackDeductionEntry).target_id === 'string' &&
      Number.isSafeInteger(Number((v as MoneyBackDeductionEntry).amount_cents)) &&
      Number((v as MoneyBackDeductionEntry).amount_cents) > 0,
  );
}

export function moneyBackDeductedCents(
  operational: unknown,
  target_kind: MoneyBackDeductionTargetKind,
  target_id: string,
): number {
  const id = String(target_id || '');
  if (!id) return 0;
  return listMoneyBackDeductions(operational)
    .filter((v) => v.target_kind === target_kind && String(v.target_id) === id)
    .reduce((sum, v) => sum + Number(v.amount_cents), 0);
}

export function appendMoneyBackDeduction(
  operational: Record<string, unknown> | null | undefined,
  entry: MoneyBackDeductionEntry,
): Record<string, unknown> {
  if (!Number.isSafeInteger(entry.amount_cents) || entry.amount_cents <= 0)
    throw new Error('Deduction amount must be a positive whole-cent amount');
  const base = { ...(operational ?? {}) };
  if (isMoneyBackVoided(base, entry.target_kind, entry.target_id))
    throw new Error('Cannot deduct a voided Money Back line');
  if (isMoneyBackDenied(base, entry.target_kind, entry.target_id))
    throw new Error('Cannot deduct a denied Money Back line');
  const prior = listMoneyBackDeductions(base);
  return {
    ...base,
    money_back_deductions: [...prior, entry],
  };
}
