import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  sourceDelta,
  exactCents,
  scalar,
  cell,
  value,
  roster,
  normalizedName,
  locatorKey,
  type R,
} from './lib/historical-reconciliation';
import { prepareHistoricalRows, historicalTravelerCell } from '../src/lib/historical-preparation';
import { confirmedCustomerGroups } from '../src/lib/test-reference';
import { sourceFingerprint } from '../src/lib/historical-delta';

const input = process.argv[2],
  output = process.argv[3];
if (!input || !output)
  throw new Error('Supply a fresh private capture and a new private output directory');
const base = path.resolve('.data/historical-cutover');
for (const p of [input, output])
  if (!path.resolve(p).startsWith(base + path.sep))
    throw new Error('Private historical workspace required');
await mkdir(output, { recursive: true });
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const write = async (n: string, v: unknown) =>
  writeFile(path.join(output, n), JSON.stringify(v, null, 2));
const tables = '.data/drive-readback-unpacked/evidence/tables';
const rows: R[] = await read(`${input}/source-row-snapshots.json`),
  old: R[] = await read(`${base}/current-cells-1793231255605/source-row-snapshots.json`);
const paused: R[] = await read(
  `${base}/current-cells-20261031-final-reconciliation/source-row-snapshots.json`,
);
const previous: R[] = await read(`${base}/prepared-bookings/migration-mappings.json`),
  targets: R[] = await read(`${base}/prepared-bookings/bookings.json`);
const capture = await read(`${base}/capture.json`);
const evidence = (name: string) => {
  const file = capture.files.find((f: R) => f.path === `tables/${name}.json`);
  return capture.evidence.filter((e: R) => e.file_id === file?.id);
};
const aliases = confirmedCustomerGroups(evidence('customer_aliases'), evidence('owner_decisions'));
const canonical = (n: string) => normalizedName(aliases.resolve(n)?.name ?? n);
const checksummedInputs = [
  `${input}/source-row-snapshots.json`,
  `${base}/prepared-bookings/migration-mappings.json`,
  `${base}/prepared-bookings/bookings.json`,
  `${tables}/owner_decisions.json`,
  `${tables}/customer_aliases.json`,
  `${tables}/allocations_current.json`,
  `${tables}/payments_current.json`,
  `${tables}/bank_transactions.json`,
];
const sha = async (p: string) =>
  createHash('sha256')
    .update(await readFile(p))
    .digest('hex');
const preservation = await Promise.all(
  checksummedInputs.map(async (file) => ({ file, sha256: await sha(file) })),
);
const delta = sourceDelta(old, rows),
  sincePause = sourceDelta(paused, rows);
const previousByKey = new Map(previous.map((r) => [r.sourceKey, r]));
const changes = delta.changed.map((r) => ({ ...r, priorMapping: previousByKey.get(r.key) }));
await write('source-delta.json', {
  newLocators: delta.added,
  changed: changes,
  missing: delta.missing,
  sincePause,
});
const proposals = prepareHistoricalRows(rows, (n) => aliases.resolve(n)?.name, previous as any);
const changedKeys = new Set(delta.changed.map((r) => r.key));
// The installed, accepted decision is immutable. Changes are amendments, never replacement decisions.
const mappings = rows.map((r) => {
  const prior = previousByKey.get(locatorKey(r));
  const proposed = proposals.mappings.find((p) => p.sourceKey === locatorKey(r));
  return {
    sourceKey: locatorKey(r),
    priorMapping: prior,
    proposedMapping: proposed,
    decision:
      prior && !changedKeys.has(locatorKey(r))
        ? 'Preserve existing decision'
        : prior
          ? 'Amendment review; retain existing target and history'
          : 'New source review',
    targetId: prior?.targetId ?? proposed?.targetId,
  };
});
await write('mapping-amendments.json', mappings);

