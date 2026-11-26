import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareRefundFollowUpDue,
  isRefundFollowUpHot,
  refundFollowUpAttentionTitle,
  refundFollowUpDueOn,
  refundFollowUpSortRank,
  refundFollowUpUrgency,
  refundFollowUpUrgencyLabel,
  refundMatchesSearch,
} from '../src/lib/refund-follow-up-due';
import { buildDashboardTodoList } from '../src/lib/dashboard-todo';
import { operationalViews } from '../src/lib/operational-views';
import type { Permission } from '../src/lib/permissions';

const today = '2026-11-26';

test('refund follow-up urgency bands match Held PNR; blank stays none', () => {
  assert.equal(refundFollowUpDueOn('2026-11-20'), '2026-11-20');
  assert.equal(refundFollowUpDueOn(''), null);
  assert.equal(refundFollowUpDueOn('not-a-date'), null);
  assert.equal(refundFollowUpUrgency('2026-11-20', today), 'overdue');
  assert.equal(refundFollowUpUrgency('2026-11-26', today), 'due_today');
  assert.equal(refundFollowUpUrgency('2026-11-28', today), 'due_soon');
  assert.equal(refundFollowUpUrgency('2026-12-10', today), 'ok');
  assert.equal(refundFollowUpUrgency(null, today), 'none');
  assert.equal(refundFollowUpUrgencyLabel('overdue'), 'Overdue');
  assert.equal(refundFollowUpUrgencyLabel('due_today'), 'Due today');
  assert.equal(refundFollowUpUrgencyLabel('due_soon'), 'Due ≤3 days');
  assert.equal(refundFollowUpUrgencyLabel('ok'), null);
  assert.ok(isRefundFollowUpHot('overdue'));
  assert.equal(isRefundFollowUpHot('ok'), false);
  assert.ok(refundFollowUpSortRank('overdue') < refundFollowUpSortRank('due_soon'));
});

test('attention title adds overdue/due wording without inventing money', () => {
  assert.equal(
    refundFollowUpAttentionTitle('PDV-100', '2026-11-20', today),
    'PDV-100 · Unresolved refund · overdue',
  );
  assert.equal(
    refundFollowUpAttentionTitle('PDV-100', '2026-11-26', today),
    'PDV-100 · Unresolved refund · due today',
  );
  assert.equal(
    refundFollowUpAttentionTitle('PDV-100', '2026-12-10', today),
    'PDV-100 · Unresolved refund',
  );
  assert.equal(
    refundFollowUpAttentionTitle('PDV-100', null, today),
    'PDV-100 · Unresolved refund',
  );
});

test('sort overdue first; dashboard to-do boosts hot refunds after seller ASAP', () => {
  const rows = [
    { due_on: '2026-12-10' },
    { due_on: '2026-11-20' },
    { due_on: '2026-11-26' },
  ];
  rows.sort((a, b) => compareRefundFollowUpDue(a, b, today));
  assert.deepEqual(
    rows.map((r) => r.due_on),
    ['2026-11-20', '2026-11-26', '2026-12-10'],
  );

  const todo = buildDashboardTodoList({
    attention: [
      { key: 'a1', title: 'Quiet note', kind: 'Other' },
      {
        key: 'refund:1',
        title: 'PDV-1 · Unresolved refund · overdue',
        kind: 'Refund',
        due_on: '2026-11-20',
        urgency: 'overdue',
        booking_id: 'b1',
      },
      {
        key: 'supplier:b2',
        title: 'PDV-2 · Pay seller ASAP',
        kind: 'Seller unpaid',
        booking_id: 'b2',
      },
    ],
    limit: 10,
  });
  assert.equal(todo[0].title.includes('Pay seller ASAP'), true);
  assert.equal(todo[1].title.includes('Unresolved refund'), true);
  assert.equal(todo[1].due_on, '2026-11-20');
});

test('Pending Refunds include follow-up due and sort overdue first', () => {
  const can = (p: Permission) => p === 'view_refunds';
  const views = operationalViews({
    bookings: [],
    assets: [],
    parties: [],
    commissions: [],
    referrals: [],
    expectedEvents: [],
    attention: [],
    can,
    today,
    refunds: [
      {
        id: 'r-late',
        booking_id: 'b1',
        code: 'PDV-1',
        reason: 'Airline cancel',
        due_on: '2026-11-20',
        supplier_expected: 10000,
        received: 0,
        customer_due: 9000,
        paid: 0,
        handed_over: 0,
      },
      {
        id: 'r-ok',
        booking_id: 'b2',
        code: 'PDV-2',
        reason: 'Later follow-up',
        due_on: '2026-12-10',
        supplier_expected: 5000,
        received: 0,
        customer_due: 0,
        paid: 0,
        handed_over: 0,
      },
    ] as any,
  });
  const pending = views['Pending Refunds'] as Array<Record<string, unknown>>;
  assert.ok(pending.length >= 2);
  assert.equal(pending[0].due_on, '2026-11-20');
  assert.match(String(pending[0].detail || ''), /Follow-up 2026-11-20/);
  assert.match(String(pending[0].detail || ''), /Overdue/);
});

test('Refunds search: booking · customer · reason; blank query matches all ≠ invent', () => {
  const row = {
    id: 'ref-xyz789',
    code: 'PDV-100',
    customer: 'Ada Lovelace',
    reason: 'Airline cancel',
    call_notes_latest: 'Left voicemail',
  };
  assert.equal(refundMatchesSearch(row, ''), true);
  assert.equal(refundMatchesSearch(row, null), true);
  assert.equal(refundMatchesSearch(row, 'pdv-100'), true);
  assert.equal(refundMatchesSearch(row, 'ADA'), true);
  assert.equal(refundMatchesSearch(row, 'voicemail'), true);
  assert.equal(refundMatchesSearch(row, 'airline'), true);
  assert.equal(refundMatchesSearch(row, 'ref-xyz'), true);
  assert.equal(refundMatchesSearch(row, 'hotel'), false);
  assert.equal(refundMatchesSearch({ code: null, customer: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /refundMatchesSearch/);
  assert.match(src, /refunds-search/);
  assert.match(src, /Search booking #, customer or reason/);
});
