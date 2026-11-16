import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createDatabase, migrate, one, type Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor, createUser } from '../src/lib/users';
import { type Actor } from '../src/lib/permissions';
import {
  executePartnership,
  partnershipList,
  partnershipDetail,
  sourceRegister,
  hash,
} from '../src/lib/partnerships/service';
import {
  importPartnershipBundle,
  classifyCampaign,
  type ImportBundle,
} from '../src/lib/partnerships/import';
import { storeDocument, readDocument } from '../src/lib/partnerships/documents';
import { execute as financialCommand, economics } from '../src/lib/finance';
import { detail as bookingDetail } from '../src/lib/queries';
async function fixture() {
  const db = await createDatabase(true);
  await migrate(db);
  const password = 'Isolated Partnerships Owner password';
  const u = await bootstrapOwner(db, {
    name: 'Partnerships Test Owner',
    email: 'partnerships@example.invalid',
    password,
  });
  const actor = (await sessionActor(db, (await login(db, { email: u.email, password })).token))!;
  return { db, actor };
}
const command = (db: Database, actor: Actor, kind: string, data: unknown) =>
  executePartnership(db, actor, {
    id: randomUUID(),
    kind,
    data,
    reason: 'Synthetic acceptance test',
  });
async function setup(db: Database, actor: Actor) {
  const org = await command(db, actor, 'organization', {
    name: 'Synthetic Harbor Center',
    location: 'Test Bay',
  });
  const campaign = await command(db, actor, 'campaign', {
    key: 'synthetic_current',
    name: 'Synthetic current campaign',
    kind: 'current_direct',
    historical: false,
    starts_on: null,
    ends_on: null,
  });
  const opportunity = await command(db, actor, 'opportunity', {
    organization_id: org.id,
    campaign_id: campaign.id,
    stage: 'ready_for_outreach',
    owner_id: actor.id,
    next_action: 'Discuss travel referrals',
    due_on: '2020-01-01',
    unscheduled_reason: null,
    priority: 1,
  });
  const method = await command(db, actor, 'contact_method', {
    organization_id: org.id,
    contact_id: null,
    kind: 'email',
    value: 'harbor@example.invalid',
    verification: 'verified',
    source_url: 'https://example.invalid/contact',
    do_not_contact: false,
  });
  return { org, campaign, opportunity, method };
}
test('Partnership queue, ownership, optimistic edits, exact retries and permission boundaries', async () => {
  const { db, actor } = await fixture();
  try {
    const { org, opportunity } = await setup(db, actor);
    for (const view of [
      'queue',
      'all',
      'best',
      'awaiting',
      'active',
      'earlier_direct',
      'verification',
      'replies',
    ]) {
      const result = await partnershipList(db, actor, new URLSearchParams({ view }));
      assert.ok(
        Array.isArray(result.rows),
        `Unfiltered ${view} query executes with correct binding`,
      );
    }
    const state = await partnershipList(db, actor, new URLSearchParams('view=due&q=Harbor'));
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].overdue, true);
    assert.equal(state.rows[0].relationship, 'prospect');
    await assert.rejects(
      command(db, actor, 'relationship', {
        id: org.id,
        version: 1,
        relationship: 'active',
        dnc_reason: null,
      }),
      /agreement/i,
    );
    const payload = {
      id: randomUUID(),
      kind: 'interaction',
      data: {
        organization_id: org.id,
        campaign_id: null,
        kind: 'note',
        direction: 'internal',
        occurred_at: null,
        original_date: null,
        original_timezone: null,
        subject: '',
        body: 'Undated original note',
        source_url: null,
      },
      reason: 'Recorded synthetic history',
    };
    const a = await executePartnership(db, actor, payload);
    assert.deepEqual(await executePartnership(db, actor, payload), a);
    await assert.rejects(
      executePartnership(db, actor, { ...payload, reason: 'Changed' }),
      /Idempotency/,
    );
    const detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.timeline.length, 1);
    assert.equal(detail.timeline[0].occurred_at, null);
    await assert.rejects(
      command(db, actor, 'review_reply', {
        id: opportunity.id,
        version: 1,
        next_action: 'Stale edit',
        due_on: null,
        unscheduled_reason: 'test',
      }),
      /changed/i,
    );
    const worker = await createUser(db, actor, {
      name: 'No partnerships access',
      email: 'worker@example.invalid',
      role: 'EMPLOYEE',
      permissions: ['operations'],
    });
    await assert.rejects(
      partnershipList(
        db,
        { id: worker.id, name: worker.name, role: 'OWNER', permissions: [] },
        new URLSearchParams(),
      ),
      /Permission/,
    );
    await assert.rejects(
      db.query('UPDATE pt_interactions SET body=$1 WHERE id=$2', ['overwrite', a.id]),
      /immutable/,
    );
  } finally {
    await db.close();
  }
});
test('Exact draft approval is invalidated by replies and do-not-contact blocks outreach', async () => {
  const { db, actor } = await fixture();
  try {
    const { org, opportunity, method } = await setup(db, actor);
    const d = await command(db, actor, 'draft', {
      opportunity_id: opportunity.id,
      method_id: method.id,
      subject: 'Hello',
      body: 'Discuss referrals?',
    });
    let detail = await partnershipDetail(db, actor, org.id);
    await command(db, actor, 'approve_draft', {
      id: d.id,
      version: 1,
      approval_hash: detail.drafts[0].review_hash,
    });
    await command(db, actor, 'interaction', {
      organization_id: org.id,
      campaign_id: null,
      kind: 'email',
      direction: 'inbound',
      occurred_at: '2026-11-03T12:00:00Z',
      original_date: null,
      original_timezone: 'UTC',
      subject: 'Reply',
      body: 'Please wait; we have an existing hotel arrangement.',
      source_url: 'https://example.invalid/message',
    });
    detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.drafts[0].state, 'invalidated');
    assert.equal(detail.opportunities[0].reply_review, true);
    await assert.rejects(
      command(db, actor, 'draft', {
        opportunity_id: opportunity.id,
        method_id: method.id,
        subject: 'Stale',
        body: 'Follow-up',
      }),
      /Review the new reply/,
    );
    await command(db, actor, 'relationship', {
      id: org.id,
      version: 1,
      relationship: 'do_not_contact',
      dnc_reason: 'Recipient requested no contact',
    });
    await assert.rejects(
      command(db, actor, 'draft', {
        opportunity_id: opportunity.id,
        method_id: method.id,
        subject: 'Ignored suppression',
        body: 'Follow-up',
      }),
      /blocked/,
    );
  } finally {
    await db.close();
  }
});
test('Immutable source import reconciles, reruns without duplicates and never activates legacy interest', async () => {
  const { db, actor } = await fixture();
  try {
    const bundle: ImportBundle = {
      key: 'synthetic-batch',
      source: {
        key: 'synthetic-sheet',
        title: 'Synthetic source',
        kind: 'spreadsheet',
        location: 'https://example.invalid/sheet',
        coverage: 'Two synthetic rows',
        complete: true,
      },
      captureHash: hash('synthetic'),
      exceptions: [],
      items: [
        {
          key: 'CH-00001',
          locator: 'Organizations!A2',
          legacyId: 'CH-00001',
          originalText: 'Interested years ago',
          payload: { old_status: 'Interested' },
          kind: 'organization',
          matchingMethod: 'stable legacy ID',
          reason: 'Preserved source',
          organization: {
            name: 'Synthetic Historic Branch',
            location: 'Test',
            country: '',
            region: '',
            summary: 'Historical interest',
            contacts: [],
            nextAction: 'Verify current relationship',
            historicalStatus: 'Interested',
            review: '',
          },
        },
        {
          key: 'H-00001',
          legacyId: 'H-00001',
          organizationLegacyId: 'CH-00001',
          locator: 'History!A2',
          originalText: 'Please book directly through Padova. Proposed 15% of earnings.',
          payload: {},
          kind: 'interaction',
          matchingMethod: 'stable CH identity',
          reason: 'Dated source discussion',
          interaction: {
            kind: 'note',
            direction: 'unknown',
            body: 'Please book directly through Padova. Proposed 15% of earnings.',
            subject: '',
            occurredAt: null,
            campaign: 'historical_direct',
          },
        },
      ],
    };
    const result = await importPartnershipBundle(db, actor, bundle);
    assert.equal(result.source_items, 2);
    assert.equal(result.imported, 2);
    const before = await one(db, 'SELECT count(*) n FROM pt_interactions');
    const replay = await importPartnershipBundle(db, actor, bundle);
    assert.equal(replay.created, 0);
    assert.equal((await one(db, 'SELECT count(*) n FROM pt_interactions')).n, before.n);
    assert.equal(
      (await one(db, 'SELECT relationship FROM pt_organizations')).relationship,
      'prospect',
    );
    assert.equal(
      classifyCampaign(
        'They can book directly through Padova. We offer 15% of earnings.',
        'Legacy affiliate',
      ),
      'historical_direct',
    );
    const changed = structuredClone(bundle);
    changed.key = 'synthetic-next';
    changed.items[0].originalText = 'Changed old note';
    changed.captureHash = hash('next');
    const next = await importPartnershipBundle(db, actor, changed);
    assert.equal(next.unresolved, 1);
    assert.equal((await one(db, 'SELECT count(*) n FROM pt_organizations')).n, 1);
  } finally {
    await db.close();
  }
});
test('Recovered source coverage and reviewed identity mappings preserve originals and invalidate affected drafts', async () => {
  const { db, actor } = await fixture();
  try {
    const { org, opportunity, method } = await setup(db, actor);
    const source = {
      key: 'synthetic-recovered',
      title: 'Missing source',
      kind: 'email',
      location: 'https://example.invalid/archive',
      coverage: 'Not accessible',
      complete: false,
      unavailableReason: 'Synthetic access gap',
    };
    await importPartnershipBundle(db, actor, {
      key: 'missing',
      captureHash: hash('missing'),
      source,
      items: [],
      exceptions: ['Synthetic access gap'],
    });
    const recovered: ImportBundle = {
      key: 'recovered',
      captureHash: hash('recovered'),
      source: {
        key: source.key,
        title: 'Recovered original source',
        kind: 'email',
        location: source.location,
        coverage: 'Full recovered message',
        complete: true,
      },
      items: [
        {
          key: 'unmatched-message',
          locator: 'synthetic/message',
          originalText: 'Please review our existing hotel agreement first.',
          payload: { original: true },
          kind: 'interaction',
          matchingMethod: 'Unresolved branch',
          reason: 'New thread requires review',
          interaction: {
            kind: 'email',
            direction: 'inbound',
            occurredAt: '2026-11-01T10:00:00Z',
            subject: 'Existing agreement',
            body: 'Please review our existing hotel agreement first.',
            campaign: 'historical_direct',
          },
        },
      ],
      exceptions: [],
    };
    await importPartnershipBundle(db, actor, recovered);
    const register = await one(db, 'SELECT * FROM pt_sources WHERE key=$1', [source.key]);
    assert.equal(register.title, 'Recovered original source');
    assert.equal(register.coverage, 'Full recovered message');
    assert.equal(register.status, 'awaiting_review');
    const item = await one(db, 'SELECT * FROM pt_source_items WHERE source_id=$1', [register.id]);
    let review = await one(db, 'SELECT * FROM pt_reviews WHERE source_item_id=$1', [item.id]);
    await command(db, actor, 'review', {
      id: review.id,
      version: review.version,
      status: 'deferred',
      resolution: 'Identity remains uncertain; await evidence',
      organization_id: null,
    });
    const deferred = await sourceRegister(db, actor);
    assert.equal(deferred.total, 1, 'Deferred unresolved work remains discoverable');
    assert.equal(deferred.reviews[0].status, 'deferred');
    review = await one(db, 'SELECT * FROM pt_reviews WHERE id=$1', [review.id]);
    const draft = await command(db, actor, 'draft', {
      opportunity_id: opportunity.id,
      method_id: method.id,
      subject: 'Test',
      body: 'Old context',
    });
    await command(db, actor, 'review', {
      id: review.id,
      version: review.version,
      status: 'resolved',
      resolution: 'Verified synthetic branch identity',
      organization_id: org.id,
    });
    let details = await partnershipDetail(db, actor, org.id);
    assert.ok(details.timeline.some((i) => i.body === item.original_text));
    assert.equal(details.opportunities[0].reply_review, true);
    assert.equal(details.drafts.find((d) => d.id === draft.id)?.state, 'invalidated');
    const second = await command(db, actor, 'organization', { name: 'Synthetic separate branch' });
    await command(db, actor, 'review', {
      id: review.id,
      version: review.version + 1,
      status: 'resolved',
      resolution: 'Corrected branch after additional evidence',
      organization_id: second.id,
    });
    details = await partnershipDetail(db, actor, org.id);
    assert.ok(!details.timeline.some((i) => i.body === item.original_text));
    assert.ok(
      (await partnershipDetail(db, actor, second.id)).timeline.some(
        (i) => i.body === item.original_text,
      ),
    );
    assert.equal(
      (await one(db, 'SELECT original_text FROM pt_source_items WHERE id=$1', [item.id]))
        .original_text,
      item.original_text,
    );
    assert.equal(
      (
        await one(db, 'SELECT count(*) n FROM pt_source_resolutions WHERE source_item_id=$1', [
          item.id,
        ])
      ).n,
      2,
    );
    assert.equal(
      (await partnershipList(db, actor, new URLSearchParams('view=earlier_direct'))).rows[0].id,
      second.id,
    );
  } finally {
    await db.close();
  }
});

