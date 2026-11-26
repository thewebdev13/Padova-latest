/**
 * Plan v1 — Points transfer / buy with bonus.
 * Whole acquisition cost spreads over all points received (e.g. 100k + 30% → 130k).
 * Never invent quantities or rates; blank stays blank.
 */

/** bonus_bps: 3000 = 30%. Returns whole points received, or null if inputs invalid. */
export function pointsReceivedWithBonus(
  quantitySent: number,
  bonusBps: number,
): number | null {
  if (!Number.isInteger(quantitySent) || quantitySent <= 0) return null;
  if (!Number.isInteger(bonusBps) || bonusBps < 0 || bonusBps > 100000) return null;
  // received = sent * (10000 + bonus_bps) / 10000 — must be exact whole points.
  const num = BigInt(quantitySent) * BigInt(10000 + bonusBps);
  if (num % 10000n !== 0n) return null;
  const received = Number(num / 10000n);
  if (!Number.isSafeInteger(received) || received < quantitySent) return null;
  return received;
}

/**
 * Matches finance expected_event Points transfer: sent × ratio × (1+bonus) / ratio_den.
 * Ratio omitted → 1:1. Bonus omitted → 0.
 */
export function expectedTransferQuantity(input: {
  quantitySent: number;
  bonusBps?: number | null;
  ratioNumerator?: number | null;
  ratioDenominator?: number | null;
}): number | null {
  const sent = input.quantitySent;
  if (!Number.isInteger(sent) || sent <= 0) return null;
  const bonus = input.bonusBps ?? 0;
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100000) return null;
  const hasNum = input.ratioNumerator != null && input.ratioNumerator !== 0;
  const hasDen = input.ratioDenominator != null && input.ratioDenominator !== 0;
  if (hasNum !== hasDen) return null;
  const num = hasNum ? Number(input.ratioNumerator) : 1;
  const den = hasDen ? Number(input.ratioDenominator) : 1;
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) return null;
  const product = BigInt(sent) * BigInt(num) * BigInt(10000 + bonus);
  const divisor = BigInt(den) * 10000n;
  if (product % divisor !== 0n) return null;
  const received = Number(product / divisor);
  if (!Number.isSafeInteger(received) || received <= 0) return null;
  return received;
}

/** Pro-rata remaining basis for quantity sent; null when Unknown. */
export function proportionalTransferBasisCents(
  remainingBasisCents: number | null | undefined,
  remainingQuantity: number | null | undefined,
  quantitySent: number,
): number | null {
  if (remainingBasisCents == null || remainingQuantity == null) return null;
  const basis = Math.trunc(Number(remainingBasisCents));
  const rem = Math.trunc(Number(remainingQuantity));
  if (!Number.isInteger(basis) || basis < 0) return null;
  if (!Number.isInteger(rem) || rem <= 0) return null;
  if (!Number.isInteger(quantitySent) || quantitySent <= 0 || quantitySent > rem) return null;
  if (quantitySent === rem) return basis;
  return Math.floor((basis * quantitySent) / rem);
}

/** Integer cents of basis per point (floor); null when unknown / incomplete. */
export function transferLotCostPerPointCents(
  basisCents: number | null | undefined,
  quantityReceived: number,
): number | null {
  if (basisCents == null || !Number.isFinite(Number(basisCents))) return null;
  const basis = Math.trunc(Number(basisCents));
  if (!Number.isInteger(quantityReceived) || quantityReceived <= 0) return null;
  if (basis < 0) return null;
  return Math.floor(basis / quantityReceived);
}

export function transferBonusPlanHint(): string {
  return 'Plan: with a bonus (e.g. 100,000 + 30%), enter all points received. The whole cost spreads over that total — never invent the rate.';
}

export function formatCentsPerPoint(centsPerPoint: number | null): string {
  if (centsPerPoint == null) return 'Unknown ¢/pt';
  return `${centsPerPoint} ¢/pt`;
}

/** Live form summary when sent + received are known. */
export function transferSpreadSummary(input: {
  quantitySent: number;
  quantityReceived: number;
  remainingBasisCents?: number | null;
  remainingQuantity?: number | null;
  feesCents?: number;
}): string | null {
  const { quantitySent, quantityReceived } = input;
  if (
    !Number.isInteger(quantitySent) ||
    quantitySent <= 0 ||
    !Number.isInteger(quantityReceived) ||
    quantityReceived <= 0
  )
    return null;
  const bonusPts = quantityReceived - quantitySent;
  const bonusNote =
    bonusPts > 0
      ? ` (+${bonusPts.toLocaleString('en-US')} bonus pts)`
      : bonusPts === 0
        ? ' (no bonus)'
        : '';
  const moved = proportionalTransferBasisCents(
    input.remainingBasisCents,
    input.remainingQuantity,
    quantitySent,
  );
  const fees = input.feesCents ?? 0;
  const totalBasis = moved == null ? null : moved + (Number.isInteger(fees) && fees >= 0 ? fees : 0);
  const perPt = transferLotCostPerPointCents(totalBasis, quantityReceived);
  const costNote =
    totalBasis == null
      ? 'Cost basis Unknown — stays Unknown ≠ $0.'
      : `Cost ${formatUsdCents(totalBasis)} spreads → ${formatCentsPerPoint(perPt)}.`;
  return `${quantitySent.toLocaleString('en-US')} → ${quantityReceived.toLocaleString('en-US')}${bonusNote}. ${costNote}`;
}

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
