import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInvoiceEmailBodies,
  formatInvoiceWhatsAppOwnerCopy,
  invoiceSendNote,
  resolveInvoiceRecipientEmail,
} from '../src/lib/invoice-mail';
import {
  buildInvoicePreview,
  canSendInvoiceEmail,
  canMarkInvoiceSent,
  canApproveInvoice,
} from '../src/lib/invoice-preview';

test('Plan send gate: email only after previewed (approved)', () => {
  assert.equal(canApproveInvoice('draft'), true);
  assert.equal(canSendInvoiceEmail('draft'), false);
  assert.equal(canSendInvoiceEmail('approved'), true);
  assert.equal(canMarkInvoiceSent('approved'), true);
  assert.equal(canSendInvoiceEmail('sent'), false);
});

test('resolveInvoiceRecipientEmail never invents an address', () => {
  assert.equal(resolveInvoiceRecipientEmail(null), null);
  assert.equal(resolveInvoiceRecipientEmail(''), null);
  assert.equal(resolveInvoiceRecipientEmail('not-an-email'), null);
  assert.equal(resolveInvoiceRecipientEmail('a@b.co'), 'a@b.co');
  assert.equal(resolveInvoiceRecipientEmail('a@b.co', 'Other@X.com'), 'other@x.com');
  assert.equal(resolveInvoiceRecipientEmail(null, 'bad'), null);
});

test('invoice email + WhatsApp Owner copy include preview text; WA is not auto-send', () => {
  const preview = buildInvoicePreview({
    customer_name: 'Send Test Customer',
    bookings: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        code: 'SEND1',
        summary: 'Test',
        sale: 10000,
        charges: [{ kind: 'sale', amount: 10000 }],
      },
    ],
  });
  const mail = buildInvoiceEmailBodies(preview);
  assert.match(mail.subject, /Send Test Customer/);
  assert.match(mail.text, /Owner approval/i);
  assert.match(mail.text, /\$100\.00|100\.00/);
  const wa = formatInvoiceWhatsAppOwnerCopy(preview);
  assert.match(wa, /does not send WhatsApp automatically/i);
  assert.match(wa, /Send Test Customer/);
  assert.match(
    invoiceSendNote({ to: 'a@b.co', whatsappCopyNoted: true }),
    /clipboard; not auto-sent/i,
  );
});
