import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { planSourceDelta, type SourceRow, sourceKey } from '../src/lib/historical-delta';
import { comparableSourceCells } from '../src/lib/source-cell-comparison';
const root = process.argv[2];
if (!root) throw new Error('Supply the existing private full current-cells capture directory');
const prior = JSON.parse(await readFile('.data/historical-cutover/capture.json', 'utf8'));
const current = JSON.parse(await readFile(path.join(root, 'source-row-snapshots.json'), 'utf8'));
const files = new Map(prior.files.map((file: any) => [file.id, file]));
const previousRows: SourceRow[] = prior.evidence
  .filter((e: any) => e.evidence_class === 'live_sheet_snapshot')
  .map((e: any) => ({
    workbook: e.raw.source_spreadsheet_id,
    tab: e.raw.source_sheet,
    row: e.raw.source_row,
    evidenceId: e.id,
    batch: (files.get(e.file_id) as any)?.batch_id,
    cells: comparableSourceCells(e.raw.cells),
  }));
const currentRows: SourceRow[] = current.map((r: any) => ({
  workbook: r.workbook_id,
  tab: r.tab,
  row: r.row,
  evidenceId: `capture:${r.source_capture_file}:row:${r.row}`,
  batch: r.snapshot_id,
  cells: comparableSourceCells(r.raw_payload.values ?? []),
}));
for (const row of [...previousRows, ...currentRows])
  if (!row.workbook || !row.tab || !Number.isInteger(row.row) || !row.batch)
    throw new Error('Incomplete source provenance; do not infer identity');
const plan = planSourceDelta(previousRows, currentRows);
const scopes = [
  ...new Set([...previousRows, ...currentRows].map((r) => JSON.stringify([r.workbook, r.tab]))),
];
const byTab = scopes.map((scope) => {
  const [workbook, tab] = JSON.parse(scope);
  const before = previousRows.filter((r) => r.workbook === workbook && r.tab === tab),
    after = currentRows.filter((r) => r.workbook === workbook && r.tab === tab);
  const partial = planSourceDelta(before, after);
  return {
    workbook,
    tab,
    previousRows: before.length,
    currentRows: after.length,
    counts: partial.counts,
  };
});
const priorKeys = new Set(previousRows.map(sourceKey));
const report = {
  generatedAt: new Date().toISOString(),
  project: prior.project,
  previousCaptureAt: prior.identity.captured_at,
  currentSnapshot: path.basename(root),
  financialPostingsAuthorized: false,
  existingMappings: prior.mappings.length,
  existingReviews: prior.reviews.length,
  limitations: [
    'Value/formula/note comparison only; all original cell formatting, validation and full row payloads remain in the separate complete capture.',
    'Source coordinates are locators, not approved stable financial identities. New, changed, moved, repeated or missing rows require reconciliation.',
    'No financial totals, actual payments, ownership or cost classifications are inferred from these differences.',
    'These are populated source rows including headers/supporting rows, not migrated booking counts.',
    'Both sources remain active; rerun final live delta before cutover. No source, staging, review, mapping or live financial writes.',
  ],
  byTab,
  newLocators: currentRows
    .filter((r) => !priorKeys.has(sourceKey(r)))
    .map((r) => ({ workbook: r.workbook, tab: r.tab, row: r.row })),
  ...plan,
};
await writeFile(
  '.data/historical-cutover/current-source-delta.json',
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      previousSourceRows: previousRows.length,
      currentSourceRows: currentRows.length,
      counts: plan.counts,
      existingReviews: prior.reviews.length,
      existingMappings: prior.mappings.length,
      financialPostingsAuthorized: false,
      report: '.data/historical-cutover/current-source-delta.json',
    },
    null,
    2,
  ),
);
