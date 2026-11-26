import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import {
  EXPIRY_RULE_OTHER,
  EXPIRY_RULES,
  encodeExpiryRuleInRestrictions,
  mergeExpiryRuleOptions,
  parseExpiryRuleFromRestrictions,
  resolveExpiryRule,
  suggestExpiresOn,
} from '../src/lib/expiry-rules';

test('Plan expiry rules merge owner-added names + Other…', () => {
  const opts = mergeExpiryRuleOptions([
    '24 months from purchase',
    'Airline fixed window',
    '',
    '  Program anniversary  ',
  ]);
  assert.ok(opts.includes('Never expires'));
  assert.ok(opts.includes('Airline fixed window'));
  assert.ok(opts.includes('Program anniversary'));
  assert.equal(opts.filter((o) => o === '24 months from purchase').length, 1);
  assert.equal(opts[opts.length - 1], EXPIRY_RULE_OTHER);
  assert.ok(EXPIRY_RULES.includes('12 months from purchase'));
});

test('resolveExpiryRule + encode/parse round-trip without inventing dates', () => {
  assert.equal(resolveExpiryRule('Never expires'), 'Never expires');
  assert.equal(resolveExpiryRule(EXPIRY_RULE_OTHER, 'Airline fixed window'), 'Airline fixed window');
  assert.equal(resolveExpiryRule(EXPIRY_RULE_OTHER, '  '), '');
  const encoded = encodeExpiryRuleInRestrictions('24 months from purchase', 'Name match only');
  assert.match(encoded, /^Expiry rule: 24 months from purchase/);
  assert.match(encoded, /Name match only/);
  assert.equal(parseExpiryRuleFromRestrictions(encoded), '24 months from purchase');
  assert.equal(suggestExpiresOn('Never expires', '2026-01-15'), null);
  assert.equal(suggestExpiresOn('Exact date on file', '2026-01-15'), null);
  assert.equal(suggestExpiresOn('24 months from purchase', '2026-01-15'), '2028-01-15');
  assert.equal(suggestExpiresOn('Calendar year-end', '2026-03-01'), '2026-12-31');
  assert.equal(suggestExpiresOn('24 months from purchase', ''), null);
});

test('acquire_asset stores expiry_rule in restrictions; expires_on stays explicit', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const asset = await run('acquire_asset', {
      name: 'UA batch',
      kind: 'Points',
      issuer: 'United MileagePlus',
      quantity: 50000,
      cost: 65000,
      date: '2026-01-15',
      ownership: 'Padova',
      expiry_rule: '24 months from purchase',
      expires_on: '2028-01-15',
      restrictions: '',
      reference: 'UA-TEST-EXPIRY',
    });
    const row = (await db.query('SELECT expires_on, restrictions FROM assets WHERE id=$1', [
      asset.id,
    ])).rows[0];
    assert.equal(String(row.expires_on).slice(0, 10), '2028-01-15');
    assert.equal(parseExpiryRuleFromRestrictions(row.restrictions), '24 months from purchase');
  } finally {
    await db.close();
  }
});
