import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createDatabase, migrate } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import {
  importPracticeFinancialPlan,
  importCommandId,
  type ImportEvent,
} from '../src/lib/financial-importer';
import { economics } from '../src/lib/finance';
import { confirmedCustomerGroups } from '../src/lib/test-reference';
import { exactCents, value, cell, normalizedName, type R } from './lib/historical-reconciliation';

// Real source values stay private. This tool can only open an isolated in-memory fixture.
const root = '.data/historical-cutover/reconciliation-resumed';
const captureRoot = '.data/historical-cutover/current-cells-20261031-resumed';
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const rows: R[] = await read(`${captureRoot}/source-row-snapshots.json`);
const allocations: R[] = await read(`${root}/allocation-verification.json`);
const banks: R[] = await read(`${root}/bank-verification.json`);
const source = await read('.data/historical-cutover/capture.json');
const evidence = (n: string) =>
  source.evidence.filter(
    (e: R) => e.file_id === source.files.find((f: R) => f.path === `tables/${n}.json`)?.id,
  );
const aliases = confirmedCustomerGroups(evidence('customer_aliases'), evidence('owner_decisions'));
const card = await read(`${root}/processor-receipt-verification.json`);
const receiptHash = createHash('sha256').update(`gmail:${card.message_id}`).digest('hex');
const cardEvidenceId = `${receiptHash.slice(0, 8)}-${receiptHash.slice(8, 12)}-4${receiptHash.slice(13, 16)}-8${receiptHash.slice(17, 20)}-${receiptHash.slice(20, 32)}`;
await writeFile(
  `${root}/proposed-processor-evidence.json`,
  JSON.stringify(
    {
      id: cardEvidenceId,
      source_system: 'gmail',
      message_id: card.message_id,
      original_path: `${captureRoot}/robert-card-receipt.json`,
      proposed_only: true,
      registered_in_production: false,
    },
    null,
    2,
  ),
);
const plan: ImportEvent[] = [],
  held: R[] = [],
  parties = new Map<string, string>();
