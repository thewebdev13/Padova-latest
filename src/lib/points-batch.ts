/**
 * Plan Phase 3 — points ledger batch: opening, used, remaining, ¢/pt.
 * Unknown opening/basis stays Incomplete — never invent $0 or rates.
 */

import { formatCentsPerPoint } from './points-transfer-bonus';
import { formatTradeRateLabel } from './trade-desk';

export type PointsBatchInput = {
  /** Whole points remaining (asset balance). */
  remaining?: number | null;
  /** Remaining cost basis in integer cents. */
  remaining_basis_cents?: number | null;
  /** Original batch size when known (opening_quantity / lots). */
  opening?: number | null;
};

export type PointsBatchSummary = {
  opening: number | null;
  used: number | null;
  remaining: number | null;
  remaining_basis_cents: number | null;
  /** Floor ¢/pt from remaining basis ÷ remaining qty when exact enough to show. */
  cents_per_point: number | null;
  incomplete: boolean;
};

function whole(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Derive used/remaining/¢/pt for one points batch. */
export function pointsBatchSummary(input: PointsBatchInput): PointsBatchSummary {
  const remaining = whole(input.remaining);
  const opening = whole(input.opening);
  const basisRaw = input.remaining_basis_cents;
  const basis =
    basisRaw == null || !Number.isFinite(Number(basisRaw))
      ? null
      : Math.trunc(Number(basisRaw));

  let used: number | null = null;
  let incomplete = false;
  if (opening != null && remaining != null) {
    used = opening - remaining;
    if (used < 0) {
      used = null;
      incomplete = true;
    }
  } else if (opening == null && remaining != null) {
    // Remaining known without opening — used Incomplete.
    incomplete = true;
  } else if (remaining == null) {
    incomplete = true;
  }

  let cents_per_point: number | null = null;
  if (basis != null && remaining != null && remaining > 0 && basis >= 0) {
    cents_per_point = Math.floor(basis / remaining);
  } else if (remaining != null && remaining > 0 && basis == null) {
    incomplete = true;
  }

  return {
    opening,
    used,
    remaining,
    remaining_basis_cents: basis,
    cents_per_point,
    incomplete,
  };
}

/** One-line card label, e.g. "40,000 used · 60,000 left · 1 ¢/pt". */
export function pointsBatchListLabel(
  summary: PointsBatchSummary,
  formatQty: (n: number) => string,
): string {
  const parts: string[] = [];
  if (summary.used != null) parts.push(`${formatQty(summary.used)} used`);
  else if (summary.incomplete) parts.push('Used Incomplete');
  if (summary.remaining != null) parts.push(`${formatQty(summary.remaining)} left`);
  else parts.push('Left Incomplete');
  if (summary.cents_per_point != null) parts.push(formatCentsPerPoint(summary.cents_per_point));
  else if (summary.remaining != null && summary.remaining > 0)
    parts.push(formatTradeRateLabel('Points', summary.remaining, summary.remaining_basis_cents));
  return parts.join(' · ');
}
