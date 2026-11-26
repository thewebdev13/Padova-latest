/**
 * Plan Phase 3 — voucher statuses:
 * held → partly used → used | sold | expired.
 * Unknown opening with remaining balance stays held (never invent face).
 */

export const VOUCHER_LEDGER_STATUSES = [
  'held',
  'partly used',
  'used',
  'sold',
  'expired',
] as const;
export type VoucherLedgerStatus = (typeof VOUCHER_LEDGER_STATUSES)[number];

export function isVoucherAsset(kind: string | null | undefined): boolean {
  const k = String(kind || '').trim();
  if (!k) return false;
  if (k === 'Capital One credit') return false;
  return /voucher|airline credit|hotel credit|gift card/i.test(k) || k === 'Voucher';
}

function asQty(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive Plan voucher status from remaining face, opening, sales, and expire flag.
 * Priority: expired → sold → used → partly used → held.
 */
export function voucherLedgerStatus(input: {
  kind?: string | null;
  balance?: unknown;
  opening_quantity?: unknown;
  /** True when expire_asset (or equivalent) was posted. */
  expired?: boolean;
  /** Quantity sold (sum of sale movements) when known. */
  sold_quantity?: unknown;
}): VoucherLedgerStatus | null {
  if (!isVoucherAsset(input.kind)) return null;
  if (input.expired) return 'expired';

  const bal = asQty(input.balance);
  if (bal == null) return null;

  const sold = asQty(input.sold_quantity) ?? 0;
  if (bal <= 0) {
    if (sold > 0) return 'sold';
    return 'used';
  }

  const opening = asQty(input.opening_quantity);
  if (opening == null || opening <= 0) return 'held';
  if (bal < opening) return 'partly used';
  return 'held';
}

export function soldQuantityFromMovements(
  movements: Array<{ kind?: string; quantity?: number | null }>,
): number {
  let total = 0;
  for (const m of movements) {
    if (m.kind !== 'sale') continue;
    const q = asQty(m.quantity);
    if (q != null && q > 0) total += q;
  }
  return total;
}

export function isAssetExpired(
  movements: Array<{ kind?: string }>,
): boolean {
  return movements.some((m) => m.kind === 'expiration');
}
