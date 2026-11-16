import { createHash } from 'node:crypto';

export type SourceRow = {
  workbook: string;
  tab: string;
  row: number;
  evidenceId: string;
  batch: string;
  cells: unknown;
  stableId?: string;
};
export type AcceptedMapping = {
  sourceKey: string;
  fingerprint: string;
  targetTable: string;
  targetId: string;
};
const stable = (value: any): any =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
export const sourceFingerprint = (cells: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(cells)))
    .digest('hex');
const scope = (row: SourceRow) => JSON.stringify([row.workbook, row.tab]);
export const sourceKey = (row: SourceRow) =>
  JSON.stringify([
    row.workbook,
    row.tab,
    row.stableId ? ['id', row.stableId] : ['locator', row.row],
  ]);

// Stable command ID is independent of capture time/content. Changed accepted
// content must be reviewed as a correction, never retried under a new event ID.
export function migrationCommandId(approvedEventIdentity: string) {
  const bytes = createHash('sha256')
    .update(`padova-approved-event:${approvedEventIdentity}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Planning only. Has no database handle, network or write-capable importer. */
export function planSourceDelta(
  previous: SourceRow[],
  current: SourceRow[],
  mappings: AcceptedMapping[] = [],
) {
  const index = (rows: SourceRow[]) => {
    const byKey = new Map<string, SourceRow[]>();
    for (const row of rows) byKey.set(sourceKey(row), [...(byKey.get(sourceKey(row)) ?? []), row]);
    return byKey;
  };
  const old = index(previous),
    next = index(current);
  const content = new Map<string, SourceRow[]>();
  for (const row of [...previous, ...current]) {
    const key = `${scope(row)}:${sourceFingerprint(row.cells)}`;
    content.set(key, [...(content.get(key) ?? []), row]);
  }
  const proposals = current.map((row) => {
    const key = sourceKey(row),
      fingerprint = sourceFingerprint(row.cells);
    const prior = old.get(key) ?? [],
      accepted = mappings.filter((m) => m.sourceKey === key);
    const sameContentElsewhere = (content.get(`${scope(row)}:${fingerprint}`) ?? []).some(
      (candidate) => sourceKey(candidate) !== key,
    );
    const targets = [...new Set(accepted.map((m) => `${m.targetTable}:${m.targetId}`))];
    let status: 'unchanged' | 'new_candidate' | 'changed_needs_review' | 'identity_needs_review';
    if (
      (next.get(key)?.length ?? 0) > 1 ||
      prior.length > 1 ||
      targets.length > 1 ||
      (!row.stableId && sameContentElsewhere)
    )
      status = 'identity_needs_review';
    else if (accepted.some((m) => m.fingerprint !== fingerprint)) status = 'changed_needs_review';
    else if (
      accepted.length ||
      (prior.length === 1 && sourceFingerprint(prior[0].cells) === fingerprint)
    )
      status = 'unchanged';
    else if (prior.length) status = 'changed_needs_review';
    else status = 'new_candidate';
    return {
      sourceKey: key,
      fingerprint,
      status,
      provenance: {
        workbook: row.workbook,
        tab: row.tab,
        row: row.row,
        evidenceId: row.evidenceId,
        batch: row.batch,
        stableId: row.stableId ?? null,
      },
      target:
        accepted.length === 1 ? { table: accepted[0].targetTable, id: accepted[0].targetId } : null,
      writeAuthorized: false as const,
    };
  });
  const missing = previous
    .filter((row) => !next.has(sourceKey(row)))
    .map((row) => ({
      sourceKey: sourceKey(row),
      evidenceId: row.evidenceId,
      status: 'missing_needs_review' as const,
      deleteAuthorized: false as const,
    }));
  return {
    proposals,
    missing,
    counts: {
      current: current.length,
      unchanged: proposals.filter((p) => p.status === 'unchanged').length,
      newCandidates: proposals.filter((p) => p.status === 'new_candidate').length,
      changed: proposals.filter((p) => p.status === 'changed_needs_review').length,
      identityReview: proposals.filter((p) => p.status === 'identity_needs_review').length,
      missing: missing.length,
    },
  };
}