const add = (
  key: string,
  role: string,
  kind: ImportEvent['kind'],
  data: R,
  locator: R,
  evidenceId: string,
  decision: string,
) => {
  const event: ImportEvent = {
    source_system: 'padova-historical-v1',
    source_key: key,
    event_role: role,
    kind,
    data,
    source_locator: locator,
    evidence_id: evidenceId,
    reviewer_decision: decision,
  };
  plan.push(event);
  return importCommandId(event);
};
const ref = (id: string) => ({ $event: id });
const party = (name: string, role: string, evidenceId: string) => {
  const canonical = aliases.resolve(name)?.name ?? name,
    key = normalizedName(canonical) + ':' + role;
  if (!parties.has(key))
    parties.set(
      key,
      add(
        `party:${key}`,
        'party',
        'party',
        {
          name: canonical,
          kind: /\b(?:llc|inc|tours|travelution|flyluxury|chabad)\b/i.test(canonical)
            ? 'company'
            : 'person',
          roles: [role],
        },
        { label: canonical },
        evidenceId,
        'Preserve existing Owner aliases; retain distinct payer and billed customer',
      ),
    );
  return ref(parties.get(key)!);
};
const date = (r: R, c: string) => {
  const item = cell(r, c),
    v = value(r, c);
  return typeof v === 'number' && item?.userEnteredFormat?.numberFormat?.type?.startsWith('DATE')
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v
      : null;
};
const expected: R[] = [];
for (const a of allocations.filter((a) => a.decision.startsWith('Retain'))) {
  const bank = banks.find((b) => b.bank_id === a.bank_id),
    row = rows.find(
      (r) => r.tab === 'accounting' && r.row === Number(a.booking_key.replace('M-', '')),
    );
  const booked = row && date(row, 'L'),
    travel = row && date(row, 'M'),
    sale = row && exactCents(value(row, 'D')),
    route = String((row && value(row, 'K')) || '');
  if (
    !row ||
    !booked ||
    !travel ||
    sale === null ||
    sale === undefined ||
    !/[A-Z]{3}-[A-Z]{3}/.test(route)
  ) {
    held.push({
      booking_key: a.booking_key,
      bank_id: a.bank_id,
      reason: !booked
        ? 'Economic booking date absent'
        : !travel
          ? 'Unambiguous travel date absent'
          : sale === null
            ? 'Subcent sale retained; no silent rounding'
            : 'Product/route not proven',
      allocationStillConfirmed: true,
    });
    continue;
  }
  assert.ok(bank, 'Verified bank record required');
  const e = source.evidence.find((e: R) => e.raw?.bank_id === bank.bank_id);
  assert.ok(e, 'Original bank provenance required');
  const customer = party(String(value(row, 'A')), 'customer', e.id),
    payer = party(bank.payer, 'customer', e.id);
  const key = a.booking_key,
    locator = {
      workbook_id: row.workbook_id,
      tab: row.tab,
      row: row.row,
      bank_id: bank.bank_id,
      owner_decisions: a.owner_decision_ids ?? [],
      original_fields: row.original_fields,
    };
  const booking = add(
    key,
    'booking',
    'booking',
    {
      customer_id: customer,
      product: 'Flight',
      channel: 'Direct',
      summary: route,
      booked_on: booked,
      travel_start: travel,
      travel_end: travel,
      confirmations: [value(row, 'N')].filter(Boolean),
      sale,
      itinerary: { cost_status: 'Pending', historical_sources: [locator], end_date_known: false },
    },
    locator,
    e.id,
    'Exact original dated invoice and reviewed payment match; unknown return/cost/source channel remain pending',
  );
  // Channel Direct is not a historical fact: only the fixture adapter requires a channel label.
  // Explicit unknown provenance is attached below and this plan is not production-ready.
  plan.at(-1)!.data.channel = 'Unknown';
  if (JSON.stringify(customer) !== JSON.stringify(payer))
    add(
      key,
      'authorize-payer',
      'authorize_payer',
      { booking_id: ref(booking), party_id: payer, reason: a.basis },
      locator,
      e.id,
      a.basis,
    );
  const receipt = add(
    bank.bank_id,
    'customer-receipt',
    'payment',
    {
      direction: 'customer',
      party_id: payer,
      amount: bank.amount_cents,
      date: bank.date,
      method: bank.method,
      reference: bank.reference,
      allocations: [{ booking_id: ref(booking), amount: a.exact_amount_cents }],
    },
    locator,
    e.id,
    a.basis,
  );
  expected.push({ booking, receipt, sale, allocated: a.exact_amount_cents });
}
const commission = allocations.find((a) => a.matchingChecks.commissionNotice);
assert.ok(commission);
const cb = banks.find((b) => b.bank_id === commission.bank_id);
assert.ok(cb);
const ce = source.evidence.find((e: R) => e.raw?.bank_id === cb.bank_id);
assert.ok(ce);
add(
  cb.bank_id,
  'commission-receipt',
  'payment',
  {
    direction: 'commission',
    party_id: party(cb.payer, 'commission_payer', ce.id),
    amount: cb.amount_cents,
    date: cb.date,
    method: cb.method,
    reference: cb.reference,
  },
  {
    bank_id: cb.bank_id,
    message_id: (await read(`${root}/bank-notices.json`)).find((n: R) => n.bank_id === cb.bank_id)
      ?.message_id,
  },
  ce.id,
  'Original bank memo explicitly commission from LLR; no duplicate customer sale or invented commission accrual',
);
add(
  card.processor_transaction,
  'customer-receipt',
  'payment',
  {
    direction: 'customer',
    party_id: party(card.customer_label, 'customer', cardEvidenceId),
    amount: card.amount_cents,
    date: card.received_on,
    method: 'Card',
    reference: card.processor_transaction,
  },
  { message_id: card.message_id, invoice: card.invoice, approved_splits: card.allocations },
  cardEvidenceId,
  'Primary processor receipt and prior Owner splits; receipt held unallocated in fixture until dated invoice records are prepared, not a second bank receipt',
);
held.push({
  booking_keys: card.allocations.map((a: R) => a.booking_key),
  reason:
    'Original invoice date proven; booking/travel dates still require carrier evidence. Approved splits retained without fabricated dates.',
  receiptVerified: true,
  approved_splits: card.allocations,
});
await writeFile(
  `${root}/importer-real-source-plan.json`,
  JSON.stringify(
    {
      plan,
      held,
      scope: 'Verified subset only; no production authorization or full-plan readiness',
    },
    null,
    2,
  ),
);
const db = await createDatabase(true);
try {
  assert.equal(db.storage, undefined);
  await migrate(db);
  const identity = {
    name: 'Historical reconciliation verifier',
    email: 'historical-verifier@example.invalid',
    password: randomBytes(30).toString('base64url'),
  };
  await bootstrapOwner(db, identity);
  const session = await login(db, identity),
    actor = await sessionActor(db, session.token);
  assert.ok(actor);
  const first = await importPracticeFinancialPlan(db, actor, plan);
  const fingerprint = async () => {
    const tables = (
      await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    ).rows;
    const content = [];
    for (const t of tables)
      content.push([
        t.tablename,
        (
          await db.query(
            `SELECT to_jsonb(t) data FROM "${t.tablename}" t ORDER BY to_jsonb(t)::text`,
          )
        ).rows,
      ]);
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
  };
  const before = await fingerprint(),
    replay = await importPracticeFinancialPlan(db, actor, plan);
  assert.equal(replay.created, 0);
  assert.equal(await fingerprint(), before);
  const changed = structuredClone(plan);
  const payment = changed.find((e) => e.kind === 'payment')!;
  payment.data.amount += 1;
  await assert.rejects(importPracticeFinancialPlan(db, actor, changed));
  assert.equal(await fingerprint(), before);
  const lateFailure: ImportEvent[] = [
    { ...plan[0], source_key: 'rollback-proof-only' },
    { ...plan[0], source_key: 'rollback-proof-invalid', data: { name: '', kind: 'person' } },
  ];
  await assert.rejects(importPracticeFinancialPlan(db, actor, lateFailure));
  assert.equal(await fingerprint(), before);
  const proofs = [];
  for (const x of expected) {
    const result = first.results[x.booking];
    assert.ok(result);
    const e = await economics(db, result.id);
    assert.equal(e.customer_balance, x.sale - x.allocated);
    assert.equal(e.profit, null);
    proofs.push({
      booking_command: x.booking,
      customer_balance_cents: e.customer_balance,
      actual_profit: null,
      cost_incomplete: e.cost_incomplete,
    });
  }
  const journal = (
    await db.query('SELECT COALESCE(sum(debit-credit),0) difference FROM journal_lines')
  ).rows[0];
  assert.equal(Number(journal.difference), 0);
  const totals = (
    await db.query(
      'SELECT direction,count(*) count,sum(amount) cents FROM payments GROUP BY direction ORDER BY direction',
    )
  ).rows;
  const report = {
    verifiedAt: new Date().toISOString(),
    isolation: 'In-memory local PostgreSQL fixture; individual authenticated Owner session',
    source_plan_sha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
    events: plan.length,
    first,
    replay,
    unchanged_replay: true,
    changed_payload_rejected: true,
    partial_failure_rolled_back: true,
    journal_difference_cents: Number(journal.difference),
    payments: totals,
    booking_balances: proofs,
    held,
    production_writes: 0,
    full_plan_ready: false,
  };
  await writeFile(`${root}/importer-dry-run.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ...report,
        first: { created: first.created },
        replay: { created: replay.created, replayed: replay.replayed },
        held: held.length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
