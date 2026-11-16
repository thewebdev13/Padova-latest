import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseUnavailable } from '../src/lib/service-errors';
test('capacity failures remain recoverable infrastructure errors while financial validation and permissions stay distinct', () => {
  assert.ok(
    databaseUnavailable(
      Object.assign(new Error('max clients reached in session mode'), { code: 'XX000' }),
    ),
  );
  assert.ok(databaseUnavailable(Object.assign(new Error('disconnected'), { code: 'ECONNRESET' })));
  assert.equal(databaseUnavailable(new Error('Refund payout exceeds liability')), false);
  assert.equal(databaseUnavailable(new Error('Permission required: manage_funding')), false);
});
