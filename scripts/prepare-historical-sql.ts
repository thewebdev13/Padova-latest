import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { migrationCommandId, sourceFingerprint } from '../src/lib/historical-delta';
import { comparableSourceCells } from '../src/lib/source-cell-comparison';

// Emits additive reviewed SQL for the connected US project. No connection or
// financial command execution is available to this preparation script.
const root = '.data/historical-cutover/prepared-bookings';
const mappings = JSON.parse(await readFile(`${root}/migration-mappings.json`, 'utf8'));
const bookings = JSON.parse(await readFile(`${root}/bookings.json`, 'utf8'));
const capture = JSON.parse(await readFile('.data/historical-cutover/capture.json', 'utf8'));
if (capture.project.ref !== 'unugynfzmxjxifgofxjr')
  throw new Error('Pinned existing US project required');
const evidence = new Map<string, any[]>();
for (const e of capture.evidence.filter((e: any) => e.evidence_class === 'live_sheet_snapshot')) {
  const key = JSON.stringify([e.raw.source_spreadsheet_id, e.raw.source_sheet, e.raw.source_row]);
  evidence.set(key, [...(evidence.get(key) ?? []), e]);
}
const bookingIds = new Set(bookings.map((b: any) => b.id));
const sources = mappings.map((m: any) => {
  const candidates = evidence.get(m.sourceKey) ?? [];
  const same = candidates.filter(
    (e) =>
      sourceFingerprint(comparableSourceCells(e.raw.cells)) ===
      sourceFingerprint(comparableSourceCells(m.source.raw_payload.values ?? [])),
  );
  const evidenceId = candidates.length === 1 && same.length === 1 ? same[0].id : null;
  const payload = JSON.stringify(m.source);
  return {
    id: m.id,
    source_key: m.sourceKey,
    fingerprint: m.fingerprint,
    status: m.status,
    target_id: bookingIds.has(m.targetId) ? m.targetId : null,
    evidence_record_id: evidenceId,
    facts: m.facts,
    summary: {
      workbook: m.source.workbook_title,
      workbook_id: m.source.workbook_id,
      tab: m.source.tab,
      row: m.source.row,
      snapshot_id: m.source.snapshot_id,
      source_sha256: m.source.source_sha256,
    },
    source_b64: gzipSync(payload).toString('base64'),
    source_payload_sha256: createHash('sha256').update(payload).digest('hex'),
    rationale: m.rationale,
    financial_review: m.financialReview,
    mapping_id: migrationCommandId(`accepted-preparation:${m.sourceKey}`),
  };
});
const targets = bookings.map((b: any) => ({
  id: b.id,
  facts: b.facts,
  manifest_sha256: sourceFingerprint({
    facts: b.facts,
    sources: sources
      .filter((s: any) => s.target_id === b.id)
      .map((s: any) => ({ id: s.id, fingerprint: s.fingerprint })),
  }),
}));
const quote = (v: any) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const sqlHeader =
  "BEGIN; SELECT pg_advisory_xact_lock(71280428); DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_historical_booking_preparations') THEN RAISE EXCEPTION 'Reviewed historical preparation extension required'; END IF; END $$;";
