import { readFile } from 'node:fs/promises';
import type { Actor } from './permissions';
import type { SQL } from './db';
import { travelerReviewRows } from './traveler-review';
export async function travelerReviewIndex(actor: Actor, local: boolean, db: SQL) {
  if (process.env.PADOVA_QA === '1') return null;
  if (actor.role !== 'OWNER' || !local) return null;
  try {
    const report = JSON.parse(await readFile('.data/traveler-reconciliation/result.json', 'utf8'));
    const events = (
      await db.query(
        "SELECT * FROM review_resolution_events WHERE source_key LIKE 'traveler-cell:%'",
      )
    ).rows;
    const rows = travelerReviewRows(report.held, events);
    return {
      uniqueNameCandidates: report.uniqueNameCandidates,
      ambiguousCells: report.ambiguousCells,
      splitCells: report.splitCells,
      identityMerges: report.identityMerges,
      remaining: rows.filter((r) => r.decision?.status !== 'Resolved').length,
      held: rows.map((r: any) => ({
        source_key: r.source_key,
        source_locator: {
          workbook_id: r.source.workbook_id,
          tab: r.source.tab,
          row: r.source.row,
          column: r.source.column,
          raw_text: r.source.raw_text,
          source_sha256: r.source.source_sha256,
          snapshot_id: r.source.snapshot_id,
        },
        decision: r.decision,
        raw: r.source.raw_text,
        workbook: r.source.workbook_id,
        tab: r.source.tab,
        row: r.source.row,
        column: r.source.column,
        reason: r.reason,
      })),
    };
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
