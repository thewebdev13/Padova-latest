/**
 * Plan Phase 3 — voucher / credit chain view (read-only).
 * Story: original booking → price match → this asset → uses/sales → net.
 * Plan example net: price-match credit (+ when issued) + sale vs face (− when sold below face).
 * Unknown stays null — never invent money.
 */

export type AssetChainStep = {
  kind: 'source_booking' | 'price_match' | 'sibling_asset' | 'use' | 'sale' | 'net';
  label: string;
  booking_id?: string | null;
  asset_id?: string | null;
  amount_cents?: number | null;
  date?: string | null;
  note?: string;
};

export type AssetChainInput = {
  asset: {
    id: string;
    name?: string;
    kind?: string;
    reference?: string | null;
    source_booking_id?: string | null;
    remaining_basis?: number | null;
    balance?: number | null;
    /** Opening face (USD cents) for sale-vs-face; blank → Incomplete ≠ invent. */
    face_cents?: number | null;
  };
  source_booking?: { id: string; code?: string; summary?: string } | null;
  price_matches?: Array<{
    asset_id?: string | null;
    reference?: string | null;
    status?: string | null;
    credit?: number | null;
    amount?: number | null;
    expected_credit?: number | null;
    date?: string | null;
    recorded_on?: string | null;
  }>;
  siblings?: Array<{ id?: string; name?: string; kind?: string; created_at?: string }>;
  uses?: Array<{
    booking_id?: string | null;
    code?: string | null;
    quantity?: number | null;
    basis?: number | null;
    effective_on?: string | null;
    kind?: string | null;
  }>;
  sales?: Array<{
    id?: string;
    buyer?: string;
    proceeds?: number | null;
    received?: number | null;
    quantity?: number | null;
    effective_on?: string | null;
  }>;
};

export type AssetChain = {
  steps: AssetChainStep[];
  net_cents: number | null;
  incomplete: boolean;
};

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Build chronological story for one voucher/credit without inventing amounts. */
export function buildAssetChain(input: AssetChainInput): AssetChain {
  const steps: AssetChainStep[] = [];
  let incomplete = false;
  const a = input.asset;
  const face = asCents(a.face_cents);

  if (input.source_booking?.id || a.source_booking_id) {
    const id = input.source_booking?.id || a.source_booking_id!;
    steps.push({
      kind: 'source_booking',
      label: input.source_booking
        ? `${input.source_booking.code || id}${input.source_booking.summary ? ` · ${input.source_booking.summary}` : ''}`
        : 'Source booking',
      booking_id: id,
    });
  }

  let priceMatchTotal = 0;
  let priceMatchKnown = true;
  let hasPriceMatch = false;
  const matches = (input.price_matches ?? []).filter((m) => {
    if (m.asset_id && m.asset_id === a.id) return true;
    if (a.reference && m.reference && String(m.reference) === String(a.reference)) return true;
    return false;
  });
  for (const m of matches) {
    hasPriceMatch = true;
    const amount =
      asCents(m.credit) ?? asCents(m.amount) ?? asCents(m.expected_credit) ?? null;
    if (amount == null) {
      incomplete = true;
      priceMatchKnown = false;
    } else priceMatchTotal += amount;
    steps.push({
      kind: 'price_match',
      label: `Price match${m.status ? ` · ${m.status}` : ''}`,
      booking_id: a.source_booking_id,
      asset_id: a.id,
      amount_cents: amount,
      date: m.date || m.recorded_on || null,
      note: amount != null ? 'Counted when issued' : undefined,
    });
  }

  for (const s of input.siblings ?? []) {
    if (!s.id || s.id === a.id) continue;
    steps.push({
      kind: 'sibling_asset',
      label: `${s.kind || 'Asset'} · ${s.name || s.id.slice(0, 8)}`,
      asset_id: s.id,
      date: s.created_at ? String(s.created_at).slice(0, 10) : null,
      note: 'Same source booking',
    });
  }

  for (const u of input.uses ?? []) {
    if (!u.booking_id && !/use|spend|fund|consume/i.test(String(u.kind || ''))) continue;
    if (!u.booking_id) continue;
    steps.push({
      kind: 'use',
      label: `Used on ${u.code || 'booking'}`,
      booking_id: u.booking_id,
      amount_cents: asCents(u.basis),
      date: u.effective_on || null,
      note: u.quantity != null ? `Qty ${u.quantity}` : undefined,
    });
  }

  let saleVsFaceTotal = 0;
  let saleVsFaceKnown = true;
  let hasSale = false;
  for (const sale of input.sales ?? []) {
    hasSale = true;
    const proceeds = asCents(sale.proceeds);
    const soldFace = asCents(sale.quantity) ?? face;
    let vsFace: number | null = null;
    let note: string | undefined =
      sale.received != null &&
      sale.proceeds != null &&
      Number(sale.received) < Number(sale.proceeds)
        ? 'Receipt incomplete'
        : undefined;

    if (proceeds == null || soldFace == null) {
      incomplete = true;
      saleVsFaceKnown = false;
    } else {
      vsFace = proceeds - soldFace;
      saleVsFaceTotal += vsFace;
      if (vsFace < 0) {
        note = note
          ? `${note} · sold below face value`
          : 'sold below face value';
      } else if (vsFace > 0) {
        note = note ? `${note} · sold above face value` : 'sold above face value';
      }
    }

    steps.push({
      kind: 'sale',
      label: `Sold${sale.buyer ? ` to ${sale.buyer}` : ''}`,
      amount_cents: vsFace,
      date: sale.effective_on || null,
      note:
        vsFace == null && proceeds != null
          ? [note, `Proceeds known · face Unknown`].filter(Boolean).join(' · ')
          : note,
    });
  }

  // Plan net: price-match credits (when issued) + sale vs face. Never invent.
  let net: number | null = null;
  if (hasSale) {
    if (priceMatchKnown && saleVsFaceKnown) {
      net = (hasPriceMatch ? priceMatchTotal : 0) + saleVsFaceTotal;
    } else {
      incomplete = true;
      net = null;
    }
  } else if (hasPriceMatch) {
    net = priceMatchKnown ? priceMatchTotal : null;
    if (!priceMatchKnown) incomplete = true;
  } else {
    const basis = asCents(a.remaining_basis);
    if (basis != null) net = -basis;
    else if (asCents(a.balance) != null && asCents(a.balance)! > 0) incomplete = true;
  }

  steps.push({
    kind: 'net',
    label: incomplete
      ? 'Chain result (incomplete)'
      : hasSale
        ? 'Chain net (price match + sale vs face)'
        : hasPriceMatch
          ? 'Chain net (price match issued)'
          : 'Remaining cost basis',
    amount_cents: net,
    asset_id: a.id,
  });

  return { steps, net_cents: net, incomplete };
}
