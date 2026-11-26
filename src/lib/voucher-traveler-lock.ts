/**
 * Plan v1 — optional voucher "locked to" traveler.
 * When set on a Padova voucher/credit (not Cap1 / not points), use only if that
 * person is the customer, an active traveler, or an authorized payer on the booking.
 */

const POINTS_LIKE = /points|miles|award/i;
const CAP1_LIKE = /capital\s*one|cap\s*1/i;

export function isTravelerLockedVoucher(asset: {
  ownership?: string | null;
  holder_id?: string | null;
  kind?: string | null;
}): boolean {
  if (String(asset.ownership || '') !== 'Padova') return false;
  if (!asset.holder_id) return false;
  const kind = String(asset.kind || '');
  if (POINTS_LIKE.test(kind)) return false;
  if (CAP1_LIKE.test(kind)) return false;
  return true;
}

export function voucherLockDisplayLabel(holderName: string | null | undefined): string {
  const name = String(holderName || '').trim() || 'Unknown traveler';
  return `Locked to ${name} — use only for this traveler`;
}
