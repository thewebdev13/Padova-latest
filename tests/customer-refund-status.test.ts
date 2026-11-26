import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chargebackStatusLabel,
  customerRefundStatus,
  customerRefundStatusLabel,
  formatChargebackTag,
  parseChargebackStatus,
  withChargebackInText,
} from '../src/lib/customer-refund-status';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('customer refund owed until paid + handed_over covers due', () => {
  assert.equal(
    customerRefundStatus({ customer_due: 90000, paid: 0, handed_over: 0 }),
    'owed',
  );
  assert.equal(
    customerRefundStatus({ customer_due: 90000, paid: 50000, handed_over: 40000 }),
    'paid',
  );
  assert.equal(customerRefundStatusLabel('owed'), 'Owed');
  assert.equal(customerRefundStatusLabel('paid'), 'Paid');
});

test('unknown customer due stays Incomplete — never invent paid', () => {
  assert.equal(
    customerRefundStatus({ customer_due: null, paid: 0, handed_over: 0 }),
    'incomplete',
  );
  assert.equal(customerRefundStatusLabel('incomplete'), 'Incomplete');
});

test('chargeback status parses from reason / notes text', () => {
  assert.equal(parseChargebackStatus('Card pullback\nChargeback: disputed'), 'disputed');
  assert.equal(parseChargebackStatus('Chargeback: won'), 'won');
  assert.equal(chargebackStatusLabel('lost'), 'Chargeback lost');
  assert.equal(parseChargebackStatus('no marker here'), null);
});

test('withChargebackInText appends Plan marker without inventing', () => {
  assert.equal(formatChargebackTag('disputed'), 'Chargeback: disputed');
  assert.equal(withChargebackInText('Customer cancelled', 'won'), 'Customer cancelled\nChargeback: won');
  assert.equal(withChargebackInText('', 'lost'), 'Chargeback: lost');
  assert.equal(withChargebackInText('Chargeback: disputed\nNotes', 'won'), 'Notes\nChargeback: won');
  assert.equal(withChargebackInText('Chargeback: disputed\nNotes', ''), 'Notes');
  assert.equal(withChargebackInText('plain', null), 'plain');
  const form = readFileSync(join(process.cwd(), 'src/components/command-form.tsx'), 'utf8');
  assert.match(form, /chargeback_status[\s\S]*disputed[\s\S]*won[\s\S]*lost/);
  const finance = readFileSync(join(process.cwd(), 'src/lib/finance.ts'), 'utf8');
  assert.match(finance, /withChargebackInText/);
});
