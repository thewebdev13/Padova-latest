import { ownMessageText } from './source-text';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Database, type SQL, type Row, one } from '../db';
import { type Actor, requirePermission, hasPermission } from '../permissions';
import { freshActor, AccessError } from '../users';
import { businessDate } from '../business-date';
import { redactOperationalText } from '../operational-redaction';
import { economics } from '../finance';
import { schemas, commandEnvelope, aiWriteKinds, type CommandKind } from './contracts';

export type Channel = 'staff' | 'ai' | 'import';
export class ConflictError extends Error {}
export const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function safeText(value: string): string {
  return redactOperationalText(value)
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
      '[REDACTED credential]',
    )
    .replace(
      /\b(password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|cvv|cvc)\s*[:=]\s*[^\s,;]+/gi,
      '$1: [REDACTED]',
    );
}
export function safeValue(value: unknown): unknown {
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeValue(v)]));
  return value;
}
export async function partnershipActor(tx: SQL, actor: Actor, write = false) {
  // Unlike offline financial fixtures, partnership access always requires a real staff row.
  if (!z.string().uuid().safeParse(actor.id).success)
    throw new AccessError('Individual staff identity required', 401);
  actor = await freshActor(tx, actor);
  requirePermission(actor, 'view_partnerships');
  if (write) requirePermission(actor, 'manage_partnerships');
  return actor;
}
const tables = new Set([
  'pt_organizations',
  'pt_contacts',
  'pt_contact_methods',
  'pt_campaigns',
  'pt_opportunities',
  'pt_interactions',
  'pt_research',
  'pt_agreements',
  'pt_referrals',
  'pt_reviews',
  'pt_drafts',
  'pt_sources',
  'pt_import_batches',
  'pt_source_items',
  'pt_source_resolutions',
  'pt_documents',
  'pt_ai_grants',
  'pt_ai_refresh_tokens',
  'pt_oauth_clients',
  'pt_oauth_codes',
]);
export async function insert(tx: SQL, table: string, data: Row): Promise<Row> {
  if (!tables.has(table)) throw new Error('Unknown partnership entity');
  const keys = Object.keys(data);
  if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k))) throw new Error('Invalid column');
  return one(
    tx,
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(data),
  );
}
export async function audit(
  tx: SQL,
  actor: Actor,
  commandId: string,
  channel: Channel,
  table: string,
  before: Row | null,
  after: Row,
  reason: string,
) {
  const scrub = (r: Row | null) =>
    r
      ? Object.fromEntries(
          Object.entries(r).filter(
            ([k]) => !['encrypted_content', 'token_hash', 'code_hash'].includes(k),
          ),
        )
      : null;
  await tx.query(
    'INSERT INTO pt_audit(command_id,actor_id,channel,entity_type,entity_id,before_value,after_value,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      commandId,
      actor.id,
      channel,
      table,
      after.id,
      JSON.stringify(scrub(before)),
      JSON.stringify(scrub(after)),
      safeText(reason),
    ],
  );
}
export async function update(
  tx: SQL,
  table: string,
  id: string,
  version: number,
  data: Row,
): Promise<{ before: Row; after: Row }> {
  if (!tables.has(table)) throw new Error('Unknown partnership entity');
  const before = await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
  if (Number(before.version) !== version)
    throw new ConflictError('This record changed. Refresh and review the latest version.');
  const keys = Object.keys(data);
  if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k))) throw new Error('Invalid column');
  const after = await one(
    tx,
    `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(',')},version=version+1 WHERE id=$1 AND version=$2 RETURNING *`,
    [id, version, ...Object.values(data)],
  );
  return { before, after };
}
export async function invalidateDrafts(
  tx: SQL,
  actor: Actor,
  commandId: string,
  channel: Channel,
  organizationId: string,
  reason: string,
) {
  const rows = (
    await tx.query(
      "SELECT d.* FROM pt_drafts d JOIN pt_opportunities o ON o.id=d.opportunity_id WHERE o.organization_id=$1 AND d.state IN ('draft','approved')",
      [organizationId],
    )
  ).rows;
  for (const before of rows) {
    const { after } = await update(tx, 'pt_drafts', before.id, Number(before.version), {
      state: 'invalidated',
    });
    await audit(tx, actor, commandId, channel, 'pt_drafts', before, after, reason);
  }
}
export async function recordInteraction(
  tx: SQL,
  actor: Actor,
  commandId: string,
  channel: Channel,
  data: Row,
): Promise<Row> {
  const interaction = await insert(tx, 'pt_interactions', { ...data, actor_id: actor.id });
  if (data.organization_id) {
    const opportunities = (
      await tx.query('SELECT * FROM pt_opportunities WHERE organization_id=$1', [
        data.organization_id,
      ])
    ).rows;
    for (const before of opportunities) {
      const { after } = await update(tx, 'pt_opportunities', before.id, Number(before.version), {
        history_version: Number(before.history_version) + 1,
        reply_review: before.reply_review || data.direction === 'inbound',
        updated_at: new Date().toISOString(),
      });
      await audit(
        tx,
        actor,
        commandId,
        channel,
        'pt_opportunities',
        before,
        after,
        'New history requires fresh outreach review',
      );
    }
    await invalidateDrafts(
      tx,
      actor,
      commandId,
      channel,
      data.organization_id,
      'New interaction invalidated previous outreach context',
    );
  }
  return interaction;
}
async function activeAgreement(tx: SQL, organizationId: string, today: string) {
  const row = (
    await tx.query(
      'SELECT * FROM pt_agreements WHERE organization_id=$1 ORDER BY version DESC LIMIT 1',
      [organizationId],
    )
  ).rows[0];
  if (
    !row ||
    row.status !== 'accepted' ||
    !row.starts_on ||
    row.starts_on > today ||
    (row.ends_on && row.ends_on < today)
  )
    throw new Error('An evidenced, currently effective accepted agreement is required');
  return row;
}
export function draftApprovalHash(draft: Row, method: Row) {
  return hash({
    id: draft.id,
    recipient: method.value,
    subject: draft.subject,
    body: draft.body,
    context_version: draft.context_version,
    opportunity_version: draft.opportunity_version,
    method_version: draft.method_version,
  });
}
async function draftContext(tx: SQL, opportunityId: string, methodId: string) {
  const opportunity = await one(tx, 'SELECT * FROM pt_opportunities WHERE id=$1 FOR UPDATE', [
    opportunityId,
  ]);
  const organization = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [
    opportunity.organization_id,
  ]);
  const method = await one(tx, 'SELECT * FROM pt_contact_methods WHERE id=$1', [methodId]);
  const contact = method.contact_id
    ? await one(tx, 'SELECT * FROM pt_contacts WHERE id=$1', [method.contact_id])
    : null;
  const campaign = await one(tx, 'SELECT * FROM pt_campaigns WHERE id=$1', [
    opportunity.campaign_id,
  ]);
  if (method.organization_id !== organization.id)
    throw new Error('Recipient belongs to another organization');
  if (
    organization.do_not_contact ||
    ['do_not_contact', 'paused', 'declined', 'ended'].includes(organization.relationship) ||
    method.do_not_contact ||
    contact?.do_not_contact ||
    ['do_not_contact', 'declined', 'ended', 'paused'].includes(opportunity.stage)
  )
    throw new Error('Outreach is blocked for this relationship or recipient');
  if (campaign.historical) throw new Error('Historical campaigns cannot generate new outreach');
  if (organization.relationship === 'active')
    await activeAgreement(tx, organization.id, await businessDate(tx));
  if (opportunity.reply_review)
    throw new Error('Review the new reply before preparing or approving outreach');
  if (method.verification !== 'verified')
    throw new Error('Verify the recipient before preparing outreach');
  if (!['email', 'whatsapp', 'phone'].includes(method.kind))
    throw new Error('Select an outreach recipient');
  return { opportunity, organization, method, contact };
}
function commandPermission(kind: CommandKind) {
  if (['approve_draft', 'manually_sent'].includes(kind))
    return 'approve_partnership_outreach' as const;
  return 'manage_partnerships' as const;
}
export async function executePartnership(
  db: Database,
  actor: Actor,
  input: unknown,
  channel: Channel = 'staff',
  authorizeWrite?: (tx: SQL) => Promise<void>,
) {
  const command = commandEnvelope.parse(input),
    kind = command.kind;
  if (channel === 'ai' && !aiWriteKinds.has(kind))
    throw new AccessError('This operation is not available to AI');
  const data = schemas[kind].parse(safeValue(command.data)) as Row;
  const payloadHash = hash({ kind, data, reason: command.reason, channel });
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor, true);
    requirePermission(actor, commandPermission(kind));
    // Serialize commands across instances, including initial inserts and import reply invalidation.
    await tx.query('SELECT pg_advisory_xact_lock(71281103)');
    if (authorizeWrite) await authorizeWrite(tx);
    const retry = (await tx.query('SELECT * FROM pt_commands WHERE id=$1', [command.id])).rows[0];
    if (retry) {
      if (retry.actor_id !== actor.id || retry.payload_hash !== payloadHash || retry.kind !== kind)
        throw new ConflictError('Idempotency key was already used for different input');
      return retry.result;
    }
    let table = '',
      before: Row | null = null,
      after: Row;
    const today = await businessDate(tx);
    if (['organization', 'contact', 'contact_method', 'opportunity'].includes(kind)) {
      table = {
        organization: 'pt_organizations',
        contact: 'pt_contacts',
        contact_method: 'pt_contact_methods',
        opportunity: 'pt_opportunities',
      }[kind as 'organization' | 'contact' | 'contact_method' | 'opportunity'];
      const { id, version, ...fields } = data;
      if (fields.organization_id)
        await one(tx, 'SELECT id FROM pt_organizations WHERE id=$1', [fields.organization_id]);
      if (kind === 'organization') {
        if (channel === 'ai') throw new AccessError('AI cannot create or merge organizations');
        if (Object.hasOwn(fields, 'accounting_party_id'))
          requirePermission(actor, 'manage_commissions');
        if (fields.parent_id) {
          if (fields.parent_id === id) throw new Error('Organization cannot be its own branch');
          const ancestors = (
            await tx.query(
              'WITH RECURSIVE parents AS (SELECT id,parent_id FROM pt_organizations WHERE id=$1 UNION SELECT p.id,p.parent_id FROM pt_organizations p JOIN parents c ON p.id=c.parent_id) SELECT id FROM parents',
              [fields.parent_id],
            )
          ).rows;
          if (ancestors.some((p) => p.id === id))
            throw new Error('Branch hierarchy cannot contain a cycle');
        }
        if (!id) fields.created_by = actor.id;
      }
      if (kind === 'contact_method') {
        if (fields.kind === 'email' && !z.email().safeParse(fields.value).success)
          throw new Error('Valid recipient email required');
        if (fields.kind === 'website' && !/^https?:\/\//i.test(fields.value))
          throw new Error('Website must use http(s)');
        if (fields.contact_id) {
          const c = await one(tx, 'SELECT organization_id FROM pt_contacts WHERE id=$1', [
            fields.contact_id,
          ]);
          if (c.organization_id !== fields.organization_id)
            throw new Error('Contact belongs to another organization');
        }
      }
      if (kind === 'contact' || kind === 'contact_method') {
        if (
          channel === 'ai' &&
          (fields.verification === 'verified' || fields.do_not_contact === false)
        ) {
          if (fields.verification === 'verified')
            throw new AccessError('AI cannot verify contacts or remove contact suppression');
          if (id) {
            const old = await one(tx, `SELECT * FROM ${table} WHERE id=$1`, [id]);
            if (old.do_not_contact) throw new AccessError('AI cannot remove contact suppression');
          }
        }
        fields.verified_at = fields.verification === 'verified' ? new Date().toISOString() : null;
      }
      if (kind === 'opportunity') {
        const owner = await one(
          tx,
          'SELECT id,role,permissions FROM staff WHERE id=$1 AND active=true',
          [fields.owner_id],
        );
        if (owner.role !== 'OWNER' && !owner.permissions.includes('manage_partnerships'))
          throw new Error('Owner must be active and allowed to manage partnerships');
        const campaign = await one(tx, 'SELECT historical FROM pt_campaigns WHERE id=$1', [
          fields.campaign_id,
        ]);
        const org = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [
          fields.organization_id,
        ]);
        if (org.do_not_contact && fields.stage !== 'do_not_contact')
          throw new Error('Do-not-contact organization cannot enter an outreach stage');
        if (fields.stage === 'active_partner') {
          if (channel === 'ai' || campaign.historical)
            throw new Error('Current active partnership requires staff confirmation');
          await activeAgreement(tx, fields.organization_id, today);
          if (org.relationship !== 'active')
            throw new Error(
              'Confirm the current relationship before marking the opportunity active',
            );
        }
      }
      if (id) {
        if (!version) throw new ConflictError('Expected version required');
        ({ before, after } = await update(tx, table, id, version, fields));
        if (before.organization_id && before.organization_id !== fields.organization_id)
          throw new Error('Records cannot be reassigned to another organization');
        if (kind === 'opportunity' && before.campaign_id !== fields.campaign_id)
          throw new Error('Campaign history cannot be reassigned');
      } else after = await insert(tx, table, fields);
      const orgId = kind === 'organization' ? after.id : after.organization_id;
      if (kind === 'opportunity' && after.stage === 'do_not_contact') {
        const org = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [orgId]);
        if (!org.do_not_contact) {
          const suppressed = await update(tx, 'pt_organizations', orgId, Number(org.version), {
            relationship: 'do_not_contact',
            do_not_contact: true,
            dnc_reason: command.reason,
          });
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_organizations',
            org,
            suppressed.after,
            command.reason,
          );
        }
        for (const sibling of (
          await tx.query(
            "SELECT o.* FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE organization_id=$1 AND NOT c.historical AND stage<>'do_not_contact'",
            [orgId],
          )
        ).rows) {
          const suppressed = await update(
            tx,
            'pt_opportunities',
            sibling.id,
            Number(sibling.version),
            { stage: 'do_not_contact' },
          );
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_opportunities',
            sibling,
            suppressed.after,
            command.reason,
          );
        }
      }
      await invalidateDrafts(
        tx,
        actor,
        command.id,
        channel,
        orgId,
        'Contact or opportunity context changed',
      );
    } else if (kind === 'campaign') {
      if (data.kind.startsWith('historical_') !== data.historical)
        throw new Error('Historical campaign classification must be explicit');
      table = 'pt_campaigns';
      after = await insert(tx, table, data);
    } else if (kind === 'relationship') {
      if (data.relationship === 'active') await activeAgreement(tx, data.id, today);
      if (data.relationship === 'do_not_contact' && !data.dnc_reason?.trim())
        throw new Error('Record the do-not-contact reason');
      table = 'pt_organizations';
      ({ before, after } = await update(tx, table, data.id, data.version, {
        relationship: data.relationship,
        do_not_contact: data.relationship === 'do_not_contact',
        dnc_reason: data.dnc_reason,
        updated_at: new Date().toISOString(),
      }));
      await invalidateDrafts(tx, actor, command.id, channel, data.id, 'Relationship changed');
      if (['do_not_contact', 'paused', 'declined', 'ended'].includes(data.relationship)) {
        for (const old of (
          await tx.query(
            'SELECT o.* FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE organization_id=$1 AND NOT c.historical',
            [data.id],
          )
        ).rows) {
          const changed = await update(tx, 'pt_opportunities', old.id, Number(old.version), {
            stage: data.relationship,
            next_action:
              data.relationship === 'do_not_contact'
                ? 'Do not contact'
                : `Relationship ${data.relationship}; review before reopening`,
            due_on: null,
            unscheduled_reason: data.dnc_reason || command.reason,
          });
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_opportunities',
            old,
            changed.after,
            command.reason,
          );
        }
      }
    } else if (kind === 'interaction') {
      table = 'pt_interactions';
      after = await recordInteraction(tx, actor, command.id, channel, data);
    } else if (kind === 'research') {
      table = 'pt_research';
      after = await insert(tx, table, { ...data, actor_id: actor.id });
      await invalidateDrafts(
        tx,
        actor,
        command.id,
        channel,
        data.organization_id,
        'New research requires fresh outreach review',
      );
    } else if (kind === 'agreement') {
      if (
        data.status === 'accepted' &&
        (!data.confirmed_on || !data.confirmation_method || !data.evidence_url || !data.starts_on)
      )
        throw new Error('Confirmation evidence, date, method and start date required');
      const previous = (
        await tx.query(
          'SELECT * FROM pt_agreements WHERE organization_id=$1 ORDER BY version DESC LIMIT 1',
          [data.organization_id],
        )
      ).rows[0];
      if (
        data.version !== Number(previous?.version ?? 0) + 1 ||
        data.supersedes_id !== (previous?.id ?? null)
      )
        throw new ConflictError(
          'Agreement version changed; preserve and supersede the latest agreement',
        );
      table = 'pt_agreements';
      after = await insert(tx, table, {
        ...data,
        terms: JSON.stringify(data.terms ?? {}),
        actor_id: actor.id,
      });
      // Ending/superseding an agreement must never leave a stale active relationship.
      if (
        data.status !== 'accepted' ||
        data.starts_on > today ||
        (data.ends_on && data.ends_on < today)
      ) {
        const org = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [
          data.organization_id,
        ]);
        if (org.relationship === 'active') {
          const changed = await update(tx, 'pt_organizations', org.id, Number(org.version), {
            relationship: data.status === 'ended' ? 'ended' : 'paused',
          });
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_organizations',
            org,
            changed.after,
            command.reason,
          );
          for (const opportunity of (
            await tx.query(
              "SELECT o.* FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE o.organization_id=$1 AND NOT c.historical AND o.stage='active_partner'",
              [org.id],
            )
          ).rows) {
            const revised = await update(
              tx,
              'pt_opportunities',
              opportunity.id,
              Number(opportunity.version),
              {
                stage: changed.after.relationship,
                next_action: 'Review the current agreement before reopening the relationship',
                due_on: null,
                unscheduled_reason: command.reason,
              },
            );
            await audit(
              tx,
              actor,
              command.id,
              channel,
              'pt_opportunities',
              opportunity,
              revised.after,
              command.reason,
            );
          }
        }
      }
      await invalidateDrafts(
        tx,
        actor,
        command.id,
        channel,
        data.organization_id,
        'Agreement version changed',
      );
    } else if (kind === 'referral') {
      if (data.agreement_id) {
        const a = await one(tx, 'SELECT * FROM pt_agreements WHERE id=$1', [data.agreement_id]);
        if (a.organization_id !== data.organization_id)
          throw new Error('Agreement belongs to another organization');
      }
      if (data.booking_id) {
        requirePermission(actor, 'operations');
        await one(tx, 'SELECT id FROM bookings WHERE id=$1', [data.booking_id]);
      }
      if (data.accounting_referral_id) {
        requirePermission(actor, 'manage_commissions');
        const r = await one(tx, 'SELECT booking_id,referrer_id FROM referrals WHERE id=$1', [
          data.accounting_referral_id,
        ]);
        const org = await one(tx, 'SELECT accounting_party_id FROM pt_organizations WHERE id=$1', [
          data.organization_id,
        ]);
        const a = await one(tx, 'SELECT * FROM pt_agreements WHERE id=$1', [data.agreement_id]);
        if (
          r.booking_id !== data.booking_id ||
          r.referrer_id !== org.accounting_party_id ||
          a.status !== 'accepted' ||
          !a.terms?.calculation
        )
          throw new Error(
            'Accounting referral must match the booking, canonical referrer and confirmed terms',
          );
        const revision = (
          await tx.query(
            'SELECT * FROM commission_payable_revisions WHERE referral_id=$1 ORDER BY revision DESC LIMIT 1',
            [data.accounting_referral_id],
          )
        ).rows[0];
        const terms = a.terms;
        if (
          !revision ||
          revision.calculation !== terms.calculation ||
          revision.payable_when !== terms.payable_when ||
          revision.cancellation_rule !== terms.cancellation_rule ||
          (terms.payable_when === 'On date' && revision.due_on !== terms.due_on) ||
          (terms.percentage_basis === 'agreed_amount' &&
            Number(revision.agreed_basis) !== terms.agreed_basis) ||
          (terms.calculation === 'fixed'
            ? Number(revision.fixed_amount) !== terms.fixed_amount
            : revision.percentage_basis !== terms.percentage_basis ||
              Number(revision.rate_bps) !== terms.rate_bps)
        )
          throw new Error(
            'The existing accounting term version does not match the confirmed partnership agreement',
          );
        data.accounting_terms_revision_id = revision.id;
      }
      table = 'pt_referrals';
      after = await insert(tx, table, { ...data, actor_id: actor.id });
    } else if (kind === 'review') {
      requirePermission(actor, 'import_partnerships');
      table = 'pt_reviews';
      ({ before, after } = await update(tx, table, data.id, data.version, {
        status: data.status,
        resolution: data.resolution,
        resolved_by: actor.id,
        resolved_at: new Date().toISOString(),
      }));
      if (data.status === 'resolved' && data.organization_id && before.source_item_id) {
        await one(tx, 'SELECT id FROM pt_organizations WHERE id=$1', [data.organization_id]);
        const latest = (
          await tx.query(
            'SELECT version,organization_id FROM pt_source_resolutions WHERE source_item_id=$1 ORDER BY version DESC LIMIT 1',
            [before.source_item_id],
          )
        ).rows[0];
        const resolution = await insert(tx, 'pt_source_resolutions', {
          source_item_id: before.source_item_id,
          organization_id: data.organization_id,
          review_id: data.id,
          actor_id: actor.id,
          reason: command.reason + ' — ' + data.resolution,
          version: Number(latest?.version ?? 0) + 1,
        });
        await audit(
          tx,
          actor,
          command.id,
          channel,
          'pt_source_resolutions',
          null,
          resolution,
          data.resolution,
        );
        const source = await one(tx, 'SELECT organization_id FROM pt_source_items WHERE id=$1', [
          before.source_item_id,
        ]);
        const affectedOrganizations = [
          ...new Set(
            [data.organization_id, latest?.organization_id ?? source.organization_id].filter(
              Boolean,
            ),
          ),
        ];
        for (const opportunity of (
          await tx.query('SELECT * FROM pt_opportunities WHERE organization_id=ANY($1::uuid[])', [
            affectedOrganizations,
          ])
        ).rows) {
          const changed = await update(
            tx,
            'pt_opportunities',
            opportunity.id,
            Number(opportunity.version),
            { history_version: Number(opportunity.history_version) + 1, reply_review: true },
          );
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_opportunities',
            opportunity,
            changed.after,
            'Resolved source identity adds history to review',
          );
        }
        for (const organizationId of affectedOrganizations)
          await invalidateDrafts(
            tx,
            actor,
            command.id,
            channel,
            organizationId,
            'Source identity resolution requires fresh outreach review',
          );
      }
    } else if (kind === 'review_reply') {
      table = 'pt_opportunities';
      ({ before, after } = await update(tx, table, data.id, data.version, {
        reply_review: false,
        next_action: data.next_action,
        due_on: data.due_on,
        unscheduled_reason: data.unscheduled_reason,
        updated_at: new Date().toISOString(),
      }));
    } else if (kind === 'draft') {
      const { opportunity, method } = await draftContext(tx, data.opportunity_id, data.method_id);
      table = 'pt_drafts';
      after = await insert(tx, table, {
        ...data,
        context_version: opportunity.history_version,
        opportunity_version: opportunity.version,
        method_version: method.version,
        created_by: actor.id,
      });
    } else {
      table = 'pt_drafts';
      before = await one(tx, 'SELECT * FROM pt_drafts WHERE id=$1 FOR UPDATE', [data.id]);
      if (before.version !== data.version)
        throw new ConflictError('Draft changed; review it again');
      if (kind === 'reject_draft')
        ({ after } = await update(tx, table, data.id, data.version, { state: 'rejected' }));
      else {
        const { opportunity, method, organization } = await draftContext(
          tx,
          before.opportunity_id,
          before.method_id,
        );
        if (
          before.context_version !== opportunity.history_version ||
          before.opportunity_version !== opportunity.version ||
          before.method_version !== method.version
        )
          throw new ConflictError('Draft context is outdated; prepare a fresh draft');
        const approval = draftApprovalHash(before, method);
        if (kind === 'approve_draft') {
          if (before.state !== 'draft' || data.approval_hash !== approval)
            throw new ConflictError('Approve the exact current recipient and message');
          ({ after } = await update(tx, table, data.id, data.version, {
            state: 'approved',
            approved_by: actor.id,
            approved_at: new Date().toISOString(),
            approval_hash: approval,
          }));
        } else {
          if (before.state !== 'approved' || before.approval_hash !== approval)
            throw new ConflictError('Current explicit approval required');
          ({ after } = await update(tx, table, data.id, data.version, { state: 'manually_sent' }));
          const logged = await recordInteraction(tx, actor, command.id, channel, {
            organization_id: organization.id,
            campaign_id: opportunity.campaign_id,
            kind:
              method.kind === 'email' ? 'email' : method.kind === 'whatsapp' ? 'whatsapp' : 'call',
            direction: 'outbound',
            occurred_at: data.occurred_at,
            body: before.body,
            subject: before.subject,
            source_url: data.source_url,
          });
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_interactions',
            null,
            logged,
            'Staff recorded external sending; CRM sent nothing',
          );
          const latest = await one(tx, 'SELECT * FROM pt_opportunities WHERE id=$1', [
            opportunity.id,
          ]);
          const changed = await update(tx, 'pt_opportunities', latest.id, Number(latest.version), {
            stage: 'awaiting_reply',
            next_action: data.next_action,
            due_on: data.due_on,
            unscheduled_reason: data.unscheduled_reason,
          });
          await audit(
            tx,
            actor,
            command.id,
            channel,
            'pt_opportunities',
            latest,
            changed.after,
            command.reason,
          );
        }
      }
    }
    await audit(tx, actor, command.id, channel, table, before, after, command.reason);
    const result = { id: after.id, version: after.version ?? null };
    await tx.query(
      'INSERT INTO pt_commands(id,actor_id,kind,payload_hash,result,channel) VALUES($1,$2,$3,$4,$5,$6)',
      [command.id, actor.id, kind, payloadHash, JSON.stringify(result), channel],
    );
    return result;
  });
}

