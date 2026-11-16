import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/lib/db';
import { execute } from '../src/lib/finance';
import { login, sessionActor, logout } from '../src/lib/users';
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Practice only');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(path.join(process.env.PADOVA_DATA_DIR, 'PG_VERSION')))
  throw new Error('Existing Practice required');
const db = await createDatabase();
let token: string | undefined;
try {
  const session = await login(
    db,
    JSON.parse(await readFile('.data/owner-acceptance-access.json', 'utf8')),
  );
  token = session.token;
  const actor = await sessionActor(db, token);
  if (actor?.role !== 'OWNER' || session.user.email !== 'demo@example.invalid')
    throw new Error('Individual synthetic Owner required');
  const run = (kind: any, data: any) => execute(db, actor, { id: randomUUID(), kind, data });
  const stats = async () =>
    (
      await db.query(
        'SELECT (SELECT count(*) FROM bookings) bookings,(SELECT count(*) FROM journal_lines) journals,(SELECT count(*) FROM asset_movements) movements',
      )
    ).rows[0];
  const before = await stats();
  const parties = (await db.query('SELECT * FROM parties')).rows;
  const airlines = [
    'El Al',
    'United Airlines',
    'Delta Air Lines',
    'American Airlines',
    'JetBlue',
    'Arkia',
    'Israir',
    'Lufthansa',
    'Air France',
    'KLM',
    'ITA Airways',
    'British Airways',
  ];
  let enriched = 0;
  for (const p of parties.filter((p) => p.details?.test_reference_only)) {
    const role = airlines.includes(p.name)
      ? 'airline'
      : ['Hilton', 'Hyatt', 'Marriott'].includes(p.name)
        ? 'hotel_brand'
        : ['Expedia TAAP', 'BedsOnline'].includes(p.name)
          ? 'booking_platform'
          : p.name === 'Capital One'
            ? 'issuer'
            : null;
    if (role && !p.roles.includes(role)) {
      await run('edit_party', {
        party_id: p.id,
        name: p.name,
        roles: [...p.roles, role],
        email: p.email ?? '',
        phone: p.phone ?? '',
        details: p.details,
        reason: 'Explicit Practice catalog subtype; preserve IDs, provenance and prior roles',
      });
      enriched++;
    }
  }
  const qa: any = {};
  for (const [name, kind, roles] of [
    ['QA Final Customer', 'company', ['customer']],
    ['QA Final Seller', 'person', ['seller']],
    ['QA Final Traveler', 'person', ['traveler']],
    ['QA Final Hotel', 'company', ['property']],
    ['QA Final Airline', 'company', ['airline']],
  ] as const) {
    const existing = parties.filter((p) => p.name === name);
    if (existing.length > 1) throw new Error('Ambiguous QA identity');
    qa[name] = existing[0] ?? (await run('party', { name, kind, roles }));
  }
  const accounts = (await db.query('SELECT * FROM payment_accounts ORDER BY name')).rows;
  qa.card =
    accounts.find((a) => a.name === 'QA Final Padova Card') ??
    (await run('payment_account', {
      name: 'QA Final Padova Card',
      kind: 'Card',
      ownership: 'Padova',
      supported_methods: ['Card'],
      last_four: '1234',
    }));
  if (JSON.stringify(before) !== JSON.stringify(await stats()))
    throw new Error('Setup changed financial history');
  await writeFile(
    '.data/final-practice-setup.json',
    JSON.stringify(
      {
        enriched,
        accountsReviewed: accounts.length,
        unverifiedAccounts: accounts
          .filter((a) => a.ownership === 'Unknown')
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            ownership: a.ownership,
            active: a.active,
            supported_methods: a.supported_methods,
          })),
        qa,
        financialHistoryUnchanged: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      enriched,
      accountsReviewed: accounts.length,
      unverifiedAccounts: accounts.filter((a) => a.ownership === 'Unknown').length,
      financialHistoryUnchanged: true,
    }),
  );
} finally {
  if (token) await logout(db, token);
  await db.close();
}
