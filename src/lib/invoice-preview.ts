/**
 * Plan v1 Phase 4 — in-app invoice draft/preview (no auto-send).
 * Layout: item lines, booking charge, card charge, optional taxes, total.
 * ScanPay-style: Booking Fee is one line — e.g. 2 × $50 when equal PNR fees.
 * Owner sample layout still ☐ open — this matches Plan wording only.
 */

export type InvoiceCharge = {
  kind: string;
  amount: number;
};

export type InvoiceBookingInput = {
  id: string;
  code: string;
  summary?: string;
  product?: string;
  sale?: number | null;
  taxes?: number | null;
  charges: InvoiceCharge[];
};

export type InvoiceLine = {
  kind: 'item' | 'booking_charge' | 'card_fee' | 'taxes' | 'other' | 'total';
  label: string;
  booking_id?: string;
  amount_cents: number | null;
};

/** Plan / ScanPay paid-invoice footer: card last four, transaction ID, paid date, signature. */
export type InvoicePaymentReceipt = {
  card_last_four: string | null;
  transaction_id: string | null;
  paid_on: string | null;
  customer_signature: string | null;
};

export type InvoicePreview = {
  customer_name: string;
  lines: InvoiceLine[];
  subtotal_cents: number | null;
  total_cents: number | null;
  incomplete: boolean;
  /** Present when a payment receipt is attached (paid-invoice layout). */
  payment: InvoicePaymentReceipt | null;
};

function isBookingCharge(kind: string) {
  return /booking\s*fee|booking\s*charge|pnr\s*fee/i.test(kind);
}

function isCardFee(kind: string) {
  return /card\s*fee|card\s*charge|processor\s*fee/i.test(kind);
}

function isSaleLine(kind: string) {
  return /^sale$/i.test(kind.trim());
}

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Plan / ScanPay: one Booking Fee line — e.g. "Booking Fee · 2 × $50.00" when equal PNR fees.
 * Mixed amounts keep a single line with the exact total (never invent unit fee).
 */
export function formatBookingFeeInvoiceLine(
  fees: Array<{ amount: number; booking_id?: string }>,
): InvoiceLine | null {
  if (!fees.length) return null;
  const amounts = fees.map((f) => f.amount);
  if (amounts.some((a) => a == null || !Number.isFinite(a))) {
    return {
      kind: 'booking_charge',
      label: 'Booking Fee (incomplete)',
      amount_cents: null,
    };
  }
  const total = amounts.reduce((s, a) => s + Math.trunc(a), 0);
  const unit = Math.trunc(amounts[0]);
  const allSame = amounts.every((a) => Math.trunc(a) === unit);
  const count = fees.length;
  let label = 'Booking Fee';
  if (count > 1 && allSame) {
    label = `Booking Fee · ${count} × ${formatUsdCents(unit)}`;
  } else if (count > 1) {
    label = `Booking Fee · ${count} PNRs`;
  }
  return {
    kind: 'booking_charge',
    label,
    amount_cents: total,
    ...(fees[0].booking_id ? { booking_id: fees[0].booking_id } : {}),
  };
}

