import type { Database } from './db';
import type { Actor } from './permissions';
import { maybePromoteIntakeToLiveBooking, type PromoteResult } from './ai-intake-promote';
import type { BuiltIntakeDraft } from './booking-intake';
import {
  assessIntakeCapture,
  applyIntakeCaptureToEntry,
  formatIntakeOwnerAlert,
  type IntakeCaptureMeta,
} from './intake-confidence';

export type AfterIntakeResult = {
  promote: PromoteResult;
  capture: IntakeCaptureMeta;
  owner_alert_text: string | null;
};

/** After booking_draft insert: confidence tags + optional auto-live (Owner 1B). */
export async function afterIntakeDraftSaved(
  db: Database,
  actor: Actor,
  draftId: string,
  built: BuiltIntakeDraft,
  opts?: { channel?: string; chat_or_mailbox?: string },
): Promise<AfterIntakeResult> {
  const entry = { ...(built.entry || {}) };
  const capture = assessIntakeCapture({
    entry,
    issues: built.issues,
    recognized_fields: built.recognized_fields,
  });
  applyIntakeCaptureToEntry(entry, capture);

  const promote = await maybePromoteIntakeToLiveBooking(db, actor, {
    draft_id: draftId,
    title: built.title,
    entry,
    issues: built.issues,
  });

  const channel =
    opts?.channel ||
    String((entry.intake_provenance as { source?: string } | undefined)?.source || 'intake');

  const shouldAlert =
    capture.needs_owner_alert ||
    !promote.live ||
    (promote.live && !promote.sale_known);

  const owner_alert_text = shouldAlert
    ? formatIntakeOwnerAlert({
        channel,
        title: built.title,
        draft_id: draftId,
        booking_id: promote.live ? promote.booking_id : undefined,
        booking_code: promote.live ? promote.booking_code : undefined,
        live: promote.live,
        capture,
        chat_or_mailbox: opts?.chat_or_mailbox,
        reason: promote.live ? undefined : promote.reason,
      })
    : null;

  return { promote, capture, owner_alert_text };
}
