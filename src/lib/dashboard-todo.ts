/** Plan Phase 4 — dashboard to-do = open tasks + follow-ups (not company profit). */

import { isSellerUnpaidAttention } from './seller-unpaid';
import {
  isRefundFollowUpHot,
  refundFollowUpSortRank,
  type RefundFollowUpUrgency,
} from './refund-follow-up-due';
import {
  WORKSPACE_RECORD_KEYS,
  workspaceRecordUrl,
  type WorkspaceRecordKey,
} from './workspace-routes';

/** Plan To-do screen buckets (Main screens — To-do). */
export const PLAN_TODO_CATEGORIES = [
  'refund',
  'price_match',
  'commission',
  'expiring',
  'missing_cost',
  'unpaid',
  'task',
  'other',
] as const;

export type PlanTodoCategory = (typeof PLAN_TODO_CATEGORIES)[number];

export const PLAN_TODO_CATEGORY_LABELS: Record<PlanTodoCategory, string> = {
  refund: 'Refunds due',
  price_match: 'Price matches',
  commission: 'Commissions',
  expiring: 'Expiring credits',
  missing_cost: 'Missing cost',
  unpaid: 'Unpaid balances',
  task: 'Team tasks',
  other: 'Other',
};

/** Classify a to-do row into a Plan bucket (Unknown stays other — never invent). */
export function classifyPlanTodo(row: {
  kind?: string | null;
  title?: string | null;
  detail?: string | null;
  status?: string | null;
  view?: string | null;
}): PlanTodoCategory {
  if (row.kind === 'task') return 'task';
  const blob = [row.view, row.kind, row.title, row.detail, row.status]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  if (/refund/.test(blob)) return 'refund';
  if (/price\s*match|pending credits|credit not yet|credit issued/.test(blob))
    return 'price_match';
  if (/commission/.test(blob)) return 'commission';
  if (/expir|asset expiration/.test(blob)) return 'expiring';
  // Plan: cost estimate stays on follow-up until real USD is entered.
  if (
    /missing cost|cost remains unknown|supplier_cost_incomplete|cost estimate/.test(blob)
  )
    return 'missing_cost';
  if (
    /unpaid|customer owes|owes sellers|balance open|seller unpaid|pay asap|acquisition_due/.test(
      blob,
    )
  )
    return 'unpaid';
  return 'other';
}

function attentionPriority(row: {
  key?: string;
  kind?: string;
  title?: string;
  urgency?: RefundFollowUpUrgency | string | null;
}): number {
  if (isSellerUnpaidAttention(row)) return 0;
  const isRefund =
    row.kind === 'Refund' || /Unresolved refund/i.test(String(row.title || ''));
  if (!isRefund) return 2;
  const urgency = (row.urgency as RefundFollowUpUrgency | undefined) || 'none';
  return isRefundFollowUpHot(urgency) ? 1 : 2;
}

export type DashboardTodoItem = {
  id: string;
  kind: 'task' | 'attention' | 'followup';
  title: string;
  detail?: string;
  booking_id?: string;
  task_id?: string;
  due_on?: string | null;
  priority?: string;
  record_type?: string;
  record_id?: string;
  /** Plan To-do bucket when built via buildPlanTodoList. */
  category?: PlanTodoCategory;
};

export type PlanTodoItem = DashboardTodoItem & { category: PlanTodoCategory };

/**
 * Plan shareable address for a To-do row when it points at a known record.
 * Booking wins over record_type; Unknown / blank → null (never invent a link).
 */
export function planTodoShareTarget(item: {
  booking_id?: string | null;
  record_type?: string | null;
  record_id?: string | null;
}): { type: WorkspaceRecordKey; id: string } | null {
  const bookingId = String(item.booking_id || '').trim();
  if (bookingId) return { type: 'booking', id: bookingId };
  const type = String(item.record_type || '').trim();
  const id = String(item.record_id || '').trim();
  if (!type || !id) return null;
  if (!(WORKSPACE_RECORD_KEYS as readonly string[]).includes(type)) return null;
  return { type: type as WorkspaceRecordKey, id };
}

export function planTodoRecordUrl(item: {
  booking_id?: string | null;
  record_type?: string | null;
  record_id?: string | null;
}): string | null {
  const target = planTodoShareTarget(item);
  return target ? workspaceRecordUrl(target.type, target.id) : null;
}