test('Current relationship changes preserve campaign history and stale research cannot authorize outreach', async () => {
  const { db, actor } = await fixture();
  try {
    const { org, opportunity, method } = await setup(db, actor);
    const historical = await command(db, actor, 'campaign', {
      key: 'old_direct',
      name: 'Previous direct campaign',
      kind: 'historical_direct',
      historical: true,
      starts_on: null,
      ends_on: null,
    });
    const oldOpportunity = await command(db, actor, 'opportunity', {
      organization_id: org.id,
      campaign_id: historical.id,
      stage: 'interested',
      owner_id: actor.id,
      next_action: 'Historical discussion preserved',
      due_on: null,
      unscheduled_reason: 'Archived campaign',
      priority: 2,
    });
    const draft = await command(db, actor, 'draft', {
      opportunity_id: opportunity.id,
      method_id: method.id,
      subject: 'Test',
      body: 'Discuss an arrangement',
    });
    await command(db, actor, 'research', {
      organization_id: org.id,
      kind: 'restriction',
      title: 'Existing hotel agreement',
      body: 'Review overflow only',
      source_url: 'https://example.invalid/hotels',
      observed_on: '2026-11-03',
      verified_on: null,
      rank: null,
    });
    assert.equal(
      (await one(db, 'SELECT state FROM pt_drafts WHERE id=$1', [draft.id])).state,
      'invalidated',
    );
    const terms = {
      organization_id: org.id,
      version: 1,
      status: 'accepted',
      supersedes_id: null,
      original_wording: 'Synthetic referral arrangement with no money implied',
      confirmed_on: '2026-10-01',
      confirmation_method: 'Signed synthetic agreement',
      evidence_url: 'https://example.invalid/terms',
      starts_on: '2026-10-01',
      ends_on: '2026-10-02',
      terms: null,
    };
    const expired = await command(db, actor, 'agreement', terms);
    await assert.rejects(
      command(db, actor, 'relationship', {
        id: org.id,
        version: 1,
        relationship: 'active',
        dnc_reason: null,
      }),
      /effective/,
    );
    const accepted = await command(db, actor, 'agreement', {
      ...terms,
      version: 2,
      supersedes_id: expired.id,
      ends_on: null,
    });
    await command(db, actor, 'relationship', {
      id: org.id,
      version: 1,
      relationship: 'active',
      dnc_reason: null,
    });
    const current = await one(db, 'SELECT * FROM pt_opportunities WHERE id=$1', [opportunity.id]);
    await command(db, actor, 'opportunity', {
      id: current.id,
      version: current.version,
      organization_id: org.id,
      campaign_id: current.campaign_id,
      stage: 'active_partner',
      owner_id: actor.id,
      next_action: 'Check referral progress',
      due_on: '2026-12-01',
      unscheduled_reason: null,
      priority: 1,
    });
    await command(db, actor, 'agreement', {
      ...terms,
      version: 3,
      status: 'ended',
      supersedes_id: accepted.id,
      ends_on: '2026-11-03',
    });
    assert.equal(
      (await one(db, 'SELECT stage FROM pt_opportunities WHERE id=$1', [opportunity.id])).stage,
      'ended',
    );
    assert.equal(
      (await one(db, 'SELECT stage FROM pt_opportunities WHERE id=$1', [oldOpportunity.id])).stage,
      'interested',
    );
    assert.equal((await partnershipList(db, actor, new URLSearchParams('view=queue'))).total, 0);
    const orgNow = await one(db, 'SELECT version FROM pt_organizations WHERE id=$1', [org.id]);
    await command(db, actor, 'relationship', {
      id: org.id,
      version: orgNow.version,
      relationship: 'do_not_contact',
      dnc_reason: 'Synthetic suppression request',
    });
    assert.equal(
      (await one(db, 'SELECT stage FROM pt_opportunities WHERE id=$1', [oldOpportunity.id])).stage,
      'interested',
    );
  } finally {
    await db.close();
  }
});

