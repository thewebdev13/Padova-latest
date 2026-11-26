import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoicePreview,
  buildInvoicePaymentReceipt,
  formatBookingFeeInvoiceLine,
  formatInvoiceCardChargeLabel,
  formatInvoicePaymentReceiptLines,
  formatInvoicePreviewPlainText,
  invoiceStatusLabel,
  normalizeInvoiceCardLastFour,
  pickInvoicePaymentReceipt,
} from '../src/lib/invoice-preview';

test('invoice preview lists item, booking charge, card charge, and total', () => {
  const preview = buildInvoicePreview({
    customer_name: 'Synthetic Customer',
    bookings: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        code: 'P-1001',
        summary: 'TLV–JFK',
        sale: 100000,
        charges: [
          { kind: 'sale', amount: 100000 },
          { kind: 'Booking fee', amount: 5000 },
          { kind: 'Card fee', amount: 2900 },
        ],
      },
    ],
  });
  assert.equal(preview.incomplete, false);
  assert.equal(preview.total_cents, 107900);
  assert.deepEqual(
    preview.lines.map((l) => l.kind),
    ['item', 'booking_charge', 'card_fee', 'total'],
  );
  assert.equal(preview.lines[0].label.includes('P-1001'), true);
  assert.equal(preview.lines.find((l) => l.kind === 'booking_charge')?.label, 'Booking Fee');
  assert.equal(preview.lines.find((l) => l.kind === 'card_fee')?.label, 'Card charge');
  assert.equal(formatInvoiceCardChargeLabel('Card fee'), 'Card charge');
  assert.equal(invoiceStatusLabel('approved'), 'Previewed');
  assert.equal(invoiceStatusLabel('draft'), 'Draft');
  assert.equal(invoiceStatusLabel('sent'), 'Sent');
});

test('ScanPay-style Booking Fee collapses equal PNR fees as N × $50', () => {
  const collapsed = formatBookingFeeInvoiceLine([
    { amount: 5000, booking_id: 'a' },
    { amount: 5000, booking_id: 'b' },
  ]);
  assert.equal(collapsed?.label, 'Booking Fee · 2 × $50.00');
  assert.equal(collapsed?.amount_cents, 10000);

  const preview = buildInvoicePreview({
    customer_name: 'Two PNR Customer',
    bookings: [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        code: 'P-A',
        sale: 40000,
        charges: [
          { kind: 'sale', amount: 40000 },
          { kind: 'Booking fee', amount: 5000 },
        ],
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        code: 'P-B',
        sale: 60000,
        charges: [
          { kind: 'sale', amount: 60000 },
          { kind: 'Booking charge', amount: 5000 },
        ],
      },
    ],
  });
  assert.equal(preview.incomplete, false);
  assert.equal(preview.total_cents, 110000);
  const feeLines = preview.lines.filter((l) => l.kind === 'booking_charge');
  assert.equal(feeLines.length, 1);
  assert.equal(feeLines[0].label, 'Booking Fee · 2 × $50.00');
  assert.equal(feeLines[0].amount_cents, 10000);
});

test('unknown sale stays incomplete and never invents zero', () => {
  const preview = buildInvoicePreview({
    customer_name: 'Unknown Price Customer',
    bookings: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'P-1002',
        sale: null,
        charges: [],
      },
    ],
  });
  assert.equal(preview.incomplete, true);
  assert.equal(preview.lines[0].amount_cents, null);
  assert.equal(preview.total_cents, null);
});

test('taxes line is informational and not double-added to total', () => {
  const preview = buildInvoicePreview({
    customer_name: 'Taxed Customer',
    bookings: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        code: 'P-1003',
        sale: 80000,
        taxes: 12000,
        charges: [{ kind: 'sale', amount: 80000 }],
      },
    ],
  });
  assert.equal(preview.incomplete, false);
  assert.equal(preview.total_cents, 80000);
  assert.ok(preview.lines.some((l) => l.kind === 'taxes' && l.amount_cents === 12000));
});

test('formatInvoicePreviewPlainText includes lines and Unknown without inventing', () => {
  const preview = buildInvoicePreview({
    customer_name: 'Copy Customer',
    bookings: [
      {
        id: '44444444-4444-4444-4444-444444444444',
        code: 'P-1004',
        sale: 50000,
        taxes: 5000,
        charges: [{ kind: 'sale', amount: 50000 }],
      },
    ],
  });
  const text = formatInvoicePreviewPlainText(preview);
  assert.match(text, /Invoice · Copy Customer/);
  assert.match(text, /P-1004/);
  assert.match(text, /\$500\.00/);
  assert.match(text, /Taxes \(informational\).*part of price/);
  assert.match(text, /Total: \$500\.00/);
  assert.equal(preview.payment, null);
  const incomplete = formatInvoicePreviewPlainText(
    buildInvoicePreview({
      customer_name: 'Partial',
      bookings: [{ id: '55555555-5555-5555-5555-555555555555', code: 'P-1005', sale: null, charges: [] }],
    }),
  );
  assert.match(incomplete, /incomplete/);
  assert.match(incomplete, /Unknown/);
});

test('ScanPay paid-invoice receipt: card last four · transaction · paid · signature', () => {
  assert.equal(normalizeInvoiceCardLastFour('4111-1111-1111-4242'), '4242');
  assert.equal(normalizeInvoiceCardLastFour('12'), null);
  const receipt = buildInvoicePaymentReceipt({
    card_last_four: '4242',
    transaction_id: 'txn_abc',
    paid_on: '2026-11-26',
    customer_signature: 'Signed by customer',
  });
  assert.deepEqual(formatInvoicePaymentReceiptLines(receipt), [
    'Card: ****4242',
    'Transaction ID: txn_abc',
    'Paid: 2026-11-26',
    'Signature: Signed by customer',
  ]);
  const unknown = formatInvoicePaymentReceiptLines(
    buildInvoicePaymentReceipt({ paid_on: 'not-a-date' }),
  );
  assert.ok(unknown.every((line) => /Unknown/.test(line)));

  const picked = pickInvoicePaymentReceipt({
    payments: [
      {
        direction: 'customer',
        paid_on: '2026-11-20',
        reference: 'old',
        account_id: 'acct',
      },
      {
        direction: 'customer',
        paid_on: '2026-11-26',
        reference: 'sp_txn_99',
        account_id: 'acct',
      },
    ],
    payment_accounts: [{ id: 'acct', last_four: '9876' }],
  });
  assert.equal(picked?.transaction_id, 'sp_txn_99');
  assert.equal(picked?.card_last_four, '9876');
  assert.equal(picked?.paid_on, '2026-11-26');
  assert.equal(picked?.customer_signature, null);

  const text = formatInvoicePreviewPlainText(
    buildInvoicePreview({
      customer_name: 'Paid Customer',
      bookings: [
        {
          id: '66666666-6666-6666-6666-666666666666',
          code: 'P-1006',
          sale: 10000,
          charges: [{ kind: 'sale', amount: 10000 }],
        },
      ],
      payment: receipt,
    }),
  );
  assert.match(text, /Payment receipt/);
  assert.match(text, /Card: \*\*\*\*4242/);
  assert.match(text, /Transaction ID: txn_abc/);
});
