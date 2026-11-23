import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maybePromoteIntakeToLiveBooking } from '../src/lib/ai-intake-promote';
import type { Actor } from '../src/lib/permissions';

const actor = { id: '00000000-0000-4000-8000-000000000099', role: 'Owner' } as Actor;
const fakeDb = {} as never;

test('promote stays draft when AI intake disabled', async () => {
  const prev = process.env.PADOVA_AI_INTAKE;
  process.env.PADOVA_AI_INTAKE = '0';
  try {
    const r = await maybePromoteIntakeToLiveBooking(fakeDb, actor, {
      draft_id: 'd1',
      title: 't',
      entry: { product: 'Flight', travel_start: '2026-12-01' },
    });
    assert.equal(r.live, false);
    assert.equal(r.reason, 'ai_intake_disabled');
  } finally {
    process.env.PADOVA_AI_INTAKE = prev;
  }
});

test('promote stays draft when auto-live off (unless force)', async () => {
  const prevI = process.env.PADOVA_AI_INTAKE;
  const prevA = process.env.PADOVA_AI_AUTO_LIVE;
  process.env.PADOVA_AI_INTAKE = '1';
  process.env.PADOVA_AI_AUTO_LIVE = '0';
  try {
    const blocked = await maybePromoteIntakeToLiveBooking(fakeDb, actor, {
      draft_id: 'd2',
      title: 't',
      entry: { product: 'Flight', travel_start: '2026-12-01' },
    });
    assert.equal(blocked.live, false);
    assert.equal(blocked.reason, 'auto_live_disabled');

    // force (staff SAVE) still blocked here only by missing DB — but flag gate opens.
    // Without DB we stop at product path after flags; use product_unknown to avoid DB.
    const forced = await maybePromoteIntakeToLiveBooking(fakeDb, actor, {
      draft_id: 'd3',
      title: 't',
      entry: { product: 'Unknown' },
      force: true,
    });
    assert.equal(forced.live, false);
    assert.equal(forced.reason, 'product_unknown');
  } finally {
    process.env.PADOVA_AI_INTAKE = prevI;
    process.env.PADOVA_AI_AUTO_LIVE = prevA;
  }
});

test('promote stays draft when product or travel dates missing', async () => {
  const prevI = process.env.PADOVA_AI_INTAKE;
  const prevA = process.env.PADOVA_AI_AUTO_LIVE;
  process.env.PADOVA_AI_INTAKE = '1';
  process.env.PADOVA_AI_AUTO_LIVE = '1';
  try {
    const noProduct = await maybePromoteIntakeToLiveBooking(fakeDb, actor, {
      draft_id: 'd4',
      title: 't',
      entry: { product: 'Unknown', travel_start: '2026-12-01' },
    });
    assert.equal(noProduct.live, false);
    assert.equal(noProduct.reason, 'product_unknown');

    const noDates = await maybePromoteIntakeToLiveBooking(fakeDb, actor, {
      draft_id: 'd5',
      title: 't',
      entry: { product: 'Hotel' },
    });
    assert.equal(noDates.live, false);
    assert.equal(noDates.reason, 'travel_dates_unknown');
  } finally {
    process.env.PADOVA_AI_INTAKE = prevI;
    process.env.PADOVA_AI_AUTO_LIVE = prevA;
  }
});