export function buildDashboardTodoList(input: {
  tasks?: Array<{
    id?: string;
    title?: string;
    status?: string;
    due_on?: string | null;
    priority?: string;
  }>;
  attention?: Array<{
    key?: string;
    title?: string;
    detail?: string;
    booking_id?: string;
    due_on?: string | null;
    urgency?: RefundFollowUpUrgency | string | null;
    record_type?: string | null;
    record_id?: string | null;
    kind?: string;
  }>;
  followups?: Array<{
    id?: string;
    key?: string;
    title?: string;
    detail?: string;
    booking_id?: string;
    code?: string;
    kind?: string;
    status?: string;
  }>;
  limit?: number;
}): DashboardTodoItem[] {
  const limit = input.limit ?? 12;
  const out: DashboardTodoItem[] = [];
  const seen = new Set<string>();

  const push = (item: DashboardTodoItem) => {
    if (out.length >= limit) return;
    const dedupe = `${item.kind}:${item.booking_id || ''}:${item.title}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(item);
  };

  for (const t of input.tasks ?? []) {
    if (!t.id || String(t.status || '') !== 'Open') continue;
    push({
      id: `task:${t.id}`,
      kind: 'task',
      title: String(t.title || 'Open task'),
      task_id: t.id,
      due_on: t.due_on ?? null,
      priority: t.priority,
    });
  }

  // Plan: sellers ASAP first; hot refund follow-ups (overdue/today/≤3d) next.
  const attentionRows = [...(input.attention ?? [])].sort((a, b) => {
    const ap = attentionPriority(a);
    const bp = attentionPriority(b);
    if (ap !== bp) return ap - bp;
    if (ap === 1 && bp === 1) {
      const ua = (a.urgency as RefundFollowUpUrgency | undefined) || 'none';
      const ub = (b.urgency as RefundFollowUpUrgency | undefined) || 'none';
      return refundFollowUpSortRank(ua) - refundFollowUpSortRank(ub);
    }
    return 0;
  });
  for (const a of attentionRows) {
    if (!a.key && !a.title) continue;
    push({
      id: `attention:${a.key || a.title}`,
      kind: 'attention',
      title: String(a.title || 'Needs attention'),
      detail: a.detail,
      booking_id: a.booking_id,
      due_on: a.due_on ?? null,
      record_type: a.record_type ? String(a.record_type) : undefined,
      record_id: a.record_id ? String(a.record_id) : undefined,
    });
  }

  const followupRows = [...(input.followups ?? [])].sort((a, b) => {
    const ap = isSellerUnpaidAttention({
      key: a.key,
      kind: a.kind,
      title: a.title || (a.code ? `${a.code} · ${a.kind || ''}` : a.kind),
    })
      ? 0
      : 1;
    const bp = isSellerUnpaidAttention({
      key: b.key,
      kind: b.kind,
      title: b.title || (b.code ? `${b.code} · ${b.kind || ''}` : b.kind),
    })
      ? 0
      : 1;
    return ap - bp;
  });
  for (const f of followupRows) {
    const title = f.title || (f.code ? `${f.code} · ${f.kind || 'Follow-up'}` : f.kind) || 'Follow-up';
    push({
      id: `followup:${f.id || f.key || title}`,
      kind: 'followup',
      title: String(title),
      detail: f.detail,
      booking_id: f.booking_id,
    });
  }

  return out;
}

const PLAN_TODO_VIEW_KEYS = [
  'Pending Refunds',
  'Pending Credits',
  'Commission Receivable',
  'Commission Payable',
  'Missing Cost',
  'Customer Owes',
  'Padova Owes Sellers',
] as const;

/**
 * Plan single To-do surface: refunds, price matches, commissions, expiring credits,
 * missing cost, unpaid balances — plus open team tasks. Dedupes across views.
 */
export function buildPlanTodoList(input: {
  tasks?: Parameters<typeof buildDashboardTodoList>[0]['tasks'];
  attention?: Parameters<typeof buildDashboardTodoList>[0]['attention'];
  followups?: Parameters<typeof buildDashboardTodoList>[0]['followups'];
  operationalViews?: Record<
    string,
    Array<{
      id?: string;
      key?: string;
      title?: string;
      detail?: string;
      booking_id?: string;
      code?: string;
      kind?: string;
      status?: string;
      record_type?: string;
      record_id?: string;
      due_on?: string | null;
    }>
  >;
  limit?: number;
}): PlanTodoItem[] {
  const limit = input.limit ?? 100;
  const base = buildDashboardTodoList({
    tasks: input.tasks,
    attention: input.attention,
    followups: input.followups,
    limit,
  });
  const out: PlanTodoItem[] = base.map((item) => ({
    ...item,
    category: classifyPlanTodo(item),
  }));
  const seen = new Set(out.map((i) => `${i.booking_id || ''}:${i.title}`));

  for (const view of PLAN_TODO_VIEW_KEYS) {
    for (const row of input.operationalViews?.[view] ?? []) {
      if (out.length >= limit) break;
      const title =
        row.title ||
        (row.code ? `${row.code} · ${view}` : null) ||
        row.kind ||
        view;
      const dedupe = `${row.booking_id || row.record_id || ''}:${title}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const item: PlanTodoItem = {
        id: `view:${view}:${row.id || row.key || title}`,
        kind: 'followup',
        title: String(title),
        detail: row.detail || row.status || view,
        booking_id: row.booking_id,
        due_on: row.due_on ?? null,
        record_type: row.record_type,
        record_id: row.record_id,
        category: classifyPlanTodo({ ...row, view, title }),
      };
      out.push(item);
    }
  }

  return out.slice(0, limit);
}