test('Private documents require staff permissions, remain encrypted and survive restore', async () => {
  const { db, actor } = await fixture();
  let restored: Database | undefined;
  process.env.PADOVA_PARTNERSHIP_DOCUMENT_KEY = randomBytes(32).toString('base64');
  try {
    const { org } = await setup(db, actor);
    const body = Buffer.from('Synthetic private source agreement');
    const documentCommand = randomUUID();
    const d = await storeDocument(db, actor, org.id, '../agreement.txt', 'text/plain', body, {
      commandId: documentCommand,
    });
    assert.deepEqual(
      await storeDocument(db, actor, org.id, '../agreement.txt', 'text/plain', body, {
        commandId: documentCommand,
      }),
      d,
    );
    await assert.rejects(
      storeDocument(
        db,
        actor,
        org.id,
        '../agreement.txt',
        'text/plain',
        Buffer.from('Changed content'),
        { commandId: documentCommand },
      ),
      /different content/,
    );
    assert.equal(
      (await one(db, "SELECT count(*) n FROM pt_interactions WHERE kind='document'")).n,
      1,
    );
    const stored = await one(db, 'SELECT * FROM pt_documents WHERE id=$1', [d.id]);
    assert.ok(!stored.encrypted_content.includes(body.toString()));
    assert.equal((await readDocument(db, actor, d.id)).bytes.toString(), body.toString());
    restored = await createDatabase(true, await db.dump!());
    assert.equal((await readDocument(restored, actor, d.id)).bytes.toString(), body.toString());
    const worker = await createUser(db, actor, {
      name: 'Restricted',
      email: 'restricted@example.invalid',
      role: 'EMPLOYEE',
      permissions: ['operations'],
    });
    await assert.rejects(
      readDocument(db, { id: worker.id, name: 'Restricted', permissions: [] }, d.id),
      /Permission/,
    );
  } finally {
    await restored?.close();
    await db.close();
    delete process.env.PADOVA_PARTNERSHIP_DOCUMENT_KEY;
  }
});

