import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database, one } from '@/lib/db';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import {
  buildInvoiceEmailBodies,
  formatInvoiceWhatsAppOwnerCopy,
  invoiceMailConfigured,
  invoiceSendNote,
  resolveInvoiceRecipientEmail,
  sendInvoiceCustomerEmail,
} from '@/lib/invoice-mail';
import {
  canSendInvoiceEmail,
  type InvoiceLine,
  type InvoicePreview,
} from '@/lib/invoice-preview';
import { AccessError } from '@/lib/users';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';

function previewFromDraft(inv: {
  customer_name: string;
  lines: unknown;
  total_cents: number | null;
  incomplete: boolean;
}): InvoicePreview {
  const lines = (
    typeof inv.lines === 'string' ? JSON.parse(inv.lines) : inv.lines
  ) as InvoiceLine[];
  return {
    customer_name: inv.customer_name,
    lines: Array.isArray(lines) ? lines : [],
    subtotal_cents: inv.total_cents,
    total_cents: inv.total_cents,
    incomplete: Boolean(inv.incomplete),
    payment: null,
  };
}

/**
 * Plan: email invoice to customer only after Owner marks previewed.
 * WhatsApp Owner copy is returned for clipboard — never auto-sent.
 */
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (actor.role !== 'OWNER')
      return NextResponse.json(
        { error: 'Only an Owner can email an invoice to a customer' },
        { status: 403 },
      );
    validateOrigin(request);
    const body = await readJSON(request);
    const invoiceId = String(body.invoice_id || '').trim();
    if (!invoiceId)
      return NextResponse.json({ error: 'invoice_id required' }, { status: 400 });

    const db = await database();
    const inv = await one(db, 'SELECT * FROM invoice_drafts WHERE id=$1', [invoiceId]);
    if (!canSendInvoiceEmail(inv.status))
      return NextResponse.json(
        {
          error:
            'Mark previewed first. Invoices are emailed from the system only after Owner approval.',
        },
        { status: 400 },
      );

    const party = await one(db, 'SELECT id, email, name FROM parties WHERE id=$1', [
      inv.customer_id,
    ]);
    const to = resolveInvoiceRecipientEmail(party.email, body.to);
    if (!to)
      return NextResponse.json(
        {
          error:
            'Customer email is Unknown — add an email on the person, or pass to=, before sending.',
        },
        { status: 400 },
      );

    if (!invoiceMailConfigured())
      return NextResponse.json(
        {
          error:
            'Outbound mail is not configured (Resend or Gmail send). Use Mark sent without email, or configure mail.',
          mail_configured: false,
        },
        { status: 503 },
      );

    const preview = previewFromDraft({
      customer_name: String(inv.customer_name || ''),
      lines: inv.lines,
      total_cents: inv.total_cents == null ? null : Number(inv.total_cents),
      incomplete: Boolean(inv.incomplete),
    });
    const bodies = buildInvoiceEmailBodies(preview);
    const accepted = await sendInvoiceCustomerEmail({
      to,
      customerName: preview.customer_name,
      plainText: bodies.text,
      subject: bodies.subject,
    });
    if (!accepted)
      return NextResponse.json(
        { error: 'Mail provider did not accept the message; invoice left Previewed (not Sent)' },
        { status: 502 },
      );

    const noteWhatsapp = Boolean(body.prepare_whatsapp_copy);
    const note = invoiceSendNote({ to, whatsappCopyNoted: noteWhatsapp });
    const sent = await execute(db, actor, {
      id: randomUUID(),
      kind: 'invoice_mark_sent',
      data: {
        invoice_id: invoiceId,
        note,
        sent_to: to,
        whatsapp_copy_noted: noteWhatsapp,
      },
    });

    return NextResponse.json({
      result: {
        id: sent.id,
        status: sent.status,
        sent_to: to,
        whatsapp_copy: noteWhatsapp ? formatInvoiceWhatsAppOwnerCopy(preview) : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invoice send failed';
    return NextResponse.json(
      {
        error: databaseUnavailable(e) ? temporarilyUnavailable : message,
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : databaseUnavailable(e)
              ? 503
              : 400,
      },
    );
  }
}
