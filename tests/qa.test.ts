import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { assertQAIsolation, QA_PERMISSIONS } from '../src/lib/qa';
import { hasPermission, OWNER_PERMISSIONS, EMPLOYEE_PERMISSIONS } from '../src/lib/permissions';
import {
  historicalPreparationIndex,
  historicalPreparationDetail,
} from '../src/lib/historical-preparation-store';
import { travelerReviewIndex } from '../src/lib/traveler-review-store';

test('QA fails closed on production credentials, wrong data directory, or a cloud mode', () => {
  const env = {
    NODE_ENV: 'test' as const,
    PADOVA_QA: '1',
    PADOVA_DATABASE_MODE: 'local',
    PADOVA_DATA_DIR: path.resolve('.data/remote-qa'),
  };
  assert.doesNotThrow(() => assertQAIsolation(env));
  for (const key of [
    'DATABASE_URL',
    'SUPABASE_SECRET_KEY',
    'PADOVA_BACKUP_DATABASE_URL',
    'PADOVA_EVIDENCE_ROOT',
    'PADOVA_AUTH_ENCRYPTION_KEY',
  ])
    assert.throws(() => assertQAIsolation({ ...env, [key]: 'forbidden' }));
  assert.throws(() =>
    assertQAIsolation({ ...env, PADOVA_DATA_DIR: path.resolve('.data/owner-acceptance') }),
  );
  assert.throws(() => assertQAIsolation({ ...env, PADOVA_DATABASE_MODE: 'supabase' }));
  assert.doesNotThrow(() =>
    assertQAIsolation({
      NODE_ENV: 'test',
      PADOVA_QA: '0',
      DATABASE_URL: 'unchanged-existing-configuration',
    }),
  );
});

test('QA operations grants exclude administration while existing staff defaults are unchanged', () => {
  const actor = {
    id: 'qa-test',
    name: 'QA Tester',
    role: 'EMPLOYEE' as const,
    permissions: QA_PERMISSIONS,
  };
  for (const p of [
    'operations',
    'manage_funding',
    'edit_customer_charges',
    'edit_payments',
    'manage_assets',
  ] as const)
    assert.ok(hasPermission(actor, p));
  for (const p of [
    'manage_users',
    'manage_settings',
    'view_accounting',
    'view_audit',
    'view_total_profit',
  ] as const)
    assert.ok(!hasPermission(actor, p));
  assert.ok(EMPLOYEE_PERMISSIONS.includes('operations'));
  assert.ok(EMPLOYEE_PERMISSIONS.includes('view_booking_profit'));
  assert.ok(EMPLOYEE_PERMISSIONS.includes('manage_funding'));
  assert.ok(!EMPLOYEE_PERMISSIONS.includes('view_total_profit'));
  assert.ok(!EMPLOYEE_PERMISSIONS.includes('view_accounting'));
  assert.ok(!EMPLOYEE_PERMISSIONS.includes('manage_users'));
  assert.ok(OWNER_PERMISSIONS.includes('manage_users'));
});

test('QA prevents even its Owner from reading historical evidence files', async () => {
  const previous = process.env.PADOVA_QA;
  process.env.PADOVA_QA = '1';
  const owner = {
    id: 'qa-owner',
    name: 'QA Owner',
    role: 'OWNER' as const,
    permissions: OWNER_PERMISSIONS,
  };
  try {
    assert.equal(await historicalPreparationIndex(owner), null);
    assert.equal(
      await travelerReviewIndex(owner, true, {
        query: async () => {
          throw new Error('QA must not query traveler source decisions');
        },
        exec: async () => {
          throw new Error('QA must not mutate source decisions');
        },
      }),
      null,
    );
    await assert.rejects(historicalPreparationDetail(owner, 'anything'), /unavailable in QA/);
  } finally {
    if (previous === undefined) delete process.env.PADOVA_QA;
    else process.env.PADOVA_QA = previous;
  }
});
