import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDatabase } from '../src/lib/db';
import { execute } from '../src/lib/finance';
import { login, sessionActor, logout } from '../src/lib/users';
import { historicalTravelerCell } from '../src/lib/historical-preparation';
import { travelerCandidates } from '../src/lib/traveler-candidates';
import { referenceKey } from '../src/lib/test-reference';
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Practice only; cloud writes prohibited');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(path.join(process.env.PADOVA_DATA_DIR, 'PG_VERSION')))
  throw new Error('Existing Practice fixture required');
const sourcePath = '.data/historical-cutover/current-cells-1793231255605/source-row-snapshots.json';
const bytes = await readFile(sourcePath);
const sources = JSON.parse(bytes.toString());
const candidates = new Map<string, { name: string; sources: any[] }>(),
  held: any[] = [];
let cells = 0,
  splitCells = 0;
for (const source of sources) {
  const cell = historicalTravelerCell(source);
  if (!cell) continue;
  cells++;
  const parsed = travelerCandidates(cell.raw);
  const provenance = {
    workbook_id: source.workbook_id,
    tab: source.tab,
    row: source.row,
    column: cell.column,
    raw_text: cell.raw,
    raw_cell: cell.cell,
    source_sha256: source.source_sha256,
    snapshot_id: source.snapshot_id,
  };
  if (parsed.review) {
    held.push({
      source: provenance,
      reason: 'Ambiguous traveler text; no inferred person or merge',
    });
    continue;
  }
  if (parsed.split) splitCells++;
  for (const name of parsed.names) {
    const key = referenceKey(name);
    const c = candidates.get(key) ?? { name, sources: [] };
    c.sources.push(provenance);
    candidates.set(key, c);
  }
}
const db = await createDatabase();
let token: string | undefined;
const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const hash = (v: any) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
const stableID = (s: string) => {
  const h = hash(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const session = await login(
    db,
    JSON.parse(await readFile('.data/owner-acceptance-access.json', 'utf8')),
  );
  token = session.token;
  const actor = await sessionActor(db, token);
  if (actor?.role !== 'OWNER') throw new Error('Individual Practice Owner required');
  const original = (await db.query('SELECT * FROM parties')).rows;
  const stats = async () => {
    const r: any = {};
    for (const table of [
      'bookings',
      'charges',
      'payments',
      'funding_components',
      'supplier_obligations',
      'assets',
      'asset_lots',
      'asset_movements',
      'journal_lines',
    ])
      r[table] = (
        await db.query(
          `SELECT count(*) n,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) hash FROM ${table} t`,
        )
      ).rows[0];
    return r;
  };
  const before = await stats();
  let created = 0,
    updated = 0,
    reviewHidden = 0,
    alreadyPresent = 0;
  for (const [key, c] of candidates) {
    const prior = original.find(
      (p) =>
        referenceKey(p.name) === key &&
        p.kind === 'person' &&
        !p.archived_at &&
        (p.details?.test_reference_only || p.details?.traveler_candidate),
    );
    const details = {
      ...(prior?.details ?? {}),
      test_reference_only: prior ? prior.details?.test_reference_only : true,
      traveler_candidate: true,
      identity_status: 'Exact source-name candidate only; identity not merged or verified',
      traveler_source_claims: c.sources,
      traveler_review_only: false,
    };
    if (prior) {
      alreadyPresent++;
      const roles = [...new Set([...(prior.roles ?? []), 'traveler'])];
      if (hash(details) !== hash(prior.details) || hash(roles) !== hash(prior.roles)) {
        await execute(db, actor, {
          id: stableID(`traveler-reconcile:${prior.id}:${hash(details)}`),
          kind: 'edit_party',
          data: {
            party_id: prior.id,
            name: prior.name,
            email: prior.email ?? '',
            phone: prior.phone ?? '',
            roles,
            details,
            reason:
              'Practice reference-only traveler reconciliation; preserve exact source claims, no identity merge',
          },
        });
        updated++;
      }
    } else {
      await execute(db, actor, {
        id: stableID(`traveler-candidate:${key}`),
        kind: 'party',
        data: { name: c.name, kind: 'person', roles: ['traveler'], details },
      });
      created++;
    }
  }
  for (const p of original) {
    if (
      !p.details?.test_reference_only ||
      !p.roles?.includes('traveler') ||
      !travelerCandidates(p.name).review ||
      p.details.traveler_review_only
    )
      continue;
    await execute(db, actor, {
      id: stableID(`traveler-ambiguous:${p.id}`),
      kind: 'edit_party',
      data: {
        party_id: p.id,
        name: p.name,
        email: p.email ?? '',
        phone: p.phone ?? '',
        roles: p.roles,
        details: {
          ...p.details,
          traveler_review_only: true,
          traveler_review_reason:
            'Combined/ambiguous imported label; retained raw and all existing links',
        },
        reason:
          'Hide ambiguous historical traveler label from new-entry suggestions; retain original record/history',
      },
    });
    reviewHidden++;
  }
  const after = await stats();
  if (hash(before) !== hash(after)) throw new Error('Financial preservation mismatch');
  const report = {
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    sourceRows: sources.length,
    travelerCells: cells,
    splitCells,
    uniqueNameCandidates: candidates.size,
    created,
    updated,
    alreadyPresent,
    ambiguousCells: held.length,
    reviewHidden,
    identityMerges: 0,
    financialTablesUnchanged: true,
    held,
    candidates: [...candidates.values()],
  };
  await mkdir('.data/traveler-reconciliation', { recursive: true });
  await writeFile('.data/traveler-reconciliation/result.json', JSON.stringify(report));
  const { held: _, candidates: __, ...counts } = report;
  console.log(JSON.stringify(counts));
} finally {
  if (token) await logout(db, token);
  await db.close();
}
