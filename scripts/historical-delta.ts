import { readFile, writeFile } from 'node:fs/promises';
import { planSourceDelta, type SourceRow } from '../src/lib/historical-delta';

// Offline preparation using the existing SELECT-only capture. Does not import
// financial data or mutate staging/mappings/reviews/source workbooks.
const currentPath = process.argv[2] ?? '.data/historical-cutover/capture.json';
const previousPath = process.argv[3] ?? currentPath;
const current = JSON.parse(await readFile(currentPath, 'utf8'));
const previous =
  previousPath === currentPath ? current : JSON.parse(await readFile(previousPath, 'utf8'));
const rows = (capture: any): SourceRow[] => {
  const files = new Map(capture.files.map((f: any) => [f.id, f]));
  return capture.evidence
    .filter((e: any) => e.evidence_class === 'live_sheet_snapshot')
    .map((e: any) => {
      const r = e.raw,
        f = files.get(e.file_id) as any;
      if (!r.source_spreadsheet_id || !r.source_sheet || !Number.isInteger(r.source_row) || !f)
        throw new Error('Incomplete sheet provenance; do not infer source coordinates');
      return {
        workbook: r.source_spreadsheet_id,
        tab: r.source_sheet,
        row: r.source_row,
        cells: r.cells,
        evidenceId: e.id,
        batch: f.batch_id,
      };
    });
};
const plan = planSourceDelta(rows(previous), rows(current));
const report = {
  generatedAt: new Date().toISOString(),
  project: current.project,
  sourceCapturedAt: current.identity.captured_at,
  sameCaptureReplay: currentPath === previousPath,
  limitations: [
    'Working snapshot comparison only; not a financial import approval or final cutover reconciliation.',
    'Source-row locators are not approved identity keys. New/changed rows still require documented accounting mapping and primary evidence.',
    'Existing migration_mappings have no approved stable event-key uniqueness; future posting must lock/recheck mappings and use stable requests IDs atomically.',
    'Spreadsheets remain active. Refresh original bounded ranges read-only and compare again immediately before cutover.',
    'No financial totals are inferred from raw cell columns, legacy AI allocations, formulas or blank costs.',
  ],
  existingReviewCount: current.reviews.length,
  existingMappingCount: current.mappings.length,
  liveCounts: current.liveCounts,
  sourceProvenanceHash: current.provenanceHash,
  financialPostingsAuthorized: false,
  ...plan,
};
await writeFile('.data/historical-cutover/working-delta.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      sameCaptureReplay: report.sameCaptureReplay,
      counts: plan.counts,
      existingReviews: report.existingReviewCount,
      existingMappings: report.existingMappingCount,
      financialPostingsAuthorized: false,
      report: '.data/historical-cutover/working-delta.json',
    },
    null,
    2,
  ),
);
