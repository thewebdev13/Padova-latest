/**
 * Plan Phase 3 — booking cost-line kind labels + voucher note.
 * Kind: card payment, Cap1 credit used, points batch used, voucher used,
 * seller's agreed price, Sruly fee, other.
 * Voucher note: "paid with a previous voucher" so cost is never read as a mistake.
 */

import { isVoucherAsset } from '@/lib/voucher-ledger';

export type FundingCostLabelInput = {
  kind?: string | null;
  /** Linked travel-asset kind when known. */
  asset_kind?: string | null;
  notes?: string | null;
};

function looksLikeSrulyFee(kind: string, notes: string): boolean {
  const blob = `${kind} ${notes}`.toLowerCase();
  return (
    /\bsruly\s*fee\b/.test(blob) ||
    /\bgds\s*fee\b/.test(blob) ||
    /\bbooking\s*charge\b/.test(blob) ||
    /\b\$?50\s*\/?\s*pnr\b/.test(blob) ||
    /\bvoucher\s*fee\b/.test(blob)
  );
}

/**
 * Plan cost-line Kind label for a funding component.
 * Blank kind → Other (never invent a money amount).
 */
export function fundingCostKindLabel(input: FundingCostLabelInput): string {
  const kind = String(input.kind || '').trim();
  const assetKind = String(input.asset_kind || '').trim();
  const notes = String(input.notes || '');

  if (looksLikeSrulyFee(kind, notes)) return 'Sruly fee';

  // Linked asset kind wins when it clearly identifies Cap1 / points / voucher use.
  if (/capital one/i.test(assetKind) || /capital one/i.test(kind)) {
    return 'Cap1 credit used';
  }
  if (/^points$/i.test(assetKind) || /^points$/i.test(kind)) {
    return 'Points batch used';
  }
  if (
    isVoucherAsset(assetKind) ||
    isVoucherAsset(kind) ||
    /voucher|airline credit|hotel credit|gift card/i.test(kind)
  ) {
    return 'Voucher used';
  }

  const k = kind.toLowerCase();
  if (k === 'card') return 'Card payment';
  if (k === 'cash') return 'Cash payment';
  if (k === 'bank') return 'Bank payment';
  if (/seller/i.test(kind)) return "Seller's agreed price";

  return kind || 'Other';
}

/**
 * Plan voucher note when cost came from a prior voucher / credit asset.
 * Returns null when not a voucher line (blank ≠ invent).
 */
export function fundingVoucherNote(input: FundingCostLabelInput & { asset_id?: string | null }): string | null {
  if (fundingCostKindLabel(input) === 'Voucher used') {
    return 'Paid with a previous voucher';
  }
  if (input.asset_id && isVoucherAsset(input.asset_kind)) {
    return 'Paid with a previous voucher';
  }
  return null;
}
