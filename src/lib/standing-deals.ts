/**
 * Plan v1 — standing deals on a person/partner (e.g. Marriott extra 10% cash).
 * Stored on party.details; seeded onto new bookings as expected Money Back.
 * Amount Unknown when basis facts missing — never invent $0.
 * ☐ Cadence (per booking vs periodic) still Owner-open — we only seed expected lines.
 */

export const STANDING_DEAL_BASES = ['sale_ex_tax', 'sale'] as const;
export type StandingDealBasis = (typeof STANDING_DEAL_BASES)[number];

export const STANDING_DEAL_PRODUCTS = ['Hotel', 'Flight', 'Car', 'Other', 'Any'] as const;
export type StandingDealProduct = (typeof STANDING_DEAL_PRODUCTS)[number];

export type StandingDeal = {
  id: string;
  label: string;
  rate_bps: number;
  basis: StandingDealBasis;
  /** Restrict to product; Any = all products. */
  product: StandingDealProduct;
  payer_party_id?: string | null;
  active: boolean;
};

export type StandingDealExpectation = {
  deal_id: string;
  label: string;
  rate_bps: number;
  basis: StandingDealBasis;
  amount_cents: number | null;
  payer_party_id?: string | null;
  notes: string;
};

const PRIMARY_ID = 'primary';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Parse party.details.standing_deals; invalid rows dropped (never invent). */
export function partyStandingDeals(party: {
  details?: { standing_deals?: unknown } | null;
} | null | undefined): StandingDeal[] {
  const raw = party?.details?.standing_deals;
  if (!Array.isArray(raw)) return [];
  const out: StandingDeal[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const rate = Number(row.rate_bps);
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) continue;
    const basis = STANDING_DEAL_BASES.includes(row.basis as StandingDealBasis)
      ? (row.basis as StandingDealBasis)
      : null;
    if (!basis) continue;
    const product = STANDING_DEAL_PRODUCTS.includes(row.product as StandingDealProduct)
      ? (row.product as StandingDealProduct)
      : 'Any';
    const label = String(row.label || '').trim().slice(0, 200);
    if (!label) continue;
    out.push({
      id: String(row.id || PRIMARY_ID).slice(0, 64),
      label,
      rate_bps: rate,
      basis,
      product,
      payer_party_id: row.payer_party_id ? String(row.payer_party_id) : null,
      active: row.active !== false,
    });
  }
  return out;
}

export function activeStandingDealsForProduct(
  deals: StandingDeal[],
  product: string,
): StandingDeal[] {
  return deals.filter(
    (d) => d.active && (d.product === 'Any' || d.product === product),
  );
}

/** Exact % of basis; null when basis Unknown (never invent). */
export function standingDealAmountCents(
  rateBps: number,
  basisCents: number | null | undefined,
): number | null {
  if (basisCents == null || !Number.isFinite(basisCents) || !Number.isFinite(rateBps))
    return null;
  if (basisCents < 0 || rateBps < 0) return null;
  const numerator = BigInt(Math.trunc(basisCents)) * BigInt(Math.trunc(rateBps));
  if (numerator % 10000n !== 0n) return null;
  return Number(numerator / 10000n);
}

export function standingDealBasisCents(input: {
  basis: StandingDealBasis;
  saleCents: number | null | undefined;
  taxCents: number | null | undefined;
}): number | null {
  if (input.saleCents == null || !Number.isFinite(input.saleCents)) return null;
  if (input.basis === 'sale') return Math.trunc(input.saleCents);
  if (input.taxCents == null || !Number.isFinite(input.taxCents)) return null;
  const ex = Math.trunc(input.saleCents) - Math.trunc(input.taxCents);
  return ex < 0 ? null : ex;
}

export function buildStandingDealExpectations(input: {
  deals: StandingDeal[];
  product: string;
  saleCents: number | null | undefined;
  taxCents: number | null | undefined;
}): StandingDealExpectation[] {
  return activeStandingDealsForProduct(input.deals, input.product).map((d) => {
    const basisCents = standingDealBasisCents({
      basis: d.basis,
      saleCents: input.saleCents,
      taxCents: input.taxCents,
    });
    const amount = standingDealAmountCents(d.rate_bps, basisCents);
    return {
      deal_id: d.id,
      label: d.label,
      rate_bps: d.rate_bps,
      basis: d.basis,
      amount_cents: amount,
      payer_party_id: d.payer_party_id ?? null,
      notes:
        d.basis === 'sale_ex_tax'
          ? `${(d.rate_bps / 100).toFixed(d.rate_bps % 100 === 0 ? 0 : 2)}% of stay price excluding taxes`
          : `${(d.rate_bps / 100).toFixed(d.rate_bps % 100 === 0 ? 0 : 2)}% of sale`,
    };
  });
}

