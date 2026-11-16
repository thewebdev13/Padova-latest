import { createHash } from 'node:crypto';
import type { Database, Row } from './db';
import { execute, type CommandKind } from './finance';
import { requirePermission, type Actor } from './permissions';
import { freshActor } from './users';

export type ImportEvent = {
  source_system: string;
  source_key: string;
  event_role: string;
  evidence_id: string;
  capture_batch_id?: string;
  source_locator: Record<string, unknown>;
  reviewer_decision: string;
  kind: CommandKind;
  data: Row;
};
/** Keys identify approved source events, never source snapshot dates or amounts. */
export function importCommandId(
  e: Pick<ImportEvent, 'source_system' | 'source_key' | 'event_role'>,
) {
  const h = createHash('sha256')
    .update(JSON.stringify([e.source_system, e.source_key, e.event_role]))
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Exact result references allow a reviewed plan to link creations without name matching. */
function resolve(value: any, results: Map<string, Row>): any {
  if (value && typeof value === 'object' && !Array.isArray(value) && '$event' in value) {
    const result = results.get(value.$event);
    if (!result) throw new Error('Import reference must identify an earlier approved event');
    return result[value.field ?? 'id'];
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, results));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, results)]));
  return value;
}
export async function importPracticeFinancialPlan(
  db: Database,
  actor: Actor,
  events: ImportEvent[],
) {
  if (db.storage === 'padova')
    throw new Error('Historical production financial cutover is not authorized');
  return importReviewedFinancialPlan(db, actor, events);
}
/** Prepared production path is guarded by a separate, default-disabled database authorization. */
export async function importReviewedFinancialPlan(
  db: Database,
  actor: Actor,
  events: ImportEvent[],
) {
  requirePermission(actor, 'manage_settings');
  if (
    !events.length ||
    events.some(
      (e) =>
        !e.source_key ||
        !e.evidence_id ||
        !e.reviewer_decision ||
        !Object.keys(e.source_locator).length,
    )
  )
    throw new Error('Reviewed stable source identity and evidence are required');
  if (new Set(events.map(importCommandId)).size !== events.length)
    throw new Error('Duplicate source event in import plan');
  if (events.some((e) => e.event_role.endsWith(':provenance')))
    throw new Error('Reserved provenance event role');
  for (const e of events) {
    if (
      (e.event_role === 'historical_supplier_return_link') !==
      (e.kind === 'reconcile_supplier_return')
    )
      throw new Error('Historical supplier return link requires its explicit reviewed source role');
    if (
      (e.event_role === 'historical_undated_booking') !==
        (e.data.historical_undated_booking === true) ||
      (e.event_role === 'historical_undated_booking' && e.kind !== 'booking')
    )
      throw new Error('Undated hotel requires its explicit reviewed source role');
    if (
      (e.event_role === 'historical_owned_opening') !== (e.data.historical_opening === true) ||
      (e.event_role === 'historical_owned_opening' && e.kind !== 'acquire_asset')
    )
      throw new Error('Historical owned opening requires its explicit reviewed source role');
    if (
      (e.event_role === 'historical_refund_settlement') !==
        (e.data.historical_refund_settlement === true) ||
      (e.event_role === 'historical_refund_settlement' && e.kind !== 'payment')
    )
      throw new Error('Historical refund settlement requires its explicit reviewed source role');
  }
  const roleCounts = new Map<string, number>();
  for (const e of events) roleCounts.set(e.event_role, (roleCounts.get(e.event_role) ?? 0) + 1);
  return db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    requirePermission(actor, 'manage_settings');
    if (db.storage === 'padova') {
      if (actor.role !== 'OWNER')
        throw new Error('Individual active Owner required for financial import');
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor.id]);
    }
    const results = new Map<string, Row>();
    let created = 0,
      replayed = 0;
    for (const e of events) {
      const commandId = importCommandId(e);
      const sourceEventKey = JSON.stringify([e.source_system, e.source_key, e.event_role]);
      if (db.storage === 'padova') {
        if (!e.capture_batch_id) throw new Error('Approved current source capture batch required');
        await tx.query('SELECT padova.check_financial_import_source($1,$2,$3,$4)', [
          sourceEventKey,
          e.evidence_id,
          e.capture_batch_id,
          commandId,
        ]);
      }
      const previous = (await tx.query('SELECT id FROM commands WHERE id=$1', [commandId])).rows
        .length;
      const result = await execute(
        { ...db, transaction: async (fn) => fn(tx) },
        actor,
        { id: commandId, kind: e.kind, data: resolve(e.data, results) },
        [
          'historical_owned_opening',
          'historical_refund_settlement',
          'historical_undated_booking',
          'historical_supplier_return_link',
        ].includes(e.event_role)
          ? {
              event_key: sourceEventKey,
              evidence_id: e.evidence_id,
              capture_batch_id: e.capture_batch_id!,
            }
          : undefined,
      );
      // Preserve evidence and actual reviewer alongside the resulting immutable command.
      await execute({ ...db, transaction: async (fn) => fn(tx) }, actor, {
        id: importCommandId({ ...e, event_role: `${e.event_role}:provenance` }),
        kind: 'review_resolution',
        data: {
          source_key: `${e.source_system}:${e.source_key}:${e.event_role}`,
          evidence_id: e.evidence_id,
          source_locator: e.source_locator,
          issue_type: 'Reviewed financial import',
          status: 'Resolved',
          decision: e.reviewer_decision,
          destination_ids: { command_id: commandId, result_id: result.id },
          proposed_mapping: { kind: e.kind },
        },
      });
      if (db.storage === 'padova')
        await tx.query('SELECT padova.bind_financial_import_event($1,$2,$3,$4,$5)', [
          sourceEventKey,
          e.evidence_id,
          e.capture_batch_id,
          commandId,
          e.reviewer_decision,
        ]);
      results.set(commandId, result);
      results.set(`${e.source_system}:${e.source_key}:${e.event_role}`, result);
      if (roleCounts.get(e.event_role) === 1) results.set(e.event_role, result);
      if (previous) replayed++;
      else created++;
    }
    return { created, replayed, results: Object.fromEntries(results) };
  });
}
