import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database } from '../src/lib/db';
import {
  bootstrapOwner,
  login,
  sessionActor,
  createUser,
  issueRecovery,
  completeRecovery,
} from '../src/lib/users';
import { Actor, EMPLOYEE_PERMISSIONS } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';
import { snapshot } from '../src/lib/queries';
import {
  customerCardFeeCents,
  padovaCardCostCents,
  DEFAULT_CARD_FEE_SETTINGS,
  bpsToPercentLabel,
  suggestPaymentCardFees,
  isCardPaymentMethod,
  normalizeCardFeeSettings,
} from '../src/lib/card-fees';

test('card fee math uses integer cents with half-up percent', () => {
  assert.equal(customerCardFeeCents(10000, 290), 290);
  assert.equal(customerCardFeeCents(10001, 290), 290);
  assert.equal(customerCardFeeCents(10002, 290), 290);
  assert.equal(customerCardFeeCents(10017, 290), 290);
  assert.equal(customerCardFeeCents(10018, 290), 291);
  assert.equal(padovaCardCostCents(10000, 270, 30), 270 + 30);
  assert.equal(bpsToPercentLabel(290), '2.9%');
  assert.equal(bpsToPercentLabel(270), '2.7%');
  assert.ok(isCardPaymentMethod('Card'));
  assert.ok(!isCardPaymentMethod('Zelle'));
  assert.deepEqual(suggestPaymentCardFees(10000), {
    customer_card_fee: 290,
    padova_card_cost: 300,
  });
});

test('normalizeCardFeeSettings accepts pg bigint strings (QA crash regression)', () => {
  assert.deepEqual(
    normalizeCardFeeSettings({
      customer_card_fee_bps: 290,
      padova_card_fee_bps: 270,
      padova_card_fee_flat_cents: '30',
    }),
    DEFAULT_CARD_FEE_SETTINGS,
  );
  assert.equal(
    normalizeCardFeeSettings({
      customer_card_fee_bps: '300',
      padova_card_fee_bps: '250',
      padova_card_fee_flat_cents: '35',
    }).padova_card_fee_flat_cents,
    35,
  );
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for isolated fee tests';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Fee Owner',
    email: 'fee-owner@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

test('snapshot exposes Plan card-fee defaults and Owner can update them', async () => {
  const s0 = await snapshot(db, owner);
  assert.equal(s0.feeSettingsEnabled, true);
  assert.deepEqual(s0.feeSettings, DEFAULT_CARD_FEE_SETTINGS);

  await execute(db, owner, {
    id: randomUUID(),
    kind: 'update_fee_settings',
    data: {
      customer_card_fee_bps: 300,
      padova_card_fee_bps: 250,
      padova_card_fee_flat_cents: 35,
    },
  });
  const s1 = await snapshot(db, owner);
  assert.equal(s1.feeSettings.customer_card_fee_bps, 300);
  assert.equal(s1.feeSettings.padova_card_fee_bps, 250);
  assert.equal(s1.feeSettings.padova_card_fee_flat_cents, 35);
});

test('staff without manage_settings cannot change card fee defaults', async () => {
  const created = await createUser(db, owner, {
    name: 'Fee Worker',
    email: 'fee-worker@example.invalid',
    permissions: [...EMPLOYEE_PERMISSIONS],
    role: 'EMPLOYEE',
  });
  const recovery = await issueRecovery(db, owner, created.id);
  const password = 'Synthetic fee worker password only';
  await completeRecovery(db, { token: recovery.token, password });
  const worker = (await sessionActor(
    db,
    (await login(db, { email: created.email, password })).token,
  ))!;
  await assert.rejects(
    () =>
      execute(db, worker, {
        id: randomUUID(),
        kind: 'update_fee_settings',
        data: {
          customer_card_fee_bps: 400,
          padova_card_fee_bps: 200,
          padova_card_fee_flat_cents: 10,
        },
      }),
    /manage_settings/,
  );
});
