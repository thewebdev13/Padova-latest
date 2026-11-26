import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlinePartyCreateDefaults } from '../src/lib/inline-party-defaults';

test('authorize payer Add new seeds payer role', () => {
  const d = inlinePartyCreateDefaults({
    fieldKey: 'party_id',
    commandKind: 'authorize_payer',
  });
  assert.equal(d.kind, 'person');
  assert.deepEqual(d.roles, ['payer']);
});

test('referrer Add new seeds referrer role', () => {
  const d = inlinePartyCreateDefaults({
    fieldKey: 'referrer_id',
    commandKind: 'referral',
  });
  assert.equal(d.kind, 'person');
  assert.deepEqual(d.roles, ['referrer']);
});

test('customer payment Add new seeds customer + payer', () => {
  const d = inlinePartyCreateDefaults({
    fieldKey: 'party_id',
    commandKind: 'payment',
    paymentDirection: 'customer',
  });
  assert.equal(d.kind, 'person');
  assert.deepEqual(d.roles, ['customer', 'payer']);
});

test('commission payer field seeds payer; supplier id stays supplier', () => {
  assert.deepEqual(
    inlinePartyCreateDefaults({ fieldKey: 'payer_id', commandKind: 'commission' }).roles,
    ['payer'],
  );
  assert.deepEqual(
    inlinePartyCreateDefaults({ fieldKey: 'supplier_id', commandKind: 'booking' }),
    { kind: 'supplier', roles: ['supplier'] },
  );
});
