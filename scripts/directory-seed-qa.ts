/**
 * Phase 1 — QA directory seed from PM extract JSON (names only).
 * Never creates bookings, payments, costs, or receipts.
 * Never targets production (unug…).
 *
 * Run with Vercel QA secrets (do not write .env):
 *   PADOVA_DIRECTORY_SEED_QA=YES npx vercel env run -e production -- \
 *     node --import tsx scripts/directory-seed-qa.ts
 */
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase, requireCurrentSchema } from '../src/lib/db';
import { execute, type CommandKind } from '../src/lib/finance';
import { executePartnership } from '../src/lib/partnerships/service';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';
import { PADOVA_PROJECT, PADOVA_QA_PROJECT } from '../src/lib/project';

if (process.env.PADOVA_DIRECTORY_SEED_QA !== 'YES')
  throw new Error('Refusing QA directory seed without PADOVA_DIRECTORY_SEED_QA=YES');

if (process.env.PADOVA_QA !== '1')
  throw new Error('QA directory seed requires PADOVA_QA=1 from Vercel env');
if (process.env.PADOVA_DATABASE_MODE !== 'supabase')
  throw new Error('QA directory seed requires PADOVA_DATABASE_MODE=supabase');
if (process.env.PADOVA_QA_PROJECT_REF !== PADOVA_QA_PROJECT.ref)
  throw new Error(`QA directory seed requires PADOVA_QA_PROJECT_REF=${PADOVA_QA_PROJECT.ref}`);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing from Vercel env run');
if (process.env.DATABASE_URL.includes(PADOVA_PROJECT.ref))
  throw new Error('Refusing to seed production database');
if (!process.env.DATABASE_URL.includes(PADOVA_QA_PROJECT.ref))
  throw new Error('DATABASE_URL is not the QA project');
if (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== PADOVA_QA_PROJECT.url)
  throw new Error('SUPABASE_URL is not the QA project');

// Local machine may not have the Vercel CA path; drop sslrootcert if file missing.
if (process.env.PADOVA_DB_CA_FILE) {
  try {
    await access(process.env.PADOVA_DB_CA_FILE);
  } catch {
    console.warn('PADOVA_DB_CA_FILE not on this machine; using sslmode=verify-full without local CA path');
    delete process.env.PADOVA_DB_CA_FILE;
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL);
      u.searchParams.delete('sslrootcert');
      process.env.DATABASE_URL = u.toString();
    }
  }
}

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST = path.join(ROOT, '.data', 'directory-seed', 'pm-2026-directory.json');
const MARK = 'directory_seed:pm-2026';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

type Manifest = {
  airlines: string[];
  customers: string[];
  travelers: string[];
  account_holders: string[];
  booking_websites: { host: string; count: number }[];
  referral_org_candidates: string[];
};

