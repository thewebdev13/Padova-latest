import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingProfitListLabels,
  bookingProfitPair,
  buildDashboardTodoList,
  buildPlanTodoList,
  classifyPlanTodo,
  dashboardProfitTotals,
  filterPlanTodoList,
  planTodoMatchesSearch,
  planTodoRecordUrl,
  planTodoShareTarget,
  PLAN_TODO_CATEGORY_LABELS,
  teamTaskMatchesSearch,
} from '../src/lib/dashboard-todo';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('planTodoRecordUrl shares booking/person links; blank stays null', () => {
  const bookingId = '11111111-1111-1111-1111-111111111111';
  const personId = '22222222-2222-2222-2222-222222222222';
  assert.deepEqual(planTodoShareTarget({ booking_id: bookingId }), {
    type: 'booking',
    id: bookingId,
  });
  assert.equal(
    planTodoRecordUrl({ booking_id: bookingId }),
    `/w/transactions#booking=${bookingId}`,
  );
  assert.equal(
    planTodoRecordUrl({ record_type: 'person', record_id: personId }),
    `/w/people#person=${personId}`,
  );
  // Booking wins over a secondary record pointer.
  assert.equal(
    planTodoRecordUrl({
      booking_id: bookingId,
      record_type: 'person',
      record_id: personId,
    }),
    `/w/transactions#booking=${bookingId}`,
  );
  assert.equal(planTodoRecordUrl({}), null);
  assert.equal(planTodoRecordUrl({ record_type: 'person', record_id: '  ' }), null);
  assert.equal(planTodoRecordUrl({ record_type: 'unknown', record_id: personId }), null);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /planTodoRecordUrl/);
  assert.match(src, /page === 'To-do'[\s\S]*Copy link/);
  // Attention + Team tasks reuse the same share helper when a record is linked.
  assert.match(
    src,
    /const attentionRows[\s\S]*planTodoRecordUrl[\s\S]*Copy link/,
  );
  assert.match(
    src,
    /Team tasks[\s\S]*planTodoRecordUrl[\s\S]*Copy link/,
  );
  // Operational Follow-up (Dashboard + Follow-up page) Copy link via shared helper.
  assert.match(src, /copyWorkspacePath/);
  assert.match(src, /OperationalViews[\s\S]*copyLink=\{copyWorkspacePath\}/);
  const followup = readFileSync(
    join(process.cwd(), 'src/components/operational-views.tsx'),
    'utf8',
  );
  assert.match(followup, /planTodoRecordUrl/);
  assert.match(followup, /Copy link/);
  assert.match(followup, /Copy shareable link/);
  // Dashboard Traveling today + Upcoming shareable booking links.
  assert.match(
    src,
    /Traveling today[\s\S]*calendarBookingSharePath[\s\S]*Copy link[\s\S]*Upcoming bookings[\s\S]*calendarBookingSharePath[\s\S]*Copy link/,
  );
  // Dashboard Traveling today + Upcoming search (bookingMatchesSearch; blank ≠ invent).
  assert.match(src, /dashboardTravelQuery/);
  assert.match(src, /dashboard-travel-search/);
  assert.match(src, /Search booking #, traveler or trip/);
  assert.match(
    src,
    /todayTravelAll\.filter\(\(b\) =>\s*bookingMatchesSearch\(b, s, dashboardTravelQuery\)/,
  );
  assert.match(
    src,
    /upcomingAll\.filter\(\(b\) => bookingMatchesSearch\(b, s, dashboardTravelQuery\)\)/,
  );
});

test('classifyPlanTodo maps Plan buckets without inventing', () => {
  assert.equal(classifyPlanTodo({ kind: 'task' }), 'task');
  assert.equal(classifyPlanTodo({ title: 'Refund pending' }), 'refund');
  assert.equal(classifyPlanTodo({ view: 'Pending Credits', title: 'Cap1 credit' }), 'price_match');
  assert.equal(classifyPlanTodo({ view: 'Commission Receivable' }), 'commission');
  assert.equal(classifyPlanTodo({ title: 'Asset expiration' }), 'expiring');
  assert.equal(classifyPlanTodo({ view: 'Missing Cost' }), 'missing_cost');
  // Plan: cost estimate stays on follow-up until real USD is entered.
  assert.equal(classifyPlanTodo({ kind: 'Cost estimate', title: 'PDV-1 · Cost estimate' }), 'missing_cost');
  assert.equal(classifyPlanTodo({ view: 'Customer Owes' }), 'unpaid');
  assert.equal(classifyPlanTodo({ title: 'Odd note' }), 'other');
  assert.ok(PLAN_TODO_CATEGORY_LABELS.refund);
});

test('buildPlanTodoList unifies operational views into one Plan To-do', () => {
  const rows = buildPlanTodoList({
    tasks: [{ id: 't1', title: 'Call', status: 'Open' }],
    attention: [{ key: 'a1', title: 'Missing cost on PDV-1', booking_id: 'b1' }],
    operationalViews: {
      'Pending Refunds': [{ id: 'r1', title: 'Refund due', booking_id: 'b2' }],
      'Customer Owes': [{ id: 'c1', code: 'PDV-9', title: 'Customer', booking_id: 'b3' }],
      'Commission Receivable': [{ id: 'm1', title: 'Hotel commission', booking_id: 'b4' }],
    },
    limit: 20,
  });
  assert.ok(rows.some((r) => r.category === 'task'));
  assert.ok(rows.some((r) => r.category === 'missing_cost'));
  assert.ok(rows.some((r) => r.category === 'refund'));
  assert.ok(rows.some((r) => r.category === 'unpaid'));
  assert.ok(rows.some((r) => r.category === 'commission'));
  assert.equal(filterPlanTodoList(rows, 'refund').every((r) => r.category === 'refund'), true);
});

test('To-do search: title · detail · category; blank query matches all ≠ invent', () => {
  const item = {
    id: 'view:Pending Refunds:r1',
    title: 'PDV-100 · Unresolved refund',
    detail: 'Follow-up overdue',
    category: 'refund' as const,
    booking_id: 'b-abc',
    due_on: '2026-11-20',
  };
  assert.equal(planTodoMatchesSearch(item, ''), true);
  assert.equal(planTodoMatchesSearch(item, null), true);
  assert.equal(planTodoMatchesSearch(item, 'pdv-100'), true);
  assert.equal(planTodoMatchesSearch(item, 'Refunds due'), true);
  assert.equal(planTodoMatchesSearch(item, 'overdue'), true);
  assert.equal(planTodoMatchesSearch(item, 'b-abc'), true);
  assert.equal(planTodoMatchesSearch(item, 'commission'), false);
  assert.equal(planTodoMatchesSearch({ title: null, detail: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /planTodoMatchesSearch/);
  assert.match(src, /todo-search/);
  assert.match(src, /Search title, detail or booking/);
});

test('Team tasks search: title · notes · assignee; blank query matches all ≠ invent', () => {
  const row = {
    id: 'task-1',
    title: 'Call Sruly about PDV-100',
    notes: 'Ask about remittance',
    status: 'Open',
    priority: 'High',
    due_on: '2026-12-01',
    assignee_name: 'Minindy',
    record_type: 'booking',
    record_id: 'b-abc',
  };
  assert.equal(teamTaskMatchesSearch(row, ''), true);
  assert.equal(teamTaskMatchesSearch(row, null), true);
  assert.equal(teamTaskMatchesSearch(row, 'sruly'), true);
  assert.equal(teamTaskMatchesSearch(row, 'MININDY'), true);
  assert.equal(teamTaskMatchesSearch(row, 'remittance'), true);
  assert.equal(teamTaskMatchesSearch(row, 'high'), true);
  assert.equal(teamTaskMatchesSearch(row, 'b-abc'), true);
  assert.equal(teamTaskMatchesSearch(row, 'zelle'), false);
  assert.equal(teamTaskMatchesSearch({ title: null, notes: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /teamTaskMatchesSearch/);
  assert.match(src, /tasks-search/);
  assert.match(src, /Search title, notes or assignee/);
});

test('dashboard to-do merges open tasks ahead of attention and follow-ups', () => {
  const rows = buildDashboardTodoList({
    tasks: [
      { id: 't1', title: 'Call Sruly', status: 'Open', due_on: '2026-12-01' },
      { id: 't2', title: 'Done item', status: 'Done' },
    ],
    attention: [{ key: 'a1', title: 'Missing cost', booking_id: 'b1' }],
    followups: [{ id: 'f1', code: 'PDV-1', kind: 'Customer Owes', booking_id: 'b1' }],
    limit: 10,
  });
  assert.equal(rows[0].kind, 'task');
  assert.equal(rows[0].title, 'Call Sruly');
  assert.ok(rows.some((r) => r.kind === 'attention'));
  assert.equal(rows.find((r) => r.title === 'Done item'), undefined);
});

test('bookingProfitPair: incomplete / confirmed / expected with outstanding commission', () => {
  assert.deepEqual(bookingProfitPair({ profit: null, cost_incomplete: true }), {
    confirmed_cents: null,
    expected_cents: null,
    incomplete: true,
  });
  assert.deepEqual(
    bookingProfitPair({
      profit: 10000,
      expected_commission: 0,
      received_commission: 0,
    }),
    { confirmed_cents: 10000, expected_cents: 10000, incomplete: false },
  );
  assert.deepEqual(
    bookingProfitPair({
      profit: 10000,
      expected_commission: 2000,
      received_commission: 0,
    }),
    { confirmed_cents: 8000, expected_cents: 10000, incomplete: false },
  );
  assert.deepEqual(
    bookingProfitPair({
      profit: 10000,
      expected_commission: 2000,
      received_commission: 2000,
    }),
    { confirmed_cents: 10000, expected_cents: 10000, incomplete: false },
  );
  assert.deepEqual(
    bookingProfitPair({
      profit: 10000,
      current_profit: 8500,
      expected_commission: 2000,
      received_commission: 500,
    }),
    { confirmed_cents: 8500, expected_cents: 10000, incomplete: false },
  );
});

test('bookingProfitListLabels never invents $0 for incomplete', () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  assert.deepEqual(
    bookingProfitListLabels(
      { confirmed_cents: null, expected_cents: null, incomplete: true },
      'Incomplete',
      fmt,
    ),
    { confirmed: 'Incomplete', expected: 'Incomplete' },
  );
  assert.deepEqual(
    bookingProfitListLabels(
      { confirmed_cents: 8000, expected_cents: 10000, incomplete: false },
      'Incomplete',
      fmt,
    ),
    { confirmed: '$80.00', expected: '$100.00' },
  );
});

test('dashboard profit totals stay incomplete when any booking profit is unknown', () => {
  const incomplete = dashboardProfitTotals([
    { profit: 10000, expected_commission: 0, received_commission: 0 },
    { profit: null, cost_incomplete: true },
  ]);
  assert.equal(incomplete.incomplete, true);
  assert.equal(incomplete.confirmed_cents, 10000);
  assert.equal(incomplete.expected_cents, 10000);

  // Plan: profit already includes accrued commission; confirmed strips outstanding.
  const complete = dashboardProfitTotals([
    { profit: 10000, expected_commission: 2000, received_commission: 500 },
    { profit: 5000, expected_commission: 0, received_commission: 0 },
  ]);
  assert.equal(complete.incomplete, false);
  assert.equal(complete.confirmed_cents, 8500 + 5000);
  assert.equal(complete.expected_cents, 10000 + 5000);
});
