/**
 * Plan Phase 3 — cost-line settlement fields:
 * paid or unpaid, paid date, paid to.
 * Never invent $0: unknown cost / unknown settlement → Incomplete.
 */

export type FundingSettlementStatus = 'Paid' | 'Unpaid' | 'Incomplete';

export type FundingSettlement = {
  status: FundingSettlementStatus;
  /** ISO date (YYYY-MM-DD) when known. */
  paid_on: string | null;
  /** Party / payee label when known. */
  paid_to: string | null;
};

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asDay(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Derive Plan cost-line paid/unpaid from funding + obligation facts.
 * Inventory uses (Padova asset, no seller payable) count as Paid on the use date.
 */
export function fundingCostLineSettlement(input: {
  cost_cents?: unknown;
  reversed?: boolean | null;
  asset_id?: string | null;
  /** Explicit Padova inventory use (no supplier obligation). */
  inventory_use?: boolean | null;
  seller_name?: string | null;
  effective_on?: string | null;
  obligation_amount_cents?: unknown;
  obligation_remaining_cents?: unknown;
  /** Latest supplier payment date settling this obligation. */
  paid_on?: string | null;
}): FundingSettlement {
  const paid_to = String(input.seller_name || '').trim() || null;
  const effective = asDay(input.effective_on);
  const paidOn = asDay(input.paid_on);

  if (input.reversed) {
    return { status: 'Incomplete', paid_on: null, paid_to };
  }

  const cost = asCents(input.cost_cents);
  if (cost == null) {
    return { status: 'Incomplete', paid_on: null, paid_to };
  }

  if (input.inventory_use === true) {
    return { status: 'Paid', paid_on: effective, paid_to: paid_to || 'Inventory' };
  }

  const remaining = asCents(input.obligation_remaining_cents);
  const obligationAmount = asCents(input.obligation_amount_cents);

  if (remaining != null) {
    if (remaining <= 0) {
      return { status: 'Paid', paid_on: paidOn || effective, paid_to };
    }
    return { status: 'Unpaid', paid_on: null, paid_to };
  }

  if (obligationAmount != null) {
    // Obligation known but remaining unknown → Incomplete ≠ invent paid.
    return { status: 'Incomplete', paid_on: null, paid_to };
  }

  // No supplier obligation row.
  if (cost === 0) {
    return { status: 'Paid', paid_on: effective, paid_to };
  }

  if (input.asset_id && !paid_to) {
    // Padova stock use without a seller payable.
    return { status: 'Paid', paid_on: effective, paid_to: 'Inventory' };
  }

  if (paid_to) {
    return { status: 'Unpaid', paid_on: null, paid_to };
  }

  return { status: 'Incomplete', paid_on: null, paid_to: null };
}

export function fundingSettlementBadgeTone(
  status: FundingSettlementStatus,
): 'green' | 'amber' | 'gray' {
  if (status === 'Paid') return 'green';
  if (status === 'Unpaid') return 'amber';
  return 'gray';
}

/** One-line Plan label: Paid · 2026-11-26 · Acme Seller */
export function fundingSettlementSummary(s: FundingSettlement): string {
  const parts: string[] = [s.status];
  if (s.status === 'Paid' && s.paid_on) parts.push(s.paid_on);
  if (s.paid_to) parts.push(s.paid_to);
  return parts.join(' · ');
}
