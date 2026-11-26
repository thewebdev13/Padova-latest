import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerStatementPreview,
  formatCustomerStatementPlainText,
} from '../src/lib/customer-statement';

test('statement running balance across charges and payments', () => {
  const preview = buildCustomerStatementPreview({
    customer_name: 'Ada',
    as_of: '2026-11-25',
    entries: [
      { date: '2026-01-01', label: 'P-1 · Hotel', debit: 10000, credit: 0 },
      { date: '2026-01-02', label: 'Payment · Zelle', debit: 0, credit: 4000 },
      { date: '2026-01-03', label: 'P-2 · Flight', debit: 5000, credit: 0 },
    ],
  });
  assert.equal(preview.incomplete, false);
  assert.equal(preview.closing_balance_cents, 11000);
  assert.equal(preview.lines[0].balance_cents, 10000);
  assert.equal(preview.lines[1].balance_cents, 6000);
  assert.equal(preview.lines[2].balance_cents, 11000);
});

test('unknown amounts keep statement incomplete (never invent $0)', () => {
  const preview = buildCustomerStatementPreview({
    customer_name: 'Ada',
    as_of: '2026-11-25',
    entries: [
      { date: '2026-01-01', label: 'P-1', debit: 10000, credit: 0 },
      { date: '2026-01-02', label: 'Unknown charge', debit: null, credit: null },
    ],
  });
  assert.equal(preview.incomplete, true);
  assert.equal(preview.lines[1].charge_cents, null);
  assert.equal(preview.closing_balance_cents, 10000);
});

test('empty statement closes at zero without inventing activity', () => {
  const preview = buildCustomerStatementPreview({
    customer_name: 'Ada',
    as_of: '2026-11-25',
    entries: [],
  });
  assert.equal(preview.lines.length, 0);
  assert.equal(preview.closing_balance_cents, 0);
  assert.equal(preview.incomplete, false);
});

test('formatCustomerStatementPlainText copies running balance without inventing', () => {
  const preview = buildCustomerStatementPreview({
    customer_name: 'Ada',
    as_of: '2026-11-26',
    entries: [
      { date: '2026-01-01', label: 'P-1 · Hotel', debit: 10000, credit: 0 },
      { date: '2026-01-02', label: 'Payment · Zelle', debit: 0, credit: 4000 },
    ],
  });
  const text = formatCustomerStatementPlainText(preview);
  assert.match(text, /Statement · Ada/);
  assert.match(text, /As of 2026-11-26/);
  assert.match(text, /P-1 · Hotel/);
  assert.match(text, /Closing balance: \$60\.00/);
});