export async function partnershipDetail(db: Database, actor: Actor, id: string, ai = false) {
  z.string().uuid().parse(id);
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    const organization = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [id]);
    const contacts = (
      await tx.query('SELECT * FROM pt_contacts WHERE organization_id=$1 ORDER BY name', [id])
    ).rows;
    const methods = (
      await tx.query(
        'SELECT * FROM pt_contact_methods WHERE organization_id=$1 ORDER BY kind,value',
        [id],
      )
    ).rows;
    const opportunities = (
      await tx.query(
        'SELECT o.*,c.name campaign,c.historical,c.kind campaign_kind,s.name owner FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id JOIN staff s ON s.id=o.owner_id WHERE organization_id=$1 ORDER BY c.historical,c.name',
        [id],
      )
    ).rows;
    const timeline = (
      await tx.query(
        'SELECT i.*,c.name campaign,c.kind campaign_kind FROM pt_interactions i LEFT JOIN pt_campaigns c ON c.id=i.campaign_id WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=i.source_item_id ORDER BY r.version DESC LIMIT 1),i.organization_id)=$1 ORDER BY occurred_at NULLS LAST,created_at,id',
        [id],
      )
    ).rows;
    const research = (
      await tx.query(
        'SELECT h.* FROM pt_research h WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=h.source_item_id ORDER BY r.version DESC LIMIT 1),h.organization_id)=$1 ORDER BY observed_on DESC NULLS LAST,created_at DESC',
        [id],
      )
    ).rows;
    const agreements = (
      await tx.query('SELECT * FROM pt_agreements WHERE organization_id=$1 ORDER BY version DESC', [
        id,
      ])
    ).rows;
    const latestAgreement = agreements[0],
      today = await businessDate(tx);
    organization.confirmation_current = Boolean(
      latestAgreement?.status === 'accepted' &&
      latestAgreement.starts_on <= today &&
      (!latestAgreement.ends_on || latestAgreement.ends_on >= today),
    );
    const referrals = (
      await tx.query(
        'SELECT r.*,b.code booking_code,b.product,b.reservation_status,b.travel_end FROM pt_referrals r LEFT JOIN bookings b ON b.id=r.booking_id WHERE organization_id=$1 ORDER BY r.created_at DESC',
        [id],
      )
    ).rows;
    for (const r of referrals) {
      if (!ai && hasPermission(actor, 'view_commissions') && r.accounting_referral_id) {
        const e = await economics(tx, r.booking_id);
        r.commission =
          e.commission_payables?.find((p: Row) => p.id === r.accounting_referral_id) ?? null;
        r.commission_history = (
          await tx.query(
            'SELECT revision,calculation,percentage_basis,rate_bps,fixed_amount,payable_when,due_on,active,cancellation_rule,reason,effective_on FROM commission_payable_revisions WHERE referral_id=$1 ORDER BY revision',
            [r.accounting_referral_id],
          )
        ).rows;
      }
      if (ai || !hasPermission(actor, 'operations')) delete r.booking_id;
    }
    const sources: Row[] = (
      await tx.query(
        "SELECT i.*,s.title source_title FROM pt_source_items i JOIN pt_sources s ON s.id=i.source_id WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=i.id ORDER BY r.version DESC LIMIT 1),i.organization_id)=$1 AND i.outcome<>'excluded' ORDER BY i.imported_at,i.source_key",
        [id],
      )
    ).rows;
    const documents = ai
      ? []
      : (
          await tx.query(
            'SELECT d.id,d.filename,d.mime_type,d.byte_length,d.sha256,d.created_at FROM pt_documents d LEFT JOIN pt_interactions i ON i.id=d.interaction_id WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=i.source_item_id ORDER BY r.version DESC LIMIT 1),d.organization_id)=$1 ORDER BY d.created_at DESC',
            [id],
          )
        ).rows;
    const drafts: Row[] = ai
      ? []
      : (
          await tx.query(
            'SELECT d.*,m.value recipient FROM pt_drafts d JOIN pt_opportunities o ON o.id=d.opportunity_id JOIN pt_contact_methods m ON m.id=d.method_id WHERE o.organization_id=$1 ORDER BY d.created_at DESC',
            [id],
          )
        ).rows.map((d) => ({ ...d, review_hash: draftApprovalHash(d, { value: d.recipient }) }));
    const reviews = (
      await tx.query('SELECT * FROM pt_reviews WHERE organization_id=$1 ORDER BY status,id', [id])
    ).rows;
    if (ai) {
      delete organization.accounting_party_id;
      for (const r of referrals) {
        delete r.accounting_referral_id;
        delete r.accounting_terms_revision_id;
      }
      for (const source of sources) {
        delete source.payload;
        delete source.original_text;
      }
    }
    return {
      organization,
      campaigns: ai
        ? []
        : (await tx.query('SELECT * FROM pt_campaigns ORDER BY historical,name')).rows,
      owners: ai
        ? []
        : (
            await tx.query(
              "SELECT id,name FROM staff WHERE active AND (role='OWNER' OR 'manage_partnerships'=ANY(permissions)) ORDER BY name",
            )
          ).rows,
      contacts,
      methods,
      opportunities,
      timeline,
      research,
      agreements,
      referrals,
      sources,
      documents,
      drafts,
      reviews,
    };
  });
}

