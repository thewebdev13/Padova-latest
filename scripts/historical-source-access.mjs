import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Inspects the existing capture and original paths; never changes source files.
const capture = JSON.parse(fs.readFileSync('.data/historical-cutover/capture.json', 'utf8'));
const root = path.resolve('.data/drive-readback-unpacked/evidence');
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const records = (name) => {
  const file = capture.files.find((f) => f.path === `tables/${name}.json`);
  return capture.evidence.filter((e) => e.file_id === file?.id);
};
const packaged = capture.files.map((file) => {
  const p = path.resolve(root, file.path);
  if (!p.startsWith(root + path.sep)) throw new Error('Invalid evidence path');
  const exists = fs.existsSync(p);
  const actualHash = exists ? hash(p) : null;
  return {
    ...file,
    status: !exists
      ? 'missing'
      : actualHash === file.sha256 && fs.statSync(p).size === Number(file.bytes)
        ? 'readable_hash_match'
        : 'mismatch',
  };
});
const attachments = records('attachment_inventory').map((e) => {
  const r = e.raw;
  const p = r.original_path;
  let status = 'not_found';
  if (p && fs.existsSync(p)) {
    try {
      status = hash(p) === r.sha256 ? 'readable_hash_match' : 'hash_mismatch';
    } catch {
      status = 'unreadable';
    }
  }
  return {
    evidenceId: e.id,
    path: p,
    filename: r.filename,
    kind: r.kind,
    status,
    zip: r.original_zip_path,
    zipExists: !!(r.original_zip_path && fs.existsSync(r.original_zip_path)),
  };
});
const counts = (rows, key) =>
  rows.reduce((a, r) => {
    a[r[key]] = (a[r[key]] ?? 0) + 1;
    return a;
  }, {});
const sheets = capture.evidence.filter((e) => e.evidence_class === 'live_sheet_snapshot');
const summary = {
  checkedAt: new Date().toISOString(),
  packaged: counts(packaged, 'status'),
  packagedBytes: packaged.reduce((sum, f) => sum + Number(f.bytes), 0),
  attachments: counts(attachments, 'status'),
  attachmentKinds: counts(attachments, 'kind'),
  accessibleOriginalZips: [...new Set(attachments.filter((r) => r.zipExists).map((r) => r.zip))],
  stagedSheetRows: sheets.length,
  fullSourceCoordinates: sheets.filter(
    (e) =>
      e.raw.source_spreadsheet_id &&
      e.raw.source_sheet &&
      Number.isInteger(e.raw.source_sheet_id) &&
      Number.isInteger(e.raw.source_row),
  ).length,
  documentedLimits: records('access_and_recovery_limits').map((e) => e.raw),
};
fs.writeFileSync(
  '.data/historical-cutover/source-access.json',
  JSON.stringify({ summary, packaged, attachments }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