test('Partnership booking links use canonical commission versions, payments, cancellations and reversals without duplicate accounting', async () => {
  const { db, actor } = await fixture();
  try {
    const finance = (kind: any, data: any) =>
      financialCommand(db, actor, { id: randomUUID(), kind, data });
    const { org } = await setup(db, actor),
      date = '2026-10-15';
    const customer = await finance('party', {
      name: 'Synthetic referral customer',
      kind: 'person',
      roles: ['customer'],
    });
    const seller = await finance('party', {
      name: 'Synthetic referral seller',
      kind: 'company',
      roles: ['seller'],
    });
    const referrer = await finance('party', {
      name: 'Synthetic canonical referrer',
      kind: 'company',
      roles: ['referrer'],
    });
    await command(db, actor, 'organization', {
      id: org.id,
      version: 1,
      name: 'Synthetic Harbor Center',
      accounting_party_id: referrer.id,
    });
    const booking = await finance('booking', {
      customer_id: customer.id,
      supplier_id: seller.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Synthetic partner booking',
      booked_on: date,
      travel_start: '2026-12-05',
      travel_end: '2026-12-06',
      sale: 100000,
    });
    const funding = await finance('fund', {
      booking_id: booking.id,
      seller_id: seller.id,
      kind: 'Cash',
      face_amount: 60000,
      cost: 60000,
      settled: false,
      date,
    });
    const canonical = await finance('referral', {
      booking_id: booking.id,
      referrer_id: referrer.id,
      basis: 'percentage',
      percentage_basis: 'sale',
      rate_bps: 1000,
      earned: true,
      payable_when: 'When earned',
      due_on: date,
      cancellation_rule: 'Realized economics',
      reason: 'Synthetic confirmed 10% of sale',
      date,
    });
    const agreement = await command(db, actor, 'agreement', {
      organization_id: org.id,
      version: 1,
      status: 'accepted',
      supersedes_id: null,
      original_wording:
        '10% of booking sale; payable when earned; realized economics after cancellation.',
      confirmed_on: date,
      confirmation_method: 'Synthetic signed agreement',
      evidence_url: 'https://example.invalid/terms',
      starts_on: date,
      ends_on: null,
      terms: {
        calculation: 'percentage',
        fixed_amount: null,
        rate_bps: 1000,
        percentage_basis: 'sale',
        payable_when: 'When earned',
        eligibility: 'Synthetic linked booking',
        cancellation_rule: 'Realized economics',
        currency: 'USD',
      },
    });
    const before = await one(
      db,
      'SELECT (SELECT count(*) FROM journal_lines) journal,(SELECT count(*) FROM referrals) referrals,(SELECT count(*) FROM payments) payments',
    );
    await command(db, actor, 'referral', {
      organization_id: org.id,
      agreement_id: agreement.id,
      booking_id: booking.id,
      accounting_referral_id: canonical.id,
      kind: 'booking',
      occurred_on: date,
      reference: 'Confirmed synthetic referral',
      source_url: 'https://example.invalid/referral',
    });
    assert.deepEqual(
      await one(
        db,
        'SELECT (SELECT count(*) FROM journal_lines) journal,(SELECT count(*) FROM referrals) referrals,(SELECT count(*) FROM payments) payments',
      ),
      before,
      'Partnership link must never create an obligation or posting',
    );
    let detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.referrals[0].commission.expected_due, 10000);
    assert.equal(detail.referrals[0].commission_history.length, 1);
    const payment = await finance('pay_referral', {
      referral_id: canonical.id,
      amount: 8000,
      date,
      method: 'ACH',
    });
    detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.referrals[0].commission.paid, 8000);
    const f = await one(db, 'SELECT id FROM funding_components WHERE booking_id=$1', [booking.id]);
    await finance('cancel', {
      booking_id: booking.id,
      funding_component_id: f.id,
      supplier_expected: 0,
      customer_due: 0,
      charge_reduction: 50000,
      due_on: date,
      date,
      reason: 'Synthetic partial cancellation',
    });
    detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.referrals[0].commission.expected_due, 0);
    assert.equal(detail.referrals[0].commission.recovery_due, 8000);
    await finance('reverse_referral_payment', {
      payment_id: payment.payment_id,
      amount: 3000,
      date,
      reason: 'Actual synthetic payout return',
    });
    detail = await partnershipDetail(db, actor, org.id);
    assert.equal(detail.referrals[0].commission.paid, 5000);
    assert.equal(detail.referrals[0].commission.recovery_due, 5000);
    assert.equal(
      Number((await one(db, 'SELECT sum(debit-credit) balance FROM journal_lines')).balance),
      0,
    );
    const operator = await createUser(db, actor, {
      name: 'Partnership only',
      email: 'scoped-partnership@example.invalid',
      permissions: ['view_partnerships', 'manage_partnerships'],
    });
    const scoped = { id: operator.id, name: operator.name, permissions: operator.permissions };
    assert.ok(!(await partnershipDetail(db, scoped, org.id)).referrals[0].commission);
    await assert.rejects(
      command(db, scoped, 'organization', {
        id: org.id,
        version: 2,
        name: 'Synthetic Harbor Center',
        accounting_party_id: null,
      }),
      /Permission/,
    );
  } finally {
    await db.close();
  }
});

