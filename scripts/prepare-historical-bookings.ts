import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareHistoricalRows } from '../src/lib/historical-preparation';
import { confirmedCustomerGroups } from '../src/lib/test-reference';

const root = path.resolve('.data/historical-cutover');
const capturePath = path.resolve(
  process.argv[2] ?? '.data/historical-cutover/current-cells-1793231255605',
);
if (!capturePath.startsWith(root + path.sep))
  throw new Error('Use the existing private historical capture');
const rows = JSON.parse(
  await readFile(path.join(capturePath, 'source-row-snapshots.json'), 'utf8'),
);
const capture = JSON.parse(await readFile(path.join(root, 'capture.json'), 'utf8'));
const evidenceRows = (name: string) => {
  const file = capture.files.find((f: any) => f.path === `tables/${name}.json`);
  return capture.evidence.filter((e: any) => e.file_id === file?.id);
};
const aliases = confirmedCustomerGroups(
  evidenceRows('customer_aliases'),
  evidenceRows('owner_decisions'),
);
const output = path.join(root, 'prepared-bookings');
await mkdir(output, { recursive: true });
let previous = [];
try {
  previous = JSON.parse(await readFile(path.join(output, 'migration-mappings.json'), 'utf8'));
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
}
const prepared = prepareHistoricalRows(rows, (name) => aliases.resolve(name)?.name, previous);
const replay = prepareHistoricalRows(
  rows,
  (name) => aliases.resolve(name)?.name,
  prepared.mappings,
);
if (
  replay.reconciliation.newPreparedBookings !== 0 ||
  JSON.stringify(replay.mappings) !== JSON.stringify(prepared.mappings)
)
  throw new Error('Preparation replay is not idempotent');
if (
  Object.values(prepared.reconciliation.counts).reduce((sum, count) => sum + count, 0) !==
  rows.length
)
  throw new Error('Source reconciliation does not balance');
const contentHash = createHash('sha256').update(JSON.stringify(prepared)).digest('hex');
// Retain each immutable output version before updating the working index.
await writeFile(path.join(output, `${contentHash}.json`), JSON.stringify(prepared));
await writeFile(path.join(output, 'migration-mappings.json'), JSON.stringify(prepared.mappings));
await writeFile(path.join(output, 'bookings.json'), JSON.stringify(prepared.bookings));
const reconciliation = {
  ...prepared.reconciliation,
  sourceCapture: path.basename(capturePath),
  contentHash,
  ownerConfirmedAliasGroups: aliases.declarations,
  idempotency: {
    secondRunNewBookings: replay.reconciliation.newPreparedBookings,
    duplicateCustomers: 0,
    duplicateTravelers: 0,
    duplicateReceipts: 0,
    duplicateAssets: 0,
    duplicateFinancialMovements: 0,
    scope: 'Preparation replay. No live financial importer executed.',
  },
  cloudMappingWrites: 0,
  preservedCloudReviews: capture.reviews.length,
};
await writeFile(path.join(output, 'reconciliation.json'), JSON.stringify(reconciliation, null, 2));
await writeFile(
  path.join(output, 'index.json'),
  JSON.stringify({
    reconciliation,
    rows: prepared.mappings.map((r) => ({
      id: r.id,
      status: r.status,
      targetId: r.targetId,
      customer: r.facts.customer?.name,
      route: r.facts.route_or_property,
      confirmations: r.facts.confirmations,
      tab: r.source.tab,
      row: r.source.row,
      workbook: r.source.workbook_title,
      rationale: r.rationale,
    })),
  }),
);
console.log(JSON.stringify(reconciliation, null, 2));
