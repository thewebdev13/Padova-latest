import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate } from '../src/lib/business-date';
import type { SQL } from '../src/lib/db';
test('company business day uses preserved timezone across UTC midnight and configured timezone changes', async () => {
  let timezone = 'America/New_York';
  const db = {
    storage: 'padova',
    query: async () => ({ rows: [{ business_timezone: timezone }] }),
  } as unknown as SQL;
  const instant = new Date('2026-10-29T01:25:15Z');
  assert.equal(await businessDate(db, instant), '2026-10-28');
  timezone = 'Asia/Jerusalem';
  assert.equal(await businessDate(db, instant), '2026-10-29');
  assert.equal(await businessDate({} as SQL, instant), '2026-10-29');
});