/** Upsert the single primary deal used by Edit profile (clearable). */
export function upsertPrimaryStandingDeal(
  existing: StandingDeal[],
  next: {
    label: string;
    rate_bps: number | null;
    basis: StandingDealBasis;
    product: StandingDealProduct;
    payer_party_id?: string | null;
  } | null,
): StandingDeal[] {
  const others = existing.filter((d) => d.id !== PRIMARY_ID);
  if (!next || next.rate_bps == null || !next.label.trim()) return others;
  return [
    {
      id: PRIMARY_ID,
      label: next.label.trim().slice(0, 200),
      rate_bps: next.rate_bps,
      basis: next.basis,
      product: next.product,
      payer_party_id: next.payer_party_id ?? null,
      active: true,
    },
    ...others,
  ];
}

export function formatStandingDealLabel(deal: StandingDeal): string {
  const pct =
    deal.rate_bps % 100 === 0
      ? `${deal.rate_bps / 100}%`
      : `${(deal.rate_bps / 100).toFixed(2)}%`;
  const basis =
    deal.basis === 'sale_ex_tax' ? 'sale excluding taxes' : 'sale';
  return `${deal.label} · ${pct} of ${basis}${deal.product !== 'Any' ? ` · ${deal.product}` : ''}`;
}

/** True when More Extra income draft fields are started (Unknown ≠ invent). */
export function entryExtraIncomeDraftStarted(input: {
  extra_income_label?: string | null;
  extra_income_percent?: string | number | null;
  extra_income_note?: string | null;
}): boolean {
  return Boolean(
    String(input.extra_income_label || '').trim() ||
      String(input.extra_income_percent ?? '').trim() ||
      String(input.extra_income_note || '').trim(),
  );
}

/**
 * Plan More: optional one-off extra income on New Booking (e.g. Marriott 10% cash).
 * Blank → null (never invent). Rate required when label/note started.
 */
export function normalizeEntryExtraIncomeDraft(input: {
  label?: string | null;
  percent?: string | number | null;
  basis?: string | null;
  note?: string | null;
  saleCents?: number | null;
  taxCents?: number | null;
  dealId?: string | null;
}): StandingDealExpectation | null {
  const label = String(input.label || '').trim();
  const note = String(input.note || '').trim();
  const percentRaw = String(input.percent ?? '').trim();
  if (!label && !percentRaw && !note) return null;
  if (!label) throw new Error('Extra income label is required when adding a line');
  if (!percentRaw) throw new Error('Extra income rate (%) is required');
  const percent = Number(percentRaw);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error('Extra income rate must be 0–100%');
  // Match decimalUnits / commission % → bps (2 decimal places).
  const rate_bps = Math.round(percent * 100);
  if (rate_bps < 0 || rate_bps > 10000) throw new Error('Extra income rate must be 0–100%');
  const basisRaw = String(input.basis || 'sale_ex_tax').trim();
  const basis = STANDING_DEAL_BASES.includes(basisRaw as StandingDealBasis)
    ? (basisRaw as StandingDealBasis)
    : 'sale_ex_tax';
  const basisCents = standingDealBasisCents({
    basis,
    saleCents: input.saleCents,
    taxCents: input.taxCents,
  });
  const amount_cents = standingDealAmountCents(rate_bps, basisCents);
  const pctLabel =
    rate_bps % 100 === 0
      ? `${rate_bps / 100}%`
      : `${(rate_bps / 100).toFixed(2)}%`;
  const basisNote =
    basis === 'sale_ex_tax'
      ? `${pctLabel} of stay price excluding taxes`
      : `${pctLabel} of sale`;
  return {
    deal_id: String(input.dealId || 'entry-more').slice(0, 64),
    label: label.slice(0, 200),
    rate_bps,
    basis,
    amount_cents,
    payer_party_id: null,
    notes: note ? `${basisNote} · ${note.slice(0, 500)}` : basisNote,
  };
}

/** Merge customer-seeded + More draft; More deal_id wins on collision. */
export function mergeStandingDealExpectations(
  seeded: StandingDealExpectation[],
  entry: StandingDealExpectation | null,
): StandingDealExpectation[] | undefined {
  if (!entry && !seeded.length) return undefined;
  if (!entry) return seeded.length ? seeded : undefined;
  const others = seeded.filter((d) => d.deal_id !== entry.deal_id);
  return [...others, entry];
}
