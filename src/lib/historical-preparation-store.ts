import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Actor } from './permissions';
import type { Database } from './db';
import { gunzipSync } from 'node:zlib';

const root = () => path.join(process.cwd(), '.data/historical-cutover/prepared-bookings');
export async function historicalPreparationIndex(
  actor: Actor,
  db?: Database,
  options: { search?: string; status?: string; offset?: number } = {},
) {
  if (process.env.PADOVA_QA === '1' || actor.role !== 'OWNER') return null;
  const search = (options.search ?? '').trim().slice(0, 200).toLowerCase();
  const status = options.status ?? 'Prepared booking';
  const offset = Number.isSafeInteger(options.offset) && options.offset! > 0 ? options.offset! : 0;
  const limit = 100;
  if (db?.storage === 'padova') {
    if (
      !(await db.query("SELECT to_regclass('padova.historical_source_preparations') name")).rows[0]
        ?.name
    )
      return null;
    const totals = (
      await db.query(`SELECT status,count(*)::int count,
      count(*) FILTER (WHERE financial_review)::int unresolved
      FROM padova.historical_source_preparations GROUP BY status`)
    ).rows;
    const counts = Object.fromEntries(totals.map((r) => [r.status, Number(r.count)]));
    const records = (
      await db.query(
        `SELECT id,status,target_id,summary,
      facts->'customer'->>'name' customer, facts->>'route_or_property' route,
      facts->'confirmations' confirmations
      FROM padova.historical_source_preparations
      WHERE ($1='All' OR status=$1) AND ($2='' OR position($2 in lower(concat_ws(' ',
        facts->'customer'->>'name',facts->>'route_or_property',facts->>'confirmations',
        summary->>'workbook',summary->>'tab',summary->>'row')))>0)
      ORDER BY source_key,id LIMIT $3 OFFSET $4`,
        [status, search, limit + 1, offset],
      )
    ).rows;
    return {
      reconciliation: {
        totalSourceRows: totals.reduce((n, r) => n + Number(r.count), 0),
        counts,
        uniquePreparedBookings: counts['Prepared booking'] ?? 0,
        mappedSourceRows:
          (counts['Prepared booking'] ?? 0) + (counts['Linked supporting row'] ?? 0),
        unresolvedFinancialRows: totals.reduce((n, r) => n + Number(r.unresolved), 0),
        intentionallyExcluded: 0,
        liveFinancialPostings: 0,
      },
      offset,
      hasMore: records.length > limit,
      rows: records.slice(0, limit).map((r) => ({
        id: r.id,
        status: r.status,
        targetId: r.target_id,
        customer: r.customer,
        route: r.route,
        confirmations: r.confirmations,
        ...r.summary,
      })),
    };
  }
  try {
    const index = JSON.parse(await readFile(path.join(root(), 'index.json'), 'utf8'));
    const rows = index.rows.filter(
      (r: any) =>
        (status === 'All' || r.status === status) &&
        [r.customer, r.route, ...(r.confirmations ?? []), r.workbook, r.tab, String(r.row)]
          .join(' ')
          .toLowerCase()
          .includes(search),
    );
    return {
      ...index,
      rows: rows.slice(offset, offset + limit),
      offset,
      hasMore: rows.length > offset + limit,
    };
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export async function historicalPreparationDetail(actor: Actor, id: string, db?: Database) {
  if (process.env.PADOVA_QA === '1') throw new Error('Historical evidence is unavailable in QA');
  if (actor.role !== 'OWNER')
    throw new Error('Owner permission required for historical source preparation');
  if (db?.storage === 'padova') {
    const rows = (
      await db.query(
        'SELECT id,status,target_id,facts,rationale,source_payload_gzip FROM padova.historical_source_preparations WHERE id=$1 OR target_id=(SELECT target_id FROM padova.historical_source_preparations WHERE id=$1) ORDER BY source_key',
        [id],
      )
    ).rows;
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error('Prepared source row not found');
    const source = JSON.parse(gunzipSync(row.source_payload_gzip).toString('utf8'));
    return {
      mapping: {
        id: row.id,
        status: row.status,
        targetId: row.target_id,
        facts: row.facts,
        rationale: row.rationale,
        source,
      },
      sources: rows.map((r) => JSON.parse(gunzipSync(r.source_payload_gzip).toString('utf8'))),
    };
  }
  const mappings = JSON.parse(await readFile(path.join(root(), 'migration-mappings.json'), 'utf8'));
  const mapping = mappings.find((r: any) => r.id === id);
  if (!mapping) throw new Error('Prepared source row not found');
  const related = mapping.targetId
    ? mappings.filter((r: any) => r.targetId === mapping.targetId)
    : [mapping];
  return { mapping, sources: related.map((r: any) => r.source) };
}