export async function partnershipList(db: Database, actor: Actor, params: URLSearchParams) {
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    const today = await businessDate(tx);
    const values: unknown[] = [today],
      conditions: string[] = [];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      conditions.push(sql.replace('?', `$${values.length}`));
    };
    const q = params.get('q')?.trim().slice(0, 200);
    if (q)
      add(
        '(g.name ILIKE ? OR g.legacy_id ILIKE ? OR g.location ILIKE ? OR g.country ILIKE ? OR g.service_areas ILIKE ? OR EXISTS(SELECT 1 FROM pt_contacts c WHERE c.organization_id=g.id AND c.name ILIKE ?) OR EXISTS(SELECT 1 FROM pt_contact_methods m WHERE m.organization_id=g.id AND m.value ILIKE ?))'.replaceAll(
          '?',
          `$${values.length + 1}`,
        ),
        `%${q}%`,
      );
    for (const [key, column] of [
      ['location', 'g.location'],
      ['stage', 'o.stage'],
      ['owner', 'o.owner_id::text'],
      ['campaign', 'o.campaign_id::text'],
      ['relationship', 'g.relationship'],
      ['priority', 'o.priority::text'],
    ] as const) {
      const v = params.get(key);
      if (v)
        add(`${column} ${key === 'location' ? 'ILIKE' : '='} ?`, key === 'location' ? `%${v}%` : v);
    }
    if (params.get('due_before'))
      add('o.due_on<=?::date', z.iso.date().parse(params.get('due_before')));
    const view = params.get('view') ?? 'queue';
    // Organization views pick one current opportunity; explicit campaign views retain that campaign.
    if (!params.get('campaign'))
      conditions.push(
        '(o.id IS NULL OR o.id=(SELECT p.id FROM pt_opportunities p JOIN pt_campaigns pc ON pc.id=p.campaign_id WHERE p.organization_id=g.id ORDER BY pc.historical,p.priority,p.due_on NULLS LAST,p.id LIMIT 1))',
      );
    if (view === 'queue')
      conditions.push(
        "NOT COALESCE(c.historical,false) AND o.stage NOT IN ('paused','declined','do_not_contact','ended') AND g.relationship NOT IN ('paused','declined','ended') AND NOT g.do_not_contact",
      );
    if (view === 'due')
      conditions.push(
        "NOT c.historical AND o.due_on<=$1::date AND o.stage NOT IN ('paused','declined','do_not_contact','ended') AND g.relationship NOT IN ('paused','declined','ended') AND NOT g.do_not_contact",
      );
    if (view === 'awaiting') conditions.push("NOT c.historical AND o.stage='awaiting_reply'");
    if (view === 'active')
      conditions.push(
        "g.relationship='active' AND EXISTS(SELECT 1 FROM pt_agreements a WHERE a.organization_id=g.id AND a.version=(SELECT max(a2.version) FROM pt_agreements a2 WHERE a2.organization_id=g.id) AND a.status='accepted' AND a.starts_on<=$1::date AND (a.ends_on IS NULL OR a.ends_on>=$1::date))",
      );
    if (view === 'earlier_direct')
      conditions.push(
        "EXISTS(SELECT 1 FROM pt_interactions h JOIN pt_campaigns hc ON hc.id=h.campaign_id WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=h.source_item_id ORDER BY r.version DESC LIMIT 1),h.organization_id)=g.id AND hc.kind='historical_direct')",
      );
    if (view === 'verification')
      conditions.push(
        "NOT EXISTS(SELECT 1 FROM pt_contact_methods m WHERE m.organization_id=g.id AND m.verification='verified')",
      );
    if (view === 'best')
      conditions.push(
        "NOT g.do_not_contact AND g.relationship NOT IN ('paused','declined','ended') AND (o.priority<=2 OR EXISTS(SELECT 1 FROM pt_research h WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=h.source_item_id ORDER BY r.version DESC LIMIT 1),h.organization_id)=g.id AND h.rank IS NOT NULL))",
      );
    if (view === 'replies') conditions.push('o.reply_review=true');
    const offset = Math.max(0, Math.min(100000, Math.floor(Number(params.get('offset'))) || 0));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(params.get('limit')) || 12)));
    const query = `FROM pt_organizations g LEFT JOIN pt_opportunities o ON o.organization_id=g.id LEFT JOIN pt_campaigns c ON c.id=o.campaign_id LEFT JOIN staff s ON s.id=o.owner_id WHERE $1::date IS NOT NULL${conditions.length ? ' AND ' + conditions.join(' AND ') : ''}`;
    const rows = (
      await tx.query(
        `SELECT g.*,o.id opportunity_id,o.stage,o.owner_id,s.name owner,o.next_action,o.due_on,o.unscheduled_reason,o.priority,o.rationale,o.reply_review,o.version opportunity_version,c.name campaign,c.historical,c.id campaign_id,
      (o.due_on<$1::date AND o.stage NOT IN ('paused','declined','do_not_contact','ended')) overdue,
      (SELECT body FROM pt_interactions h WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=h.source_item_id ORDER BY r.version DESC LIMIT 1),h.organization_id)=g.id AND h.direction<>'automated' ORDER BY h.occurred_at DESC NULLS LAST,h.created_at DESC LIMIT 1) previous_discussion,
      (SELECT body FROM pt_interactions h WHERE COALESCE((SELECT r.organization_id FROM pt_source_resolutions r WHERE r.source_item_id=h.source_item_id ORDER BY r.version DESC LIMIT 1),h.organization_id)=g.id AND h.direction='inbound' ORDER BY h.occurred_at DESC NULLS LAST,h.created_at DESC LIMIT 1) last_reply,
      EXISTS(SELECT 1 FROM pt_agreements a WHERE a.organization_id=g.id AND a.version=(SELECT max(a2.version) FROM pt_agreements a2 WHERE a2.organization_id=g.id) AND a.status='accepted' AND a.starts_on<=$1::date AND (a.ends_on IS NULL OR a.ends_on>=$1::date)) confirmation_current,
      (SELECT count(*) FROM pt_referrals r WHERE r.organization_id=g.id AND r.kind IN ('reported_inquiry','verified_inquiry')) inquiries,
      (SELECT count(DISTINCT r.booking_id) FROM pt_referrals r JOIN bookings b ON b.id=r.booking_id WHERE r.organization_id=g.id AND b.reservation_status='Traveled') completed_bookings
      ${query} ORDER BY o.reply_review DESC NULLS LAST,o.due_on ASC NULLS LAST,o.priority,g.name,g.id LIMIT ${limit} OFFSET ${offset}`,
        values,
      )
    ).rows;
    for (const row of rows) {
      const excerpt = row.last_reply ? ownMessageText(row.last_reply).slice(0, 180) : '';
      row.suggested_message = `Hello, ${excerpt ? `I wanted to follow up on your earlier message: “${excerpt}”. ` : 'I’m reaching out from Padova Travels. '}Would you be open to discussing how we can help travelers visiting ${row.location || 'your community'}? We can confirm the referral arrangements together. What would be a convenient next step?`;
    }
    const total = Number((await one(tx, `SELECT count(*) total ${query}`, values)).total);
    const campaigns = (await tx.query('SELECT * FROM pt_campaigns ORDER BY historical,name')).rows;
    const owners = (
      await tx.query(
        "SELECT id,name FROM staff WHERE active=true AND (role='OWNER' OR 'manage_partnerships'=ANY(permissions)) ORDER BY name",
      )
    ).rows;
    const metrics = await one(
      tx,
      `SELECT
      (SELECT count(*) FROM pt_organizations) organizations,
      (SELECT count(*) FROM pt_organizations WHERE relationship='active' AND EXISTS(SELECT 1 FROM pt_agreements a WHERE a.organization_id=pt_organizations.id AND a.version=(SELECT max(x.version) FROM pt_agreements x WHERE x.organization_id=a.organization_id) AND a.status='accepted' AND a.starts_on<=$1::date AND (a.ends_on IS NULL OR a.ends_on>=$1::date))) active,
      (SELECT count(DISTINCT o.organization_id) FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE c.historical AND o.stage IN ('interested','discussing_terms')) historical_interest,
      (SELECT count(DISTINCT o.organization_id) FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE NOT c.historical AND o.stage IN ('interested','discussing_terms')) current_interest,
      (SELECT count(DISTINCT organization_id) FROM pt_research WHERE kind='published_contact') published_contacts,
      (SELECT count(*) FROM pt_referrals WHERE kind IN ('reported_inquiry','verified_inquiry')) inquiries,
      (SELECT count(DISTINCT r.booking_id) FROM pt_referrals r JOIN bookings b ON b.id=r.booking_id WHERE b.reservation_status='Traveled') completed_bookings,
      (SELECT count(*) FROM pt_reviews WHERE status='open') reviews`,
      [today],
    );
    let chatgptNotesLinked = false;
    try {
      chatgptNotesLinked =
        Number(
          (
            await one(
              tx,
              `SELECT count(*)::int n FROM pt_ai_grants
               WHERE staff_id=$1 AND revoked_at IS NULL AND expires_at > now()`,
              [actor.id],
            )
          ).n,
        ) > 0;
    } catch {
      chatgptNotesLinked = false;
    }
    return {
      rows,
      total,
      offset,
      limit,
      today,
      campaigns,
      owners,
      metrics,
      chatgpt_notes_linked: chatgptNotesLinked,
      actor: { id: actor.id, name: actor.name, role: actor.role, permissions: actor.permissions },
    };
  });
}
export async function outreachQueue(db: Database, actor: Actor, offset = 0, limit = 12) {
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    offset = Math.max(0, Math.min(100000, Math.floor(offset) || 0));
    limit = Math.min(50, Math.max(1, Math.floor(limit) || 12));
    const drafts = (
      await tx.query(
        `SELECT d.*,m.value recipient,g.id organization_id,g.name organization,o.reply_review,o.next_action FROM pt_drafts d JOIN pt_contact_methods m ON m.id=d.method_id JOIN pt_opportunities o ON o.id=d.opportunity_id JOIN pt_organizations g ON g.id=o.organization_id WHERE d.state IN ('draft','approved') ORDER BY d.created_at LIMIT ${limit} OFFSET ${offset}`,
      )
    ).rows.map((d) => ({ ...d, review_hash: draftApprovalHash(d, { value: d.recipient }) }));
    return {
      actor: { id: actor.id, name: actor.name, role: actor.role, permissions: actor.permissions },
      drafts,
      total: Number(
        (await one(tx, "SELECT count(*) n FROM pt_drafts WHERE state IN ('draft','approved')")).n,
      ),
      offset,
      limit,
    };
  });
}

