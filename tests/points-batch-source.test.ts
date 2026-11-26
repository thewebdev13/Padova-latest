import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import {
  POINTS_BATCH_SOURCES,
  encodePointsBatchSourceInRestrictions,
  normalizePointsBatchSource,
  parsePointsBatchSourceFromRestrictions,
  pointsBatchSourceLabel,
} from '../src/lib/points-batch-source';

test('Plan points batch sources normalize and label', () => {
  assert.deepEqual([...POINTS_BATCH_SOURCES], [
    'purchase',
    'transfer with bonus',
    'sold on',
  ]);
  assert.equal(normalizePointsBatchSource('Purchase'), 'purchase');
  assert.equal(normalizePointsBatchSource('TRANSFER WITH BONUS'), 'transfer with bonus');
  assert.equal(normalizePointsBatchSource('sold on'), 'sold on');
  assert.equal(normalizePointsBatchSource('other'), null);
  assert.equal(pointsBatchSourceLabel('purchase'), 'Purchase');
  assert.equal(pointsBatchSourceLabel(''), null);
});

test('points source encodes into restrictions without inventing cost', () => {
  const encoded = encodePointsBatchSourceInRestrictions(
    'transfer with bonus',
    'Expiry rule: 24 months from purchase',
  );
  assert.match(encoded, /^Points source: transfer with bonus/);
  assert.match(encoded, /Expiry rule: 24 months from purchase/);
  assert.equal(parsePointsBatchSourceFromRestrictions(encoded), 'transfer with bonus');
  assert.equal(parsePointsBatchSourceFromRestrictions(''), null);
});

test('acquire_asset Points stores batch source on restrictions', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const asset = await run('acquire_asset', {
      name: 'UA purchase batch',
      kind: 'Points',
      issuer: 'United MileagePlus',
      quantity: 40000,
      cost: 52000,
      date: '2026-02-01',
      ownership: 'Padova',
      points_source: 'purchase',
      restrictions: '',
      reference: 'UA-SRC-TEST',
    });
    const row = (await db.query('SELECT restrictions FROM assets WHERE id=$1', [asset.id]))
      .rows[0];
    assert.equal(parsePointsBatchSourceFromRestrictions(row.restrictions), 'purchase');
    assert.equal(pointsBatchSourceLabel(row.restrictions.match(/Points source:\s*(.+)/i)?.[1]), 'Purchase');
  } finally {
    await db.close();
  }
});
