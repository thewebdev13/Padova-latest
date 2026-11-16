import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existingFixture } from './padova-fixture';
import { execute } from '../src/lib/finance';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';
import { importReviewedFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';

async function fixture() {
  const { raw, db } = await existingFixture(undefined, undefined, false, true);
  const owner = randomUUID(),
    batch = randomUUID(),
    file = randomUUID(),
    evidence = randomUUID();
  await raw.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'opening@example.invalid',now())",
    [owner],
  );
  await raw.query(
    "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','Opening QA','opening@example.invalid',$2,1)",
    [owner, OWNER_PERMISSIONS],
  );
  await raw.query(
    'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
  );
  await raw.query(
    "INSERT INTO padova_staging.import_batches(id,label,extracted_at,source_root,limitations) VALUES($1,'synthetic opening',now(),'synthetic','No real data')",
    [batch],
  );
  await raw.query(
    "INSERT INTO padova_staging.evidence_files(id,batch_id,path,sha256,bytes,media_review_status) VALUES($1,$2,'synthetic.json',$3,10,'synthetic')",
    [file, batch, 'a'.repeat(64)],
  );
  await raw.query(
    "INSERT INTO padova_staging.evidence_records(id,file_id,record_index,raw,evidence_class) VALUES($1,$2,1,'{\"synthetic\":true}','reviewed synthetic')",
    [evidence, file],
  );
  const actor: Actor = {
    id: owner,
    name: 'Opening QA',
    role: 'OWNER',
    permissions: [...OWNER_PERMISSIONS],
  };
  const event = (
    role: string,
    kind: ImportEvent['kind'],
    data: Record<string, any>,
  ): ImportEvent => ({
    source_system: 'synthetic-opening',
    source_key: 'owned-voucher',
    event_role: role,
    evidence_id: evidence,
    capture_batch_id: batch,
    source_locator: { synthetic: true },
    reviewer_decision:
      'Ownership and original basis confirmed; original settlement remains Unknown',
    kind,
    data,
  });
  const opening = event('historical_owned_opening', 'acquire_asset', {
    historical_opening: true,
    name: 'Synthetic prior-owned voucher',
    kind: 'Voucher',
    unit: 'money',
    issuer: 'Synthetic airline',
    ownership: 'Padova',
    quantity: 15000,
    cost: 10000,
    date: '2026-10-30',
    reference: 'SYNTHETIC-PRIOR-OWNED',
  });
  const plan = [
    event('buyer', 'party', { name: 'Synthetic buyer', kind: 'company', roles: ['customer'] }),
    opening,
    event('sale', 'sell_asset', {
      asset_id: { $event: 'historical_owned_opening' },
      buyer_id: { $event: 'buyer' },
      quantity: 15000,
      proceeds: 12000,
      paid: false,
      date: '2026-10-31',
    }),
  ];
  const open = async () => {
    await raw.exec('RESET ROLE');
    await raw.query(
      "UPDATE padova.settings SET historical_financial_posting_authorized=true,historical_approved_batch_id=$1,historical_cutover_review='Synthetic isolated opening test'",
      [batch],
    );
    await raw.exec('SET ROLE padova_app_server');
  };
  return { raw, db, actor, opening, plan, open, owner, event };
}

