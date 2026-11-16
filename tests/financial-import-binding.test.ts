import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existingFixture } from './padova-fixture';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';
import { importReviewedFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';

test('prepared production importer binds existing staging atomically, defaults locked and preserves evidence on replay/failure', async () => {
  const { raw, db } = await existingFixture(undefined, undefined, false, true);
  try {
    // The real US foundation constrains this column; keep fixture parity so the
    // importer cannot pass rehearsal with a status production would reject.
    assert.equal(
      Number(
        (
          await raw.query(
            "SELECT count(*) n FROM pg_constraint WHERE conrelid='padova_staging.migration_mappings'::regclass AND conname='migration_mappings_decision_check'",
          )
        ).rows[0].n,
      ),
      1,
    );
    const ownerId = randomUUID(),
      batch = randomUUID(),
      file = randomUUID(),
      evidence = randomUUID();
    await raw.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'import-owner@example.invalid',now())",
      [ownerId],
    );
    await raw.query(
      "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','QA Import Owner','import-owner@example.invalid',$2,1)",
      [ownerId, OWNER_PERMISSIONS],
    );
    await raw.query(
      'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
    );
    await raw.query(
      "INSERT INTO padova_staging.import_batches(id,label,extracted_at,source_root,limitations) VALUES($1,'synthetic-current-capture',now(),'synthetic QA only','No real evidence')",
      [batch],
    );
    await raw.query(
      "INSERT INTO padova_staging.evidence_files(id,batch_id,path,sha256,bytes,media_review_status) VALUES($1,$2,'synthetic.json',$3,10,'synthetic')",
      [file, batch, 'a'.repeat(64)],
    );
    await raw.query(
      "INSERT INTO padova_staging.evidence_records(id,file_id,record_index,raw,evidence_class) VALUES($1,$2,1,'{\"synthetic\":true}','synthetic-reviewed-plan')",
      [evidence, file],
    );
    const actor: Actor = {
      id: ownerId,
      name: 'QA Import Owner',
      role: 'OWNER',
      permissions: [...OWNER_PERMISSIONS],
    };
    const common = {
      source_system: 'synthetic-us-binding',
      source_key: 'approved-stable-id',
      evidence_id: evidence,
      capture_batch_id: batch,
      source_locator: { tab: 'Synthetic QA', row: 1 },
      reviewer_decision: 'Explicit synthetic current-capture QA decision',
    };
    const event = (event_role: string, kind: any, data: any): ImportEvent => ({
      ...common,
      event_role,
      kind,
      data,
    });
    const ref = (role: string) => ({ $event: role });
    const date = '2026-10-30';
    const plan = [
      event('customer', 'party', {
        name: 'Binding QA customer',
        kind: 'person',
        roles: ['customer'],
      }),
      event('seller', 'party', { name: 'Binding QA seller', kind: 'person', roles: ['seller'] }),
      event('booking', 'booking', {
        customer_id: ref('customer'),
        supplier_id: ref('seller'),
        product: 'Flight',
        channel: 'Direct',
        summary: 'Binding QA booking',
        booked_on: date,
        travel_start: '2026-11-20',
        travel_end: '2026-11-20',
        sale: 10000,
      }),
      event('fund', 'fund', {
        booking_id: ref('booking'),
        seller_id: ref('seller'),
        kind: 'Ticket',
        face_amount: 6500,
        cost: 6500,
        date,
      }),
      event('receipt', 'payment', {
        direction: 'customer',
        party_id: ref('customer'),
        amount: 10000,
        date,
        method: 'Wire',
        allocations: [{ booking_id: ref('booking'), amount: 10000 }],
      }),
    ];
    await raw.exec('SET ROLE padova_app_server');
    await assert.rejects(importReviewedFinancialPlan(db, actor, plan), /not authorized/);
    assert.equal(Number((await db.query('SELECT count(*) n FROM bookings')).rows[0].n), 0);
    await raw.exec('RESET ROLE');
    // This simulates a separate future Owner approval ONLY in this isolated fixture.
    await raw.query(
      "UPDATE padova.settings SET historical_financial_posting_authorized=true,historical_approved_batch_id=$1,historical_cutover_review='Synthetic isolated acceptance; never real cutover authorization'",
      [batch],
    );
    const before = (
      await raw.query('SELECT raw::text FROM padova_staging.evidence_records WHERE id=$1', [
        evidence,
      ])
    ).rows[0].raw;
    await raw.exec('SET ROLE padova_app_server');
    assert.equal((await importReviewedFinancialPlan(db, actor, plan)).created, 5);
    assert.equal((await importReviewedFinancialPlan(db, actor, plan)).created, 0);
    await assert.rejects(
      db.query('SELECT * FROM padova_staging.evidence_records'),
      /permission denied/,
    );
    const wrongCapture = plan.map((e) => ({ ...e, capture_batch_id: randomUUID() }));
    await assert.rejects(importReviewedFinancialPlan(db, actor, wrongCapture), /not authorized/);
    const changed = structuredClone(plan);
    changed[2].data.sale = 10100;
    await assert.rejects(importReviewedFinancialPlan(db, actor, changed), /Idempotency/);
    const failed = [
      ...plan,
      event('failed', 'payment', {
        direction: 'customer',
        party_id: ref('customer'),
        amount: 20000,
        date,
        method: 'Wire',
        allocations: [{ booking_id: ref('booking'), amount: 20000 }],
      }),
    ];
    await assert.rejects(importReviewedFinancialPlan(db, actor, failed), /exceeds booking balance/);
    await raw.exec('RESET ROLE');
    const changedEvidence = randomUUID();
    await raw.query(
      'INSERT INTO padova_staging.evidence_records(id,file_id,record_index,raw,evidence_class) VALUES($1,$2,2,\'{"synthetic":true,"changed":true}\',\'synthetic-changed-source\')',
      [changedEvidence, file],
    );
    await raw.exec('SET ROLE padova_app_server');
    await assert.rejects(
      importReviewedFinancialPlan(
        db,
        actor,
        plan.map((e) => ({ ...e, evidence_id: changedEvidence })),
      ),
      /source event changed/,
    );
    await raw.exec('RESET ROLE');
    assert.equal(
      Number(
        (
          await raw.query(
            "SELECT count(*) n FROM padova_staging.migration_mappings WHERE app_financial_event_key IS NOT NULL AND decision <> 'accepted'",
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (
          await raw.query(
            'SELECT count(*) n FROM padova_staging.migration_mappings WHERE app_financial_event_key IS NOT NULL',
          )
        ).rows[0].n,
      ),
      5,
    );
    assert.equal(
      (
        await raw.query('SELECT raw::text FROM padova_staging.evidence_records WHERE id=$1', [
          evidence,
        ])
      ).rows[0].raw,
      before,
    );
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        (
          await raw.query(
            "SELECT has_function_privilege($1,'padova.bind_financial_import_event(text,uuid,uuid,uuid,text)','EXECUTE') access",
            [role],
          )
        ).rows[0].access,
        false,
      );
    }
  } finally {
    await raw.close();
  }
});
