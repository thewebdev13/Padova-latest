import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planSourceDelta,
  sourceKey,
  sourceFingerprint,
  migrationCommandId,
  type SourceRow,
} from '../src/lib/historical-delta';
const row = (patch: Partial<SourceRow> = {}): SourceRow => ({
  workbook: 'master-test',
  tab: 'Bookings',
  row: 12,
  evidenceId: 'evidence-test-1',
  batch: 'snapshot-test-1',
  cells: { sale: '100.00', cost: '' },
  ...patch,
});

test('working snapshots are repeatable and preserve blank costs without a financial posting', () => {
  const before = row(),
    after = row({ batch: 'later-snapshot', evidenceId: 'later-evidence' });
  const plan = planSourceDelta([before], [after]);
  assert.equal(plan.counts.unchanged, 1);
  assert.equal(plan.proposals[0].writeAuthorized, false);
  assert.equal(before.cells && (before.cells as any).cost, '');
  assert.equal(sourceFingerprint({ cost: '', sale: '100.00' }), sourceFingerprint(before.cells));
});
test('accepted content changes route to correction review and keep the same event identity', () => {
  const before = row({ stableId: 'approved-booking-1' });
  const mapping = {
    sourceKey: sourceKey(before),
    fingerprint: sourceFingerprint(before.cells),
    targetTable: 'bookings',
    targetId: 'existing-live-id',
  };
  const plan = planSourceDelta(
    [before],
    [row({ stableId: before.stableId, row: 30, cells: { sale: '120.00', cost: '' } })],
    [mapping],
  );
  assert.equal(plan.proposals[0].status, 'changed_needs_review');
  assert.equal(plan.proposals[0].target?.id, 'existing-live-id');
  assert.equal(
    migrationCommandId(sourceKey(before)),
    migrationCommandId(plan.proposals[0].sourceKey),
  );
});
test('row moves without approved IDs, repeated rows and conflicting mappings never become automatic creates', () => {
  const before = row();
  const moved = planSourceDelta([before], [row({ row: 30 })]);
  assert.equal(moved.proposals[0].status, 'identity_needs_review');
  assert.equal(moved.missing[0].deleteAuthorized, false);
  assert.equal(planSourceDelta([], [before, before]).counts.identityReview, 2);
  const map = {
    sourceKey: sourceKey(before),
    fingerprint: sourceFingerprint(before.cells),
    targetTable: 'bookings',
    targetId: 'id-a',
  };
  assert.equal(
    planSourceDelta([before], [before], [map, { ...map, targetId: 'id-b' }]).counts.identityReview,
    1,
  );
});
test('approved stable IDs survive row insertion and missing rows never authorize deletion', () => {
  const before = row({ stableId: 'approved-booking-1' });
  assert.equal(
    planSourceDelta([before], [row({ stableId: before.stableId, row: 100 })]).counts.unchanged,
    1,
  );
  assert.equal(planSourceDelta([before], []).missing[0].deleteAuthorized, false);
  assert.notEqual(
    migrationCommandId('receipt:account-a:123'),
    migrationCommandId('allocation:account-a:123'),
  );
});
