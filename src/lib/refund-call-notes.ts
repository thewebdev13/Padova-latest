/**
 * Plan v1 — Refund follow-up call notes.
 * A refund due stays a task until money arrives, with room for call notes.
 * Stored as append-only notes on the refund (never UPDATE/DELETE notes rows).
 */

export const REFUND_CALL_NOTE_PREFIX = 'Call note:';

export function formatRefundCallNoteBody(text: string): string {
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) return '';
  if (body.toLowerCase().startsWith('call note:')) return body;
  return `${REFUND_CALL_NOTE_PREFIX} ${body}`;
}

export function isRefundCallNoteBody(body: string | null | undefined): boolean {
  return /^call note\s*:/i.test(String(body || '').trim());
}

export function stripRefundCallNotePrefix(body: string | null | undefined): string {
  return String(body || '')
    .trim()
    .replace(/^call note\s*:\s*/i, '')
    .trim();
}

export type RefundCallNote = {
  id?: string;
  body: string;
  text: string;
  created_at?: string | null;
  actor_name?: string | null;
};

export function parseRefundCallNotes(
  notes: Array<{
    id?: string;
    body?: string | null;
    created_at?: string | null;
    actor_name?: string | null;
    record_type?: string | null;
  }>,
): RefundCallNote[] {
  return notes
    .filter((n) => (!n.record_type || n.record_type === 'refund') && isRefundCallNoteBody(n.body))
    .map((n) => ({
      id: n.id,
      body: String(n.body || ''),
      text: stripRefundCallNotePrefix(n.body),
      created_at: n.created_at ?? null,
      actor_name: n.actor_name ?? null,
    }));
}

export function latestRefundCallNoteText(
  notes: Array<{ body?: string | null; record_type?: string | null }>,
): string | null {
  const list = parseRefundCallNotes(notes);
  if (!list.length) return null;
  return list[list.length - 1]?.text || null;
}

export function refundCallNoteAttentionDetail(
  reason: string | null | undefined,
  latestCallNote: string | null | undefined,
): string {
  const base = String(reason || '').trim();
  const note = String(latestCallNote || '').trim();
  if (note) return [base, `Latest call: ${note}`].filter(Boolean).join(' · ');
  return base || 'Chase refund until settled';
}
