/**
 * Plan Phase 4 — trip group shared charges entered once at trip level.
 * Money stays on the posting booking; family view lists the shared lines.
 * Unknown amounts stay Incomplete ≠ invent $0.
 */

export type TripSharedCharge = {
  id: string;
  label: string;
  customer_amount_cents: number | null;
  cost_amount_cents: number | null;
  posted_booking_id: string;
  posted_booking_code?: string;
  charge_id?: string;
  funding_id?: string;
  effective_on: string;
  note?: string;
  hidden?: boolean;
};

type OpLike = Record<string, unknown> | null | undefined;

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asList(raw: unknown): TripSharedCharge[] {
  if (!Array.isArray(raw)) return [];
  const out: TripSharedCharge[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || '').trim();
    const label = String(r.label || '').trim();
    const posted_booking_id = String(r.posted_booking_id || '').trim();
    const effective_on = String(r.effective_on || '').trim();
    if (!id || !label || !posted_booking_id) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_on)) continue;
    out.push({
      id,
      label: label.slice(0, 200),
      customer_amount_cents: asCents(r.customer_amount_cents),
      cost_amount_cents: asCents(r.cost_amount_cents),
      posted_booking_id,
      ...(r.posted_booking_code
        ? { posted_booking_code: String(r.posted_booking_code).slice(0, 40) }
        : {}),
      ...(r.charge_id ? { charge_id: String(r.charge_id) } : {}),
      ...(r.funding_id ? { funding_id: String(r.funding_id) } : {}),
      effective_on,
      ...(r.note ? { note: String(r.note).slice(0, 2000) } : {}),
      ...(r.hidden ? { hidden: true } : {}),
    });
  }
  return out;
}

export function tripSharedCharges(op: OpLike): TripSharedCharge[] {
  if (!op || typeof op !== 'object') return [];
  return asList((op as Record<string, unknown>).trip_shared_charges);
}

export function visibleTripSharedCharges(op: OpLike): TripSharedCharge[] {
  return tripSharedCharges(op).filter((c) => !c.hidden);
}

/** Deduped list across a trip family (newest effective_on first). */
export function collectTripSharedChargesFromFamily(
  bookings: Array<{
    id: string;
    code?: string | null;
    itinerary?: { operational_entry?: OpLike } | null;
  }>,
): TripSharedCharge[] {
  const byId = new Map<string, TripSharedCharge>();
  for (const b of bookings) {
    const op = b.itinerary?.operational_entry;
    for (const c of visibleTripSharedCharges(op)) {
      if (!byId.has(c.id)) {
        byId.set(c.id, {
          ...c,
          posted_booking_code: c.posted_booking_code || String(b.code || '') || undefined,
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(b.effective_on).localeCompare(String(a.effective_on)),
  );
}

export function appendTripSharedCharge(
  op: OpLike,
  charge: TripSharedCharge,
): Record<string, unknown> {
  const base =
    op && typeof op === 'object' ? { ...(op as Record<string, unknown>) } : {};
  const existing = tripSharedCharges(base);
  return {
    ...base,
    trip_shared_charges: [...existing.filter((c) => c.id !== charge.id), charge],
  };
}

export function tripSharedChargeSummary(c: TripSharedCharge): string {
  const parts = [c.label];
  if (c.customer_amount_cents == null) parts.push('customer Unknown');
  else parts.push(`customer $${(c.customer_amount_cents / 100).toFixed(2)}`);
  if (c.cost_amount_cents == null) parts.push('cost Unknown');
  else parts.push(`cost $${(c.cost_amount_cents / 100).toFixed(2)}`);
  if (c.posted_booking_code) parts.push(`on ${c.posted_booking_code}`);
  return parts.join(' · ');
}

/** Prefix for charge/funding labels when trip-shared. */
export function tripSharedExtraLabel(label: string): string {
  const s = String(label || '').trim();
  if (!s) return 'Trip shared';
  if (/^Trip shared\b/i.test(s)) return s;
  return `Trip shared · ${s}`;
}
