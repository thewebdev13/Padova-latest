import { Client } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { configuredDatabaseURL, PADOVA_PROJECT } from '../src/lib/project';

// Deliberately SELECT-only. The backup reader is never used by the application.
const connectionString = configuredDatabaseURL({
  ...process.env,
  DATABASE_URL: process.env.PADOVA_BACKUP_DATABASE_URL,
});
if (
  !connectionString ||
  !decodeURIComponent(new URL(connectionString).username).startsWith('padova_backup.')
)
  throw new Error('Dedicated read-only backup reader required');
const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
await mkdir('.data/historical-cutover', { recursive: true });
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity = (
    await client.query(
      "SELECT current_user, current_setting('transaction_read_only') AS read_only, clock_timestamp() AS captured_at",
    )
  ).rows[0];
  if (identity.read_only !== 'on') throw new Error('Read-only transaction required');
  const schemas = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='padova' AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows;
  const liveCounts: Record<string, number> = {};
  for (const { table_name } of schemas) {
    liveCounts[table_name] = Number(
      (await client.query(`SELECT count(*) FROM padova."${table_name.replaceAll('"', '""')}"`))
        .rows[0].count,
    );
  }
  const evidence = (
    await client.query(
      'SELECT id,file_id,record_index,evidence_class,raw FROM padova_staging.evidence_records ORDER BY id',
    )
  ).rows;
  const files = (await client.query('SELECT * FROM padova_staging.evidence_files ORDER BY id'))
    .rows;
  const batches = (await client.query('SELECT * FROM padova_staging.import_batches ORDER BY id'))
    .rows;
  const mappings = (
    await client.query('SELECT * FROM padova_staging.migration_mappings ORDER BY id')
  ).rows;
  const reviews = (await client.query('SELECT * FROM padova.review_cases ORDER BY id')).rows;
  const parties = (
    await client.query('SELECT id,kind,display_name FROM padova.parties ORDER BY id')
  ).rows;
  const bookings = (
    await client.query('SELECT id,kind,status,booked_date FROM padova.bookings ORDER BY id')
  ).rows;
  const constraints = (
    await client.query(
      "SELECT conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE conrelid IN ('padova_staging.migration_mappings'::regclass,'padova.requests'::regclass) ORDER BY conname",
    )
  ).rows;
  const provenanceHash = createHash('sha256')
    .update(JSON.stringify({ evidence, files, batches, mappings, reviews }))
    .digest('hex');
  await client.query('COMMIT');
  const payload = {
    project: PADOVA_PROJECT,
    identity,
    liveCounts,
    evidence,
    files,
    batches,
    mappings,
    reviews,
    parties,
    bookings,
    constraints,
    provenanceHash,
  };
  await writeFile('.data/historical-cutover/capture.json', JSON.stringify(payload));
  console.log(
    JSON.stringify(
      {
        capturedAt: identity.captured_at,
        evidence: evidence.length,
        reviews: reviews.length,
        mappings: mappings.length,
        liveCounts,
        provenanceHash,
        constraints,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
