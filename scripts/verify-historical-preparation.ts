import { Client } from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { configuredDatabaseURL } from '../src/lib/project';
import { sourceFingerprint } from '../src/lib/historical-delta';

const connectionString = configuredDatabaseURL({
  ...process.env,
  DATABASE_URL: process.env.PADOVA_BACKUP_DATABASE_URL,
});
if (
  !connectionString ||
  !decodeURIComponent(new URL(connectionString).username).startsWith('padova_backup.')
)
  throw new Error('Pinned read-only backup reader required');
const root = '.data/historical-cutover/prepared-bookings';
const expected = JSON.parse(await readFile(`${root}/migration-mappings.json`, 'utf8'));
const targets = JSON.parse(await readFile(`${root}/bookings.json`, 'utf8'));
const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity = (
    await client.query(
      "SELECT current_user operator,current_setting('transaction_read_only') read_only",
    )
  ).rows[0];
  if (identity.read_only !== 'on') throw new Error('Read-only verification required');
  const actual = (
    await client.query('SELECT * FROM padova.historical_source_preparations ORDER BY source_key')
  ).rows;
  const actualTargets = (
    await client.query('SELECT * FROM padova.historical_booking_preparations ORDER BY id')
  ).rows;
  const accepted = (
    await client.query(
      "SELECT * FROM padova_staging.migration_mappings WHERE target_table='padova.historical_booking_preparations' AND decision='accepted'",
    )
  ).rows;
  if (actual.length !== expected.length || actualTargets.length !== targets.length)
    throw new Error('Historical preparation row count differs');
  const byId = new Map(actual.map((r) => [r.id, r]));
  for (const source of expected) {
    const r = byId.get(source.id);
    if (
      !r ||
      r.source_key !== source.sourceKey ||
      r.status !== source.status ||
      r.fingerprint !== source.fingerprint ||
      sourceFingerprint(r.facts) !== sourceFingerprint(source.facts)
    )
      throw new Error(`Source identity/classification/facts differ: ${source.id}`);
    const payload = gunzipSync(r.source_payload_gzip);
    if (
      createHash('sha256').update(payload).digest('hex') !== r.source_payload_sha256 ||
      sourceFingerprint(JSON.parse(payload.toString('utf8'))) !== sourceFingerprint(source.source)
    )
      throw new Error(`Source payload or provenance differs: ${source.id}`);
  }
  for (const target of targets) {
    const r = actualTargets.find((r) => r.id === target.id);
    if (
      !r ||
      r.financial_postings_authorized !== false ||
      sourceFingerprint(r.facts) !== sourceFingerprint(target.facts)
    )
      throw new Error(`Prepared target differs: ${target.id}`);
  }
  for (const mapping of accepted) {
    const source = actual.find(
      (r) =>
        r.evidence_record_id === mapping.evidence_record_id &&
        r.target_id === mapping.target_id &&
        ['Prepared booking', 'Linked supporting row'].includes(r.status),
    );
    if (!source) throw new Error('Accepted mapping does not match the preserved preparation');
  }
  const live = (
    await client.query(
      'SELECT (SELECT count(*) FROM padova.bookings)::int bookings,(SELECT count(*) FROM padova.asset_movements)::int asset_movements,(SELECT count(*) FROM padova.journal_lines)::int journal_lines',
    )
  ).rows[0];
  if (Object.values(live).some((n) => n !== 0))
    throw new Error('Live financial state changed; investigate independently');
  await client.query('COMMIT');
  const proof = {
    project: 'unugynfzmxjxifgofxjr',
    verifiedAt: new Date().toISOString(),
    identity,
    sourceRows: actual.length,
    sourcePayloadsVerified: actual.length,
    preparedBookings: actualTargets.length,
    acceptedMappings: accepted.length,
    live,
    everyFieldAndProvenanceVerified: true,
    classificationCounts: Object.fromEntries(
      ['Prepared booking', 'Linked supporting row', 'Needs Review', 'Preserved supporting row'].map(
        (status) => [status, actual.filter((r) => r.status === status).length],
      ),
    ),
  };
  await writeFile(
    process.argv[2] ?? `${root}/remote-readback-proof.json`,
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await client.end();
}
