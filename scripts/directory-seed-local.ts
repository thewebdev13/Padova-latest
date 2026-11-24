/**
 * Phase 1 — local directory seed from PM extract JSON.
 * Creates parties / booking methods / accepted referral orgs only.
 * Never creates bookings, payments, costs, or receipts.
 *
 * Usage (stop `npm run dev` first):
 *   node --env-file-if-exists=.env.local --import tsx scripts/directory-seed-local.ts
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase } from '../src/lib/db';
import { execute, type CommandKind } from '../src/lib/finance';
import { executePartnership } from '../src/lib/partnerships/service';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';

if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('directory-seed-local is local-only; cloud seeding is prohibited');

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
const staffRow = (
  await db.query(
    `SELECT id, name, role, permissions FROM staff WHERE active = true AND role = 'OWNER' ORDER BY created_at LIMIT 1`,
  )
).rows[0];
if (!staffRow) throw new Error('No local Owner staff row — run staff:create first');

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
    reason: 'Directory seed from PM 2026 sheet (names only)',
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
        reason: 'Directory seed role merge (PM 2026 names)',
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

for (const name of manifest.airlines) {
  const r = await ensureParty({
    name,
    kind: 'supplier',
    roles: ['seller', 'airline'],
  });
  if (r.created) summary.airlines_created++;
  else summary.airlines_existing++;
}

const customerNames = new Set(manifest.customers.map(norm));
for (const name of manifest.customers) {
  const r = await ensureParty({
    name,
    kind: 'person',
    roles: ['customer', 'traveler'],
  });
  if (r.created) summary.customers_created++;
  else summary.customers_existing++;
}

for (const name of manifest.travelers) {
  if (customerNames.has(norm(name))) continue;
  const r = await ensureParty({
    name,
    kind: 'person',
    roles: ['traveler'],
  });
  if (r.created) summary.travelers_created++;
  else summary.travelers_existing++;
}

for (const name of manifest.account_holders) {
  const r = await ensureParty({
    name,
    kind: 'person',
    roles: ['contact'],
  });
  if (r.created) summary.contacts_created++;
  else summary.contacts_existing++;
}

const topSites = manifest.booking_websites.slice(0, 40);
for (const { host } of topSites) {
  const name = host;
  const existing = (
    await db.query(
      `SELECT id FROM booking_source_methods WHERE lower(name) = $1 LIMIT 1`,
      [norm(name)],
    )
  ).rows[0];
  if (existing) {
    summary.methods_existing++;
    continue;
  }
  await run('booking_source_method', {
    name,
    products: ['Flight', 'Hotel', 'Car', 'Other'],
    award: false,
  });
  summary.methods_created++;
}

/** Referral orgs: sheet client tags that are clearly groups (not individual people). */
const orgSeeds = manifest.referral_org_candidates.filter((n) =>
  /lonley|shraga|stefansky|group|org|shul|school|yeshiva|camp/i.test(n),
);
for (const raw of orgSeeds.length ? orgSeeds : ['Lonley', 'Shraga']) {
  const name = raw.replace(/\b\w/g, (c) => c.toUpperCase());
  const existingOrg = (
    await db.query(
      `SELECT id, version, relationship, accounting_party_id FROM pt_organizations
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
    summary: 'Directory seed — confirm real referral terms with Owner before production use',
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
      'Directory seed default: 20% of profit; payable when earned; realized economics. Confirm with Owner.',
    confirmed_on: today,
    confirmation_method: 'Local directory seed (practice)',
    evidence_url: 'https://local.invalid/directory-seed/pm-2026',
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
