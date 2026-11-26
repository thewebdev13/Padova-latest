/**
 * Plan v1 — Refund follow-up due date visibility.
 * Cancel captures due_on; staff chase until settled. Bands match Held PNR:
 * overdue / due today / due within 3 days. Never invent money or dates.
 */

import { heldDeadlineUrgency } from './held-pnr';

export type RefundFollowUpUrgency = 'ok' | 'due_soon' | 'due_today' | 'overdue' | 'none';

export function refundFollowUpDueOn(raw: unknown): string | null {
  const d = String(raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

export function refundFollowUpUrgency(
  dueOn: string | null | undefined,
  today: string,
): RefundFollowUpUrgency {
  return heldDeadlineUrgency(dueOn, today);
}

export function refundFollowUpUrgencyLabel(urgency: RefundFollowUpUrgency): string | null {
  if (urgency === 'overdue') return 'Overdue';
  if (urgency === 'due_today') return 'Due today';
  if (urgency === 'due_soon') return 'Due ≤3 days';
  return null;
}

export function refundFollowUpSortRank(urgency: RefundFollowUpUrgency): number {
  if (urgency === 'overdue') return 0;
  if (urgency === 'due_today') return 1;
  if (urgency === 'due_soon') return 2;
  if (urgency === 'ok') return 3;
  return 4;
}

/** Title suffix for unresolved refund attention (blank due → no urgency wording). */
export function refundFollowUpAttentionTitle(
  code: string | null | undefined,
  dueOn: string | null | undefined,
  today: string,
): string {
  const base = `${String(code || 'Booking').trim() || 'Booking'} · Unresolved refund`;
  const urgency = refundFollowUpUrgency(dueOn, today);
  if (urgency === 'overdue') return `${base} · overdue`;
  if (urgency === 'due_today') return `${base} · due today`;
  if (urgency === 'due_soon') return `${base} · due soon`;
  return base;
}

export function isRefundFollowUpHot(urgency: RefundFollowUpUrgency): boolean {
  return urgency === 'overdue' || urgency === 'due_today' || urgency === 'due_soon';
}

export function compareRefundFollowUpDue(
  a: { due_on?: string | null; urgency?: RefundFollowUpUrgency },
  b: { due_on?: string | null; urgency?: RefundFollowUpUrgency },
  today: string,
): number {
  const ua = a.urgency ?? refundFollowUpUrgency(refundFollowUpDueOn(a.due_on), today);
  const ub = b.urgency ?? refundFollowUpUrgency(refundFollowUpDueOn(b.due_on), today);
  const rank = refundFollowUpSortRank(ua) - refundFollowUpSortRank(ub);
  if (rank !== 0) return rank;
  const da = refundFollowUpDueOn(a.due_on) || '9999-12-31';
  const db = refundFollowUpDueOn(b.due_on) || '9999-12-31';
  return da.localeCompare(db);
}

/**
 * Plan Refunds list search: booking code · customer · reason · call notes · id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function refundMatchesSearch(
  refund: {
    id?: string | null;
    code?: string | null;
    customer?: string | null;
    reason?: string | null;
    call_notes_latest?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    refund.code,
    refund.customer,
    refund.reason,
    refund.call_notes_latest,
    refund.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}