function norm(s: string) {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

const db = await createDatabase();
await requireCurrentSchema(db);

const staffRow = (
  await db.query(
    `SELECT id, name, role, permissions FROM staff WHERE active = true AND role = 'OWNER' ORDER BY created_at LIMIT 1`,
  )
).rows[0];
if (!staffRow) throw new Error('No QA Owner staff row');

const actor: Actor = {
  id: staffRow.id,
  name: staffRow.name,
  role: 'OWNER',
  permissions: [...OWNER_PERMISSIONS],
};

const run = (kind: CommandKind, data: unknown) =>
  execute(db, actor, { id: randomUUID(), kind, data });
const partner = (kind: string, data: unknown) =>
  executePartnership(db, actor, {
    id: randomUUID(),
    kind,
    data,
    reason: 'QA directory seed from PM 2026 sheet (names only)',
  });

async function ensureParty(opts: {
  name: string;
  kind: 'person' | 'company' | 'supplier' | 'partner';
  roles: string[];
}) {
  const existing = (
    await db.query(
      `SELECT id, roles, details FROM parties
       WHERE lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $1
       ORDER BY created_at LIMIT 1`,
      [norm(opts.name)],
    )
  ).rows[0];
  if (existing) {
    const roles = [...new Set([...(existing.roles ?? []), ...opts.roles])];
    const details = {
      ...(existing.details ?? {}),
      directory_seed: MARK,
    };
    const sameRoles =
      roles.length === (existing.roles ?? []).length &&
      roles.every((r) => (existing.roles ?? []).includes(r));
    if (!sameRoles || existing.details?.directory_seed !== MARK) {
      await run('edit_party', {
        party_id: existing.id,
        name: opts.name,
        email: '',
        phone: '',
        roles,
        details,
        reason: 'QA directory seed role merge (PM 2026 names)',
      });
    }
    return { id: existing.id, created: false };
  }
  const row = await run('party', {
    name: opts.name,
    kind: opts.kind,
    roles: opts.roles,
    details: { directory_seed: MARK },
  });
  return { id: row.id as string, created: true };
}

const manifest: Manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const summary = {
  target: 'qa',
  project_ref: PADOVA_QA_PROJECT.ref,
  airlines_created: 0,
  airlines_existing: 0,
  customers_created: 0,
  customers_existing: 0,
  travelers_created: 0,
  travelers_existing: 0,
  contacts_created: 0,
  contacts_existing: 0,
  methods_created: 0,
  methods_existing: 0,
  orgs_created: 0,
  orgs_existing: 0,
};

console.log(
  JSON.stringify({
    starting: true,
    project_ref: PADOVA_QA_PROJECT.ref,
    db_host_ok: process.env.DATABASE_URL!.includes(PADOVA_QA_PROJECT.ref),
  }),
);

for (const name of manifest.airlines) {
  const r = await ensureParty({ name, kind: 'supplier', roles: ['seller', 'airline'] });
  if (r.created) summary.airlines_created++;
  else summary.airlines_existing++;
}

const customerNames = new Set(manifest.customers.map(norm));
for (const name of manifest.customers) {
  const r = await ensureParty({ name, kind: 'person', roles: ['customer', 'traveler'] });
  if (r.created) summary.customers_created++;
  else summary.customers_existing++;
}

for (const name of manifest.travelers) {
  if (customerNames.has(norm(name))) continue;
  const r = await ensureParty({ name, kind: 'person', roles: ['traveler'] });
  if (r.created) summary.travelers_created++;
  else summary.travelers_existing++;
}

for (const name of manifest.account_holders) {
  const r = await ensureParty({ name, kind: 'person', roles: ['contact'] });
  if (r.created) summary.contacts_created++;
  else summary.contacts_existing++;
}

for (const { host } of manifest.booking_websites.slice(0, 40)) {
  const existing = (
    await db.query(`SELECT id FROM booking_source_methods WHERE lower(name) = $1 LIMIT 1`, [
      norm(host),
    ])
  ).rows[0];
  if (existing) {
    summary.methods_existing++;
    continue;
  }
  await run('booking_source_method', {
    name: host,
    products: ['Flight', 'Hotel', 'Car', 'Other'],
    award: false,
  });
  summary.methods_created++;
}

const orgSeeds = manifest.referral_org_candidates.filter((n) =>
  /lonley|shraga|stefansky|group|org|shul|school|yeshiva|camp/i.test(n),
);
for (const raw of orgSeeds.length ? orgSeeds : ['Lonley', 'Shraga']) {
  const name = raw.replace(/\b\w/g, (c) => c.toUpperCase());
  const existingOrg = (
    await db.query(
      `SELECT id FROM pt_organizations
       WHERE lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $1
       LIMIT 1`,
      [norm(name)],
    )
  ).rows[0];
  if (existingOrg) {
    summary.orgs_existing++;
    continue;
  }
  const payee = await ensureParty({
    name: `${name} Referral Payee`,
    kind: 'company',
    roles: ['referrer', 'partner'],
  });
  const org = await partner('organization', {
    name,
    location: 'From PM 2026 sheet client tag',
    summary: 'QA directory seed — confirm real referral terms with Owner before production use',
  });
  await partner('organization', {
    id: org.id,
    version: org.version ?? 1,
    name,
    location: 'From PM 2026 sheet client tag',
    accounting_party_id: payee.id,
  });
  await partner('agreement', {
    organization_id: org.id,
    version: 1,
    status: 'accepted',
    supersedes_id: null,
    original_wording:
      'QA directory seed default: 20% of profit; payable when earned; realized economics. Confirm with Owner.',
    confirmed_on: today,
    confirmation_method: 'QA directory seed (practice)',
    evidence_url: 'https://qa.invalid/directory-seed/pm-2026',
    starts_on: today,
    ends_on: null,
    terms: {
      calculation: 'percentage',
      fixed_amount: null,
      rate_bps: 2000,
      percentage_basis: 'profit',
      payable_when: 'When earned',
      eligibility: 'Referring organization on booking',
      cancellation_rule: 'Realized economics',
      currency: 'USD',
    },
  });
  const refreshed = (
    await db.query(`SELECT id, version FROM pt_organizations WHERE id = $1`, [org.id])
  ).rows[0];
  await partner('relationship', {
    id: refreshed.id,
    version: refreshed.version,
    relationship: 'active',
    dnc_reason: '',
  });
  summary.orgs_created++;
}

await db.close();
console.log(JSON.stringify({ ok: true, mark: MARK, summary }, null, 2));
