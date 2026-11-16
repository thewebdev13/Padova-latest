import path from 'node:path';
import { z } from 'zod';
import type { Database } from './db';
import type { Actor, Permission } from './permissions';
import { freshActor, AccessError } from './users';
import { redactOperationalValue } from './operational-redaction';
import { PADOVA_QA_PROJECT, selectedSupabaseProject, validateDatabaseTarget } from './project';

export const QA_PERMISSIONS: Permission[] = [
  'operations',
  'view_sale_price',
  'view_supplier_cost',
  'view_booking_profit',
  'view_asset_basis',
  'edit_payments',
  'edit_customer_charges',
  'manage_funding',
  'view_refunds',
  'issue_refunds',
  'view_commissions',
  'manage_commissions',
  'manage_assets',
  'edit_completed_bookings',
  'view_traveler_sensitive',
];

// A separate local fixture is necessary: existing Practice includes source-derived labels.
// Fail closed before opening any connection; never reuse the owner's .env.local in QA.
export function assertQAIsolation(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_PROJECT_ID === 'prj_sHhN3MbYAAsTIwm4jJZWTbvkYucA' && env.PADOVA_QA !== '1')
    throw new Error('This Vercel project may only run synthetic QA');
  if (env.PADOVA_QA !== '1') return;
  if (env.PADOVA_DATABASE_MODE === 'supabase') {
    selectedSupabaseProject(env);
    if (!env.DATABASE_URL || env.SUPABASE_URL !== PADOVA_QA_PROJECT.url)
      throw new Error('Hosted QA requires only its dedicated Supabase database and Auth');
    validateDatabaseTarget(env);
    for (const [key, value] of Object.entries(env)) {
      if (
        value &&
        /BACKUP_|EVIDENCE|GMAIL|GOOGLE_APPLICATION_CREDENTIALS|^PADOVA_PRODUCTION_|^PRODUCTION_(DATABASE|SUPABASE|SECRET)/i.test(
          key,
        )
      )
        throw new Error('Production, source and recovery credentials are forbidden in QA');
    }
    return;
  }
  if (
    env.PADOVA_DATABASE_MODE !== 'local' ||
    path.resolve(/* turbopackIgnore: true */ env.PADOVA_DATA_DIR ?? '') !==
      path.resolve('.data/remote-qa')
  )
    throw new Error('QA requires its dedicated synthetic database');
  for (const [key, value] of Object.entries(env)) {
    if (value && /SUPABASE|DATABASE_URL|BACKUP_|EVIDENCE|AUTH_ENCRYPTION/.test(key))
      throw new Error('QA cannot run with production, source or recovery credentials');
  }
}

const issueSchema = z.object({
  type: z.enum(['Bug', 'Confusing', 'Missing', 'Too Slow', 'Suggestion']),
  section: z.string().trim().min(1).max(200),
  booking: z.string().trim().max(100).default(''),
  expected: z.string().trim().min(1).max(4000),
  happened: z.string().trim().min(1).max(4000),
  notes: z.string().trim().max(4000).default(''),
});
async function authorize(db: Database, actor: Actor) {
  if (process.env.PADOVA_QA !== '1') throw new AccessError('QA reports are unavailable', 404);
  assertQAIsolation();
  if (db.storage === 'padova') {
    const marker = (
      await db.query('SELECT project_ref,data_class FROM padova.qa_environment WHERE id=true')
    ).rows[0];
    if (marker?.project_ref !== PADOVA_QA_PROJECT.ref || marker?.data_class !== 'synthetic')
      throw new AccessError('QA requires its dedicated synthetic storage');
  }
  actor = await freshActor(db, actor);
  if (actor.role !== 'OWNER' && !actor.permissions.includes('operations'))
    throw new AccessError('QA access required');
  return actor;
}
export async function listQAIssues(db: Database, actor: Actor) {
  actor = await authorize(db, actor);
  return (
    await db.query(
      `SELECT * FROM qa_issues ${actor.role === 'OWNER' ? '' : 'WHERE reporter_id=$1'} ORDER BY created_at DESC LIMIT 500`,
      actor.role === 'OWNER' ? [] : [actor.id],
    )
  ).rows;
}
export async function submitQAIssue(db: Database, actor: Actor, input: unknown) {
  const data = issueSchema.parse(redactOperationalValue(input));
  return db.transaction(async (tx) => {
    actor = await authorize({ ...db, ...tx }, actor);
    const count = (
      await tx.query('SELECT count(*) n FROM qa_issues WHERE reporter_id=$1', [actor.id])
    ).rows[0];
    if (Number(count.n) >= 200)
      throw new AccessError('Report limit reached; contact the Owner', 429);
    return (
      await tx.query(
        'INSERT INTO qa_issues(reporter_id,reporter_name,type,section,booking,expected,happened,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [
          actor.id,
          actor.name,
          data.type,
          data.section,
          data.booking,
          data.expected,
          data.happened,
          data.notes,
        ],
      )
    ).rows[0];
  });
}