const targetSQL = (values: any[]) => `${sqlHeader}
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM jsonb_to_recordset(${quote(values)}) x(id uuid,facts jsonb,manifest_sha256 text) JOIN padova.historical_booking_preparations p USING(id) WHERE p.facts IS DISTINCT FROM x.facts OR p.manifest_sha256 IS DISTINCT FROM x.manifest_sha256) THEN RAISE EXCEPTION 'Previously prepared booking differs; correction review required'; END IF; END $check$;
WITH added AS (INSERT INTO padova.historical_booking_preparations(id,facts,manifest_sha256) SELECT id,facts,manifest_sha256 FROM jsonb_to_recordset(${quote(values)}) x(id uuid,facts jsonb,manifest_sha256 text) ON CONFLICT(id) DO NOTHING RETURNING id) SELECT count(*) new_prepared_bookings FROM added; COMMIT;`;
const sourceSQL = (values: any[]) => `${sqlHeader}
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM jsonb_to_recordset(${quote(values)}) x(id uuid,source_key text,fingerprint text,source_payload_sha256 text,status text,target_id uuid) JOIN padova.historical_source_preparations p ON p.id=x.id OR p.source_key=x.source_key WHERE p.id IS DISTINCT FROM x.id OR p.fingerprint IS DISTINCT FROM x.fingerprint OR p.source_payload_sha256 IS DISTINCT FROM x.source_payload_sha256 OR p.status IS DISTINCT FROM x.status OR p.target_id IS DISTINCT FROM x.target_id) THEN RAISE EXCEPTION 'Previously prepared source differs; preserve prior row and review correction'; END IF; END $check$;
INSERT INTO padova.historical_source_preparations(id,source_key,fingerprint,status,target_id,evidence_record_id,summary,facts,source_payload_gzip,source_payload_sha256,rationale,financial_review)
SELECT id,source_key,fingerprint,status,target_id,evidence_record_id,summary,facts,decode(source_b64,'base64'),source_payload_sha256,rationale,financial_review FROM jsonb_to_recordset(${quote(values)}) x(id uuid,source_key text,fingerprint text,status text,target_id uuid,evidence_record_id uuid,summary jsonb,facts jsonb,source_b64 text,source_payload_sha256 text,rationale text,financial_review boolean) ON CONFLICT(id) DO NOTHING;
INSERT INTO padova_staging.migration_mappings(id,evidence_record_id,target_table,target_id,decision,rationale,actor)
SELECT x.mapping_id,x.evidence_record_id,'padova.historical_booking_preparations',x.target_id,'accepted',x.rationale || ' Operational preparation only; no financial posting approval. Owner direction OWNER_DECISIONS_20261029.md, administrative operator=' || current_user,NULL FROM jsonb_to_recordset(${quote(values.map(({ source_b64, facts, ...v }: any) => v))}) x(mapping_id uuid,evidence_record_id uuid,target_id uuid,status text,rationale text)
WHERE x.status IN ('Prepared booking','Linked supporting row') AND x.evidence_record_id IS NOT NULL AND x.target_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM padova_staging.migration_mappings old WHERE old.evidence_record_id=x.evidence_record_id AND old.decision='accepted' AND (old.target_id IS DISTINCT FROM x.target_id OR old.target_table IS DISTINCT FROM 'padova.historical_booking_preparations'))
ON CONFLICT(id) DO NOTHING;
COMMIT;`;
await mkdir(`${root}/sql`, { recursive: true });
const batches: { path: string; kind: string; rows: number }[] = [];
for (const [kind, values, render] of [
  ['targets', targets, targetSQL],
  ['sources', sources, sourceSQL],
] as const) {
  for (let start = 0; start < values.length; start += 25) {
    const batch = values.slice(start, start + 25);
    const file = `${root}/sql/${kind}-${start}.json`;
    await writeFile(
      file,
      JSON.stringify({ project_id: 'unugynfzmxjxifgofxjr', query: render(batch) }),
    );
    batches.push({ path: file, kind, rows: batch.length });
  }
}
await writeFile(`${root}/sql/batches.json`, JSON.stringify(batches));
console.log(
  JSON.stringify({
    targets: targets.length,
    sources: sources.length,
    eligibleAcceptedMappings: sources.filter(
      (s: any) =>
        ['Prepared booking', 'Linked supporting row'].includes(s.status) &&
        s.evidence_record_id &&
        s.target_id,
    ).length,
    batches: batches.length,
    maxBatchBytes: Math.max(
      ...(await Promise.all(batches.map(async (b) => (await readFile(b.path)).length))),
    ),
    noFinancialWrites: true,
  }),
);
