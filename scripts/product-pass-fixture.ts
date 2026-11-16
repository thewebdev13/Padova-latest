import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../src/lib/db';
import {
  login,
  logout,
  sessionActor,
  createUser,
  issueRecovery,
  completeRecovery,
} from '../src/lib/users';
import { execute } from '../src/lib/finance';

if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Synthetic local fixture only');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(process.env.PADOVA_DATA_DIR))
  throw new Error('Existing acceptance fixture required');
const access = JSON.parse(await readFile('.data/owner-acceptance-access.json', 'utf8'));
const db = await createDatabase();
try {
  const session = await login(db, access),
    owner = await sessionActor(db, session.token);
  if (!owner || owner.role !== 'OWNER' || owner.name !== 'Demo Owner')
    throw new Error('Synthetic Demo Owner required');
  const customer = (
    await db.query("SELECT id FROM parties WHERE name='PASS1 Casey Direct' AND archived_at IS NULL")
  ).rows[0];
  if (!customer) throw new Error('Reuse the browser-created synthetic customer');
  const booking = await execute(db, owner, {
    id: '68a665a2-57b0-4c3f-91c5-7148015d1382',
    kind: 'booking',
    data: {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'Unknown historical channel',
      summary: 'PASS1 historical source preservation (synthetic)',
      booked_on: '2026-10-29',
      travel_start: '2026-11-25',
      travel_end: '2026-11-26',
      sale: 0,
      itinerary: {
        cost_status: 'Pending',
        historical_sources: [
          {
            workbook_id: 'synthetic-master',
            workbook_title: 'Synthetic master accounting',
            tab: 'accounting',
            row: 12,
            snapshot_id: 'SYNTHETIC-PRODUCT-PASS',
            original_fields: {
              Customer: 'Synthetic original alias',
              Cost: '',
              Paid: 'Unverified synthetic payment text; no receipt created',
              Notes: 'Original first note\nOriginal second note — preserve exact text',
              'Future instrument description': 'Unclassified synthetic travel value',
            },
          },
          {
            workbook_id: 'synthetic-pm',
            workbook_title: 'Synthetic PM accounting',
            tab: 'PM',
            row: 25,
            snapshot_id: 'SYNTHETIC-PRODUCT-PASS',
            original_fields: {
              'Original Rate': '',
              'New Rate': '',
              Notes:
                'Second source belongs to the same synthetic booking; no extra booking or financial claim is posted.',
            },
          },
        ],
      },
    },
  });
  const email = 'product.worker@example.invalid';
  const existing = (await db.query('SELECT id FROM staff WHERE email=$1', [email])).rows[0];
  if (!existing) {
    const user = await createUser(db, owner, {
      name: 'Demo Product Worker',
      email,
      role: 'EMPLOYEE',
      permissions: ['operations', 'edit_payments'],
      reason: 'Isolated browser permission acceptance',
    });
    const proof = await issueRecovery(db, owner, user.id),
      password = randomBytes(24).toString('base64url');
    await completeRecovery(db, { token: proof.token, password });
    await writeFile('.data/owner-acceptance-employee.json', JSON.stringify({ email, password }));
  } else if (!existsSync('.data/owner-acceptance-employee.json'))
    throw new Error(
      'Existing synthetic worker credential is unavailable; do not reset it silently',
    );
  await logout(db, session.token);
  console.log(
    JSON.stringify({
      syntheticSourceBooking: booking.code,
      syntheticWorkerReady: true,
      financialPostingsFromSource: 0,
    }),
  );
} finally {
  await db.close();
}
