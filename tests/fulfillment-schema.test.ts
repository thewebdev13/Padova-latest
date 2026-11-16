import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existingFixture } from './padova-fixture';
import { execute, economics } from '../src/lib/finance';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';
test('installed fulfillment artifact is frozen and its generator refuses to overwrite it', async () => {
  const manifest = JSON.parse(await readFile('db/padova/fulfillment-object-summary.json', 'utf8'));
  assert.equal(manifest.status, 'INSTALLED');
  assert.equal(manifest.projectRef, 'unugynfzmxjxifgofxjr');
  const before = await readFile(manifest.sourceFile);
  assert.equal(createHash('sha256').update(before).digest('hex'), manifest.sha256);
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-fulfillment.ts'], {
    encoding: 'utf8',
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /already installed/);
  assert.deepEqual(await readFile(manifest.sourceFile), before);
});
test('incremental unit extension preserves already-populated legacy asset/funding amounts and economics', async () => {
  const { raw, db } = await existingFixture();
  try {
    const actor: Actor = {
      id: randomUUID(),
      name: 'Synthetic compatibility Owner',
      role: 'OWNER',
      permissions: [...OWNER_PERMISSIONS],
    };
    await raw.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'unit-compatibility@example.invalid',now())",
      [actor.id],
    );
    await raw.query(
      "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','Synthetic compatibility Owner','unit-compatibility@example.invalid',$2,1)",
      [actor.id, OWNER_PERMISSIONS],
    );
    await raw.query(
      'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
    );
    const run = (kind: any, data: any) => execute(db, actor, { id: randomUUID(), kind, data });
    const customer = await run('party', {
      name: 'Synthetic compatibility customer',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    });
    const voucher = await run('acquire_asset', {
      name: 'Existing voucher',
      kind: 'Voucher',
      issuer: 'Synthetic',
      quantity: 100000,
      cost: 80000,
      date: '2026-10-29',
    });
    const points = await run('acquire_asset', {
      name: 'Existing points',
      kind: 'Points',
      issuer: 'Synthetic',
      quantity: 100000,
      cost: 120000,
      date: '2026-10-29',
    });
    const booking = await run('booking', {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'Award Program',
      summary: 'Pre-extension mixed funding',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-03',
      sale: 200000,
      funding: [
        { kind: 'Voucher', asset_id: voucher.id, face_amount: 50000, date: '2026-10-29' },
        { kind: 'Points', asset_id: points.id, face_amount: 25000, date: '2026-10-29' },
      ],
    });
    const values = async () => ({
      assets: (
        await db.query(
          'SELECT id,name,kind,opening_quantity,opening_cost,balance,remaining_basis FROM asset_balances ORDER BY id',
        )
      ).rows,
      funding: (
        await db.query(
          'SELECT id,kind,face_amount,cost,asset_id FROM funding_components ORDER BY id',
        )
      ).rows,
      economics: await economics(db, booking.id),
    });
    const before = await values();
    await raw.transaction(async (tx) =>
      tx.exec(
        await readFile(
          'supabase/migrations/20261029012515_padova_fulfillment_catalogs_units.sql',
          'utf8',
        ),
      ),
    );
    assert.deepEqual(await values(), before);
    assert.equal(
      (await db.query('SELECT unit FROM assets WHERE id=$1', [voucher.id])).rows[0].unit,
      'money',
    );
    assert.equal(
      (await db.query('SELECT unit FROM assets WHERE id=$1', [points.id])).rows[0].unit,
      'points',
    );
    assert.equal(Number((await economics(db, booking.id)).profit), 130000);
  } finally {
    await db.close();
  }
});
