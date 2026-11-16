import { randomBytes, randomUUID } from 'node:crypto';
import { type Database, one } from '../../src/lib/db';
import {
  bootstrapOwner,
  login,
  sessionActor,
  createUser,
  issueRecovery,
  completeRecovery,
} from '../../src/lib/users';
import {
  executePartnership,
  partnershipDetail,
  draftApprovalHash,
} from '../../src/lib/partnerships/service';
import { importPartnershipBundle, type ImportBundle } from '../../src/lib/partnerships/import';
export async function syntheticPartnerships(db: Database) {
  const password = randomBytes(24).toString('base64url');
  const owner = await bootstrapOwner(db, {
    name: 'Synthetic Partnerships Owner',
    email: 'partnership-owner@example.invalid',
    password,
  });
  const actor = (await sessionActor(
    db,
    (await login(db, { email: owner.email, password })).token,
  ))!;
  const worker = await createUser(db, actor, {
    name: 'Synthetic Partnership Operator',
    email: 'partnership-operator@example.invalid',
    permissions: ['view_partnerships', 'manage_partnerships'],
  });
  const workerPassword = randomBytes(24).toString('base64url');
  await completeRecovery(db, {
    token: (await issueRecovery(db, actor, worker.id)).token,
    password: workerPassword,
  });
  const run = (kind: string, data: unknown) =>
    executePartnership(db, actor, {
      id: randomUUID(),
      kind,
      data,
      reason: 'Synthetic development fixture',
    });
  const campaign = await run('campaign', {
    key: 'synthetic-current',
    name: 'Current community referrals',
    kind: 'current_direct',
    historical: false,
    starts_on: null,
    ends_on: null,
  });
  const today = new Date().toISOString().slice(0, 10),
    yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const records = [];
  for (const [index, name] of [
    'Harbor Community Center',
    'Maple Visitor Center',
    'Cedar Travel Network',
    'Riverside Community',
  ].entries()) {
    const org = await run('organization', {
      name: 'Synthetic ' + name,
      location: ['Harbor Bay', 'Maple City', 'Cedar Hills', 'Riverside'][index],
      country: 'Synthetic country',
      summary: 'Synthetic development data; never contact these recipients.',
    });
    const method = await run('contact_method', {
      organization_id: org.id,
      contact_id: null,
      kind: 'email',
      value: `synthetic-${index}@example.invalid`,
      verification: 'verified',
      source_url: 'https://example.invalid/synthetic-verification',
      do_not_contact: false,
    });
    const opportunity = await run('opportunity', {
      organization_id: org.id,
      campaign_id: campaign.id,
      stage: index === 1 ? 'awaiting_reply' : 'ready_for_outreach',
      owner_id: worker.id,
      next_action: [
        'Confirm the preferred hand-off for travelers',
        'Review reply and agree a next step',
        'Verify current travel needs',
        'Respect suppression request',
      ][index],
      due_on: yesterday,
      unscheduled_reason: null,
      priority: index + 1,
      rationale: 'Synthetic earlier conversation provides the next action.',
    });
    await run('interaction', {
      organization_id: org.id,
      campaign_id: campaign.id,
      kind: 'call',
      direction: 'internal',
      occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      original_date: null,
      original_timezone: null,
      subject: 'Previous discussion',
      body: 'Discussed help for community visitors. They asked about the referral hand-off and requested clear contact details. No agreement has been confirmed.',
      source_url: null,
    });
    if (index === 1)
      await run('interaction', {
        organization_id: org.id,
        campaign_id: campaign.id,
        kind: 'email',
        direction: 'inbound',
        occurred_at: new Date().toISOString(),
        original_date: null,
        original_timezone: null,
        subject: 'Please clarify before following up',
        body: 'We have an existing hotel arrangement. Could we discuss how your travel service would fit alongside it?',
        source_url: 'https://example.invalid/reply',
      });
    if (index === 2) {
      await run('agreement', {
        organization_id: org.id,
        version: 1,
        status: 'accepted',
        supersedes_id: null,
        original_wording:
          'Synthetic agreement to refer inquiries. Monetary terms remain unconfirmed.',
        confirmed_on: today,
        confirmation_method: 'Synthetic signed agreement',
        evidence_url: 'https://example.invalid/agreement',
        starts_on: today,
        ends_on: null,
        terms: null,
      });
      await run('relationship', {
        id: org.id,
        version: 1,
        relationship: 'active',
        dnc_reason: null,
      });
    }
    if (index === 3)
      await run('relationship', {
        id: org.id,
        version: 1,
        relationship: 'do_not_contact',
        dnc_reason: 'Synthetic suppression request',
      });
    records.push({ org, method, opportunity });
  }
  const draft = await run('draft', {
    opportunity_id: records[0].opportunity.id,
    method_id: records[0].method.id,
    subject: 'Following up on the visitor hand-off',
    body: 'Hello, following our call about helping community visitors, could we confirm the best way to introduce travelers? We can agree any referral terms together before proceeding.',
  });
  const detail = await partnershipDetail(db, actor, records[0].org.id);
  const hash = draftApprovalHash(detail.drafts[0], records[0].method);
  const sample: ImportBundle = {
    key: 'synthetic-source-v1',
    captureHash: 'a'.repeat(64),
    source: {
      key: 'synthetic-source',
      title: 'Synthetic source reconciliation example',
      kind: 'manual',
      location: 'https://example.invalid/source',
      coverage: 'One deliberately unmatched synthetic record.',
      complete: true,
    },
    items: [
      {
        key: 'sample-1',
        locator: 'row-1',
        originalText: 'A shared contact address needs branch verification.',
        payload: { synthetic: true },
        kind: 'review',
        matchingMethod: 'No stable branch identity',
        reason: 'Staff must verify the branch before linking this source.',
      },
    ],
    exceptions: [],
  };
  await importPartnershipBundle(db, actor, sample);
  return {
    owner: { id: owner.id, email: owner.email, password },
    worker: { id: worker.id, email: worker.email, password: workerPassword },
    records,
    draft: { ...draft, approvalHash: hash },
    campaign,
    sample,
  };
}
