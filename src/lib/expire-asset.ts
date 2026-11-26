/**
 * Plan v1 — Points/vouchers that expire unused: loss = remaining cost.
 * Cap1 credits do not expire for now (use void_credit). Never invent basis.
 */
import { assetUnit } from '@/lib/asset-units';

export const EXPIRE_ASSET_REASON =
  'Unused balance expired. Remaining acquisition cost is recorded as a loss.';

export function isCap1CreditAsset(asset: { kind?: string | null } | null | undefined): boolean {
  return /capital\s*one/i.test(String(asset?.kind || ''));
}

/** Cap1 credits: Plan says they do not expire for now — expire UI stays off. */
export function canExpireAsset(asset: {
  kind?: string | null;
  balance?: number | null;
  ownership?: string | null;
} | null | undefined): boolean {
  if (!asset) return false;
  if (isCap1CreditAsset(asset)) return false;
  if (asset.ownership && asset.ownership !== 'Padova') return false;
  return Number(asset.balance ?? 0) > 0;
}

/**
 * Form defaults for expire_asset. Quantity display matches command-form quantity fields
 * (dollars for money units; whole units for points/count). Loss basis stays Unknown when null.
 */
export function buildExpireAssetDefaults(asset: {
  id: string;
  balance?: number | null;
  remaining_basis?: number | null;
  unit?: string | null;
  kind?: string | null;
}): {
  asset_id: string;
  quantity?: string;
  reason: string;
  /** Integer cents when known — for UI copy only; never invent $0. */
  loss_basis_cents: number | null;
} {
  const bal = asset.balance == null ? null : Number(asset.balance);
  const unit = assetUnit({ unit: asset.unit, kind: asset.kind });
  let quantity: string | undefined;
  if (bal != null && Number.isFinite(bal) && bal > 0) {
    quantity = unit === 'money' ? (bal / 100).toFixed(2) : String(Math.trunc(bal));
  }
  const basisRaw = asset.remaining_basis;
  const loss_basis_cents =
    basisRaw == null
      ? null
      : Number.isFinite(Number(basisRaw))
        ? Math.trunc(Number(basisRaw))
        : null;
  return {
    asset_id: asset.id,
    ...(quantity != null ? { quantity } : {}),
    reason: EXPIRE_ASSET_REASON,
    loss_basis_cents,
  };
}

export function expireAssetLossLabel(
  lossBasisCents: number | null | undefined,
  formatMoney: (cents: number) => string,
): string {
  if (lossBasisCents == null) return 'Loss: remaining cost Unknown (not $0)';
  return `Loss: ${formatMoney(lossBasisCents)} (remaining cost)`;
}
