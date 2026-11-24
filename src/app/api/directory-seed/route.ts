import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { execute, type CommandKind } from '@/lib/finance';
import { executePartnership } from '@/lib/partnerships/service';
import { OWNER_PERMISSIONS, type Actor } from '@/lib/permissions';
import { PADOVA_QA_PROJECT } from '@/lib/project';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Manifest = {
  airlines?: string[];
  customers?: string[];
  travelers?: string[];
  account_holders?: string[];
  booking_websites?: { host: string; count: number }[];
  referral_org_candidates?: string[];
  source?: { money?: boolean; purpose?: string };
};

const MARK = 'directory_seed:pm-2026';

function norm(s: string) {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

export async function POST(request: Request) {
  try {
    if (process.env.PADOVA_QA !== '1')
      return NextResponse.json({ error: 'Directory seed only on QA' }, { status: 403 });
    if (process.env.PADOVA_QA_PROJECT_REF !== PADOVA_QA_PROJECT.ref)
      return NextResponse.json({ error: 'QA project ref mismatch' }, { status: 403 });
    const expected = process.env.PADOVA_DIRECTORY_SEED_TOKEN?.trim();
    if (!expected)
      return NextResponse.json({ error: 'PADOVA_DIRECTORY_SEED_TOKEN not configured' }, { status: 503 });
    const got = request.headers.get('x-directory-seed-token')?.trim();
    if (!got || got !== expected)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Manifest;
    if (body?.source?.money === true)
      return NextResponse.json({ error: 'Money seed refused' }, { status: 400 });
    if (body?.source?.purpose && body.source.purpose !== 'directory_seed_only')
      return NextResponse.json({ error: 'purpose must be directory_seed_only' }, { status: 400 });

    const db = await database();
    const staffRow = (
      await db.query(
        `SELECT id, name, role, permissions FROM staff WHERE active = true AND role = 'OWNER' ORDER BY created_at LIMIT 1`,
      )
    ).rows[0];
    if (!staffRow) return NextResponse.json({ error: 'No Owner staff on QA' }, { status: 500 });

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
        const details = { ...(existing.details ?? {}), directory_seed: MARK };
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
        return { id: existing.id as string, created: false };
      }
      const row = await run('party', {
        name: opts.name,
        kind: opts.kind,
        roles: opts.roles,
        details: { directory_seed: MARK },
      });
      return { id: row.id as string, created: true };
    }

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

    for (const name of body.airlines ?? []) {
      const r = await ensureParty({ name, kind: 'supplier', roles: ['seller', 'airline'] });
      if (r.created) summary.airlines_created++;
      else summary.airlines_existing++;
    }

    const customers = body.customers ?? [];
    const customerNames = new Set(customers.map(norm));
    for (const name of customers) {
      const r = await ensureParty({ name, kind: 'person', roles: ['customer', 'traveler'] });
      if (r.created) summary.customers_created++;
      else summary.customers_existing++;
    }

    for (const name of body.travelers ?? []) {
      if (customerNames.has(norm(name))) continue;
      const r = await ensureParty({ name, kind: 'person', roles: ['traveler'] });
      if (r.created) summary.travelers_created++;
      else summary.travelers_existing++;
    }

    for (const name of body.account_holders ?? []) {
      const r = await ensureParty({ name, kind: 'person', roles: ['contact'] });
      if (r.created) summary.contacts_created++;
      else summary.contacts_existing++;
    }

    for (const { host } of (body.booking_websites ?? []).slice(0, 40)) {
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

    const orgSeeds = (body.referral_org_candidates ?? []).filter((n) =>
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
        confirmed_on: today(),
        confirmation_method: 'QA directory seed (practice)',
        evidence_url: 'https://qa.invalid/directory-seed/pm-2026',
        starts_on: today(),
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

    return NextResponse.json({ ok: true, mark: MARK, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Directory seed failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
