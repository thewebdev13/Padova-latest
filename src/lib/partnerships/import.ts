import { randomUUID } from 'node:crypto';
import { type Database, type Row, one } from '../db';
import { type Actor, requirePermission } from '../permissions';
import {
  hash,
  safeText,
  safeValue,
  insert,
  partnershipActor,
  update,
  audit,
  invalidateDrafts,
} from './service';

export type SourceItem = {
  key: string;
  locator: string;
  legacyId?: string;
  sourceUrl?: string;
  originalDate?: string;
  originalTimezone?: string;
  originalStatus?: string;
  originalText: string;
  payload: Row;
  kind: 'organization' | 'interaction' | 'research' | 'evidence' | 'review' | 'excluded';
  organizationLegacyId?: string;
  matchingMethod: string;
  reason: string;
  organization?: {
    name: string;
    location: string;
    country: string;
    region: string;
    summary: string;
    contacts: { name: string; kind: string; value: string }[];
    nextAction: string;
    historicalStatus: string;
    review: string;
    doNotContactReason?: string;
  };
  interaction?: {
    kind: string;
    direction: string;
    body: string;
    subject: string;
    occurredAt: string | null;
    campaign: string;
    accountKey?: string;
    messageId?: string;
    rfcMessageId?: string;
  };
  research?: {
    title: string;
    body: string;
    kind: string;
    observedOn: string | null;
    rank: number | null;
    nextAction?: string;
  };
};
export type ImportBundle = {
  key: string;
  source: {
    key: string;
    title: string;
    kind: string;
    location: string;
    coverage: string;
    complete: boolean;
    unavailableReason?: string;
  };
  captureHash: string;
  items: SourceItem[];
  exceptions: string[];
};
export { classifyCampaign, ownMessageText } from './source-text';
export function parseSourceDate(value: unknown): { date: string | null; original: string | null } {
  if (value === null || value === undefined || value === '') return { date: null, original: null };
  const original = String(value);
  if (
    /^\d{4}-\d{2}-\d{2}T\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(original) &&
    !Number.isNaN(Date.parse(original))
  )
    return { date: new Date(original).toISOString(), original };
  // Date-only source values stay date-only; midnight/timezone is not invented.
  return { date: null, original };
}
export async function importPartnershipBundle(db: Database, actor: Actor, bundle: ImportBundle) {
  if (!/^[a-f0-9]{64}$/.test(bundle.captureHash)) throw new Error('Verified capture hash required');
  if (new Set(bundle.items.map((i) => i.key)).size !== bundle.items.length)
    throw new Error('Duplicate source keys in batch');
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor, true);
    requirePermission(actor, 'import_partnerships');
    await tx.query('SELECT pg_advisory_xact_lock(71281103)');
    let source = (await tx.query('SELECT * FROM pt_sources WHERE key=$1', [bundle.source.key]))
      .rows[0];
    if (!source)
      source = await insert(tx, 'pt_sources', {
        key: bundle.source.key,
        title: bundle.source.title,
        kind: bundle.source.kind,
        location: bundle.source.location,
        coverage: bundle.source.coverage,
        status: 'discovered',
      });
    const previous = (await tx.query('SELECT * FROM pt_import_batches WHERE key=$1', [bundle.key]))
      .rows[0];
    if (previous) {
      if (
        previous.capture_hash !== bundle.captureHash ||
        previous.manifest.input_hash !== hash(bundle)
      )
        throw new Error('Import batch identity already has different content');
      const result = previous.manifest.command_id
        ? (
            await one(tx, 'SELECT result FROM pt_commands WHERE id=$1', [
              previous.manifest.command_id,
            ])
          ).result
        : previous.manifest;
      return { ...result, replayed: true, created: 0 };
    }
    const commandId = randomUUID();
    const batch = await insert(tx, 'pt_import_batches', {
      key: bundle.key,
      source_id: source.id,
      capture_hash: bundle.captureHash,
      actor_id: actor.id,
      manifest: JSON.stringify({
        command_id: commandId,
        input_hash: hash(bundle),
        source_items: bundle.items.length,
        exceptions: bundle.exceptions,
      }),
    });
    const campaigns: Record<string, string> = {};
    for (const [key, name, historical] of [
      ['historical_affiliate', 'Historical affiliate-link outreach', true],
      ['historical_direct', 'Earlier direct-referral discussions', true],
      ['historical_unclear', 'Historical campaign needs review', true],
      ['current_direct', 'Current direct-referral campaign', false],
    ] as const) {
      let c = (await tx.query('SELECT id FROM pt_campaigns WHERE key=$1', [key])).rows[0];
      if (!c) c = await insert(tx, 'pt_campaigns', { key, name, kind: key, historical });
      campaigns[key] = c.id;
    }
    const organizationMap = new Map<string, string>(
      (
        await tx.query('SELECT id,legacy_id FROM pt_organizations WHERE legacy_id IS NOT NULL')
      ).rows.map((r) => [r.legacy_id, r.id]),
    );
    let imported = 0,
      duplicates = 0,
      unresolved = 0,
      excluded = 0,
      errors = 0,
      created = 0;
    const historyChanges = new Map<string, { count: number; inbound: boolean }>();
    for (const item of bundle.items) {
      const fingerprint = hash(item),
        safe = safeValue(item) as SourceItem;
      const existing = (
        await tx.query(
          'SELECT id,fingerprint FROM pt_source_items WHERE source_id=$1 AND source_key=$2 ORDER BY imported_at DESC',
          [source.id, item.key],
        )
      ).rows;
      if (existing.some((r) => r.fingerprint === fingerprint)) {
        duplicates++;
        continue;
      }
      const changed = existing.length > 0;
      let organizationId = organizationMap.get(item.organizationLegacyId ?? '') ?? null,
        targetId: string | null = null;
      let outcome = 'imported',
        reason = item.reason;
      if (changed) {
        outcome = 'unresolved';
        reason =
          'Source identity changed since prior capture. Original mapping preserved; review correction before operational updates.';
      } else if (item.kind === 'organization' && item.organization && item.legacyId) {
        if (!/^CH-\d+$/.test(item.legacyId))
          throw new Error('Only verified CRM legacy identities may create organizations');
        organizationId = organizationMap.get(item.legacyId) ?? null;
        if (organizationId) {
          outcome = 'duplicate_linked';
          targetId = organizationId;
        } else {
          const o = safe.organization!;
          const org = await insert(tx, 'pt_organizations', {
            legacy_id: item.legacyId,
            name: o.name || `Unnamed organization ${item.legacyId}`,
            location: o.location,
            country: o.country,
            region: o.region,
            summary: o.summary,
            do_not_contact: !!o.doNotContactReason,
            dnc_reason: o.doNotContactReason || null,
            relationship: o.doNotContactReason ? 'do_not_contact' : 'prospect',
            created_by: actor.id,
          });
          organizationId = org.id;
          targetId = org.id;
          organizationMap.set(item.legacyId, org.id);
          for (const c of o.contacts) {
            if (!c.value.trim()) continue;
            await tx.query(
              'INSERT INTO pt_contact_methods(organization_id,kind,value,source_url) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,kind,value) DO NOTHING',
              [org.id, c.kind, c.value, item.sourceUrl ?? null],
            );
          }
          const names = [
            ...new Set(
              o.contacts
                .map((c) => c.name)
                .filter((n) => n && !/not recorded|not confirmed/i.test(n)),
            ),
          ];
          for (const name of names)
            await insert(tx, 'pt_contacts', { organization_id: org.id, name });
          await insert(tx, 'pt_opportunities', {
            organization_id: org.id,
            campaign_id: campaigns.current_direct,
            stage: o.doNotContactReason ? 'do_not_contact' : 'needs_research',
            owner_id: actor.id,
            next_action:
              o.nextAction || 'Review preserved history and verify contact before outreach',
            due_on: null,
            unscheduled_reason: 'Imported for review; no current follow-up date has been confirmed',
            priority: 3,
            rationale: 'Preserved source history requires current relationship verification',
          });
          if (o.historicalStatus) {
            await insert(tx, 'pt_opportunities', {
              organization_id: org.id,
              campaign_id: campaigns.historical_unclear,
              stage: /positive|warm|interested/i.test(o.historicalStatus)
                ? 'interested'
                : 'needs_research',
              owner_id: actor.id,
              next_action: 'Preserve and verify historical campaign classification',
              due_on: null,
              unscheduled_reason: 'Historical campaign archive',
              priority: 3,
              rationale: o.historicalStatus,
            });
          }
        }
      } else if (item.kind === 'excluded') {
        outcome = 'excluded';
      } else if (item.kind === 'evidence') {
        outcome = organizationId ? 'duplicate_linked' : 'unresolved';
        reason = organizationId
          ? 'Preserved supporting source row linked by stable legacy mapping'
          : item.reason;
      } else if (item.kind === 'review' || !organizationId) {
        outcome = 'unresolved';
      }
      if (safe.originalText !== item.originalText && outcome !== 'excluded') {
        outcome = 'unresolved';
        reason +=
          ' Sensitive text quarantined in the private original snapshot; operational copy is redacted.';
      }
      let duplicate: Row | undefined;
      if (!changed && item.kind === 'interaction' && safe.interaction) {
        const i = safe.interaction;
        if (i.messageId && i.accountKey)
          duplicate = (
            await tx.query('SELECT * FROM pt_interactions WHERE account_key=$1 AND message_id=$2', [
              i.accountKey,
              i.messageId,
            ])
          ).rows[0];
        if (!duplicate && item.legacyId)
          duplicate = (
            await tx.query('SELECT * FROM pt_interactions WHERE legacy_id=$1', [item.legacyId])
          ).rows[0];
        if (duplicate) {
          targetId = duplicate.id;
          // MIME/plain-text copies can differ in CRLF transport only. Both exact copies remain preserved.
          const same =
            duplicate.body.replaceAll('\r\n', '\n') === i.body.replaceAll('\r\n', '\n') &&
            duplicate.organization_id === organizationId;
          outcome = same ? 'duplicate_linked' : 'unresolved';
          reason = same
            ? 'Same immutable message identity and text; original source copy preserved'
            : 'Duplicate message identity has different content or organization. Both copies preserved; correction requires review.';
        } else targetId = randomUUID();
      }
      if (!changed && item.kind === 'research' && safe.research && organizationId)
        targetId = randomUUID();
      const sourceItem = await insert(tx, 'pt_source_items', {
        source_id: source.id,
        batch_id: batch.id,
        source_key: item.key,
        locator: item.locator,
        source_url: item.sourceUrl ?? null,
        legacy_id: item.legacyId ?? null,
        original_date: item.originalDate ?? null,
        original_timezone: item.originalTimezone ?? null,
        original_status: item.originalStatus ?? null,
        fingerprint,
        original_text: safe.originalText,
        payload: JSON.stringify(safe.payload),
        outcome,
        reason,
        matching_method: item.matchingMethod,
        organization_id: organizationId,
        target_id: targetId,
      });
      created++;
      if (!changed && item.kind === 'interaction' && safe.interaction) {
        const i = safe.interaction;
        // Never merge branches just because an email matches; source organization identity is required.
        if (!duplicate) {
          await insert(tx, 'pt_interactions', {
            actor_id: actor.id,
            id: targetId,
            organization_id: organizationId,
            campaign_id: campaigns[i.campaign] ?? campaigns.historical_unclear,
            source_item_id: sourceItem.id,
            legacy_id: item.legacyId ?? null,
            kind: i.kind,
            direction: i.direction,
            occurred_at: i.occurredAt,
            original_date: item.originalDate ?? null,
            original_timezone: item.originalTimezone ?? null,
            body: i.body,
            subject: i.subject,
            source_url: item.sourceUrl ?? null,
            account_key: i.accountKey ?? null,
            message_id: i.messageId ?? null,
            rfc_message_id: i.rfcMessageId ?? null,
          });
          if (organizationId) {
            const change = historyChanges.get(organizationId) ?? { count: 0, inbound: false };
            change.count++;
            change.inbound ||= i.direction === 'inbound';
            historyChanges.set(organizationId, change);
          }
        }
      }
      if (!changed && item.kind === 'research' && safe.research && organizationId) {
        const r = safe.research;
        const change = historyChanges.get(organizationId) ?? { count: 0, inbound: false };
        change.count++;
        historyChanges.set(organizationId, change);
        await insert(tx, 'pt_research', {
          id: targetId,
          organization_id: organizationId,
          source_item_id: sourceItem.id,
          kind: r.kind,
          title: r.title,
          body: r.body,
          source_url: item.sourceUrl ?? bundle.source.location,
          observed_on: r.observedOn,
          rank: r.rank,
          actor_id: actor.id,
        });
        if (r.nextAction) {
          const current = (
            await tx.query(
              "SELECT o.* FROM pt_opportunities o JOIN pt_campaigns c ON c.id=o.campaign_id WHERE o.organization_id=$1 AND NOT c.historical AND o.stage='needs_research' AND o.unscheduled_reason LIKE 'Imported for review%'",
              [organizationId],
            )
          ).rows;
          for (const before of current) {
            const { after } = await update(
              tx,
              'pt_opportunities',
              before.id,
              Number(before.version),
              {
                next_action: r.nextAction,
                rationale: r.title,
                priority: r.rank && r.rank <= 3 ? 1 : 2,
              },
            );
            await audit(
              tx,
              actor,
              commandId,
              'import',
              'pt_opportunities',
              before,
              after,
              'Recovered research supplies a specific next action; no outreach authorized',
            );
          }
        }
        if (r.kind === 'reported_inquiry')
          await insert(tx, 'pt_referrals', {
            organization_id: organizationId,
            kind: 'reported_inquiry',
            occurred_on: r.observedOn,
            reference: r.title + ' — ' + r.body,
            source_url: item.sourceUrl ?? bundle.source.location,
            actor_id: actor.id,
          });
      }
      if (outcome === 'unresolved') {
        unresolved++;
        await insert(tx, 'pt_reviews', {
          organization_id: organizationId,
          source_item_id: sourceItem.id,
          kind: changed ? 'changed_source' : 'import_match',
          details: safeText(reason),
        });
      } else if (outcome === 'duplicate_linked') duplicates++;
      else if (outcome === 'excluded') excluded++;
      else if (outcome === 'error') errors++;
      else imported++;
      if (item.organization?.review && organizationId)
        await insert(tx, 'pt_reviews', {
          organization_id: organizationId,
          source_item_id: sourceItem.id,
          kind: 'source_conflict',
          details: safeText(item.organization.review),
        });
    }
    // One context change per affected opportunity in this atomic batch. Every original interaction stays separate.
    for (const [organizationId, change] of historyChanges) {
      for (const before of (
        await tx.query('SELECT * FROM pt_opportunities WHERE organization_id=$1', [organizationId])
      ).rows) {
        const { after } = await update(tx, 'pt_opportunities', before.id, Number(before.version), {
          history_version: Number(before.history_version) + change.count,
          reply_review: before.reply_review || change.inbound,
          updated_at: new Date().toISOString(),
        });
        await audit(
          tx,
          actor,
          commandId,
          'import',
          'pt_opportunities',
          before,
          after,
          'New imported history requires fresh outreach review',
        );
      }
      await invalidateDrafts(
        tx,
        actor,
        commandId,
        'import',
        organizationId,
        'Imported interaction invalidated previous outreach context',
      );
    }
    const result = {
      source_items: bundle.items.length,
      imported,
      duplicate_copies: duplicates,
      unresolved,
      excluded,
      errors,
      created,
      exceptions: bundle.exceptions,
      replayed: false,
    };
    if (imported + duplicates + unresolved + excluded + errors !== bundle.items.length)
      throw new Error('Reconciliation invariant failed');
    await tx.query(
      'INSERT INTO pt_commands(id,actor_id,kind,payload_hash,result,channel) VALUES($1,$2,$3,$4,$5,$6)',
      [commandId, actor.id, 'import', hash(bundle), JSON.stringify(result), 'import'],
    );
    const updatedSource = await one(
      tx,
      'UPDATE pt_sources SET status=$2,last_success_at=now(),last_error=$3,title=$4,location=$5,coverage=$6,version=version+1 WHERE id=$1 RETURNING *',
      [
        source.id,
        bundle.source.unavailableReason
          ? 'inaccessible'
          : bundle.source.complete && !errors && !bundle.exceptions.length
            ? unresolved
              ? 'awaiting_review'
              : 'fully_imported'
            : 'partially_imported',
        bundle.exceptions.join('\n') || null,
        bundle.source.title,
        bundle.source.location,
        bundle.source.coverage,
      ],
    );
    await audit(
      tx,
      actor,
      commandId,
      'import',
      'pt_sources',
      source,
      updatedSource,
      'Source capture coverage and reconciliation updated; previous batches preserved',
    );
    return result;
  });
}
