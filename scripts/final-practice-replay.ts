import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createDatabase } from '../src/lib/db';
import { login, sessionActor, logout } from '../src/lib/users';
import { importPracticeFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Practice only');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(path.join(process.env.PADOVA_DATA_DIR, 'PG_VERSION')))
  throw new Error('Reuse existing Practice');
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
  const common = {
    source_system: 'practice-final-qa',
    source_key: 'final-replay-v1',
    evidence_id: '20000000-0000-4000-8000-000000000030',
    source_locator: { kind: 'synthetic QA plan', version: 1 },
    reviewer_decision:
      'Owner-authorized synthetic Practice acceptance only; no source financial claims',
  };
  const event = (event_role: string, kind: any, data: any): ImportEvent => ({
    ...common,
    event_role,
    kind,
    data,
  });
  const ref = (role: string, field = 'id') => ({ $event: role, field });
  const date = '2026-10-29';
  const plan = [
    event('customer', 'party', {
      name: 'QA Replay Customer',
      kind: 'company',
      roles: ['customer'],
    }),
    event('traveler', 'party', { name: 'QA Replay Traveler', kind: 'person', roles: ['traveler'] }),
    event('seller', 'party', { name: 'QA Replay Seller', kind: 'person', roles: ['seller'] }),
    event('booking', 'booking', {
      customer_id: ref('customer'),
      supplier_id: ref('seller'),
      traveler_ids: [ref('traveler')],
      product: 'Flight',
      channel: 'Direct',
      summary: 'QA FINAL IMPORT REPLAY',
      booked_on: date,
      travel_start: '2026-11-10',
      travel_end: '2026-11-17',
      sale: 92500,
    }),
    event('funding', 'fund', {
      booking_id: ref('booking'),
      seller_id: ref('seller'),
      kind: 'Complete ticket',
      face_amount: 65000,
      cost: 65000,
      date,
    }),
    event('receipt', 'payment', {
      party_id: ref('customer'),
      direction: 'customer',
      amount: 92500,
      date,
      method: 'Wire',
      allocations: [{ booking_id: ref('booking'), amount: 92500 }],
    }),
    event('seller-payment', 'payment', {
      party_id: ref('seller'),
      direction: 'supplier',
      amount: 65000,
      date,
      method: 'Wire',
      allocations: [
        {
          booking_id: ref('booking'),
          obligation_id: ref('funding', 'obligation_id'),
          amount: 65000,
        },
      ],
    }),
    event('asset', 'acquire_asset', {
      name: 'QA Replay Voucher',
      kind: 'Voucher',
      issuer: 'Synthetic QA issuer',
      quantity: 100000,
      cost: 80000,
      date,
      seller_id: ref('seller'),
    }),
    event('asset-use', 'fund', {
      booking_id: ref('booking'),
      kind: 'Voucher',
      asset_id: ref('asset'),
      face_amount: 10000,
      date,
    }),
    event('commission', 'commission', {
      booking_id: ref('booking'),
      payer_id: ref('seller'),
      gross: 10000,
      due_on: date,
      date,
    }),
    event('commission-receipt', 'payment', {
      party_id: ref('seller'),
      direction: 'commission',
      amount: 3000,
      date,
      method: 'Wire',
      commission_allocations: [{ commission_id: ref('commission'), amount: 3000 }],
    }),
    event('refund', 'cancel', {
      booking_id: ref('booking'),
      supplier_expected: 10000,
      customer_due: 10000,
      charge_reduction: 10000,
      due_on: date,
      date,
      reason: 'Synthetic QA partial refund only',
    }),
    event('supplier-refund', 'receive_refund', {
      refund_id: ref('refund'),
      amount: 10000,
      form: 'cash',
      date,
      method: 'Wire',
    }),
    event('customer-refund', 'pay_refund', {
      refund_id: ref('refund'),
      amount: 10000,
      date,
      method: 'Wire',
    }),
  ];
  const tables = [
    'parties',
    'booking_travelers',
    'bookings',
    'charges',
    'payments',
    'payment_allocations',
    'supplier_obligations',
    'obligation_settlements',
    'assets',
    'asset_lots',
    'asset_movements',
    'commissions',
    'commission_allocations',
    'refunds',
    'refund_movements',
    'journal_lines',
    'profit_movements',
    'review_resolution_events',
    'booking_source_profiles',
    'source_profile_assets',
  ];
  const stats = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          (
            await db.query(
              `SELECT count(*) n,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM ${table} t`,
            )
          ).rows[0],
        ]),
      ),
    );
  const first = await importPracticeFinancialPlan(db, actor, plan),
    before = await stats(),
    second = await importPracticeFinancialPlan(db, actor, plan),
    after = await stats();
  if (JSON.stringify(before) !== JSON.stringify(after) || second.created)
    throw new Error('Replay duplicated or changed economic events');
  await writeFile(
    '.data/final-practice-replay.json',
    JSON.stringify({ first, second, before, after, zeroAdditionalEconomicEvents: true }, null, 2),
  );
  console.log(
    JSON.stringify({
      firstCreated: first.created,
      replayed: second.replayed,
      zeroAdditionalEconomicEvents: true,
    }),
  );
} finally {
  if (token) await logout(db, token);
  await db.close();
}
