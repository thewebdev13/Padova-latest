/**
 * Plan Points batch: owning account name (with program / masked ref when known).
 * Blank → null — never invent an account.
 */

export type PointsOwningAccount = {
  id: string;
  name: string;
  program_name?: string | null;
  masked_reference?: string | null;
  ownership?: string | null;
};

/** Display label for the owning account on a points batch. */
export function pointsOwningAccountLabel(
  account: PointsOwningAccount | null | undefined,
): string | null {
  if (!account?.name?.trim()) return null;
  const parts = [account.name.trim()];
  const program = String(account.program_name || '').trim();
  if (program) parts.push(program);
  const mask = String(account.masked_reference || '').trim();
  if (mask) parts.push(`····${mask}`);
  return parts.join(' · ');
}
