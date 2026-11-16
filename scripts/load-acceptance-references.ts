import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDatabase } from '../src/lib/db';
import { execute } from '../src/lib/finance';
import { login, sessionActor, logout } from '../src/lib/users';
import {
  referenceKey,
  singleTravelerLabel,
  sourceName,
  confirmedCustomerGroups,
  directoryContextLabel,
} from '../src/lib/test-reference';

if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Reference fixture is local-only; cloud writes prohibited');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(process.env.PADOVA_DATA_DIR))
  throw new Error('Reuse the existing acceptance fixture; do not create a database');
const root = '.data/historical-cutover';
const capture = JSON.parse(await readFile(`${root}/capture.json`, 'utf8'));
type Candidate = {
  name: string;
  kind: string;
  roles: string[];
  email?: string;
  phone?: string;
  sources: any[];
  aliases: string[];
};
const candidates = new Map<string, Candidate>();
const held: any[] = [];
const accounts = new Map<string, { name: string; sources: any[] }>();
const rows = (name: string) => {
  const f = capture.files.find((f: any) => f.path === `tables/${name}.json`);
  return capture.evidence.filter((e: any) => e.file_id === f?.id);
};
const aliases = rows('customer_aliases');
const groups = confirmedCustomerGroups(aliases, rows('owner_decisions'));
function add(name: unknown, role: string, source: any, kind?: string, contact?: any) {
  if (typeof name !== 'string' || !name.trim() || name.length > 300) return;
  let label = name.trim().replace(/\s+/g, ' ');
  if (/^personal\b/i.test(label)) {
    held.push({
      label,
      source,
      reason: 'Personal transaction description, not a directory identity',
    });
    return;
  }
  const alias = role === 'customer' ? groups.resolve(label) : undefined;
  const original = label;
  if (alias) label = alias.name;
  else if (role === 'customer' && directoryContextLabel(label)) {
    held.push({
      label,
      source,
      reason:
        'Booking/payment qualifier is not an approved separate customer identity; preserve for review, not a name picker',
    });
    return;
  }
  const key = referenceKey(label);
  const existing = candidates.get(key);
  const resolvedKind =
    kind ??
    (role === 'traveler'
      ? 'person'
      : /\b(LLC|INC\.?|LTD\.?)\b/i.test(label)
        ? 'company'
        : 'partner');
  if (existing) {
    existing.roles = [...new Set([...existing.roles, role])];
    existing.sources.push(
      source,
      ...(alias ? [{ confirmedGroupingEvidence: alias.evidence }] : []),
    );
    existing.aliases = [...new Set([...existing.aliases, original])];
    if (!existing.email && contact?.email) existing.email = contact.email;
    if (!existing.phone && contact?.phone) existing.phone = contact.phone;
    return;
  }
  candidates.set(key, {
    name: label,
    kind: resolvedKind,
    roles: [role],
    ...contact,
    sources: [source, ...(alias ? [{ confirmedGroupingEvidence: alias.evidence }] : [])],
    aliases: [original],
  });
}
for (const group of groups.approvedGroups)
  add(group.name, 'customer', {
    evidenceId: group.evidenceId,
    decisionId: group.decisionId,
    scope: 'Preserved explicit Owner customer grouping',
  });
for (const e of rows('customer_directory'))
  add(
    e.raw.name,
    'customer',
    {
      evidenceId: e.id,
      evidenceClass: e.evidence_class,
      link: e.raw.source_link,
      row: e.raw.directory_row,
    },
    undefined,
    {
      ...(e.raw.email ? { email: e.raw.email } : {}),
      ...(e.raw.phone ? { phone: e.raw.phone } : {}),
    },
  );

for (const file of (await readdir(root))
  .filter((f) => /^reference-(master|pm)-.*\.json$/.test(f))
  .sort()) {
  const snapshot = JSON.parse(await readFile(`${root}/${file}`, 'utf8'));
  const start = Number(snapshot.range.match(/\d+/)[0]);
  for (const [index, row] of (snapshot.data.values ?? []).entries()) {
    const value = row[0];
    if (typeof value !== 'string' || !value.trim()) continue;
    const source = {
      workbook: snapshot.spreadsheet_id,
      tab: snapshot.sheet_name,
      row: start + index,
      column: snapshot.range.match(/^[A-Z]+/)[0],
      capturedAt: snapshot.capturedAt,
    };
    if (snapshot.name.includes('customers')) add(value, 'customer', source);
    if (snapshot.name.includes('travelers')) {
      if (singleTravelerLabel(value)) add(value, 'traveler', source);
      else
        held.push({
          label: value,
          source,
          reason: 'Unparsed group/ambiguous traveler text; no guessed splitting or legal name',
        });
    }
    if (snapshot.name.includes('accounts')) {
      const key = referenceKey(value);
      const previous = accounts.get(key);
      if (previous) previous.sources.push(source);
      else accounts.set(key, { name: value.trim(), sources: [source] });
    }
    if (snapshot.name.includes('sources')) {
      const name = sourceName(value);
      if (name) add(name, 'rate_source', source, 'partner');
    }
  }
}
// Only preserve explicitly confirmed payer organizations; do not infer employment.
for (const e of rows('relationships').filter(
  (e: any) => e.evidence_class === 'owner_confirmed_payment_to_booking',
))
  if (/\b(LLC|INC\.?|LTD\.?)\b/i.test(e.raw.payer_label ?? ''))
    add(
      e.raw.payer_label,
      'payer',
      { evidenceId: e.id, evidenceClass: e.evidence_class },
      'company',
    );

