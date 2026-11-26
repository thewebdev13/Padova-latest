/**
 * Plan v1 — Money Back void tracking (append-only on booking itinerary).
 * Voided ≠ denied (issuer refused) — voided means Padova cancelled the expected line.
 */

export type MoneyBackVoidTargetKind =
  | 'expected_primary'
  | 'expected_secondary'
  | 'standing_deal'
  | 'commission'
  | 'referral'
  | 'price_match';

export type MoneyBackVoidEntry = {
  target_kind: MoneyBackVoidTargetKind;
  target_id: string;
  reason: string;
  voided_at: string;
  voided_by?: string;
  command_id?: string;
};

export function listMoneyBackVoids(operational: unknown): MoneyBackVoidEntry[] {
  const entry = (operational ?? {}) as { money_back_voids?: unknown };
  if (!Array.isArray(entry.money_back_voids)) return [];
  return entry.money_back_voids.filter(
    (v): v is MoneyBackVoidEntry =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as MoneyBackVoidEntry).target_kind === 'string' &&
      typeof (v as MoneyBackVoidEntry).target_id === 'string',
  );
}

export function isMoneyBackVoided(
  operational: unknown,
  target_kind: MoneyBackVoidTargetKind,
  target_id: string,
): boolean {
  const id = String(target_id || '');
  if (!id) return false;
  return listMoneyBackVoids(operational).some(
    (v) => v.target_kind === target_kind && String(v.target_id) === id,
  );
}

export function appendMoneyBackVoid(
  operational: Record<string, unknown> | null | undefined,
  entry: MoneyBackVoidEntry,
): Record<string, unknown> {
  const base = { ...(operational ?? {}) };
  const prior = listMoneyBackVoids(base);
  if (prior.some((v) => v.target_kind === entry.target_kind && v.target_id === entry.target_id))
    throw new Error('This Money Back line is already voided');
  return {
    ...base,
    money_back_voids: [...prior, entry],
  };
}