test('Booking entry referring organization creates payable + CRM link without inventing IATA commission', async () => {
  const { db, actor } = await fixture();
  try {
    const finance = (kind: any, data: any) =>
      financialCommand(db, actor, { id: randomUUID(), kind, data });
    const { org } = await setup(db, actor);
    const date = '2026-11-16';
    const customer = await finance('party', {
      name: 'Referring-org customer',
      kind: 'person',
      roles: ['customer'],
    });
    const referrer = await finance('party', {
      name: 'Referring-org payee',
      kind: 'company',
      roles: ['referrer'],
    });
    await command(db, actor, 'organization', {
      id: org.id,
      version: 1,
      name: 'Synthetic Harbor Center',
      accounting_party_id: referrer.id,
    });
    await command(db, actor, 'agreement', {
      organization_id: org.id,
      version: 1,
      status: 'accepted',
      supersedes_id: null,
      original_wording: '20% of profit; payable when earned; realized economics.',
      confirmed_on: date,
      confirmation_method: 'Synthetic signed agreement',
      evidence_url: 'https://example.invalid/ref-org-terms',
      starts_on: date,
      ends_on: null,
      terms: {
        calculation: 'percentage',
        fixed_amount: null,
        rate_bps: 2000,
        percentage_basis: 'profit',
        payable_when: 'When earned',
        eligibility: 'Referring organization on booking',
        cancellation_rule: 'Realized economics',
        currency: 'USD',
      },
    });
    const booking = await finance('booking', {
      customer_id: customer.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Referring org on booking entry',
      booked_on: date,
      travel_start: '2027-01-10',
      travel_end: '2027-01-12',
      sale: 50000,
      travel_components_input: [
        {
          product: 'Hotel',
          summary: 'Referring org hotel',
          travel_start: '2027-01-10',
          travel_end: '2027-01-12',
          details: { hotel: 'Synthetic hotel' },
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        referring_organization_id: org.id,
        components: [{ type: 'Padova payment', cost: 40000, method: 'Cash', date }],
      },
    });
    const e = await economics(db, booking.id);
    assert.equal(e.commission_payables?.length, 1);
    assert.equal(e.commission_payables[0].referrer_id, referrer.id);
    assert.equal(e.commission_payables[0].rate_bps, 2000);
    assert.equal(
      (await one(db, 'SELECT count(*)::int n FROM pt_referrals WHERE booking_id=$1', [booking.id]))
        .n,
      1,
    );
    assert.equal(
      (
        await one(db, 'SELECT organization_id FROM pt_referrals WHERE booking_id=$1', [booking.id])
      ).organization_id,
      org.id,
    );
    const viewed = await bookingDetail(db, actor, 'booking', booking.id);
    assert.equal(viewed.booking.referring_organization_id, org.id);
    assert.equal(viewed.booking.referring_organization_name, 'Synthetic Harbor Center');
  } finally {
    await db.close();
  }
});