const providers: [string, RegExp][] = [
  ['El Al', /\bel[ -]?al\b/i],
  ['United Airlines', /\bunited\b/i],
  ['Delta Air Lines', /\bdelta\b/i],
  ['American Airlines', /american airlines|\bAAdvantage\b/i],
  ['JetBlue', /\bjetblue\b/i],
  ['Arkia', /\barkia\b/i],
  ['Israir', /\bisrair\b/i],
  ['Lufthansa', /\blufthansa\b/i],
  ['Air France', /air france/i],
  ['KLM', /\bklm\b/i],
  ['ITA Airways', /ita airways/i],
  ['British Airways', /british airways/i],
  ['Hilton', /\bhilton\b/i],
  ['Hyatt', /\bhyatt\b/i],
  ['Marriott', /\bmarriott\b/i],
  ['Expedia TAAP', /\btaap\b/i],
  ['BedsOnline', /beds\s?online/i],
  ['Capital One', /capital one|\bcap1\b/i],
];
for (const [name, pattern] of providers) {
  const evidence = capture.evidence
    .filter((e: any) => pattern.test(JSON.stringify(e.raw)))
    .slice(0, 3);
  if (evidence.length)
    for (const e of evidence)
      add(
        name,
        ['Hilton', 'Hyatt', 'Marriott'].includes(name)
          ? 'hotel_brand'
          : ['Expedia TAAP', 'BedsOnline'].includes(name)
            ? 'booking_platform'
            : name === 'Capital One'
              ? 'issuer'
              : 'airline',
        {
          evidenceId: e.id,
          evidenceClass: e.evidence_class,
          scope: 'Provider/brand reference only; not a verified historical supplier relationship',
        },
        'supplier',
      );
}
const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [key, canonical(v[key])]),
        )
      : v;
