import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
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
import { detail } from '../src/lib/queries';
import {
  buildInvoicePreview,
  canApproveInvoice,
  canMarkInvoiceSent,
  canVoidInvoice,
} from '../src/lib/invoice-preview';

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for invoice draft tests';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Invoice Owner',
    email: 'invoice-owner@example.invalid',
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

test('invoice status gates: draft → approved → sent; void from draft/approved only', () => {
  assert.equal(canApproveInvoice('draft'), true);
  assert.equal(canApproveInvoice('approved'), false);
  assert.equal(canMarkInvoiceSent('approved'), true);
  assert.equal(canMarkInvoiceSent('draft'), false);
  assert.equal(canVoidInvoice('sent'), false);
  assert.equal(canVoidInvoice('draft'), true);
});

test('staff can save draft; Owner approves then marks sent (no email side effect)', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: {
      kind: 'person',
      name: 'Invoice Customer',
      email: 'invoice-customer@example.invalid',
      phone: '',
      roles: ['customer'],
      details: {},
    },
  });

  const preview = buildInvoicePreview({
    customer_name: customer.name,
    bookings: [
      {
        id: randomUUID(),
        code: 'INV-1',
        summary: 'Test flight',
        sale: 50000,
        charges: [
          { kind: 'sale', amount: 50000 },
          { kind: 'Card fee', amount: 1450 },
        ],
      },
    ],
  });

  const created = await createUser(db, owner, {
    name: 'Invoice Worker',
    email: 'invoice-worker@example.invalid',
    permissions: [...EMPLOYEE_PERMISSIONS],
    role: 'EMPLOYEE',
  });
  const recovery = await issueRecovery(db, owner, created.id);
  const password = 'Synthetic invoice worker password only';
  await completeRecovery(db, { token: recovery.token, password });
  const worker = (await sessionActor(
    db,
    (await login(db, { email: created.email, password })).token,
  ))!;

  const draft = await execute(db, worker, {
    id: randomUUID(),
    kind: 'invoice_draft',
    data: {
      customer_id: customer.id,
      customer_name: preview.customer_name,
      lines: preview.lines,
      total_cents: preview.total_cents,
      incomplete: preview.incomplete,
      note: '',
    },
  });
  assert.equal(draft.status, 'draft');
  assert.equal(Number(draft.total_cents), 51450);

  await assert.rejects(
    () =>
      execute(db, worker, {
        id: randomUUID(),
        kind: 'invoice_approve',
        data: { invoice_id: draft.id },
      }),
    /manage_settings|Owner/,
  );

  const approved = await execute(db, owner, {
    id: randomUUID(),
    kind: 'invoice_approve',
    data: { invoice_id: draft.id },
  });
  assert.equal(approved.status, 'approved');

  const sent = await execute(db, owner, {
    id: randomUUID(),
    kind: 'invoice_mark_sent',
    data: {
      invoice_id: draft.id,
      note: 'Hand-delivered copy',
      sent_to: 'invoice-customer@example.invalid',
      whatsapp_copy_noted: true,
    },
  });
  assert.equal(sent.status, 'sent');
  assert.ok(String(sent.note).includes('Hand-delivered'));
  assert.equal(sent.sent_to, 'invoice-customer@example.invalid');
  assert.ok(sent.whatsapp_copy_noted_at);

  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'invoice_void',
        data: { invoice_id: draft.id, reason: 'too late' },
      }),
    /cannot be voided/,
  );

  const person = await detail(db, owner, 'person', customer.id);
  assert.equal(person.invoiceDraftsEnabled, true);
  assert.equal(person.invoiceDrafts.length, 1);
  assert.equal(person.invoiceDrafts[0].status, 'sent');

  const row = await one(db, 'SELECT status FROM invoice_drafts WHERE id=$1', [draft.id]);
  assert.equal(row.status, 'sent');
});

test('Owner can void a draft invoice with a required reason', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: {
      kind: 'person',
      name: 'Void Invoice Customer',
      email: 'void-invoice@example.invalid',
      phone: '',
      roles: ['customer'],
      details: {},
    },
  });
  const draft = await execute(db, owner, {
    id: randomUUID(),
    kind: 'invoice_draft',
    data: {
      customer_id: customer.id,
      customer_name: customer.name,
      lines: [{ kind: 'item', label: 'Line', amount_cents: 1000 }],
      total_cents: 1000,
      incomplete: false,
      note: '',
    },
  });
  const voided = await execute(db, owner, {
    id: randomUUID(),
    kind: 'invoice_void',
    data: { invoice_id: draft.id, reason: 'Wrong customer' },
  });
  assert.equal(voided.status, 'voided');
  assert.ok(String(voided.note).includes('Wrong customer'));
});
