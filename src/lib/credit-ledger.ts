/**
 * Plan v1 — Capital One credits ledger statuses.
 * held → partly used → used; voided when itinerary cancel voids unused credit.
 * Unknown opening stays incomplete — never invent face = remaining.
 */

export const CREDIT_LEDGER_STATUSES = ['held', 'partly used', 'used', 'voided'] as const;
export type CreditLedgerStatus = (typeof CREDIT_LEDGER_STATUSES)[number];

export function isCapitalOneCredit(kind: string | null | undefined): boolean {
  return String(kind || '').trim() === 'Capital One credit';
}

/** Derive Plan credit status from remaining face + opening + void flag. */
export function creditLedgerStatus(input: {
  kind?: string | null;
  balance: number | null | undefined;
  opening_quantity?: number | null;
  voided?: boolean;
}): CreditLedgerStatus | null {
  if (!isCapitalOneCredit(input.kind)) return null;
  if (input.voided) return 'voided';
  const bal = input.balance;
  if (bal == null || !Number.isFinite(bal)) return null;
  if (bal <= 0) return 'used';
  const opening = input.opening_quantity;
  if (opening == null || !Number.isFinite(opening) || opening <= 0) return 'held';
  if (bal < opening) return 'partly used';
  return 'held';
}

export function openingQuantityFromMovements(
  movements: Array<{ kind?: string; quantity?: number | null }>,
): number | null {
  let total = 0;
  let saw = false;
  for (const m of movements) {
    if (m.kind !== 'earned_credit' && m.kind !== 'acquisition' && m.kind !== 'historical_opening')
      continue;
    const q = m.quantity;
    if (q == null || !Number.isFinite(Number(q))) return null;
    total += Number(q);
    saw = true;
  }
  return saw ? total : null;
}

export function isCreditVoided(
  movements: Array<{ kind?: string }>,
): boolean {
  return movements.some((m) => m.kind === 'void' || m.kind === 'credit_void');
}

/** Sum remaining Cap1 face on one account profile (exact cents). */
export function profileCreditBalanceCents(
  links: Array<{ profile_id: string; asset_id: string }>,
  assets: Array<{
    id: string;
    kind?: string | null;
    balance?: number | null;
    voided?: boolean;
  }>,
  profileId: string,
): { balance_cents: number; incomplete: boolean; credit_count: number } {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  let balance = 0;
  let incomplete = false;
  let count = 0;
  for (const link of links) {
    if (link.profile_id !== profileId) continue;
    const asset = assetById.get(link.asset_id);
    if (!asset || !isCapitalOneCredit(asset.kind)) continue;
    if (asset.voided) continue;
    count += 1;
    if (asset.balance == null || !Number.isFinite(Number(asset.balance))) {
      incomplete = true;
      continue;
    }
    balance += Number(asset.balance);
  }
  return { balance_cents: balance, incomplete, credit_count: count };
}

export type Cap1ProfileBalanceRow = {
  profile_id: string;
  name: string;
  provider: string | null;
  status: string | null;
  balance_cents: number | null;
  incomplete: boolean;
  credit_count: number;
};

/**
 * Plan Credits screen: balance per Cap1 account profile (~3).
 * Profiles with zero credits still listed when Active so staff see empty accounts.
 * Unknown asset balance → incomplete (never invent $0 for that credit).
 */
export function listCap1ProfileBalances(
  profiles: Array<{
    id?: string;
    name?: string | null;
    provider?: string | null;
    status?: string | null;
  }>,
  links: Array<{ profile_id: string; asset_id: string }>,
  assets: Array<{
    id: string;
    kind?: string | null;
    balance?: number | null;
    voided?: boolean;
  }>,
): Cap1ProfileBalanceRow[] {
  const rows: Cap1ProfileBalanceRow[] = [];
  for (const p of profiles) {
    if (!p.id) continue;
    const sum = profileCreditBalanceCents(links, assets, p.id);
    const active = !p.status || String(p.status) === 'Active';
    if (!active && sum.credit_count === 0) continue;
    // All Unknown remaining → null (never invent $0). Known zeros still count as $0.
    const balance_cents =
      sum.credit_count > 0 && sum.incomplete && sum.balance_cents === 0
        ? null
        : sum.balance_cents;
    rows.push({
      profile_id: p.id,
      name: String(p.name || 'Cap1 profile').trim() || 'Cap1 profile',
      provider: p.provider == null || p.provider === '' ? null : String(p.provider),
      status: p.status == null ? null : String(p.status),
      balance_cents,
      incomplete: sum.incomplete,
      credit_count: sum.credit_count,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Compact label for profile remaining (Incomplete when all Unknown). */
export function cap1ProfileBalanceLabel(
  row: Cap1ProfileBalanceRow,
  formatMoney: (cents: number) => string,
): string {
  if (row.balance_cents == null) return 'Incomplete';
  const base = formatMoney(row.balance_cents);
  return row.incomplete ? `${base} · Incomplete` : base;
}

/**
 * Plan Credits: filter batches to one Cap1 profile.
 * Blank / All → show all; unknown profile id → empty set (never invent links).
 */
export function assetMatchesCap1ProfileFilter(
  assetId: string | null | undefined,
  profileFilter: string | null | undefined,
  links: ReadonlyArray<{ profile_id?: string | null; asset_id?: string | null }>,
): boolean {
  const pf = String(profileFilter || '').trim();
  if (!pf || pf === 'All') return true;
  const aid = String(assetId || '').trim();
  if (!aid) return false;
  return links.some(
    (l) => String(l.profile_id || '').trim() === pf && String(l.asset_id || '').trim() === aid,
  );
}

/** Toggle Cap1 profile filter: same id clears to All. */
export function toggleCap1ProfileFilter(current: string, clickedProfileId: string): string {
  const id = String(clickedProfileId || '').trim();
  if (!id) return current || 'All';
  return current === id ? 'All' : id;
}