/** Last four digits only — never invent when fewer than 4 digits known. */
export function normalizeInvoiceCardLastFour(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function buildInvoicePaymentReceipt(input: {
  card_last_four?: unknown;
  transaction_id?: unknown;
  paid_on?: unknown;
  customer_signature?: unknown;
}): InvoicePaymentReceipt {
  const paidRaw = String(input.paid_on ?? '').trim().slice(0, 10);
  const paid_on = /^\d{4}-\d{2}-\d{2}$/.test(paidRaw) ? paidRaw : null;
  const transaction_id = String(input.transaction_id ?? '').trim().slice(0, 120) || null;
  const customer_signature = String(input.customer_signature ?? '').trim().slice(0, 200) || null;
  return {
    card_last_four: normalizeInvoiceCardLastFour(input.card_last_four),
    transaction_id,
    paid_on,
    customer_signature,
  };
}

/** Plain-text ScanPay-style receipt lines; Unknown when a field is blank. */
export function formatInvoicePaymentReceiptLines(
  payment: InvoicePaymentReceipt | null | undefined,
): string[] {
  if (!payment) return [];
  return [
    payment.card_last_four ? `Card: ****${payment.card_last_four}` : 'Card: Unknown',
    payment.transaction_id
      ? `Transaction ID: ${payment.transaction_id}`
      : 'Transaction ID: Unknown',
    payment.paid_on ? `Paid: ${payment.paid_on}` : 'Paid: Unknown',
    payment.customer_signature
      ? `Signature: ${payment.customer_signature}`
      : 'Signature: Unknown',
  ];
}

/**
 * Prefer newest customer Card receipt for paid-invoice footer.
 * Blank fields stay Unknown — never invent last-four or signature.
 */
export function pickInvoicePaymentReceipt(input: {
  payments?: Array<{
    direction?: string | null;
    paid_on?: string | null;
    method?: string | null;
    reference?: string | null;
    account_id?: string | null;
  }> | null;
  payment_accounts?: Array<{ id?: string; last_four?: string | null }> | null;
  customer_signature?: string | null;
}): InvoicePaymentReceipt | null {
  const rows = (input.payments ?? [])
    .filter((p) => String(p.direction || '') === 'customer')
    .slice()
    .sort((a, b) => String(b.paid_on || '').localeCompare(String(a.paid_on || '')));
  const pay = rows[0];
  if (!pay) return null;
  const account = (input.payment_accounts ?? []).find((a) => a.id && a.id === pay.account_id);
  return buildInvoicePaymentReceipt({
    card_last_four: account?.last_four,
    transaction_id: pay.reference,
    paid_on: pay.paid_on,
    customer_signature: input.customer_signature,
  });
}

/** Build a customer invoice preview from booking charges. Unknown stays null — never invent $0. */
export function buildInvoicePreview(input: {
  customer_name: string;
  bookings: InvoiceBookingInput[];
  payment?: InvoicePaymentReceipt | null;
}): InvoicePreview {
  const lines: InvoiceLine[] = [];
  let incomplete = false;
  let sum = 0;
  let anyAmount = false;
  const collectedBookingFees: Array<{ amount: number; booking_id: string }> = [];

  for (const b of input.bookings) {
    const saleCharges = b.charges.filter((c) => isSaleLine(c.kind));
    const bookingFees = b.charges.filter((c) => isBookingCharge(c.kind));
    const cardFees = b.charges.filter((c) => isCardFee(c.kind));
    const other = b.charges.filter(
      (c) => !isSaleLine(c.kind) && !isBookingCharge(c.kind) && !isCardFee(c.kind),
    );

    if (saleCharges.length) {
      for (const c of saleCharges) {
        lines.push({
          kind: 'item',
          label: `${b.code}${b.summary ? ` · ${b.summary}` : ''}`,
          booking_id: b.id,
          amount_cents: c.amount,
        });
        sum += c.amount;
        anyAmount = true;
      }
    } else if (b.sale == null) {
      lines.push({
        kind: 'item',
        label: `${b.code}${b.summary ? ` · ${b.summary}` : ''} (price unknown)`,
        booking_id: b.id,
        amount_cents: null,
      });
      incomplete = true;
    } else {
      lines.push({
        kind: 'item',
        label: `${b.code}${b.summary ? ` · ${b.summary}` : ''}`,
        booking_id: b.id,
        amount_cents: b.sale,
      });
      sum += b.sale;
      anyAmount = true;
    }

    for (const c of bookingFees) {
      collectedBookingFees.push({ amount: c.amount, booking_id: b.id });
    }
    for (const c of cardFees) {
      lines.push({
        kind: 'card_fee',
        label: formatInvoiceCardChargeLabel(c.kind),
        booking_id: b.id,
        amount_cents: c.amount,
      });
      sum += c.amount;
      anyAmount = true;
    }
    for (const c of other) {
      lines.push({
        kind: 'other',
        label: c.kind || 'Charge',
        booking_id: b.id,
        amount_cents: c.amount,
      });
      sum += c.amount;
      anyAmount = true;
    }

    if (b.taxes != null && Number.isFinite(b.taxes) && b.taxes > 0) {
      lines.push({
        kind: 'taxes',
        label: 'Taxes (informational)',
        booking_id: b.id,
        amount_cents: b.taxes,
      });
      // Taxes are part of price when present — do not double-add into total when sale already includes them.
    }
  }

  const feeLine = formatBookingFeeInvoiceLine(collectedBookingFees);
  if (feeLine) {
    // Insert after item lines, before card/other/taxes already appended — rebuild order:
    // items first (already in lines mixed with card/other/taxes). Split and reorder.
    const items = lines.filter((l) => l.kind === 'item');
    const rest = lines.filter((l) => l.kind !== 'item');
    lines.length = 0;
    lines.push(...items);
    lines.push(feeLine);
    lines.push(...rest);
    if (feeLine.amount_cents == null) {
      incomplete = true;
    } else {
      sum += feeLine.amount_cents;
      anyAmount = true;
    }
  }

  const total = anyAmount && !incomplete ? sum : anyAmount ? sum : null;
  lines.push({
    kind: 'total',
    label: incomplete ? 'Total (incomplete)' : 'Total',
    amount_cents: anyAmount ? sum : null,
  });

  return {
    customer_name: input.customer_name,
    lines,
    subtotal_cents: anyAmount ? sum : null,
    total_cents: total,
    incomplete,
    payment: input.payment ?? null,
  };
}

export const INVOICE_STATUSES = ['draft', 'approved', 'sent', 'voided'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Plan invoice wording: draft · previewed · sent (DB keeps `approved` for previewed).
 * Never invents a status.
 */
export function invoiceStatusLabel(status: string | null | undefined): string {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (s === 'draft') return 'Draft';
  if (s === 'approved') return 'Previewed';
  if (s === 'sent') return 'Sent';
  if (s === 'voided') return 'Voided';
  return String(status || '').trim() || 'Unknown';
}

/** Plan invoice line: card charge (stored charge kind may still say Card fee). */
export function formatInvoiceCardChargeLabel(kind: string | null | undefined): string {
  const k = String(kind || '').trim();
  if (!k || /^card\s*(fee|charge)$/i.test(k)) return 'Card charge';
  return k;
}

/** Plan: draft → Owner previewed → send (email) or mark sent. Never auto-email. */
export function canApproveInvoice(status: string): boolean {
  return status === 'draft';
}

export function canMarkInvoiceSent(status: string): boolean {
  return status === 'approved';
}

/** Plan: system email to customer only after Owner marks previewed (`approved` in DB). */
export function canSendInvoiceEmail(status: string): boolean {
  return status === 'approved';
}

export function canVoidInvoice(status: string): boolean {
  return status === 'draft' || status === 'approved';
}

export function invoiceBookingIds(lines: InvoiceLine[]): string[] {
  return [
    ...new Set(lines.map((l) => l.booking_id).filter((id): id is string => Boolean(id))),
  ];
}

function formatInvoiceCents(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return 'Unknown';
  const n = cents / 100;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Plan: Owner may copy invoice text for WhatsApp / email — never auto-sends.
 * Taxes lines are labeled informational; Unknown stays Unknown.
 */
export function formatInvoicePreviewPlainText(preview: InvoicePreview): string {
  const rows = preview.lines.map((line) => {
    const amount = formatInvoiceCents(line.amount_cents);
    if (line.kind === 'taxes') return `${line.label}: ${amount} (part of price; not extra)`;
    if (line.kind === 'total') return `${line.label}: ${amount}`;
    return `${line.label}: ${amount}`;
  });
  const header = [
    `Invoice · ${preview.customer_name}`,
    preview.incomplete ? 'Status: incomplete (some amounts Unknown)' : null,
    '',
  ].filter((x) => x != null) as string[];
  const receipt = formatInvoicePaymentReceiptLines(preview.payment);
  if (!receipt.length) return [...header, ...rows].join('\n');
  return [...header, ...rows, '', 'Payment receipt', ...receipt].join('\n');
}

/** Owner WhatsApp paste — never auto-sent (PC helper is receive-only). Client-safe. */
export function formatInvoiceWhatsAppOwnerCopy(preview: InvoicePreview): string {
  return [
    `Padova invoice (Owner copy) · ${preview.customer_name}`,
    'Paste into Owner WhatsApp only — system does not send WhatsApp automatically.',
    '',
    formatInvoicePreviewPlainText(preview),
  ].join('\n');
}