export function filterPlanTodoList(
  items: PlanTodoItem[],
  category: PlanTodoCategory | 'All',
): PlanTodoItem[] {
  if (category === 'All') return items;
  return items.filter((i) => i.category === category);
}

/**
 * Plan To-do search: title · detail · category label · due · booking/record ids.
 * Blank query → match all; empty fields never invent a hit.
 */
export function planTodoMatchesSearch(
  item: {
    title?: string | null;
    detail?: string | null;
    due_on?: string | null;
    category?: PlanTodoCategory | string | null;
    booking_id?: string | null;
    record_id?: string | null;
    id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const cat = item.category ? PLAN_TODO_CATEGORY_LABELS[item.category as PlanTodoCategory] : '';
  const hay = [
    item.title,
    item.detail,
    cat,
    item.category,
    item.due_on,
    item.booking_id,
    item.record_id,
    item.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/**
 * Plan Team tasks search: title · notes · status · priority · assignee · due · linked record.
 * Blank query → match all; empty fields never invent a hit.
 */
export function teamTaskMatchesSearch(
  task: {
    id?: string | null;
    title?: string | null;
    notes?: string | null;
    status?: string | null;
    priority?: string | null;
    due_on?: string | null;
    record_id?: string | null;
    record_type?: string | null;
    assignee_name?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    task.title,
    task.notes,
    task.status,
    task.priority,
    task.due_on,
    task.record_id,
    task.record_type,
    task.assignee_name,
    task.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

type BookingProfitInput = {
  profit?: number | null;
  current_profit?: number | null;
  expected_commission?: number | null;
  received_commission?: number | null;
  cost_incomplete?: boolean | null;
  itinerary?: { sale_known?: boolean };
  reservation_status?: string;
};

/**
 * Plan: every booking shows confirmed (certain) vs expected (adds commissions not yet
 * confirmed). `profit` already includes accrued commission; confirmed strips outstanding.
 * Incomplete ≠ $0 — both null when cost/sale unknown.
 */
/** Compact list labels for Confirmed / Expected (never invent $0). */
export function bookingProfitListLabels(
  pair: { confirmed_cents: number | null; expected_cents: number | null; incomplete: boolean },
  incompleteLabel = 'Incomplete',
  formatMoney: (cents: number) => string,
): { confirmed: string; expected: string } {
  if (pair.incomplete || pair.confirmed_cents == null || pair.expected_cents == null) {
    return { confirmed: incompleteLabel, expected: incompleteLabel };
  }
  return {
    confirmed: formatMoney(pair.confirmed_cents),
    expected: formatMoney(pair.expected_cents),
  };
}

export function bookingProfitPair(b: BookingProfitInput): {
  confirmed_cents: number | null;
  expected_cents: number | null;
  incomplete: boolean;
} {
  if (b.cost_incomplete || b.profit == null) {
    return { confirmed_cents: null, expected_cents: null, incomplete: true };
  }
  if (b.itinerary?.sale_known === false) {
    return { confirmed_cents: null, expected_cents: null, incomplete: true };
  }
  const expected = Number(b.profit);
  if (!Number.isFinite(expected)) {
    return { confirmed_cents: null, expected_cents: null, incomplete: true };
  }
  const outstanding = Math.max(
    0,
    Number(b.expected_commission ?? 0) - Number(b.received_commission ?? 0),
  );
  const confirmed =
    b.current_profit != null && Number.isFinite(Number(b.current_profit))
      ? Number(b.current_profit)
      : expected - outstanding;
  return { confirmed_cents: confirmed, expected_cents: expected, incomplete: false };
}

/**
 * Owner dashboard profit rollup. Null when any included booking is incomplete —
 * never invent $0. Staff must not receive company-wide totals (permission-gated by caller).
 */
export function dashboardProfitTotals(
  bookings: Array<BookingProfitInput>,
): { confirmed_cents: number | null; expected_cents: number | null; incomplete: boolean } {
  let confirmed = 0;
  let expected = 0;
  let incomplete = false;
  let any = false;
  for (const b of bookings) {
    if (b.reservation_status === 'Cancelled') continue;
    const pair = bookingProfitPair(b);
    if (pair.incomplete || pair.confirmed_cents == null || pair.expected_cents == null) {
      incomplete = true;
      continue;
    }
    any = true;
    confirmed += pair.confirmed_cents;
    expected += pair.expected_cents;
  }
  if (!any) return { confirmed_cents: null, expected_cents: null, incomplete: true };
  return {
    confirmed_cents: confirmed,
    expected_cents: expected,
    incomplete,
  };
}