test('reviewed grouped refund records one real cash settlement without inferred booking allocations', async () => {
  const f = await fixture();
  try {
    await f.open();
    const customer = await execute(f.db, f.actor, {
      id: randomUUID(),
      kind: 'party',
      data: {
        name: 'Synthetic refund customer',
        kind: 'person',
        roles: ['customer'],
      },
    });
    const account = await execute(f.db, f.actor, {
      id: randomUUID(),
      kind: 'payment_account',
      data: {
        name: 'Synthetic bank',
        kind: 'Bank',
        ownership: 'Padova',
      },
    });
    const refund = f.event('historical_refund_settlement', 'payment', {
      historical_refund_settlement: true,
      party_id: customer.id,
      direction: 'customer_refund',
      amount: 25000,
      date: '2026-10-31',
      method: 'Zelle',
      reference: 'SYNTHETIC-REFUND',
      account_id: account.id,
    });
    await assert.rejects(
      execute(f.db, f.actor, { id: randomUUID(), kind: 'payment', data: refund.data }),
      /reviewed source importer/,
    );
    const invalid = structuredClone(refund);
    invalid.data.allocations = [{ booking_id: randomUUID(), amount: 10000 }];
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [invalid]),
      /leaves allocations unresolved/,
    );
    const wrongAccount = structuredClone(refund);
    wrongAccount.data.account_id = randomUUID();
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [wrongAccount]),
      /not eligible/,
    );
    const ordinary = structuredClone(refund);
    delete ordinary.data.historical_refund_settlement;
    ordinary.event_role = 'ordinary_refund';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [ordinary]),
      /dedicated linked workflow/,
    );
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, [refund])).created, 1);
    const replay = await importReviewedFinancialPlan(f.db, f.actor, [refund]);
    assert.equal(replay.created, 0);
    assert.equal(replay.replayed, 1);
    const payment = (await f.db.query('SELECT * FROM payments')).rows;
    assert.equal(payment.length, 1);
    assert.equal(payment[0].direction, 'customer_refund');
    assert.equal(payment[0].party_id, customer.id);
    assert.equal(payment[0].account_id, account.id);
    assert.equal(Number(payment[0].amount), 25000);
    for (const table of ['payment_allocations', 'refunds', 'bookings'])
      assert.equal(Number((await f.db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n), 0);
    const journal = (
      await f.db.query('SELECT account,sum(debit-credit) n FROM journal_lines GROUP BY account')
    ).rows;
    assert.equal(Number(journal.find((r) => r.account === 'cash')?.n), -25000);
    assert.equal(Number(journal.find((r) => r.account === 'historical_refund_clearing')?.n), 25000);
    assert.equal(
      journal.reduce((n, r) => n + Number(r.n), 0),
      0,
    );
    assert.match((await f.db.query('SELECT notes FROM tasks')).rows[0].notes, /Unreconciled/);
    const duplicate = structuredClone(refund);
    duplicate.source_key = 'duplicate-source-same-settlement';
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, [duplicate]), /already exists/);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM payments')).rows[0].n), 1);
    const failing = structuredClone(refund);
    failing.source_key = 'rolled-back-settlement';
    failing.data.reference = 'SYNTHETIC-SECOND-REFUND';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [
        failing,
        f.event('bad-sale', 'sell_asset', {
          asset_id: randomUUID(),
          buyer_id: customer.id,
          quantity: 100,
          proceeds: 100,
          date: '2026-10-31',
          paid: false,
        }),
      ]),
    );
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM payments')).rows[0].n), 1);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM tasks')).rows[0].n), 1);
  } finally {
    await f.raw.close();
  }
});

