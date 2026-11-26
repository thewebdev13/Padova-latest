/**
 * Plan v1 — Money Back denied tracking (append-only on booking itinerary).
 * Denied = issuer/payer refused (≠ voided, which is Padova cancelled the expected line).
 */

import type { MoneyBackVoidTargetKind } from './money-back-void';
import { isMoneyBackVoided } from './money-back-void';

export type MoneyBackDenyTargetKind = MoneyBackVoidTargetKind;

export type MoneyBackDenialEntry = {
  target_kind: MoneyBackDenyTargetKind;
  target_id: string;
  reason: string;
  denied_at: string;
  denied_by?: string;
  command_id?: string;
};

export function listMoneyBackDenials(operational: unknown): MoneyBackDenialEntry[] {
  const entry = (operational ?? {}) as { money_back_denials?: unknown };
  if (!Array.isArray(entry.money_back_denials)) return [];
  return entry.money_back_denials.filter(
    (v): v is MoneyBackDenialEntry =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as MoneyBackDenialEntry).target_kind === 'string' &&
      typeof (v as MoneyBackDenialEntry).target_id === 'string',
  );
}

export function isMoneyBackDenied(
  operational: unknown,
  target_kind: MoneyBackDenyTargetKind,
  target_id: string,
): boolean {
  const id = String(target_id || '');
  if (!id) return false;
  return listMoneyBackDenials(operational).some(
    (v) => v.target_kind === target_kind && String(v.target_id) === id,
  );
}

export function appendMoneyBackDenial(
  operational: Record<string, unknown> | null | undefined,
  entry: MoneyBackDenialEntry,
): Record<string, unknown> {
  const base = { ...(operational ?? {}) };
  if (isMoneyBackVoided(base, entry.target_kind, entry.target_id))
    throw new Error('This Money Back line is already voided; denied is a separate outcome');
  const prior = listMoneyBackDenials(base);
  if (prior.some((v) => v.target_kind === entry.target_kind && v.target_id === entry.target_id))
    throw new Error('This Money Back line is already denied');
  return {
    ...base,
    money_back_denials: [...prior, entry],
  };
}
