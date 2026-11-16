import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionHealth } from '../src/lib/production-health';
import { PADOVA_PROJECT, PADOVA_QA_PROJECT } from '../src/lib/project';

const production = {
  PADOVA_DATABASE_MODE: 'supabase',
  PADOVA_QA: '0',
  SUPABASE_URL: PADOVA_PROJECT.url,
  DATABASE_URL: `postgresql://runtime:fixture-password@db.${PADOVA_PROJECT.ref}.supabase.co/postgres?sslmode=verify-full`,
};

test('health refuses QA and misconfigured targets before performing any database read', async () => {
  for (const env of [
    { ...production, PADOVA_QA: '1', PADOVA_QA_PROJECT_REF: PADOVA_QA_PROJECT.ref },
    { ...production, SUPABASE_URL: PADOVA_QA_PROJECT.url },
    {
      ...production,
      DATABASE_URL: production.DATABASE_URL.replace(PADOVA_PROJECT.ref, PADOVA_QA_PROJECT.ref),
    },
    { ...production, DATABASE_URL: undefined },
    { ...production, PADOVA_DATABASE_MODE: 'local' },
    { ...production, PADOVA_QA_PROJECT_REF: PADOVA_QA_PROJECT.ref },
    { ...production, DATABASE_URL: production.DATABASE_URL.replace('verify-full', 'require') },
  ]) {
    let called = false;
    const result = await productionHealth(env, async () => {
      called = true;
      throw new Error('Must not connect');
    });
    assert.equal(called, false);
    assert.equal(result.status, 'unhealthy');
    assert.equal(result.database, 'not_checked');
  }
});

test('health requires the actual installed marker and returns only availability metadata', async () => {
  const checkedAt = new Date().toISOString();
  const result = await productionHealth(production, async () => ({
    rows: [{ checked_at: checkedAt }],
  }));
  assert.deepEqual(result, {
    status: 'healthy',
    application: 'reachable',
    database: 'reachable',
    projectRef: PADOVA_PROJECT.ref,
    checkedAt,
  });
  assert.equal(
    (await productionHealth(production, async () => ({ rows: [] }))).status,
    'unhealthy',
  );
});

test('health redacts database failures and credentials', async () => {
  const result = await productionHealth(production, async () => {
    throw new Error(`Sensitive error with ${production.DATABASE_URL}`);
  });
  assert.equal(result.status, 'unhealthy');
  assert.equal(result.database, 'unavailable');
  assert.equal(JSON.stringify(result).includes('fixture-password'), false);
  assert.equal(JSON.stringify(result).includes('Sensitive'), false);
});