test('reviewed supplier return records incoming cash without cancellation or invented net cost', async () => {
  const f = await fixture();
  try {
    await f.open();
    const customer = await execute(f.db, f.actor, {
      id: randomUUID(),
      kind: 'party',
      data: {
        name: 'Synthetic refund seller',
        kind: 'person',
        roles: ['seller'],
      },
    });
    const account = await execute(f.db, f.actor, {
      id: randomUUID(),
      kind: 'payment_account',
      data: {
        name: 'Synthetic bank',
        kind: 'Bank',
        ownership: 'Padova',
      },
    });
    const refund = f.event('historical_refund_settlement', 'payment', {
      historical_refund_settlement: true,
      party_id: customer.id,
      direction: 'supplier_refund',
      amount: 25000,
      date: '2026-10-31',
      method: 'Zelle',
      reference: 'SYNTHETIC-REFUND',
      account_id: account.id,
    });
    await assert.rejects(
      execute(f.db, f.actor, { id: randomUUID(), kind: 'payment', data: refund.data }),
      /reviewed source importer/,
    );
    const invalid = structuredClone(refund);
    invalid.data.allocations = [{ booking_id: randomUUID(), amount: 10000 }];
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [invalid]),
      /leaves allocations unresolved/,
    );
    const wrongAccount = structuredClone(refund);
    wrongAccount.data.account_id = randomUUID();
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [wrongAccount]),
      /not eligible/,
    );
    const ordinary = structuredClone(refund);
    delete ordinary.data.historical_refund_settlement;
    ordinary.event_role = 'ordinary_refund';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [ordinary]),
      /dedicated linked workflow/,
    );
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, [refund])).created, 1);
    const replay = await importReviewedFinancialPlan(f.db, f.actor, [refund]);
    assert.equal(replay.created, 0);
    assert.equal(replay.replayed, 1);
    const payment = (await f.db.query('SELECT * FROM payments')).rows;
    assert.equal(payment.length, 1);
    assert.equal(payment[0].direction, 'supplier_refund');
    assert.equal(payment[0].party_id, customer.id);
    assert.equal(payment[0].account_id, account.id);
    assert.equal(Number(payment[0].amount), 25000);
    for (const table of ['payment_allocations', 'refunds', 'bookings'])
      assert.equal(Number((await f.db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n), 0);
    const journal = (
      await f.db.query('SELECT account,sum(debit-credit) n FROM journal_lines GROUP BY account')
    ).rows;
    assert.equal(Number(journal.find((r) => r.account === 'cash')?.n), 25000);
    assert.equal(
      Number(journal.find((r) => r.account === 'historical_refund_clearing')?.n),
      -25000,
    );
    assert.equal(
      journal.reduce((n, r) => n + Number(r.n), 0),
      0,
    );
    assert.match((await f.db.query('SELECT notes FROM tasks')).rows[0].notes, /Unreconciled/);
    const duplicate = structuredClone(refund);
    duplicate.source_key = 'duplicate-source-same-settlement';
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, [duplicate]), /already exists/);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM payments')).rows[0].n), 1);
    const failing = structuredClone(refund);
    failing.source_key = 'rolled-back-settlement';
    failing.data.reference = 'SYNTHETIC-SECOND-REFUND';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [
        failing,
        f.event('bad-sale', 'sell_asset', {
          asset_id: randomUUID(),
          buyer_id: customer.id,
          quantity: 100,
          proceeds: 100,
          date: '2026-10-31',
          paid: false,
        }),
      ]),
    );
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM payments')).rows[0].n), 1);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM tasks')).rows[0].n), 1);
  } finally {
    await f.raw.close();
  }
});