const held = await read('.data/traveler-reconciliation/result.json');
const byLocator = new Map(rows.map((r) => [locatorKey(r), r]));
const referenceColumns: Record<string, string[]> = {
  accounting: ['N', 'O', 'P', 'R'],
  '2026 accounting': ['O', 'Q'],
  GDS: ['H', 'I'],
  'cap1 elal': ['J', 'L'],
  Cancellations: ['B'],
  stef: ['K'],
  tranactions: ['B'],
};
const references = (r: R) => [
  ...new Set(
    (referenceColumns[r.tab] ?? [])
      .flatMap(
        (c) =>
          String(value(r, c) ?? '')
            .toUpperCase()
            .match(/\b[A-Z0-9]{6,12}\b/g) ?? [],
      )
      .filter((s) => /[A-Z]/.test(s) && !/^\d/.test(s)),
  ),
];
const context = new Map<string, { name: string; source: string }[]>();
for (const r of rows) {
  const t = historicalTravelerCell(r);
  if (!t) continue;
  const parsed = roster(t.raw);
  for (const ref of references(r)) {
    const a = context.get(ref) ?? [];
    a.push(...parsed.names.map((name) => ({ name, source: locatorKey(r) })));
    context.set(ref, a);
  }
}
const travelerResolutions = held.held.map((h: R) => {
  const current = byLocator.get(JSON.stringify([h.source.workbook_id, h.source.tab, h.source.row]));
  const parsed = roster(h.source.raw_text);
  const resolutions: R[] = [];
  if (current && parsed.unresolved.length) {
    const options = references(current)
      .flatMap((ref) => context.get(ref) ?? [])
      .filter((x) => x.source !== locatorKey(current));
    const all = [...new Map(options.map((x) => [normalizedName(x.name), x])).values()];
    for (const fragment of parsed.unresolved) {
      const fragments = fragment.split(/\s*\/\s*/);
      const matched = fragments.map((part) => {
        const words = normalizedName(part)
          .split(/[^\p{L}']+/u)
          .filter(Boolean);
        return all.filter((x) =>
          words.every((w) => normalizedName(x.name).split(/\s+/).includes(w)),
        );
      });
      if (
        matched.every((c) => c.length === 1) &&
        new Set(matched.map((c) => normalizedName(c[0].name))).size === matched.length
      ) {
        for (const candidates of matched) {
          parsed.names.push(candidates[0].name);
          resolutions.push({
            fragment,
            ...candidates[0],
            basis:
              'Exact tokens and same booking reference in another source row; no cross-booking identity merge',
          });
        }
      }
    }
    parsed.unresolved = parsed.unresolved.filter((x) => !resolutions.some((r) => r.fragment === x));
  }
  return {
    ...h,
    parsed,
    corroboration: resolutions,
    decision: parsed.unresolved.length
      ? 'Preserve partial traveler claim; no identity merge'
      : parsed.names.length
        ? 'Resolve roster notation; retain raw claim and qualifiers'
        : 'Retain as group/header/supporting text; do not invent a person',
  };
});
// Independently read carrier/portal messages supply the two remaining partial labels.
const rosterMail = await read(`${input}/roster-mail-evidence.json`);
const mailText = (m: R): string => {
  const walk = (p: R): R[] => [p, ...(p.parts ?? []).flatMap(walk)];
  return walk(m.payload)
    .filter((p) => /^text\//.test(p.mime_type))
    .map((p) => p.body?.content ?? '')
    .join(' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
};
for (const decision of await read(`${input}/roster-confirmation-decisions.json`)) {
  const message = rosterMail.structuredContent.responses.find((m: R) => m.id === decision.message);
  const text = message ? mailText(message) : '';
  const nameSupported = text.toUpperCase().includes(decision.match_text.toUpperCase());
  if (!text.includes(decision.reference) || !nameSupported)
    throw new Error('Carrier evidence no longer corroborates roster decision');
  for (const resolution of travelerResolutions) {
    const r = byLocator.get(
      JSON.stringify([resolution.source.workbook_id, resolution.source.tab, resolution.source.row]),
    );
    if (
      r &&
      references(r).includes(decision.reference) &&
      resolution.parsed.unresolved.includes(decision.fragment)
    ) {
      resolution.parsed.names.push(decision.name);
      resolution.parsed.unresolved = resolution.parsed.unresolved.filter(
        (x: string) => x !== decision.fragment,
      );
      resolution.corroboration.push({
        ...decision,
        basis:
          'Full passenger name and exact booking reference in original carrier/portal confirmation',
      });
      resolution.decision =
        'Resolve partial roster from primary carrier evidence; no cross-booking identity merge';
    }
  }
}
await write('traveler-resolutions.json', travelerResolutions);

const bank: R[] = await read(`${tables}/bank_transactions.json`),
  primary: R[] = await read(`${output}/bank-primary-pages.json`);
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const usedLines = new Set<string>();
const bankChecks: R[] = bank.map((b) => {
  const pdf = primary.find((p) => p.file === b.statement),
    page = pdf?.pages.find((p: R) => p.page === b.page);
  const text = compact(page?.text ?? '');
  const description = compact(b.description);
  const matches: number[] = [];
  let at = text.indexOf(description);
  while (at >= 0) {
    matches.push(at);
    at = text.indexOf(description, at + description.length);
  }
  const date = b.date.slice(5).replace('-', ''),
    amount = String(b.amount_cents);
  const contexts = matches.map((at) => ({
    at,
    text: text.slice(Math.max(0, at - 12), at + description.length + 45),
  }));
  const exact = contexts.filter((c) => c.text.includes(date) && c.text.includes(amount));
  const lines = (page?.text ?? '')
    .split('\n')
    .map((text: string, index: number) => ({ text, index }))
    .filter(
      (l: R) =>
        l.text.startsWith(b.date.slice(5).replace('-', '/')) &&
        compact(l.text).includes(description) &&
        exactCents(l.text.match(/(-?\d[\d,]*\.\d{2})\s*$/)?.[1]) === b.amount_cents &&
        !usedLines.has(`${b.statement}:${b.page}:${l.index}`),
    );
  const line = lines[0];
  if (line) usedLines.add(`${b.statement}:${b.page}:${line.index}`);
  return {
    ...b,
    primaryCheck: {
      pdf_sha256: pdf?.sha256,
      page: b.page,
      descriptionFound: matches.length > 0,
      dateFound: contexts.some((c) => c.text.includes(date)),
      amountFound: contexts.some((c) => c.text.includes(amount)) || !!line,
      verified: !!line || exact.length === 1,
      physicalLine: line?.index ?? null,
      matchOffset: exact[0]?.at ?? null,
    },
  };
});
const duplicateBankKeys = bankChecks.filter(
  (b, i) => bankChecks.findIndex((x) => x.bank_id === b.bank_id) !== i,
);
if (duplicateBankKeys.length) throw new Error('Duplicate stable bank identity');
await write('bank-verification.json', bankChecks);
const statementControls = primary.map((pdf) => {
  const text = pdf.pages[0].text;
  const amount = (label: string) => {
    const line = text.split('\n').find((s: string) => s.startsWith(label));
    return line ? exactCents(line.match(/(-?\$?[\d,]+\.\d{2})\s*$/)?.[1]) : 0;
  };
  const counts = text.match(/^Ending Balance\s+(\d+)/m);
  const transactions = bankChecks.filter((b) => b.statement === pdf.file);
  const incoming = transactions
      .filter((b) => b.direction === 'incoming')
      .reduce((n, b) => n + b.amount_cents, 0),
    outgoing = transactions
      .filter((b) => b.direction === 'outgoing')
      .reduce((n, b) => n + b.amount_cents, 0),
    fees = transactions
      .filter((b) => b.direction === 'fee')
      .reduce((n, b) => n + b.amount_cents, 0);
  const opening = amount('Beginning Balance'),
    closing = amount('Ending Balance');
  return {
    file: pdf.file,
    opening_cents: opening,
    closing_cents: closing,
    incoming_cents: incoming,
    outgoing_cents: outgoing,
    fees_cents: fees,
    expected_transactions: Number(counts?.[1]),
    transactions: transactions.length,
    balanced:
      opening !== null &&
      closing !== null &&
      opening + incoming - outgoing - fees === closing &&
      incoming === amount('Deposits and Additions') &&
      outgoing === Math.abs(amount('Electronic Withdrawals') ?? 0) &&
      fees === Math.abs(amount('Fees') ?? 0) &&
      transactions.length === Number(counts?.[1]),
  };
});
if (
  statementControls.some(
    (s, i) => !s.balanced || (i > 0 && s.opening_cents !== statementControls[i - 1].closing_cents),
  )
)
  throw new Error('Primary bank monthly rollforward failed');
await write('bank-monthly-controls.json', statementControls);
const noticeEvidence = [
  await read(`${input}/bank-notice-evidence-0.json`),
  await read(`${input}/bank-notice-evidence-held.json`),
];
const notices = noticeEvidence
  .flatMap((e) => e.structuredContent.responses)
  .map((m: R) => {
    const text = mailText(m),
      ref = text.match(/Transaction number\s+([A-Za-z0-9]+)/i)?.[1],
      amount = exactCents(text.match(/Amount\s+\$([\d,.]+)/i)?.[1]);
    const memo = text.match(/Memo\s+(.+?)\s+[^.]*?is registered with/i)?.[1]?.trim();
    return {
      message_id: m.id,
      reference: ref,
      amount_cents: amount,
      memo,
      bank_id: bankChecks.find((b) => b.reference === ref && b.amount_cents === amount)?.bank_id,
    };
  })
  .filter((n) => n.reference);
await write('bank-notices.json', notices);
const payments: R[] = await read(`${tables}/payments_current.json`),
  allocations: R[] = await read(`${tables}/allocations_current.json`),
  bookings: R[] = await read(`${tables}/bookings_current.json`),
  decisions: R[] = await read(`${tables}/owner_decisions.json`);
const bankById = new Map(bankChecks.map((b) => [b.bank_id, b]));
const primaryByRow = new Map(rows.filter((r) => r.tab === 'accounting').map((r) => [r.row, r]));
const dateOf = (r: R) => {
  const c = cell(r, 'L'),
    v = scalar(c);
  return typeof v === 'number' && c?.userEnteredFormat?.numberFormat?.type?.startsWith('DATE')
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v
      : null;
};
const allocationChecks: R[] = allocations.map((a) => {
  const b = bankById.get(a.bank_id),
    booking = bookings.find((x) => x.booking_key === a.booking_key);
  const current = primaryByRow.get(Number(a.booking_key?.replace('M-', '')));
  let cents = exactCents(a.split_entered);
  const ids = a.owner_decision_ids ?? [];
  const confirmed =
    a.evidence_class === 'owner_confirmed_payment_to_booking' &&
    ids.length &&
    ids.every((id: string) => decisions.some((d) => d.decision_id === id));
  if (
    confirmed &&
    cents === null &&
    b &&
    Math.abs(Number(a.split_entered) * 100 - b.amount_cents) < 1
  )
    cents = b.amount_cents;
  const paidNote = String(booking?.original_payment_notes ?? '');
  const methodSupported =
    b &&
    ((/zelle/i.test(paidNote) && b.method === 'Zelle') ||
      (/wire/i.test(paidNote) && b.method === 'Wire') ||
      (/check/i.test(paidNote) && b.method === 'Check'));
  const customerName = canonical(booking?.customer_label ?? '');
  const payerMatches =
    b &&
    booking &&
    customerName.split(' ').length >= 2 &&
    (canonical(b.payer ?? '') === customerName ||
      (b.method === 'Wire' && normalizedName(b.payer ?? '').includes(customerName)));
  const date = current ? dateOf(current) : null;
  const days = b && date ? (Date.parse(b.date) - Date.parse(date)) / 86400000 : null;
  const candidates = b
    ? rows.filter(
        (r) =>
          r.tab === 'accounting' &&
          canonical(String(value(r, 'A') ?? '')) === customerName &&
          exactCents(value(r, 'D')) === b.amount_cents,
      )
    : [];
  const explicitReference = !!(
    b?.primaryCheck.verified &&
    b.reference &&
    !b.reference.startsWith('STATEMENT-') &&
    String(value(current ?? {}, 'E') ?? '')
      .toLowerCase()
      .includes(String(b.reference).toLowerCase()) &&
    cents !== null &&
    cents <= b.amount_cents &&
    allocations
      .filter((x) => x.bank_id === a.bank_id)
      .reduce((n, x) => n + (exactCents(x.split_entered) ?? Number.MAX_SAFE_INTEGER), 0) <=
      b.amount_cents
  );
  const uniqueExact = !!(
    b?.primaryCheck.verified &&
    cents === b.amount_cents &&
    payerMatches &&
    methodSupported &&
    candidates.length === 1 &&
    (days === null || (days >= -3 && days <= 45)) &&
    allocations.filter((x) => x.bank_id === a.bank_id).length === 1
  );
  const sourceNote = String(value(current ?? {}, 'E') ?? '');
  const noteAmounts = [...sourceNote.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => exactCents(m[0]));
  const explicitReceiptAmount = !!(
    b?.primaryCheck.verified &&
    cents === b.amount_cents &&
    noteAmounts.includes(cents) &&
    methodSupported &&
    candidates.length === 1 &&
    (days === null || (days >= -3 && days <= 45)) &&
    bankChecks.filter((x) => x.direction === 'incoming' && x.amount_cents === cents).length === 1 &&
    allocations.filter((x) => x.bank_id === a.bank_id).length === 1
  );
  const commissionNotice = notices.some(
    (n) => n.bank_id === a.bank_id && /commission/i.test(n.memo ?? ''),
  );
  const accepted =
    !commissionNotice &&
    !!b?.primaryCheck.verified &&
    cents !== null &&
    (confirmed || uniqueExact || explicitReference || explicitReceiptAmount);
  return {
    ...a,
    exact_amount_cents: cents,
    bank_verified: !!b?.primaryCheck.verified,
    prior_owner_confirmation: a.evidence_class === 'owner_confirmed_payment_to_booking',
    unique_context_match: uniqueExact,
    matchingChecks: {
      explicitReference,
      explicitReceiptAmount,
      commissionNotice,
      payerMatches,
      methodSupported,
      candidateCount: candidates.length,
      bankMethod: b?.method,
      bankAmount: b?.amount_cents,
    },
    decision: commissionNotice
      ? 'Reclassify as commission receipt; no duplicate customer sale/payment'
      : accepted
        ? 'Retain/confirm exact allocation'
        : 'Hold existing proposal; do not post',
    basis: confirmed
      ? 'Existing explicit Owner decision; primary bank verified'
      : explicitReference
        ? 'Exact original receipt reference and cent split in fresh source; primary bank verified'
        : explicitReceiptAmount
          ? 'Exact original recorded receipt amount/method and unique primary-bank amount; unique invoice, compatible known dates'
          : uniqueExact
            ? 'Exact Owner-canonical payer/customer, unique exact amount, original Padova receipt-method note; dates compatible where known'
            : 'No sufficient exact allocation evidence',
    days_after_booking: days,
  };
});
await write('allocation-verification.json', allocationChecks);
const receiptChecks = payments.map((p) => {
  const b = bankById.get(p.bank_transaction_id);
  const amount = exactCents(p.received_sum_computed);
  return {
    ...p,
    exact_amount_cents: amount,
    bank_verified: !!(
      b?.primaryCheck.verified &&
      b.direction === 'incoming' &&
      b.amount_cents === amount
    ),
    allocationCount: allocationChecks.filter(
      (a) => a.bank_id === p.bank_transaction_id && a.decision.startsWith('Retain'),
    ).length,
  };
});
await write('receipt-verification.json', receiptChecks);

const totals = (items: R[], key: string) => ({
  known: items.filter((r) => r[key] !== null && r[key] !== undefined).length,
  unknown: items.filter((r) => r[key] === null || r[key] === undefined).length,
  cents: items.reduce((n, r) => n + (r[key] ?? 0), 0),
});
const canonicalFacts = targets.map((t) => t.facts);
const tabTotals = [...new Set(rows.map((r) => r.tab))].map((tab) => {
  const list = rows.filter((r) => r.tab === tab);
  return { tab, rows: list.length, sourceClaimOnly: true, financialPostings: 0 };
});
const sourceMoney = rows
  .filter((r) => r.tab === 'accounting')
  .map((r) => ({
    sourceKey: locatorKey(r),
    row: r.row,
    sale: exactCents(value(r, 'D')),
    cost: exactCents(value(r, 'F')),
    cash: exactCents(value(r, 'G')),
    voucher_face: exactCents(value(r, 'H')),
    sale_formula: !!cell(r, 'D')?.userEnteredValue?.formulaValue,
    cost_formula: !!cell(r, 'F')?.userEnteredValue?.formulaValue,
  }));
await write('primary-source-money-claims.json', sourceMoney);
const voucherRows = rows
  .filter((r) => r.tab === 'vouchers' && r.row > 1)
  .map((r) => ({
    source: r,
    label: value(r, 'B'),
    faceText: value(r, 'B'),
    remaining: exactCents(value(r, 'C')),
    acquisitionBasis: exactCents(value(r, 'D')),
    paid: exactCents(value(r, 'E')),
    uses: ['F', 'H', 'J', 'L', 'N', 'P', 'R', 'T', 'V', 'X', 'Z']
      .map((c) => ({
        column: c,
        amount: exactCents(value(r, c)),
        note: value(r, String.fromCharCode(c.charCodeAt(0) + 1)),
      }))
      .filter((x) => x.amount !== null),
  }));
await write('voucher-register.json', voucherRows);
const relatedClaims = {
  credits: await read(`${tables}/credit_records.json`),
  commissions: await read(`${tables}/commission_referral_records.json`),
  refunds: await read(`${tables}/cancellation_refund_records.json`),
};
await write('financial-claims-preserved.json', relatedClaims);
const ownerVoucher = await read(`${output}/owner-voucher-clarification.json`);
const cardExpected = await read(`${input}/processor-receipt-assertions.json`);
const cardEvidence = await read(`${input}/${cardExpected.receipt_path}`);
const cardMessage = cardEvidence.structuredContent.responses.find(
  (m: R) => m.id === cardExpected.message_id,
);
const cardText = mailText(cardMessage);
for (const required of cardExpected.required_text)
  if (!cardText.includes(required))
    throw new Error('Original processor receipt failed expected amount/date/reference checks');
const cardReceipt = {
  message_id: cardMessage.id,
  customer_label: cardMessage.payload.headers
    .find((h: R) => h.name === 'To')
    .value.split('<')[0]
    .trim(),
  invoice: cardExpected.invoice,
  processor_transaction: cardExpected.processor_transaction,
  amount_cents: cardExpected.amount_cents,
  received_on: cardExpected.received_on,
  invoice_on: cardExpected.invoice_on,
  method: 'Card',
  last_four: cardExpected.last_four,
  allocations: cardExpected.allocations as { booking_key: string; amount_cents: number }[],
  primaryConfirmed: true,
  bank_settlement_confirmed: false,
  doNotDuplicateProcessorPayout: true,
};
if (cardReceipt.allocations.reduce((n, a) => n + a.amount_cents, 0) !== cardReceipt.amount_cents)
  throw new Error('Card receipt splits do not reconcile');
await write('processor-receipt-verification.json', cardReceipt);
const resolvedDelta = delta.changed.map((change) => {
  const mapping = mappings.find((m) => m.sourceKey === change.key)!;
  return {
    sourceKey: change.key,
    targetId: mapping.targetId ?? null,
    previousClassification: mapping.priorMapping?.status,
    changedColumns: change.columns,
    decision:
      change.tab === 'accounting'
        ? 'Owner-resolved sale/cost/consumption; receipt not inferred'
        : change.tab === 'vouchers'
          ? 'Preserve lot and source use; consumed value is not a second expense'
          : change.tab === 'Cancellations'
            ? 'Record source refund-processing note as expected settlement, not actual cash'
            : 'Inherit accepted booking target and identity decisions; retain revised price-match/source facts',
    freshSource: change.after,
    financialPostingAuthorized: false,
    requiresRepeatedOwnerDecision: false,
  };
});
await write('resolved-delta-amendments.json', resolvedDelta);
const newEconomic = delta.changed.find((c) => c.tab === 'accounting');
if (newEconomic)
  await write('new-economic-record-plan.json', {
    sourceKey: newEconomic.key,
    previouslyFormulaOnly: true,
    source: newEconomic.after,
    sale_cents: ownerVoucher.sale_cents,
    cost_cents: ownerVoucher.cost_cents,
    sale_source_precision: ownerVoucher.sale_source_precision,
    receipt: 'Unknown',
    cost_paid: 'Unknown',
    voucher_consumption_cents: ownerVoucher.cost_cents,
    consumption_is_second_cost: false,
    customer_label: value(newEconomic.after, 'A'),
    source_owner_decision: 'Direct Owner clarification in this chat',
    economic_date: dateOf(newEconomic.after),
    no_fabricated_date: true,
    productionWrites: 0,
  });
const eventInventory = targets.map((t) => ({
  target_id: t.id,
  originalFacts: t.facts,
  source_keys: previous.filter((m) => m.targetId === t.id).map((m) => m.sourceKey),
  known_source_sale_cents: t.facts.customer_sale_cents ?? null,
  known_source_cost_cents: t.facts.source_cost_cents ?? null,
  confirmed_allocations: allocationChecks
    .filter(
      (a) =>
        a.decision.startsWith('Retain') &&
        previous.some(
          (m) =>
            m.targetId === t.id &&
            m.source?.tab === 'accounting' &&
            `M-${String(m.source.row).padStart(4, '0')}` === a.booking_key,
        ),
    )
    .map((a) => ({ bank_id: a.bank_id, amount_cents: a.exact_amount_cents })),
  posted: false,
  actual_profit_certified: false,
}));
await write('historical-event-inventory.json', {
  preparedTargets: eventInventory,
  newEconomicRecord: newEconomic ? 1 : 0,
  sourceRowCoverage: rows.length,
  allOriginalMappingsPreserved: true,
  globalFinancialCertification: false,
});
await write('resolved-economic-amendments.json', {
  voucherSale: {
    ...ownerVoucher,
    loss_cents: ownerVoucher.cost_cents - ownerVoucher.sale_cents,
    consumption_is_not_second_cost: true,
    no_payment_inferred: true,
  },
  cardReceipt,
  bankCommission: {
    bank_id: notices.find((n) => /commission/i.test(n.memo ?? ''))?.bank_id,
    customer_sale_rejected: true,
    booking_link_unknown: true,
  },
  activeVoucherFace: {
    positiveRows: voucherRows.filter((v) => (v.remaining ?? 0) > 0).length,
    face_cents: voucherRows.reduce((n, v) => n + Math.max(0, v.remaining ?? 0), 0),
    ownershipAndBasisNotInferred: true,
    amountBoughtColumnIsUnverifiedSourceClaim: true,
  },
});
const sellerControls = rows
  .filter((r) => r.tab === 'accounting' && r.row > 1)
  .map((r) => ({
    sourceKey: locatorKey(r),
    source_cost_cents: exactCents(value(r, 'F')),
    source_cash_funding_cents: exactCents(value(r, 'G')),
    source_voucher_funding_cents: exactCents(value(r, 'H')),
    account_label: value(r, 'Q'),
    source_paid_note: value(r, 'E'),
    cost_is_not_supplier_payment: true,
    customer_receipt_is_not_supplier_payment: true,
    seller_obligation_created: false,
    actual_cost_certified: false,
  }));
await write('seller-cost-controls.json', sellerControls);
const relatedVersionGroups = new Map<string, R[]>();
for (const claim of Object.values(relatedClaims).flat() as R[]) {
  const key = JSON.stringify([claim.workbook, claim.tab, claim.row]);
  const group = relatedVersionGroups.get(key) ?? [];
  group.push(claim);
  relatedVersionGroups.set(key, group);
}
await write('related-claim-controls.json', {
  claimRows: Object.values(relatedClaims).flat().length,
  sourceLocatorGroups: relatedVersionGroups.size,
  multipleVersions: [...relatedVersionGroups]
    .filter(([, v]) => v.length > 1)
    .map(([key, versions]) => ({
      key,
      versions: versions.map((v) => ({
        event_id: v.event_id,
        source_version: v.source_version,
        evidence_id: v.evidence_id,
      })),
      decision: 'Versioned source claims, not additive economic events; row shifts remain possible',
    })),
  currentCaptureAuthoritative: true,
  automaticFinancialPostings: 0,
  controls: {
    expectedNotActual: true,
    deniedNotReceived: true,
    customerCreditNotCash: true,
    voucherRestorationNotNewPurchase: true,
    originalBasisNotFaceValue: true,
    commissionReceiptNotSecondCustomerSale: true,
  },
});
const groupControls = {
  sourceOpeningCredit_cents: 100397,
  duplicatePresentationNotSecondCredit: true,
  bankReceipts: [637900, 844600].map((cents) => ({
    cents,
    matches: bankChecks
      .filter((b) => b.direction === 'incoming' && b.amount_cents === cents)
      .map((b) => ({ bank_id: b.bank_id, date: b.date, verified: b.primaryCheck.verified })),
  })),
  unclearedCheckClaim_cents: 692592,
  unclearedCheckMatched: bankChecks.some(
    (b) => b.direction === 'incoming' && b.amount_cents === 692592,
  ),
  perBookingSplitsNotInvented: true,
};
await write('group-account-controls.json', groupControls);
await write('remaining-evidence.json', {
  ownerQuestionsDeferredUntilIndependentWorkComplete: true,
  requests: [
    {
      category: 'Missing current cash coverage',
      needed:
        'Chase business checking ending 2865: October 1 through latest available transaction date, PDF statement or posted-transaction export including dates, references, payers/payees and opening/closing balance; pending items separately',
    },
    {
      category: 'Card settlement and supplier payments',
      needed: `Existing transaction-level supplier card/refund settlement records through the same date; processor payout/fee reconciliation including ${cardReceipt.processor_transaction}. Do not request full card numbers or login credentials.`,
    },
  ],
  recordQuestionsResolved: [
    'Voucher sale/cost/consumption distinction',
    'Grouped card receipt date, transaction and exact approved splits',
  ],
  privateHolds: {
    unprovenEconomicDates: true,
    unknownSellerFundingLinks: true,
    activeVoucherOwnershipAndBasis: true,
    groupSplitsWithoutOriginalNotes: true,
  },
  noBulkOwnerReviewRequested: true,
});
const financial = {
  canonicalPreparedBookings: targets.length,
  sourceSaleClaims: totals(canonicalFacts, 'customer_sale_cents'),
  sourceCostClaims: totals(canonicalFacts, 'source_cost_cents'),
  verifiedBank: {
    records: bankChecks.length,
    verified: bankChecks.filter((b) => b.primaryCheck.verified).length,
    incoming_cents: bankChecks
      .filter((b) => b.primaryCheck.verified && b.direction === 'incoming')
      .reduce((n, b) => n + b.amount_cents, 0),
    outgoing_cents: bankChecks
      .filter((b) => b.primaryCheck.verified && b.direction === 'outgoing')
      .reduce((n, b) => n + b.amount_cents, 0),
    through: bank
      .map((b) => b.date)
      .sort()
      .at(-1),
  },
  receipts: {
    claims: payments.length,
    bankVerified: receiptChecks.filter((p) => p.bank_verified).length,
    cents: receiptChecks
      .filter((p) => p.bank_verified)
      .reduce((n, p) => n + (p.exact_amount_cents ?? 0), 0),
  },
  allocations: {
    proposals: allocations.length,
    ownerConfirmedRetained: allocationChecks.filter(
      (a) => a.prior_owner_confirmation && a.bank_verified && a.decision.startsWith('Retain'),
    ).length,
    independentlyResolved: allocationChecks.filter(
      (a) => !a.prior_owner_confirmation && a.decision.startsWith('Retain'),
    ).length,
    commissionReclassified: allocationChecks.filter((a) => a.matchingChecks.commissionNotice)
      .length,
    held: allocationChecks.filter(
      (a) => !a.decision.startsWith('Retain') && !a.matchingChecks.commissionNotice,
    ).length,
    ownerConfirmedPreserved: 9,
    processorConfirmedAllocations: cardReceipt.allocations.length,
    verifiedCents: allocationChecks
      .filter((a) => a.decision.startsWith('Retain'))
      .reduce((n, a) => n + (a.exact_amount_cents ?? 0), 0),
  },
  voucherRows: voucherRows.length,
  voucherBasisUnverified: voucherRows.length,
  creditClaims: relatedClaims.credits.length,
  commissionClaims: relatedClaims.commissions.length,
  refundClaims: relatedClaims.refunds.length,
  actualCostAndProfitCertified: false,
  unverifiedPaymentsNotZero: true,
  deniedAndExpectedCreditsPosted: 0,
  financialProductionWrites: 0,
};
for (const original of preservation)
  if ((await sha(original.file)) !== original.sha256)
    throw new Error('An immutable prior input changed');
const report = {
  generatedAt: new Date().toISOString(),
  productFrozenAt: 'ab7fa8099d82d1671d01515621b73b715edccf3c',
  sourceRows: rows.length,
  delta: {
    newLocators: delta.added.length,
    changed: delta.changed.length,
    missing: delta.missing.length,
    changesSincePause: sincePause.changed.length,
    newSincePause: sincePause.added.length,
  },
  prior: {
    acceptedMappings: previous.filter((p) =>
      ['Prepared booking', 'Linked supporting row'].includes(p.status),
    ).length,
    preparedTargets: targets.length,
    ownerDecisions: decisions.length,
    ownerConfirmedAliasGroups: aliases.declarations,
    existingTravelerCandidates: held.uniqueNameCandidates,
  },
  travelers: {
    heldCells: held.held.length,
    resolvedCells: travelerResolutions.filter((r: R) => !r.parsed.unresolved.length).length,
    partialCells: travelerResolutions.filter((r: R) => r.parsed.unresolved.length).length,
    resolvedRosterCells: travelerResolutions.filter(
      (r: R) => r.parsed.names.length && !r.parsed.unresolved.length,
    ).length,
    nonPersonOrGroupCells: travelerResolutions.filter(
      (r: R) => !r.parsed.names.length && !r.parsed.unresolved.length,
    ).length,
    identityMerges: 0,
    verifiedIdentityOverrides: 0,
  },
  financial,
  processorReceipt: cardReceipt,
  bankMonthlyControls: statementControls,
  ownerVoucherClarification: ownerVoucher,
  tabTotals,
  preservation,
  rawSourceWrites: 0,
  liveFinancialWrites: 0,
};
await write('reconciliation.json', report);
await write('preservation-manifest.json', preservation);
console.log(
  JSON.stringify(
    {
      ...report,
      preservation: preservation.map((p) => ({ file: path.basename(p.file), sha256: p.sha256 })),
      tabTotals: undefined,
    },
    null,
    2,
  ),
);
