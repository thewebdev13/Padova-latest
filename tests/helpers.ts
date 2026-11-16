import { Actor, OWNER_PERMISSIONS } from '../src/lib/permissions';
import { createDatabase, migrate } from '../src/lib/db';
import { existingFixture } from './padova-fixture';
import { randomUUID } from 'node:crypto';
import { execute } from '../src/lib/finance';
export async function declareNoSupplierCost(
  db: import('../src/lib/db').Database,
  booking_id: string,
  date: string,
) {
  const booking = (await db.query('SELECT * FROM bookings WHERE id=$1', [booking_id])).rows[0];
  await execute(db, testOwner, {
    id: randomUUID(),
    kind: 'revise',
    data: {
      booking_id,
      summary: booking.summary,
      travel_start: booking.travel_start,
      travel_end: booking.travel_end,
      itinerary: { ...booking.itinerary, cost_status: 'No supplier cost' },
      date,
      reason:
        'This synthetic case explicitly has no Padova supplier expense; customer pays provider directly or sale is service-only',
    },
  });
}
export const testOwner: Actor = {
  id: 'synthetic-test-owner',
  name: 'Synthetic test owner',
  role: 'OWNER',
  permissions: [...OWNER_PERMISSIONS],
};
export async function financialDatabase() {
  if (process.env.PADOVA_TEST_STORE !== 'existing') {
    const db = await createDatabase(true);
    await migrate(db);
    return db;
  }
  const { raw, db } = await existingFixture(undefined, undefined, false, true);
  testOwner.id = randomUUID();
  await raw.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'financial@example.invalid',now())",
    [testOwner.id],
  );
  await raw.query(
    "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','Synthetic financial Owner','financial@example.invalid',$2,1)",
    [testOwner.id, OWNER_PERMISSIONS],
  );
  await raw.query(
    'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
  );
  const employee = randomUUID();
  await raw.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'worker@example.invalid',now())",
    [employee],
  );
  await db.query(
    "INSERT INTO staff(id,email,name,role,permissions,active,auth_version) VALUES($1,'worker@example.invalid','Staff','EMPLOYEE',$2,true,1)",
    [employee, ['operations', 'edit_payments']],
  );
  await raw.exec('SET ROLE padova_app_server');
  return db;
}
export async function financialEmployee(db: import('../src/lib/db').Database): Promise<Actor> {
  const actor: Actor = { id: 'staff', name: 'Staff', permissions: ['operations', 'edit_payments'] };
  if (db.storage === 'padova') {
    actor.id = (
      await db.query("SELECT id FROM staff WHERE email='worker@example.invalid'")
    ).rows[0].id;
    actor.role = 'EMPLOYEE';
    actor.authVersion = 1;
  }
  return actor;
}