test('reviewed owned-voucher opening preserves basis without cash or seller debt and replays once', async () => {
  const f = await fixture();
  try {
    await f.open();
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, f.plan)).created, 3);
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, f.plan)).replayed, 3);
    const sale = (await f.db.query('SELECT * FROM asset_sales')).rows[0];
    assert.equal(Number(sale.basis), 10000);
    assert.equal(Number(sale.proceeds), 12000);
    assert.equal(sale.payment_id, null);
    const asset = (await f.db.query('SELECT * FROM asset_balances')).rows[0];
    assert.equal(Number(asset.balance), 0);
    assert.equal(Number(asset.remaining_basis), 0);
    for (const table of ['payments', 'asset_acquisition_payments', 'supplier_obligations'])
      assert.equal(Number((await f.db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n), 0);
    const accounts = (
      await f.db.query('SELECT account,sum(debit-credit) n FROM journal_lines GROUP BY account')
    ).rows;
    assert.equal(
      Number(accounts.find((r) => r.account === 'historical_funding_unreconciled')?.n),
      -10000,
    );
    assert(
      !accounts.some((r) =>
        ['cash', 'asset_acquisition_payable', 'supplier_payable'].includes(r.account),
      ),
    );
    assert.equal(
      Number((await f.db.query('SELECT sum(debit-credit) n FROM journal_lines')).rows[0].n),
      0,
    );
    const tasks = (await f.db.query('SELECT * FROM tasks')).rows;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].record_id, asset.id);
    assert.equal(tasks[0].assignee_id, f.actor.id);
    assert.equal(tasks[0].status, 'Open');
    assert.match(tasks[0].notes, /Unreconciled/);
    assert(!tasks[0].notes.includes('10000'));
    const duplicate = structuredClone(f.plan);
    duplicate[1].source_key = 'different-key-same-voucher';
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, duplicate), /already exists/);
    const ordinary = {
      id: randomUUID(),
      kind: 'acquire_asset' as const,
      data: {
        name: 'Synthetic new purchase',
        kind: 'Voucher',
        issuer: 'Synthetic',
        quantity: 1000,
        cost: 700,
        date: '2026-10-31',
      },
    };
    await execute(f.db, f.actor, ordinary);
    await execute(f.db, f.actor, ordinary);
    assert.equal(
      Number(
        (
          await f.db.query(
            "SELECT sum(credit) n FROM journal_lines WHERE account='asset_acquisition_payable'",
          )
        ).rows[0].n,
      ),
      700,
    );
  } finally {
    await f.raw.close();
  }
});

test('opening requires the approved importer, real Owner, confirmed basis and fresh source gate', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      execute(f.db, f.actor, { id: randomUUID(), kind: 'acquire_asset', data: f.opening.data }),
      /reviewed source importer/,
    );
    await f.raw.exec('SET ROLE padova_app_server');
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, f.plan), /not authorized/);
    await f.open();
    const wrongRole = structuredClone(f.plan);
    wrongRole[1].event_role = 'ordinary_acquisition';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, wrongRole),
      /explicit reviewed source role/,
    );
    const unknownBasis = structuredClone(f.plan);
    unknownBasis[1].data.cost = null;
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, unknownBasis),
      /confirmed positive basis/,
    );
    const inferredSeller = structuredClone(f.plan);
    inferredSeller[1].data.seller_id = randomUUID();
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, inferredSeller),
      /no inferred seller/,
    );
    await f.raw.exec('RESET ROLE');
    await f.raw.query("UPDATE padova.staff SET role='staff' WHERE user_id=$1", [f.owner]);
    await f.raw.exec('SET ROLE padova_app_server');
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, f.plan), /Owner/);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM assets')).rows[0].n), 0);
    await f.raw.exec('RESET ROLE');
    await f.raw.query("UPDATE padova.staff SET role='owner' WHERE user_id=$1", [f.owner]);
    await f.raw.exec('CREATE TABLE padova.qa_environment(id boolean)');
    await f.raw.exec('SET ROLE padova_app_server');
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, f.plan),
      /cannot be posted to QA/,
    );
  } finally {
    await f.raw.close();
  }
});

test('failed sale rolls back the entire opening including its reconciliation task', async () => {
  const f = await fixture();
  try {
    await f.open();
    const failed = structuredClone(f.plan);
    failed[2].data.quantity = 16000;
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, failed));
    for (const table of [
      'assets',
      'asset_lots',
      'asset_movements',
      'asset_sales',
      'tasks',
      'journal_lines',
      'commands',
    ])
      assert.equal(Number((await f.db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n), 0);
  } finally {
    await f.raw.close();
  }
});

