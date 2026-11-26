import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_METHOD_OTHER,
  PAYMENT_METHODS,
  mergePaymentMethodOptions,
  resolvePaymentMethod,
} from '../src/lib/entry-options';

test('Plan payment methods merge owner-added names + Other…', () => {
  const opts = mergePaymentMethodOptions([
    'Zelle',
    'Venmo',
    '',
    '  Wise  ',
    'Other…',
  ]);
  assert.ok(opts.includes('Zelle'));
  assert.ok(opts.includes('Card'));
  assert.ok(opts.includes('PayPal'));
  assert.ok(opts.includes('Venmo'));
  assert.ok(opts.includes('Wise'));
  assert.equal(opts.filter((o) => o === 'Zelle').length, 1);
  assert.equal(opts[opts.length - 1], PAYMENT_METHOD_OTHER);
  assert.ok(PAYMENT_METHODS.includes('Cash'));
});

test('resolvePaymentMethod requires custom name for Other…', () => {
  assert.equal(resolvePaymentMethod('Zelle'), 'Zelle');
  assert.equal(resolvePaymentMethod(PAYMENT_METHOD_OTHER, 'Venmo'), 'Venmo');
  assert.equal(resolvePaymentMethod(PAYMENT_METHOD_OTHER, '  '), '');
  assert.equal(resolvePaymentMethod('Other', 'Apple Cash'), 'Apple Cash');
});
