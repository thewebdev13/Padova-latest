import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  paymentLooksRepeated,
  paymentLooksRepeatedLabel,
  possibleDuplicatePaymentPeers,
} from '../src/lib/payment-duplicate-flag';

test('flags same party·amount·method within day window', () => {
  const peers = possibleDuplicatePaymentPeers([
    {
      id: 'a',
      party_id: 'p1',
      direction: 'customer',
      current_amount: 10000,
      method: 'Zelle',
      paid_on: '2026-11-20',
    },
    {
      id: 'b',
      party_id: 'p1',
      direction: 'customer',
      current_amount: 10000,
      method: 'zelle',
      paid_on: '2026-11-21',
    },
    {
      id: 'c',
      party_id: 'p1',
      direction: 'customer',
      current_amount: 10000,
      method: 'Zelle',
      paid_on: '2026-11-28',
    },
    {
      id: 'd',
      party_id: 'p2',
      direction: 'customer',
      current_amount: 10000,
      method: 'Zelle',
      paid_on: '2026-11-20',
    },
  ]);
  assert.deepEqual(peers.get('a'), ['b']);
  assert.deepEqual(peers.get('b'), ['a']);
  assert.equal(peers.has('c'), false);
  assert.equal(peers.has('d'), false);
  assert.equal(paymentLooksRepeated('a', peers), true);
  assert.equal(paymentLooksRepeated('c', peers), false);
  assert.equal(paymentLooksRepeatedLabel(1), 'Looks repeated');
  assert.equal(paymentLooksRepeatedLabel(2), 'Looks repeated · 2 matches');
});

test('skips unknown amount or missing party — never invents a match', () => {
  const peers = possibleDuplicatePaymentPeers([
    {
      id: 'a',
      party_id: 'p1',
      direction: 'customer',
      current_amount: null,
      method: 'Card',
      paid_on: '2026-11-20',
    },
    {
      id: 'b',
      party_id: 'p1',
      direction: 'customer',
      current_amount: null,
      method: 'Card',
      paid_on: '2026-11-20',
    },
    {
      id: 'c',
      party_id: null,
      direction: 'customer',
      current_amount: 5000,
      method: 'Card',
      paid_on: '2026-11-20',
    },
  ]);
  assert.equal(peers.size, 0);
});

test('different method or direction does not match', () => {
  const peers = possibleDuplicatePaymentPeers([
    {
      id: 'a',
      party_id: 'p1',
      direction: 'customer',
      current_amount: 5000,
      method: 'Zelle',
      paid_on: '2026-11-20',
    },
    {
      id: 'b',
      party_id: 'p1',
      direction: 'customer',
      current_amount: 5000,
      method: 'Check',
      paid_on: '2026-11-20',
    },
    {
      id: 'c',
      party_id: 'p1',
      direction: 'supplier',
      current_amount: 5000,
      method: 'Zelle',
      paid_on: '2026-11-20',
    },
  ]);
  assert.equal(peers.size, 0);
});
