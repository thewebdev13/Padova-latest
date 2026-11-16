import { z } from 'zod';
import type { Row } from './db';
// Shared formatting/validation only. No database runtime may enter a client bundle.
export const unitSchema = z.enum(['money', 'points', 'count']);
export function assetUnit(asset: Row) {
  return unitSchema.parse(
    asset.unit ?? (/point|mile/i.test(asset.kind ?? '') ? 'points' : 'money'),
  );
}
export function formatQuantity(
  value: number | string | null | undefined,
  unit: string,
  label?: string,
) {
  if (value == null) return 'Unknown';
  const amount = Number(value);
  if (unit === 'money' || unit === 'cents')
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      amount / 100,
    );
  return `${amount.toLocaleString('en-US')} ${label ?? (unit === 'count' ? 'certificate(s)' : 'points')}`;
}
export function refundQuantityUnit(component: Row) {
  // Outside suppliers owe Padova an agreed monetary recovery, not their own points/certificates.
  return component.asset_id && component.asset_ownership === 'Padova'
    ? assetUnit({ unit: component.unit, kind: component.asset_kind ?? component.kind })
    : 'money';
}