const hash = (v: any) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
const commandId = (key: string) => {
  const h = hash(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const db = await createDatabase();
let token: string | undefined;
try {
  const auth = JSON.parse(await readFile('.data/owner-acceptance-access.json', 'utf8'));
  const session = await login(db, auth);
  token = session.token;
  const actor = await sessionActor(db, token);
  if (!actor || actor.role !== 'OWNER' || session.user.email !== 'demo@example.invalid')
    throw new Error('Synthetic Owner session required');
  const financialTables = [
    'bookings',
    'charges',
    'payments',
    'payment_allocations',
    'supplier_obligations',
    'funding_components',
    'assets',
    'asset_lots',
    'asset_movements',
    'asset_sales',
    'commissions',
    'referrals',
    'refunds',
    'refund_movements',
    'profit_movements',
    'journal_lines',
  ];
  const stats = async () =>
    Object.fromEntries(
      await Promise.all(
        financialTables.map(async (table) => [
          table,
          (
            await db.query(
              `SELECT count(*) n,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) h FROM ${table} t`,
            )
          ).rows[0],
        ]),
      ),
    );
  const before = await stats();
  const existing = (await db.query('SELECT * FROM parties WHERE archived_at IS NULL')).rows;
  const loaded: any[] = [];
  const activeReferenceIds = new Set<string>();
  let created = 0,
    matched = 0;
  for (const [key, c] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    const prior = existing.find((p) => referenceKey(p.name) === key);
    const details = {
      test_reference_only: true,
      identity_status: 'Source label/reference; not approved live identity or relationship',
      aliases: c.aliases,
      search_aliases: c.aliases.filter((name) => !directoryContextLabel(name)),
      source_provenance: c.sources,
    };
    if (prior && !prior.details?.test_reference_only) {
      matched++;
      loaded.push({ id: prior.id, key, preservedExistingFixture: true });
      activeReferenceIds.add(prior.id);
      continue;
    }
    let record;
    if (prior) {
      matched++;
      if (hash(prior.details) === hash(details) && hash(prior.roles) === hash(c.roles)) {
        loaded.push({ id: prior.id, key });
        activeReferenceIds.add(prior.id);
        continue;
      }
      const data = {
        party_id: prior.id,
        name: c.name,
        roles: c.roles,
        email: c.email ?? '',
        phone: c.phone ?? '',
        details,
        reason: 'Refresh private synthetic reference fixture; no historical financial import',
      };
      record = await execute(db, actor, {
        id: commandId(`test-reference-edit:${key}:${hash(data)}`),
        kind: 'edit_party',
        data,
      });
    } else {
      record = await execute(db, actor, {
        id: commandId(`test-reference-create:${key}`),
        kind: 'party',
        data: {
          kind: c.kind,
          name: c.name,
          roles: c.roles,
          email: c.email ?? '',
          phone: c.phone ?? '',
          details,
        },
      });
      created++;
    }
    loaded.push({ id: record.id, key, roles: c.roles, kind: c.kind, sources: c.sources });
    activeReferenceIds.add(record.id);
  }
  const archivedReferences = [];
  for (const previous of existing.filter(
    (p) => p.details?.test_reference_only && !activeReferenceIds.has(p.id),
  )) {
    const canonical = groups.resolve(previous.name);
    const target = canonical
      ? loaded.find((p) => p.key === referenceKey(canonical.name))
      : loaded.find((p) => p.key === referenceKey(previous.name));
    const archiveTime = new Date().toISOString();
    await db.transaction(async (tx) => {
      const details = {
        ...previous.details,
        reference_status: target ? 'superseded_alias' : 'held_source_label',
        canonical_party_id: target?.id ?? null,
        reference_archive_timestamp: archiveTime,
      };
      const data = {
        party_id: previous.id,
        name: previous.name,
        email: previous.email ?? '',
        phone: previous.phone ?? '',
        roles: previous.roles,
        details,
        reason:
          'Correct generated TEST reference directory using all preserved Owner groupings; preserve source/record/history; do not change financial links',
      };
      await execute({ ...db, transaction: async (fn) => fn(tx) }, actor, {
        id: commandId(`test-reference-retire:${previous.id}:${target?.id ?? 'held'}`),
        kind: 'edit_party',
        data,
      });
      await tx.query(
        "UPDATE parties SET archived_at=$2 WHERE id=$1 AND details->>'test_reference_only'='true' AND archived_at IS NULL",
        [previous.id, archiveTime],
      );
    });
    archivedReferences.push({
      id: previous.id,
      name: previous.name,
      canonicalPartyId: target?.id ?? null,
      preservedDetails: previous.details,
    });
  }
  const oldAccounts = (await db.query('SELECT * FROM payment_accounts')).rows;
  const accountMappings = [];
  for (const [key, a] of accounts) {
    const prior = oldAccounts.find((p) => referenceKey(p.name) === key);
    const result =
      prior ??
      (await execute(db, actor, {
        id: commandId(`test-reference-account:${key}`),
        kind: 'payment_account',
        data: { name: a.name, kind: 'Source account', ownership: 'Unknown', supported_methods: [] },
      }));
    accountMappings.push({ id: result.id, ...a, accountTypeUnverified: true });
  }
  const after = await stats();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Financial fixture changed unexpectedly');
  const summary = {
    created,
    matched,
    parties: candidates.size,
    roles: Object.fromEntries(
      ['customer', 'traveler', 'supplier', 'payer', 'rate_source'].map((role) => [
        role,
        [...candidates.values()].filter((c) => c.roles.includes(role)).length,
      ]),
    ),
    companies: [...candidates.values()].filter((c) => c.kind === 'company').length,
    sourceAccounts: accounts.size,
    heldGroupMentions: held.length,
    financialTablesUnchanged: true,
    inferredEmploymentLinks: 0,
    confirmedGroupingDeclarations: groups.declarations,
    groupingAliases: groups.aliasCount,
    groupingConflicts: groups.conflicts,
    archivedGeneratedReferences: archivedReferences.length,
    approvedGroupsWithLiveReference: groups.approvedGroups.filter((g) =>
      loaded.some((p) => p.key === referenceKey(g.name)),
    ).length,
  };
  if (summary.approvedGroupsWithLiveReference !== groups.approvedGroups.length)
    throw new Error('A saved Owner group is missing from the directory');
  await writeFile(
    `${root}/reference-load-receipt.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope: 'Local acceptance fixture only; no Supabase writes',
        summary,
        loaded,
        accountMappings,
        held,
        archivedReferences,
        before,
        after,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (token) await logout(db, token);
  await db.close();
}
