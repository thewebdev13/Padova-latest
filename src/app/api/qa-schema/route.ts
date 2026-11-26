/**
 * QA-only: apply reviewed additive schema scripts using the hosted DATABASE_URL.
 * Sensitive Vercel secrets cannot be pulled by CLI; this runs where they already exist.
 * Never available when PADOVA_QA is off. Whitelist only — never adapter/reinstall.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { PADOVA_PROJECT, PADOVA_QA_PROJECT } from '@/lib/project';
import { QA_SCHEMA_SCRIPTS, type QaSchemaScript } from '@/lib/qa-schema-scripts';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function qaConnectionString() {
  if (process.env.PADOVA_QA !== '1') throw new Error('QA schema apply only on QA');
  if (process.env.PADOVA_QA_PROJECT_REF !== PADOVA_QA_PROJECT.ref)
    throw new Error('QA project ref mismatch');
  if (process.env.PADOVA_DATABASE_MODE !== 'supabase')
    throw new Error('QA schema apply requires supabase mode');
  const raw = process.env.DATABASE_URL || '';
  if (!raw) throw new Error('DATABASE_URL missing in QA runtime');
  if (raw.includes(PADOVA_PROJECT.ref)) throw new Error('Refusing production database');
  if (!raw.includes(PADOVA_QA_PROJECT.ref)) throw new Error('DATABASE_URL is not the QA project');

  const url = new URL(raw);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'verify-full');
  const candidates = [
    process.env.PADOVA_DB_CA_FILE,
    path.join(process.cwd(), 'certs', 'supabase-root-2021.crt'),
  ].filter(Boolean) as string[];
  let caFile = '';
  for (const c of candidates) {
    try {
      await access(c);
      caFile = c;
      break;
    } catch {
      /* next */
    }
  }
  if (caFile) url.searchParams.set('sslrootcert', caFile);
  else url.searchParams.delete('sslrootcert');
  return url.toString();
}

async function withQaClient<T>(
  application_name: string,
  fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>,
) {
  const pool = new Pool({
    connectionString: await qaConnectionString(),
    max: 1,
    connectionTimeoutMillis: 15000,
    application_name,
    options: '-c search_path=padova,pg_catalog',
  });
  try {
    const client = await pool.connect();
    try {
      // Hosted QA login is padova_qa_runtime; app objects live under padova_app_server.
      await client.query('SET ROLE padova_app_server');
      return await fn(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function authorize(request: Request) {
  const expected = process.env.PADOVA_DIRECTORY_SEED_TOKEN?.trim();
  if (!expected) return { error: NextResponse.json({ error: 'PADOVA_DIRECTORY_SEED_TOKEN not configured' }, { status: 503 }) };
  const got = request.headers.get('x-directory-seed-token')?.trim();
  if (!got || got !== expected)
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(
      await withQaClient('padova-qa-schema-check', async (client) => {
        const table = await client.query(
          `SELECT to_regclass('padova.booking_relations') AS booking_relations,
                  to_regclass('padova.invoice_drafts') AS invoice_drafts,
                  to_regclass('padova.fee_settings') AS fee_settings`,
        );
        const versions = await client.query(
          `SELECT version FROM padova.app_schema_versions
           WHERE version IN (
             '20261028_existing_padova_adapter',
             '20261125_booking_relations',
             '20261125_invoice_drafts',
             '20261125_fee_settings'
           )
           ORDER BY version`,
        );
        return {
          ok: true,
          project_ref: PADOVA_QA_PROJECT.ref,
          tables: table.rows[0],
          versions: versions.rows.map((r) => r.version),
          allowed: Object.keys(QA_SCHEMA_SCRIPTS),
        };
      }),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if ('error' in auth) return auth.error;
  try {
    const body = (await request.json().catch(() => ({}))) as { script?: string };
    const script = String(body.script || '').trim() as QaSchemaScript;
    const sql = QA_SCHEMA_SCRIPTS[script];
    if (!sql)
      return NextResponse.json(
        { error: `Script not allowed. Use one of: ${Object.keys(QA_SCHEMA_SCRIPTS).join(', ')}` },
        { status: 400 },
      );

    return NextResponse.json(
      await withQaClient('padova-qa-schema-apply', async (client) => {
        await client.query(sql);
        const check = await client.query(
          `SELECT to_regclass('padova.booking_relations') AS booking_relations,
                  to_regclass('padova.invoice_drafts') AS invoice_drafts,
                  to_regclass('padova.fee_settings') AS fee_settings`,
        );
        return {
          ok: true,
          applied: script,
          project_ref: PADOVA_QA_PROJECT.ref,
          tables: check.rows[0],
        };
      }),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
