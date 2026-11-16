import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';

test('database still rejects generic negative inventory and a forged reward reversal', async () => {
  const db = await financialDatabase();
  try {
    const asset = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'acquire_asset',
      data: {
        name: 'Guarded inventory',
        kind: 'Points',
        issuer: 'Synthetic',
        quantity: 10,
        cost: 1000,
        date: '2026-10-29',
      },
    });
    const original = (await db.query('SELECT * FROM asset_movements WHERE asset_id=$1', [asset.id]))
      .rows[0];
    for (const kind of ['booking_use', 'points_rebate_reversal'])
      await assert.rejects(
        db.transaction(async (tx) => {
          const command = randomUUID();
          if (tx.storage === 'padova')
            await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [testOwner.id]);
          await tx.query('INSERT INTO commands(id,actor,kind,payload) VALUES($1,$2,$3,$4)', [
            command,
            testOwner.id,
            'update_expected_event',
            JSON.stringify({ status: 'Reversed' }),
          ]);
          await tx.query(
            'INSERT INTO asset_movements(asset_id,lot_id,quantity,basis,kind,effective_on,original_movement_id,command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [asset.id, original.lot_id, -11, -1100, kind, '2026-10-29', original.id, command],
          );
          await tx.query('UPDATE commands SET result=$2 WHERE id=$1', [
            command,
            JSON.stringify({ id: command }),
          ]);
        }),
        /Invalid inventory/,
      );
    assert.equal(
      Number(
        (await db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      10,
    );
  } finally {
    await db.close();
  }
});