export async function partnershipChoices(db: Database, actor: Actor, q: string) {
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    requirePermission(actor, 'manage_partnerships');
    const match = `%${q.slice(0, 100)}%`;
    const organizations = (
      await tx.query(
        'SELECT id,name,location FROM pt_organizations WHERE name ILIKE $1 OR legacy_id ILIKE $1 OR id::text ILIKE $1 ORDER BY name LIMIT 30',
        [match],
      )
    ).rows;
    const bookings = hasPermission(actor, 'operations')
      ? (
          await tx.query(
            'SELECT id,code,product,reservation_status,travel_start,travel_end FROM bookings WHERE code ILIKE $1 OR id::text ILIKE $1 ORDER BY created_at DESC LIMIT 30',
            [match],
          )
        ).rows
      : [];
    const parties = hasPermission(actor, 'manage_commissions')
      ? (
          await tx.query(
            'SELECT id,name FROM parties WHERE (name ILIKE $1 OR id::text ILIKE $1) ORDER BY name LIMIT 30',
            [match],
          )
        ).rows
      : [];
    const referrals = hasPermission(actor, 'manage_commissions')
      ? (
          await tx.query(
            'SELECT r.id,r.booking_id,b.code,p.name referrer FROM referrals r JOIN bookings b ON b.id=r.booking_id JOIN parties p ON p.id=r.referrer_id WHERE b.code ILIKE $1 OR p.name ILIKE $1 ORDER BY b.created_at DESC LIMIT 30',
            [match],
          )
        ).rows
      : [];
    return { organizations, bookings, parties, referrals };
  });
}
export async function sourceRegister(db: Database, actor: Actor, offset = 0, limit = 12) {
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    requirePermission(actor, 'import_partnerships');
    offset = Math.max(0, Math.min(100000, Math.floor(offset) || 0));
    limit = Math.min(50, Math.max(1, Math.floor(limit) || 12));
    return {
      actor: { id: actor.id, name: actor.name, role: actor.role, permissions: actor.permissions },
      offset,
      limit,
      total: Number(
        (await one(tx, "SELECT count(*) n FROM pt_reviews WHERE status IN ('open','deferred')")).n,
      ),
      sources: (
        await tx.query(
          `SELECT s.*,(SELECT count(*) FROM pt_source_items i WHERE i.source_id=s.id) preserved_items FROM pt_sources s ORDER BY title`,
        )
      ).rows,
      outcomes: (
        await tx.query(
          'SELECT source_id,outcome,count(*) count FROM pt_source_items GROUP BY source_id,outcome',
        )
      ).rows,
      batches: (await tx.query('SELECT * FROM pt_import_batches ORDER BY imported_at DESC')).rows,
      reviews: (
        await tx.query(
          `SELECT r.*,g.name organization,i.original_text,i.source_url,i.legacy_id FROM pt_reviews r LEFT JOIN pt_organizations g ON g.id=r.organization_id LEFT JOIN pt_source_items i ON i.id=r.source_item_id WHERE r.status IN ('open','deferred') ORDER BY (r.status='open') DESC,r.id LIMIT ${limit} OFFSET ${offset}`,
        )
      ).rows,
    };
  });
}

