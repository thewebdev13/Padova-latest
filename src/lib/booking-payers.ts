/**
 * Plan v1 — many people can pay for one booking.
 * Authorized third-party payers are explicit (authorize_payer); billed customer always can.
 * Never invent payers or amounts.
 */

export type AuthorizedPayer = {
  party_id: string;
  name: string;
  reason: string;
  command_id?: string | null;
};

export function normalizeAuthorizedPayers(
  rows: Array<{
    party_id?: unknown;
    name?: unknown;
    reason?: unknown;
    command_id?: unknown;
  }>,
): AuthorizedPayer[] {
  const out: AuthorizedPayer[] = [];
  for (const r of rows) {
    const party_id = String(r.party_id || '').trim();
    const name = String(r.name || '').trim();
    if (!party_id || !name) continue;
    out.push({
      party_id,
      name: name.slice(0, 200),
      reason: String(r.reason || '').trim().slice(0, 2000),
      command_id: r.command_id != null ? String(r.command_id) : null,
    });
  }
  return out;
}

export function authorizedPayersEmptyHint(): string {
  return 'Only the billed customer can pay until another payer is authorized.';
}

export function formatAuthorizedPayerLine(p: AuthorizedPayer): string {
  return p.reason ? `${p.name} · ${p.reason}` : p.name;
}
