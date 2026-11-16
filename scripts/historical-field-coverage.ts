import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { populated, populatedPaths, classifySourceField } from '../src/lib/source-field-coverage';
const root = process.argv[2];
if (!root) throw new Error('Supply the existing private current-cells snapshot directory');
const manifest = JSON.parse(await readFile(path.join(root, 'capture-manifest.json'), 'utf8'));
if (manifest.results.some((r: any) => r.status !== 'captured'))
  throw new Error('Resolve incomplete source reads before declaring field coverage');
const sheets = new Map<string, any>();
const columnName = (index: number) => {
  let n = index + 1,
    text = '';
  while (n) {
    n--;
    text = String.fromCharCode(65 + (n % 26)) + text;
    n = Math.floor(n / 26);
  }
  return text;
};
const hashes: any[] = [];
for (const result of manifest.results) {
  const bytes = await readFile(path.join(root, result.file));
  hashes.push({
    file: result.file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
  const capture = JSON.parse(bytes.toString('utf8'));
  for (const sheet of capture.data.sheets) {
    const key = `${capture.data.spreadsheetId}:${sheet.properties.sheetId}`;
    const target = sheets.get(key) ?? {
      workbookId: capture.data.spreadsheetId,
      workbook: capture.data.properties.title,
      tab: sheet.properties.title,
      tabId: sheet.properties.sheetId,
      rows: new Map(),
      chunks: [],
    };
    target.chunks.push({
      file: result.file,
      range: capture.source.range,
      capturedAt: capture.capturedAt,
    });
    for (const grid of sheet.data ?? [])
      for (const [index, row] of (grid.rowData ?? []).entries()) {
        const number = (grid.startRow ?? 0) + index + 1;
        const cells = row.values ?? [];
        if (
          !cells.some(
            (cell: any) =>
              populated(cell.userEnteredValue) ||
              populated(cell.effectiveValue) ||
              populated(cell.formattedValue) ||
              populated(cell.note) ||
              populated(cell.hyperlink) ||
              populated(cell.textFormatRuns),
          )
        )
          continue;
        if (target.rows.has(number))
          throw new Error('Overlapping source row captures require explicit reconciliation');
        target.rows.set(number, {
          number,
          cells,
          raw: row,
          captureFile: result.file,
          capturedAt: capture.capturedAt,
        });
      }
    sheets.set(key, target);
  }
}
const columns: any[] = [],
  snapshots: any[] = [],
  sheetSummary: any[] = [];
for (const sheet of sheets.values()) {
  const header = sheet.rows.get(1)?.cells ?? [];
  const maxColumn = Math.max(0, ...[...sheet.rows.values()].map((r: any) => r.cells.length));
  let meaningful = 0;
  for (let index = 0; index < maxColumn; index++) {
    let count = 0,
      notes = 0,
      formulas = 0;
    for (const row of sheet.rows.values()) {
      const cell = row.cells[index] ?? {};
      if (
        populated(cell.userEnteredValue) ||
        populated(cell.effectiveValue) ||
        populated(cell.formattedValue) ||
        populated(cell.note) ||
        populated(cell.hyperlink) ||
        populated(cell.textFormatRuns)
      )
        count++;
      if (populated(cell.note)) notes++;
      if (populated(cell.userEnteredValue?.formulaValue)) formulas++;
    }
    if (!count) continue;
    meaningful += count;
    const originalHeader =
      header[index]?.formattedValue ?? header[index]?.userEnteredValue?.stringValue ?? '';
    columns.push({
      workbookId: sheet.workbookId,
      workbook: sheet.workbook,
      tab: sheet.tab,
      tabId: sheet.tabId,
      column: columnName(index),
      originalHeader,
      headerUnverified: true,
      populatedSourceRowsIncludingHeader: count,
      notes,
      formulas,
      ...classifySourceField(String(originalHeader)),
    });
  }
  for (const row of sheet.rows.values()) {
    const original_fields = Object.fromEntries(
      row.cells.map((cell: any, index: number) => [
        `${columnName(index)}${header[index]?.formattedValue ? ` — ${header[index].formattedValue}` : ''}`,
        cell,
      ]),
    );
    snapshots.push({
      workbook_id: sheet.workbookId,
      workbook_title: sheet.workbook,
      tab: sheet.tab,
      tab_id: sheet.tabId,
      row: row.number,
      snapshot_id: path.basename(root),
      captured_at: row.capturedAt,
      source_capture_file: row.captureFile,
      source_sha256: hashes.find((h) => h.file === row.captureFile)?.sha256,
      original_fields,
      raw_payload: row.raw,
      evidence_ids: [],
      posting_verified: false,
    });
  }
  sheetSummary.push({
    workbook: sheet.workbook,
    tab: sheet.tab,
    populatedRows: sheet.rows.size,
    populatedCells: meaningful,
  });
}
const old = JSON.parse(await readFile('.data/historical-cutover/capture.json', 'utf8'));
const evidenceFields = new Map<string, any>();
for (const evidence of old.evidence)
  for (const field of populatedPaths(evidence.raw)) {
    const key = `${evidence.file_id}:${evidence.evidence_class}:${field}`;
    const previous = evidenceFields.get(key) ?? {
      file_id: evidence.file_id,
      evidence_class: evidence.evidence_class,
      field,
      populatedRecords: 0,
      category: 'C',
      destination:
        'Existing staging raw evidence; preserve verbatim, never automatic payment truth',
    };
    previous.populatedRecords++;
    evidenceFields.set(key, previous);
  }
const report = {
  generatedAt: new Date().toISOString(),
  workingSnapshot: true,
  readOnly: true,
  financialPostingsAuthorized: false,
  sourceFiles: hashes,
  limitations: [
    'Header text is retained verbatim and remains unverified for matrix/non-tabular tabs.',
    'Counts include original header rows; no rows are silently removed as presumed headers or irrelevant.',
    'Working multi-range reads are not a frozen transaction; final live delta/reconciliation remains mandatory.',
    'No category E exclusions are made automatically.',
    'A/B destinations are mapping candidates only. Original complete cells/notes/formulas remain preserved.',
    'Preserved snapshots are private preparation files, not newly installed live/staging mappings or imported bookings.',
  ],
  tabs: sheetSummary,
  columns,
  stagingFields: [...evidenceFields.values()],
  existingReviews: old.reviews.length,
  existingEvidence: old.evidence.length,
  totals: {
    tabs: sheets.size,
    sourceRows: snapshots.length,
    sourceColumns: columns.length,
    populatedCells: columns.reduce((sum, c) => sum + c.populatedSourceRowsIncludingHeader, 0),
    cellNotes: columns.reduce((sum, c) => sum + c.notes, 0),
    formulas: columns.reduce((sum, c) => sum + c.formulas, 0),
    stagingFieldPaths: evidenceFields.size,
    excludedFields: 0,
  },
};
await writeFile(path.join(root, 'field-coverage.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(root, 'source-row-snapshots.json'), JSON.stringify(snapshots));
console.log(
  JSON.stringify(
    {
      totals: report.totals,
      tabs: sheetSummary,
      existingReviews: report.existingReviews,
      financialPostingsAuthorized: false,
      reports: ['field-coverage.json', 'source-row-snapshots.json'],
    },
    null,
    2,
  ),
);