test('reviewed historical supplier return links existing cash once without cancellation', async () => {
  const f = await fixture();
  try {
    await f.open();
    const run = (kind: any, data: any) => execute(f.db, f.actor, { id: randomUUID(), kind, data });
    const seller = await run('party', {
      name: 'Synthetic seller',
      kind: 'supplier',
      roles: ['seller'],
    });
    const customer = await run('party', {
      name: 'Synthetic customer',
      kind: 'person',
      roles: ['customer'],
    });
    const account = await run('payment_account', {
      name: 'Synthetic card',
      kind: 'Card',
      ownership: 'Padova',
    });
    const b = await run('booking', {
      customer_id: customer.id,
      supplier_id: seller.id,
      product: 'Flight',
      channel: 'Portal',
      summary: 'Synthetic return',
      booked_on: '2026-10-28',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 20000,
      itinerary: { cost_status: 'Pending' },
    });
    const fund = await run('fund', {
      booking_id: b.id,
      kind: 'Card',
      face_amount: 15000,
      cost: 15000,
      seller_id: seller.id,
      account_id: account.id,
      settled: true,
      payment_method: 'Card',
      date: '2026-10-28',
      confirm_cost: false,
    });
    const receipt = f.event('historical_refund_settlement', 'payment', {
      historical_refund_settlement: true,
      party_id: seller.id,
      direction: 'supplier_refund',
      amount: 12000,
      date: '2026-10-31',
      method: 'Card',
      reference: 'SYNTHETIC-SUPPLIER-RETURN',
      account_id: account.id,
    });
    const imported = await importReviewedFinancialPlan(f.db, f.actor, [receipt]);
    const payment = imported.results.historical_refund_settlement;
    const event = f.event('historical_supplier_return_link', 'reconcile_supplier_return', {
      booking_id: b.id,
      funding_component_id: fund.id,
      payment_id: payment.id,
      amount: 12000,
      date: '2026-10-31',
      reason: 'Exact original source matching; no customer outcome inferred',
    });
    const payments = (await f.db.query('SELECT * FROM payments ORDER BY id')).rows;
    const bookings = (await f.db.query('SELECT * FROM bookings ORDER BY id')).rows;
    await assert.rejects(run('reconcile_supplier_return', event.data), /reviewed source importer/);
    for (const data of [
      { amount: 11999 },
      { date: '2026-10-30' },
      { funding_component_id: randomUUID() },
    ]) {
      const invalid = structuredClone(event);
      Object.assign(invalid.data, data);
      await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, [invalid]));
    }
    const broken = f.event('bad-sale', 'sell_asset', {
      asset_id: randomUUID(),
      buyer_id: customer.id,
      quantity: 1,
      proceeds: 1,
      date: '2026-10-31',
      paid: false,
    });
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, [event, broken]));
    assert.equal((await f.db.query('SELECT * FROM refunds')).rows.length, 0);
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, [event])).created, 1);
    assert.equal((await importReviewedFinancialPlan(f.db, f.actor, [event])).replayed, 1);
    const duplicate = structuredClone(event);
    duplicate.source_key = 'another-key-same-return';
    await assert.rejects(importReviewedFinancialPlan(f.db, f.actor, [duplicate]), /already linked/);
    const changed = structuredClone(event);
    changed.data.reason = 'Changed payload';
    await assert.rejects(
      importReviewedFinancialPlan(f.db, f.actor, [changed]),
      /different command/,
    );
    assert.deepEqual((await f.db.query('SELECT * FROM payments ORDER BY id')).rows, payments);
    assert.deepEqual((await f.db.query('SELECT * FROM bookings ORDER BY id')).rows, bookings);
    const movements = (await f.db.query('SELECT * FROM refund_movements')).rows;
    assert.equal(movements.length, 1);
    assert.equal(movements[0].payment_id, payment.id);
    const journal = (
      await f.db.query('SELECT account,sum(debit-credit) n FROM journal_lines GROUP BY account')
    ).rows;
    assert.equal(Number(journal.find((r) => r.account === 'historical_refund_clearing')?.n), 0);
    assert.equal(Number(journal.find((r) => r.account === 'booking_cost')?.n), 3000);
    assert.equal(
      journal.reduce((n, r) => n + Number(r.n), 0),
      0,
    );
  } finally {
    await f.raw.close();
  }
});
