/**
 * Plan v1 — related bookings family tree.
 * Links: change/extension, rebooking, voucher chain, same trip. Money stays per booking;
 * linked view shows combined totals only when every linked amount is known (never invent $0).
 */

export const BOOKING_RELATION_KINDS = [
  'Change / extension',
  'Rebooking after cancel',
  'Voucher issued from',
  'Voucher used on',
  'Same trip',
  'Other',
] as const;

export type BookingRelationKind = (typeof BOOKING_RELATION_KINDS)[number];

export type BookingRelationRow = {
  id: string;
  from_booking_id: string;
  to_booking_id: string;
  kind: string;
  note?: string | null;
  voided_at?: string | null;
};

export type BookingRelationNode = {
  id: string;
  code: string;
  summary?: string;
  sale_cents: number | null;
  /** Supplier cost when permitted / known; null = Incomplete ≠ $0. */
  funding_cost_cents: number | null;
  reservation_status?: string;
};

export type BookingFamilyTree = {
  root_id: string;
  nodes: BookingRelationNode[];
  edges: Array<{
    id: string;
    from_booking_id: string;
    to_booking_id: string;
    kind: string;
    note: string;
  }>;
  combined_sale_cents: number | null;
  /** True when any linked sale is unknown. */
  combined_incomplete: boolean;
  combined_cost_cents: number | null;
  /** True when any linked cost is unknown (or cost not visible). */
  combined_cost_incomplete: boolean;
};

export function isActiveRelation(r: BookingRelationRow): boolean {
  return !r.voided_at;
}

/** Collect connected component of active links around root (undirected graph). */
function sumKnown(
  values: Array<number | null>,
): { total: number | null; incomplete: boolean } {
  let total = 0;
  let incomplete = false;
  let any = false;
  for (const v of values) {
    if (v == null) {
      incomplete = true;
      continue;
    }
    any = true;
    total += v;
  }
  if (incomplete || !any) return { total: null, incomplete: incomplete || values.length > 0 };
  return { total, incomplete: false };
}

export function buildBookingFamilyTree(input: {
  root_id: string;
  relations: BookingRelationRow[];
  bookings: Array<{
    id: string;
    code?: string;
    summary?: string;
    sale?: number | null;
    /** Null when unknown or not permitted to view. */
    funding_cost?: number | null;
    /** True when a funding line has unknown cost (Incomplete ≠ invent). */
    cost_incomplete?: boolean | null;
    reservation_status?: string;
  }>;
}): BookingFamilyTree {
  const active = input.relations.filter(isActiveRelation);
  const byId = new Map(input.bookings.map((b) => [b.id, b]));
  const adj = new Map<string, BookingRelationRow[]>();
  for (const r of active) {
    if (!adj.has(r.from_booking_id)) adj.set(r.from_booking_id, []);
    if (!adj.has(r.to_booking_id)) adj.set(r.to_booking_id, []);
    adj.get(r.from_booking_id)!.push(r);
    adj.get(r.to_booking_id)!.push(r);
  }

  const seen = new Set<string>();
  const queue = [input.root_id];
  seen.add(input.root_id);
  const edgeIds = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    for (const r of adj.get(id) ?? []) {
      edgeIds.add(r.id);
      const other = r.from_booking_id === id ? r.to_booking_id : r.from_booking_id;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }

  const nodes: BookingRelationNode[] = [...seen].map((id) => {
    const b = byId.get(id);
    const costIncomplete = Boolean(b?.cost_incomplete);
    const rawCost = b?.funding_cost == null ? null : Number(b.funding_cost);
    return {
      id,
      code: b?.code || id.slice(0, 8),
      summary: b?.summary,
      sale_cents: b?.sale == null ? null : Number(b.sale),
      funding_cost_cents: costIncomplete ? null : rawCost,
      reservation_status: b?.reservation_status,
    };
  });

  const edges = active
    .filter((r) => edgeIds.has(r.id))
    .map((r) => ({
      id: r.id,
      from_booking_id: r.from_booking_id,
      to_booking_id: r.to_booking_id,
      kind: r.kind,
      note: String(r.note || ''),
    }));

  const saleSum = sumKnown(nodes.map((n) => n.sale_cents));
  const costSum = sumKnown(nodes.map((n) => n.funding_cost_cents));

  return {
    root_id: input.root_id,
    nodes,
    edges,
    combined_sale_cents: saleSum.total,
    combined_incomplete: saleSum.incomplete,
    combined_cost_cents: costSum.total,
    combined_cost_incomplete: costSum.incomplete,
  };
}
