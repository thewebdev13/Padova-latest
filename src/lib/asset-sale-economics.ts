/**
 * Plan Phase 3 — points/voucher sale: quantity, price received, cost taken,
 * and gain/loss. Unknown cost → Incomplete ≠ invent $0.
 */

export type AssetSaleEconomics = {
  quantity: number | null;
  proceeds_cents: number | null;
  cost_cents: number | null;
  /** Proceeds − cost when both known. */
  gain_loss_cents: number | null;
  incomplete: boolean;
  /** Plan voucher note when proceeds are below face (informational). */
  sold_below_face: boolean;
  result_label: 'Gain' | 'Loss' | 'Break even' | 'Incomplete';
};

function asInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function assetSaleEconomics(input: {
  quantity?: unknown;
  proceeds?: unknown;
  basis?: unknown;
  /** Optional face/opening for voucher “sold below face value” note. */
  face_cents?: unknown;
}): AssetSaleEconomics {
  const quantity = asInt(input.quantity);
  const proceeds = asInt(input.proceeds);
  const cost = asInt(input.basis);
  const face = asInt(input.face_cents);

  if (proceeds == null || cost == null) {
    return {
      quantity,
      proceeds_cents: proceeds,
      cost_cents: cost,
      gain_loss_cents: null,
      incomplete: true,
      sold_below_face: face != null && proceeds != null && proceeds < face,
      result_label: 'Incomplete',
    };
  }

  const gain_loss_cents = proceeds - cost;
  const result_label =
    gain_loss_cents > 0 ? 'Gain' : gain_loss_cents < 0 ? 'Loss' : 'Break even';

  return {
    quantity,
    proceeds_cents: proceeds,
    cost_cents: cost,
    gain_loss_cents,
    incomplete: false,
    sold_below_face: face != null && proceeds < face,
    result_label,
  };
}
