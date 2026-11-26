/**
 * Plan: do not double-count — flag a payment line that looks repeated.
 * Heuristic only (same party · direction · amount · method · near date).
 * Never invents amounts; unknown amount/party skips matching.
 */

export type PaymentDuplicateInput = {
  id?: string | null;
  party_id?: string | null;
  direction?: string | null;
  current_amount?: unknown;
  amount?: unknown;
  method?: string | null;
  paid_on?: string | null;
};

const DEFAULT_DAY_WINDOW = 3;

function asCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function dayKey(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function dayDistance(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(Math.round((ta - tb) / 86_400_000));
}

function methodKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Returns payment id → peer ids that look like the same remittance entered twice.
 * Symmetric: if A matches B, both maps list each other.
 */
export function possibleDuplicatePaymentPeers(
  payments: PaymentDuplicateInput[],
  opts?: { dayWindow?: number },
): Map<string, string[]> {
  const window = opts?.dayWindow ?? DEFAULT_DAY_WINDOW;
  const peers = new Map<string, Set<string>>();
  const rows = payments
    .map((p) => {
      const id = String(p.id || '').trim();
      if (!id) return null;
      const party = String(p.party_id || '').trim();
      const direction = String(p.direction || '').trim().toLowerCase();
      const amount = asCents(p.current_amount ?? p.amount);
      const method = methodKey(p.method);
      const paid = dayKey(p.paid_on);
      if (!party || !direction || amount == null || !method || !paid) return null;
      return { id, party, direction, amount, method, paid };
    })
    .filter(Boolean) as Array<{
    id: string;
    party: string;
    direction: string;
    amount: number;
    method: string;
    paid: string;
  }>;

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.party !== b.party) continue;
      if (a.direction !== b.direction) continue;
      if (a.amount !== b.amount) continue;
      if (a.method !== b.method) continue;
      const dist = dayDistance(a.paid, b.paid);
      if (dist == null || dist > window) continue;
      if (!peers.has(a.id)) peers.set(a.id, new Set());
      if (!peers.has(b.id)) peers.set(b.id, new Set());
      peers.get(a.id)!.add(b.id);
      peers.get(b.id)!.add(a.id);
    }
  }

  const out = new Map<string, string[]>();
  for (const [id, set] of peers) {
    out.set(id, [...set].sort());
  }
  return out;
}

export function paymentLooksRepeated(
  paymentId: string,
  peers: Map<string, string[]> | ReadonlyMap<string, string[]>,
): boolean {
  const list = peers.get(paymentId);
  return Boolean(list && list.length > 0);
}

export function paymentLooksRepeatedLabel(peerCount: number): string {
  if (peerCount <= 0) return '';
  if (peerCount === 1) return 'Looks repeated';
  return `Looks repeated · ${peerCount} matches`;
}
