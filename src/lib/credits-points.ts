/**
 * Plan main screen — Credits and points:
 * balance per account and per batch, used/remaining, expiry, history (via asset detail).
 */

import { assetUnit } from './asset-units';
import { calendarBookingSharePath } from './travel-presentation';
import { isVoucherAsset } from './voucher-ledger';

/**
 * Pending transfer/reward → shareable booking URL.
 * Blank booking_id → null (never invents a link).
 */
export function expectedEventBookingSharePath(event: {
  booking_id?: string | null;
}): string | null {
  return calendarBookingSharePath(event.booking_id);
}

/** Cap1 / bank / airline credits, vouchers, and points/miles batches. */
export function isPlanCreditsOrPointsAsset(asset: {
  kind?: string | null;
  unit?: string | null;
  issuer?: string | null;
  name?: string | null;
}): boolean {
  if (isVoucherAsset(asset.kind)) return true;
  if (assetUnit(asset as { kind?: string; unit?: string }) === 'points') return true;
  const blob = [asset.kind, asset.issuer, asset.name]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  if (!blob.trim()) return false;
  return /point|mile|credit|voucher|cap\s*1|capital\s*one/.test(blob);
}

export function filterCreditsAndPointsAssets<T extends Parameters<typeof isPlanCreditsOrPointsAsset>[0]>(
  assets: T[],
): T[] {
  return assets.filter(isPlanCreditsOrPointsAsset);
}

/**
 * Plan Pending transfers & rewards search: kind · reference · status · booking · id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function expectedEventMatchesSearch(
  event: {
    id?: string | null;
    kind?: string | null;
    reference?: string | null;
    status?: string | null;
    booking_id?: string | null;
    notes?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    event.kind,
    event.reference,
    event.status,
    event.booking_id,
    event.notes,
    event.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/**
 * Plan Credits / Travel Assets search: name · issuer · kind · restrictions · id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function assetMatchesSearch(
  asset: {
    id?: string | null;
    name?: string | null;
    issuer?: string | null;
    kind?: string | null;
    restrictions?: string | null;
    ownership?: string | null;
    voucher_status?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    asset.name,
    asset.issuer,
    asset.kind,
    asset.restrictions,
    asset.ownership,
    asset.voucher_status,
    asset.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export const CREDITS_POINTS_PAGE = 'Credits & points' as const;
export const CREDITS_POINTS_SLUG = 'credits-points';