export function recommendedDraft(
  detail: Awaited<ReturnType<typeof partnershipDetail>>,
  opportunityId: string,
  methodId: string,
) {
  const opportunity = detail.opportunities.find((o) => o.id === opportunityId),
    method = detail.methods.find((m) => m.id === methodId);
  if (!opportunity || !method) throw new Error('Choose an opportunity and recipient');
  const contact = detail.contacts.find((c) => c.id === method.contact_id);
  const previous = [...detail.timeline]
    .filter((i) => i.direction === 'inbound')
    .sort(
      (a, b) =>
        String(b.occurred_at ?? '').localeCompare(String(a.occurred_at ?? '')) ||
        String(b.created_at).localeCompare(String(a.created_at)),
    )[0];
  const restriction = detail.research.find((r) => r.kind === 'restriction');
  const ownText = previous ? ownMessageText(previous.body) : '';
  const excerpt = ownText ? safeText(ownText).slice(0, 350) : '';
  const context = excerpt
    ? `In our earlier exchange${previous.occurred_at ? ` on ${String(previous.occurred_at).slice(0, 10)}` : ''}, you wrote:\n“${excerpt}${ownText!.length > 350 ? '…' : ''}”\n\nI wanted to check whether this is still relevant and how we can help now.`
    : 'I’m reaching out from Padova Travels about helping travelers visiting your community.';
  return {
    subject: `Travel referrals for ${detail.organization.name}`,
    body: `Hello ${contact?.name || 'there'},\n\n${context}\n\nWould you be open to discussing direct travel referrals for ${detail.organization.location || 'your community'}? ${restriction ? 'We would like to understand and respect your existing hotel arrangements. ' : ''}We can confirm the scope and any referral terms together before proceeding.\n\nWhat would be a convenient next step?\n\nPadova Travels`,
    context: previous?.body ?? 'No previous discussion recorded',
    rationale: opportunity.rationale || opportunity.next_action,
    source_ids: previous ? [previous.id] : [],
    restriction: restriction?.body ?? null,
  };
}
