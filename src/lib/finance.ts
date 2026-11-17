import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { originalConfirmedRate } from './booking-derived';
import { Database, SQL, Row, one } from './db';

import {
  Actor,
  Permission,
  hasPermission,
  requirePermission,
  commandPermission,
} from './permissions';
import { freshActor } from './users';
import { bookingItinerary, itineraryEntryKeys } from './booking-itinerary';
import { businessDate } from './business-date';
import { refundQuantityUnit } from './asset-units';
import { isDirectBookingChannel } from './entry-options';
import { effectiveAsset } from './asset-revisions';
import { operationalEntry, sourceMethodSchema, draftSchema } from './booking-entry';
import {
  sourceProfileSchema,
  percentagePrice,
  validateSegments,
  latestCreditRequests,
} from './v1-entry';
import { assertBookingProductData, taxesCreateFunding } from './booking-entry-state';
import { requirePartyRole, providerRole, validatePaymentAccount } from './directory-eligibility';
import { sanitizeOperationalInput } from './operational-redaction';
import { sourceFingerprint } from './historical-delta';
import { exactPointCost } from './quick-paste';
import { validateTravelerDecision } from './traveler-review';
import { validateHistoricalDraftReview } from './historical-draft-review';
import { hasPayableTerms, payableStates, requirePayableTerms } from './commission-payables';
import {
  fulfillmentSchemas,
  unitSchema,
  assetUnit,
  validateInstrument,
  requireFulfillmentSchema,
  hasFulfillmentSchema,
  pendingTravelCosts,
  effectiveTravelComponents,
  effectiveFulfillments,
} from './fulfillment';
export { requirePermission };
export type { Actor, Permission };
const id = z.string().uuid();
const day = z.iso.date();
const money = z.number().int().min(0).max(9_000_000_000_000);
const positive = money.positive();
const text = z.string().trim().min(1).max(2000);
const optionalID = id.nullish();
const fundingInput = z.object({
  travel_index: z.number().int().min(0).max(29).optional(),
  kind: text,
  unit: unitSchema.optional(),
  face_amount: positive,
  cost: money.optional(),
  asset_id: optionalID,
  account_id: optionalID,
  seller_id: optionalID,
  reference: z.string().max(200).default(''),
  settled: z.boolean().default(false),
  payment_method: text.optional(),
  date: day,
  confirm_cost: z.boolean().default(true),
});

const schemas = {
  ...fulfillmentSchemas,
  booking_source_method: sourceMethodSchema,
  booking_source_profile: sourceProfileSchema,
  booking_source_profile_link: z.object({
    booking_id: id,
    profile_id: id,
    date: day,
    reason: text,
  }),
  booking_draft: draftSchema,
  revise_travel: fulfillmentSchemas.travel_component.extend({
    travel_component_id: id,
    expected_version: z.number().int().nonnegative(),
    date: day,
    reason: text,
  }),
  revise_fulfillment: fulfillmentSchemas.fulfill.extend({
    fulfillment_id: id,
    expected_version: z.number().int().nonnegative(),
    reason: text,
  }),
  reverse_fulfillment: z.object({
    booking_id: id,
    fulfillment_id: id,
    expected_version: z.number().int().nonnegative(),
    date: day,
    reason: text,
  }),
  cancellation_cost: z.object({
    booking_id: id,
    travel_component_id: optionalID,
    payee_id: id,
    amount: positive,
    date: day,
    settled: z.boolean().default(false),
    method: text.optional(),
    account_id: optionalID,
    reference: z.string().trim().min(1).max(200),
    reason: text,
  }),
  party: z.object({
    name: text,
    kind: z.enum(['person', 'company', 'family', 'supplier', 'partner']),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(100).optional(),
    roles: z.array(z.string()).default([]),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
  edit_party: z.object({
    party_id: id,
    name: text,
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(100).default(''),
    roles: z.array(z.string()).default([]),
    details: z.record(z.string(), z.unknown()).default({}),
    reason: text,
  }),
  relationship: z.object({
    person_id: id,
    group_id: id,
    relationship: text,
    tier: z.enum(['1', '2', '3']).optional(),
    comfort_level: z.enum(['A', 'B', 'C']).optional(),
  }),
  authorize_payer: z.object({ booking_id: id, party_id: id, reason: text }),
  payment_account: z.object({
    ownership: z.enum(['Padova', 'Customer', 'Unknown']).default('Padova'),
    supported_methods: z.array(text).optional(),
    active: z.boolean().default(true),
    name: text.refine(
      (v) => !/\d[\d .-]{10,}\d/.test(v),
      'Use a nickname, never a full card number',
    ),
    kind: text,
    issuer: z.string().max(200).optional(),
    owner_id: optionalID,
    notes: z.string().max(2000).optional(),
    last_four: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  }),
  transfer_asset: z.object({
    sending_asset_id: id,
    receiving_asset_id: id,
    quantity_sent: positive,
    quantity_received: positive,
    fees: money.default(0),
    date: day,
  }),
  convert_asset: z.object({
    asset_id: id,
    name: text,
    kind: text,
    issuer: text,
    quantity_sent: positive,
    quantity_received: positive,
    date: day,
    expires_on: day.optional(),
    restrictions: z.string().max(2000).default(''),
    reference: z.string().max(200).default(''),
    reason: text,
  }),
  expire_asset: z.object({ asset_id: id, quantity: positive, date: day, reason: text }),
  receive_asset_sale: z.object({
    sale_id: id,
    amount: positive,
    date: day,
    method: text,
    reference: z.string().default(''),
  }),
  pay_asset_purchase: z.object({
    asset_id: id,
    amount: positive,
    date: day,
    method: text,
    reference: z.string().default(''),
    account_id: optionalID,
  }),
  traveler: z.union([
    z.object({
      person_id: id,
      ticketing_only: z.literal(true),
      dob: z.union([day, z.literal('')]),
      sex: z.enum(['', 'F', 'M', 'X']),
      nationality: z.string().trim().max(100),
      expected: z.object({ dob: z.string(), sex: z.string(), nationality: z.string() }),
    }),
    z.object({
      person_id: id,
      legal_first: text,
      middle_name: z.string().default(''),
      last_name: text,
      dob: day.optional(),
      ktn: z.string().max(100).default(''),
      memberships: z.array(z.record(z.string(), z.unknown())).default([]),
      documents: z
        .array(z.object({ type: text, number: text, country: text, expires_on: day.optional() }))
        .default([]),
      preferences: z.record(z.string(), z.unknown()).default({}),
    }),
  ]),
  booking: z.object({
    historical_undated_booking: z.literal(true).optional(),
    operational: operationalEntry.optional(),
    customer_id: id,
    supplier_id: optionalID,
    product: text,
    channel: text,
    summary: text,
    booked_on: day,
    travel_start: day.nullable(),
    travel_end: day.nullable(),
    traveler_ids: z.array(id).default([]),
    confirmations: z.array(z.string().trim().min(1).max(100)).default([]),
    sale: money.default(0),
    funding: z.array(fundingInput).max(30).default([]),
    create_initial_travel: z.boolean().default(false),
    travel_components_input: z
      .array(fulfillmentSchemas.travel_component.omit({ booking_id: true }))
      .min(1)
      .max(30)
      .optional(),
    customer_payment: z
      .object({
        amount: positive,
        date: day,
        method: text,
        reference: z.string().max(200).default(''),
        account_id: optionalID,
        allocate_to_booking: z.boolean().default(true),
      })
      .optional(),
    itinerary: bookingItinerary.default({}),
  }),
  charge: z.object({
    booking_id: id,
    amount: z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000),
    kind: text,
    date: day,
  }),
  confirm_sale: z.object({ booking_id: id, total: money, date: day, reason: text }),
  payment: z.object({
    historical_refund_settlement: z.literal(true).optional(),
    party_id: id,
    direction: z.enum([
      'customer',
      'supplier',
      'commission',
      'referral',
      'customer_refund',
      'supplier_refund',
      'asset_purchase',
      'asset_sale',
    ]),
    amount: positive,
    date: day,
    method: text,
    reference: z.string().max(200).default(''),
    account_id: optionalID,
    allocations: z
      .array(z.object({ booking_id: id, amount: positive, obligation_id: optionalID }))
      .default([]),
    commission_allocations: z.array(z.object({ commission_id: id, amount: positive })).default([]),
  }),
  allocate: z.object({
    payment_id: id,
    booking_id: id,
    amount: positive,
    date: day,
    obligation_id: optionalID,
  }),
  correct_payment: z.object({
    payment_id: id,
    amount: money,
    reason: text,
    reduce_booking_id: optionalID,
    date: day,
  }),
  acquire_asset: z.object({
    historical_opening: z.literal(true).optional(),
    name: text,
    kind: text,
    unit: unitSchema.optional(),
    instrument_id: optionalID,
    program_account_id: optionalID,
    issuer: text,
    quantity: positive,
    cost: money.nullish(),
    date: day,
    expires_on: day.optional(),
    seller_id: optionalID,
    holder_id: optionalID,
    source_booking_id: optionalID,
    ownership: z.enum(['Padova', 'External', 'Customer']).default('Padova'),
    restrictions: z.string().max(2000).default(''),
    reference: z.string().max(200).default(''),
  }),
  revise_asset: z
    .object({
      asset_id: id,
      expected_version: z.number().int().nonnegative(),
      name: text,
      issuer: text,
      expires_on: day.optional(),
      restrictions: z.string().max(2000).default(''),
      reference: z.string().max(200).default(''),
      date: day,
      reason: text,
    })
    .strict(),
  fund: fundingInput.extend({ booking_id: id }),
  sell_asset: z.object({
    asset_id: id,
    buyer_id: id,
    quantity: positive,
    proceeds: money,
    date: day,
    paid: z.boolean().default(false),
    method: text.default('Bank'),
    reference: z.string().default(''),
  }),
  benefit: z.object({
    booking_id: id,
    name: text,
    amount: positive,
    date: day,
    kind: text.default('Capital One credit'),
    expires_on: day.optional(),
    original_rate: money.optional(),
    original_rate_reason: text.optional(),
    final_rate: money.optional(),
    reference: z.string().max(200).default(''),
  }),
  price_match_event: z.object({
    booking_id: id,
    status: z.enum(['Attempted', 'Pending', 'Approved', 'Denied', 'Received', 'Cancelled']),
    request_id: id.optional(),
    profile_id: id.optional(),
    requested_amount: money.optional(),
    expected_credit: money.optional(),
    approved_amount: money.optional(),
    received_amount: money.optional(),
    received_on: day.optional(),
    original_rate: money.optional(),
    original_rate_reason: text.optional(),
    final_rate: money.optional(),
    date: day,
    reference: z.string().max(200).default(''),
    reason: text,
  }),
  voucherize: z.object({
    booking_id: id,
    name: text,
    quantity: positive,
    basis: money,
    date: day,
    expires_on: day.optional(),
    ownership: z.enum(['Padova', 'Customer']).default('Customer'),
  }),
  commission: z
    .object({
      booking_id: id,
      date: day,
      // Legacy single-payer shape (still accepted).
      payer_id: optionalID,
      collector_id: optionalID,
      gross: positive.optional(),
      retained: money.default(0),
      due_on: day.optional(),
      is_iata_partner: z.boolean().default(false),
      // Site Feedback 3 Phase 2: multi-payer + optional referrer in one atomic save.
      payers: z
        .array(
          z.object({
            payer_id: id,
            collector_id: optionalID,
            gross: positive,
            retained: money.default(0),
            due_on: day.optional(),
            is_iata_partner: z.boolean().default(false),
          }),
        )
        .max(10)
        .optional(),
      referral: z
        .object({
          referrer_id: id,
          basis: z.enum(['profit', 'percentage', 'fixed']),
          rate_bps: z.number().int().min(0).max(10000).default(0),
          fixed_amount: money.default(0),
          due_on: day.optional(),
          after_receipt: z.boolean().default(true),
          cancellation_rule: z
            .enum(['Realized economics', 'Retain agreed amount'])
            .default('Realized economics'),
          reason: text.optional(),
          percentage_basis: z
            .enum(['profit', 'sale', 'commission', 'commission_received', 'agreed_amount'])
            .optional(),
          agreed_basis: money.nullish(),
          earned: z.boolean().optional(),
          payable_when: z
            .enum([
              'When earned',
              'After travel',
              'After customer paid',
              'After commission received',
              'On date',
            ])
            .optional(),
        })
        .optional(),
    })
    .superRefine((v, ctx) => {
      const fromLegacy =
        v.payer_id && v.gross != null
          ? [
              {
                payer_id: v.payer_id,
                collector_id: v.collector_id,
                gross: v.gross,
                retained: v.retained ?? 0,
                due_on: v.due_on,
                is_iata_partner: v.is_iata_partner ?? false,
              },
            ]
          : [];
      const payers = v.payers?.length ? v.payers : fromLegacy;
      if (!payers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Add at least one commission payer with an exact dollar amount',
        });
      }
      const seen = new Set<string>();
      for (const p of payers) {
        if (seen.has(p.payer_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each commission payer can appear once per save; do not double-post',
          });
        }
        seen.add(p.payer_id);
        if (p.retained > p.gross) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Collector retention exceeds commission',
          });
        }
      }
    }),
  commission_receipt: z.object({ payment_id: id, commission_id: id, amount: positive, date: day }),
  referral: z.object({
    booking_id: id,
    referrer_id: id,
    basis: z.enum(['profit', 'percentage', 'fixed']),
    rate_bps: z.number().int().min(0).max(10000).default(0),
    fixed_amount: money.default(0),
    due_on: day,
    date: day,
    after_receipt: z.boolean().default(true),
    cancellation_rule: z
      .enum(['Realized economics', 'Retain agreed amount'])
      .default('Realized economics'),
    reason: text.optional(),
    percentage_basis: z
      .enum(['profit', 'sale', 'commission', 'commission_received', 'agreed_amount'])
      .optional(),
    agreed_basis: money.nullish(),
    earned: z.boolean().optional(),
    payable_when: z
      .enum([
        'When earned',
        'After travel',
        'After customer paid',
        'After commission received',
        'On date',
      ])
      .optional(),
  }),
  revise_referral: z.object({
    referral_id: id,
    revision: z.number().int().min(0),
    basis: z.enum(['profit', 'percentage', 'fixed']),
    rate_bps: z.number().int().min(0).max(10000),
    fixed_amount: money,
    percentage_basis: z.enum([
      'profit',
      'sale',
      'commission',
      'commission_received',
      'agreed_amount',
    ]),
    agreed_basis: money.nullish(),
    earned: z.boolean(),
    payable_when: z.enum([
      'When earned',
      'After travel',
      'After customer paid',
      'After commission received',
      'On date',
    ]),
    due_on: day,
    cancellation_rule: z.enum(['Realized economics', 'Retain agreed amount']),
    date: day,
    reason: text,
  }),
  reverse_referral: z.object({
    referral_id: id,
    revision: z.number().int().min(0),
    date: day,
    reason: text,
  }),
  reverse_referral_payment: z.object({ payment_id: id, amount: positive, date: day, reason: text }),
  pay_referral: z.object({
    account_id: optionalID,
    referral_id: id,
    amount: positive,
    date: day,
    method: text,
    reference: z.string().default(''),
  }),
  cancel: z.object({
    booking_id: id,
    travel_component_id: optionalID,
    traveler_id: optionalID,
    funding_component_id: optionalID,
    supplier_expected: money,
    customer_due: money,
    charge_reduction: money.optional(),
    due_on: day,
    date: day,
    reason: text,
  }),
  reconcile_supplier_return: z.object({
    booking_id: id,
    funding_component_id: id,
    payment_id: id,
    amount: positive,
    date: day,
    reason: text,
  }),
  receive_refund: z.object({
    account_id: optionalID,
    refund_id: id,
    amount: positive,
    form: text,
    date: day,
    asset_id: optionalID,
    original_movement_id: optionalID,
    basis: money.optional(),
    new_asset: z.object({ name: text, issuer: text, expires_on: day.optional() }).optional(),
    method: text.default('Bank'),
    reference: z.string().default(''),
  }),
  pay_refund: z.object({
    account_id: optionalID,
    refund_id: id,
    amount: positive,
    date: day,
    method: text,
    reference: z.string().default(''),
    override_reason: z.string().optional(),
  }),
  revise: z.object({
    booking_id: id,
    product: text.optional(),
    channel: text.optional(),
    supplier_id: optionalID,
    change_seller_id: optionalID,
    traveler_ids: z.array(id).default([]),
    confirmations: z.array(z.string().trim().min(1).max(100)).default([]),
    summary: text,
    travel_start: day,
    travel_end: day,
    date: day,
    reason: text,
    fare_difference: money.default(0),
    supplier_change_fee: money.default(0),
    padova_change_fee: money.default(0),
    additional_customer_charge: money.default(0),
    itinerary: bookingItinerary.default({}),
    reservation_status: z
      .enum(['Booked', 'Traveled', 'Cancelled', 'Refund Pending'])
      .default('Booked'),
    confirmation_status: text.default('Confirmed'),
    document_status: text.default('Not prepared'),
  }),
  note: z.object({ record_type: text, record_id: id, body: text }),
  task: z.object({
    title: text,
    record_type: z.enum(['booking', 'party', 'asset', 'commission', 'refund']).optional(),
    record_id: optionalID,
    assignee_id: optionalID,
    due_on: day.optional(),
    priority: z.enum(['Normal', 'High', 'Urgent']).default('Normal'),
    notes: z.string().default(''),
  }),
  complete_task: z.object({ task_id: id, note: text }),
  update_task: z.object({
    task_id: id,
    title: text,
    record_type: z.enum(['booking', 'party', 'asset', 'commission', 'refund']).optional(),
    record_id: optionalID,
    assignee_id: optionalID,
    due_on: day.optional(),
    priority: z.enum(['Normal', 'High', 'Urgent']).default('Normal'),
    notes: z.string().default(''),
    status: z.enum(['Open', 'Done']),
    reason: text,
  }),
  resolve_attention: z.object({ key: text, fingerprint: text, note: text }),
  review_resolution: z.object({
    source_key: text,
    evidence_id: optionalID,
    source_locator: z.record(z.string(), z.unknown()),
    issue_type: text,
    proposed_mapping: z.record(z.string(), z.unknown()).default({}),
    status: z.enum(['Proposed', 'Held', 'Approved', 'Rejected', 'Resolved']),
    decision: text,
    destination_ids: z.record(z.string(), z.unknown()).default({}),
  }),
};
export type CommandKind = keyof typeof schemas;
export type Command = { id: string; kind: CommandKind; data: unknown };
function n(v: unknown): number {
  const r = Number(v ?? 0);
  if (!Number.isSafeInteger(r)) throw new Error('Unsafe financial integer');
  return r;
}
export function proportional(basis: number, quantity: number, total: number): number {
  if (quantity === total) return basis;
  return Number((BigInt(basis) * BigInt(quantity) + BigInt(total) / 2n) / BigInt(total));
}
function knownBasis(value: number | null): number {
  if (value == null)
    throw new Error(
      'Acquisition basis remains Unknown; resolve it before this inventory operation.',
    );
  return value;
}
/** Hosted: only after reviewed `20261117_commission_iata_partner`. Local: column from 024. */
async function commissionIataPartnerReady(tx: SQL): Promise<boolean> {
  if (tx.storage === 'padova') {
    const r = await tx.query(
      `SELECT 1 AS ok FROM app_schema_versions WHERE version=$1 LIMIT 1`,
      ['20261117_commission_iata_partner'],
    );
    return Boolean(r.rows[0]);
  }
  const r = await tx.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema=current_schema() AND table_name='commissions'
       AND column_name='is_iata_partner' LIMIT 1`,
  );
  return Boolean(r.rows[0]);
}
async function insert(tx: SQL, table: string, data: Row) {
  if (
    table === 'payments' &&
    (data.account_id ||
      ['supplier', 'asset_purchase', 'referral', 'customer_refund'].includes(data.direction))
  )
    await validatePaymentAccount(tx, data.account_id, data.method);
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  return one(
    tx,
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    keys.map((k) =>
      typeof data[k] === 'object' && data[k] !== null && !Array.isArray(data[k])
        ? JSON.stringify(data[k])
        : data[k],
    ),
  );
}
async function line(
  tx: SQL,
  command_id: string,
  date: string,
  debitAccount: string,
  creditAccount: string,
  amount: number | null | undefined,
  booking_id?: string,
  party_id?: string,
) {
  if (amount == null || amount === 0) return;
  const reverse = amount < 0;
  amount = Math.abs(amount);
  await insert(tx, 'journal_lines', {
    command_id,
    effective_on: date,
    account: reverse ? creditAccount : debitAccount,
    debit: amount,
    booking_id,
    party_id,
  });
  await insert(tx, 'journal_lines', {
    command_id,
    effective_on: date,
    account: reverse ? debitAccount : creditAccount,
    credit: amount,
    booking_id,
    party_id,
  });
}
async function movement(
  tx: SQL,
  command_id: string,
  date: string,
  kind: string,
  amount: number | null | undefined,
  booking_id?: string,
) {
  if (amount)
    await insert(tx, 'profit_movements', {
      command_id,
      effective_on: date,
      kind,
      amount,
      booking_id,
    });
}
export async function economics(
  tx: SQL,
  booking_id: string,
  context?: { booking: Row; today: string },
): Promise<Row> {
  const b = context
    ? { ...context.booking }
    : await one(tx, 'SELECT * FROM booking_balances WHERE id=$1', [booking_id]);
  if (tx.storage === 'padova' && !b.adapter_managed) {
    const old = await one(
      tx,
      `SELECT padova.app_cents(customer_total) AS sale,padova.app_cents(customer_paid) AS paid,padova.app_cents(economic_supplier_cost) AS obligations,padova.app_cents(current_profit) AS profit FROM padova.booking_summary WHERE id=$1`,
      [booking_id],
    );
    return {
      ...b,
      ...old,
      funding_cost: null,
      gross_profit: null,
      referral_due: null,
      customer_balance:
        old.sale !== null && old.paid !== null ? Number(old.sale) - Number(old.paid) : null,
      supplier_balance: null,
      adapter_review_required: true,
    };
  }
  const corrections = await one(
    tx,
    `SELECT
    COALESCE(sum(j.credit) FILTER(WHERE j.account='booking_cost'),0) cost,
    COALESCE(sum(j.debit) FILTER(WHERE j.account='supplier_payable'),0) obligation
    FROM journal_lines j JOIN commands c ON c.id=j.command_id WHERE j.booking_id=$1 AND c.kind IN ('revise_fulfillment','reverse_fulfillment')`,
    [booking_id],
  );
  b.funding_cost = n(b.funding_cost) - n(corrections.cost);
  b.obligations = n(b.obligations) - n(corrections.obligation);
  const recovery = await one(
    tx,
    "SELECT COALESCE(sum(amount),0) amount,(SELECT count(*) FROM funding_components f WHERE booking_id=$1 AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text)) funding_count FROM profit_movements WHERE booking_id=$1 AND kind IN ('supplier_recovery','earned_credit')",
    [booking_id],
  );
  const gross = n(b.sale) - n(b.funding_cost) + n(b.expected_commission) + n(recovery.amount);
  const receivedCommission = n(
    (
      await one(
        tx,
        'SELECT COALESCE(sum(a.amount),0) amount FROM commission_allocations a JOIN commissions c ON c.id=a.commission_id WHERE c.booking_id=$1',
        [booking_id],
      )
    ).amount,
  );
  const unknownBasis =
    (
      await tx.query(
        "SELECT 1 FROM funding_components f WHERE booking_id=$1 AND cost IS NULL AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text) LIMIT 1",
        [booking_id],
      )
    ).rows.length > 0;
  const supplierCostIncomplete =
    b.itinerary?.cost_status === 'Pending' ||
    (!Number(recovery.funding_count) && b.itinerary?.cost_status !== 'No supplier cost') ||
    (await pendingTravelCosts(tx, booking_id)) > 0 ||
    unknownBasis;
  if (unknownBasis) b.funding_cost = null;
  const costIncomplete = b.itinerary?.sale_known === false || supplierCostIncomplete;
  const commissionTerms = b.itinerary?.operational_entry?.commission;
  const commissionIncomplete =
    commissionTerms?.expected === 'Unknown' ||
    (commissionTerms?.expected === 'Yes' &&
      (!commissionTerms.payer_id ||
        (commissionTerms.amount === undefined && commissionTerms.percentage_bps === undefined)));
  const customerRefundPaid = await one(
    tx,
    "SELECT COALESCE(sum(m.amount),0) amount FROM refund_movements m JOIN refunds r ON r.id=m.refund_id WHERE r.booking_id=$1 AND m.kind='customer_paid'",
    [booking_id],
  );
  const payableCredits = await one(
    tx,
    "SELECT COALESCE(sum(m.amount),0) amount FROM refund_movements m JOIN refunds r ON r.id=m.refund_id WHERE r.booking_id=$1 AND m.kind='supplier_received' AND m.form='Supplier payable credit'",
    [booking_id],
  );
  const customerBalance =
    b.itinerary?.sale_known === false ? null : n(b.sale) - n(b.paid) + n(customerRefundPaid.amount);
  const payables = await payableStates(
    tx,
    {
      ...b,
      sale: b.itinerary?.sale_known === false ? null : n(b.sale),
      customer_balance: customerBalance,
      cost_incomplete: costIncomplete,
      commission_incomplete: commissionIncomplete,
      gross_profit: gross,
      received_commission: receivedCommission,
    },
    context?.today ?? (await businessDate(tx)),
  );
  const sumPayable = (key: string) =>
    payables.some((r) => r[key] == null)
      ? null
      : n(payables.reduce((sum, r) => sum + Number(r[key]), 0));
  const referralDue = sumPayable('expected_due'),
    referralAccrued = sumPayable('accrued');
  return {
    ...b,
    sale: b.itinerary?.sale_known === false ? null : n(b.sale),
    cost_incomplete: costIncomplete,
    supplier_cost_incomplete: supplierCostIncomplete,
    commission_incomplete: commissionIncomplete,
    expected_commission: commissionIncomplete ? null : b.expected_commission,
    generated_value: n(recovery.amount),
    net_economic_cost: supplierCostIncomplete ? null : n(b.funding_cost) - n(recovery.amount),
    gross_profit: costIncomplete || commissionIncomplete ? null : gross,
    referral_due: referralDue,
    referral_accrued: referralAccrued,
    referral_recovery: sumPayable('recovery_due'),
    commission_payables: payables,
    profit:
      costIncomplete || commissionIncomplete || referralDue == null ? null : gross - referralDue,
    received_commission: receivedCommission,
    current_profit:
      costIncomplete || referralAccrued == null
        ? null
        : gross - referralAccrued - n(b.expected_commission) + receivedCommission,
    customer_balance:
      b.itinerary?.sale_known === false
        ? null
        : n(b.sale) - n(b.paid) + n(customerRefundPaid.amount),
    recorded_supplier_balance: n(b.obligations) - n(b.supplier_paid) - n(payableCredits.amount),
    supplier_balance: supplierCostIncomplete
      ? null
      : n(b.obligations) - n(b.supplier_paid) - n(payableCredits.amount),
  };
}
async function recognize(tx: SQL, command_id: string, date: string, booking_id: string) {
  const b = await economics(tx, booking_id);
  const current = await one(
    tx,
    'SELECT COALESCE(sum(amount),0) amount FROM profit_movements WHERE booking_id=$1',
    [booking_id],
  );
  const delta = (b.cost_incomplete ? 0 : b.profit) - n(current.amount);
  const isPrior = String(b.booked_on).slice(0, 7) !== date.slice(0, 7);
  await movement(
    tx,
    command_id,
    date,
    isPrior ? 'prior_period_adjustment' : 'booking_profit',
    delta,
    booking_id,
  );
}
async function consume(
  tx: SQL,
  command_id: string,
  asset_id: string,
  quantity: number,
  date: string,
  kind: string,
  booking_id?: string,
  allowExternal = false,
) {
  const a = await effectiveAsset(
    tx,
    await one(tx, 'SELECT * FROM assets WHERE id=$1 FOR UPDATE', [asset_id]),
  );
  if (
    a.ownership !== 'Padova' &&
    !(
      allowExternal &&
      (a.ownership === 'External' || (a.ownership === 'Customer' && kind === 'booking_use'))
    )
  )
    throw new Error('Only Padova-owned inventory can be consumed or sold');
  if (a.expires_on && String(a.expires_on) < date && kind !== 'expiration')
    throw new Error('Asset has expired');
  const lots = await tx.query(
    `SELECT l.*,sum(m.quantity)::bigint remaining,sum(m.basis)::bigint remaining_basis FROM asset_lots l JOIN asset_movements m ON m.lot_id=l.id WHERE l.asset_id=$1 GROUP BY l.id,l.asset_id,l.quantity,l.cost,l.acquired_on,l.source_lot_id,l.command_id ORDER BY l.acquired_on,l.id`,
    [asset_id],
  );
  if (lots.rows.reduce((sum, l) => sum + n(l.remaining), 0) < quantity)
    throw new Error('Insufficient asset balance');
  let left = quantity;
  let totalBasis: number | null = 0;
  const movements: Row[] = [];
  for (const lot of lots.rows) {
    const used = Math.min(left, n(lot.remaining));
    if (used <= 0) continue;
    if (lot.cost == null && kind !== 'booking_use')
      throw new Error(
        'Acquisition basis is Unknown. Resolve it before selling, transferring or expiring this value.',
      );
    const basis =
      lot.cost == null ? null : proportional(n(lot.remaining_basis), used, n(lot.remaining));
    movements.push(
      await insert(tx, 'asset_movements', {
        asset_id,
        lot_id: lot.id,
        booking_id,
        quantity: -used,
        basis: basis == null ? null : -basis,
        kind,
        effective_on: date,
        command_id,
      }),
    );
    left -= used;
    totalBasis = totalBasis == null || basis == null ? null : totalBasis + basis;
    if (!left) break;
  }
  return { basis: totalBasis, movements };
}
async function createAsset(tx: SQL, command_id: string, d: Row) {
  if (d.seller_id) await requirePartyRole(tx, d.seller_id, 'seller');
  if (d.unit || d.instrument_id || d.program_account_id) await requireFulfillmentSchema(tx);
  if (d.ownership === 'Customer' && (!d.holder_id || d.cost !== 0))
    throw new Error('Customer-owned value requires its customer owner and zero Padova cost');
  const instrument = await validateAssetInstrument(tx, d);
  const asset = await insert(tx, 'assets', {
    name: d.name,
    kind: d.kind,
    unit: d.unit ?? instrument?.unit,
    issuer: d.issuer,
    source_booking_id: d.source_booking_id,
    holder_id: d.holder_id,
    seller_id: d.seller_id,
    ownership: d.ownership ?? 'Padova',
    expires_on: d.expires_on,
    restrictions: d.restrictions ?? '',
    reference: d.reference ?? '',
    ...(tx.storage === 'padova'
      ? { opening_quantity: d.quantity, opening_cost: d.cost ?? null }
      : {}),
  });
  if (d.instrument_id)
    await insert(tx, 'inventory_profiles', {
      asset_id: asset.id,
      instrument_id: d.instrument_id,
      program_account_id: d.program_account_id,
      command_id,
    });
  const lot = await insert(tx, 'asset_lots', {
    asset_id: asset.id,
    quantity: d.quantity,
    cost: d.cost ?? null,
    acquired_on: d.date,
    command_id,
    source_lot_id: d.source_lot_id,
  });
  await insert(tx, 'asset_movements', {
    asset_id: asset.id,
    lot_id: lot.id,
    quantity: d.quantity,
    basis: d.cost ?? null,
    kind: d.movement_kind ?? 'acquisition',
    effective_on: d.date,
    command_id,
  });
  return asset;
}
async function validateAssetInstrument(tx: SQL, d: Row) {
  if (d.program_account_id && !d.instrument_id)
    throw new Error('Select the instrument for this program account');
  return d.instrument_id ? validateInstrument(tx, d) : undefined;
}
export async function supplierOutstanding(tx: SQL, booking_id: string, supplier_id: string) {
  return one(
    tx,
    `SELECT
    COALESCE((SELECT sum(amount) FROM supplier_obligations WHERE booking_id=$1 AND supplier_id=$2),0)
    -COALESCE((SELECT sum(a.net_amount) FROM net_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=$1 AND p.party_id=$2 AND p.direction='supplier'),0)
    -COALESCE((SELECT sum(j.debit) FROM journal_lines j JOIN commands c ON c.id=j.command_id WHERE j.booking_id=$1 AND j.party_id=$2 AND j.account='supplier_payable' AND c.kind IN ('revise_fulfillment','reverse_fulfillment')),0)
    -COALESCE((SELECT sum(m.amount) FROM refund_movements m JOIN refunds r ON r.id=m.refund_id JOIN bookings b ON b.id=r.booking_id LEFT JOIN funding_components f ON f.id=r.funding_component_id WHERE r.booking_id=$1 AND m.kind='supplier_received' AND m.form='Supplier payable credit' AND COALESCE(f.seller_id,b.supplier_id)=$2),0) amount`,
    [booking_id, supplier_id],
  );
}

async function reverseFulfillmentFunding(
  tx: SQL,
  command_id: string,
  fulfillment: Row,
  date: string,
) {
  const funding = await one(
    tx,
    'SELECT f.*,a.ownership FROM funding_components f LEFT JOIN assets a ON a.id=f.asset_id WHERE f.id=$1',
    [fulfillment.funding_component_id],
  );
  if (fulfillment.terms?.direct_payment)
    throw new Error(
      'Direct payment history requires an actual refund/void reconciliation before replacing its expense',
    );
  if (
    (
      await tx.query(
        "SELECT id FROM commands WHERE kind IN ('revise_fulfillment','reverse_fulfillment') AND result->>'reversed_funding_id'=$1",
        [funding.id],
      )
    ).rows.length
  )
    throw new Error('This original funding has already been reversed; edit the active replacement');
  if (
    (await tx.query('SELECT id FROM refunds WHERE funding_component_id=$1', [funding.id])).rows
      .length
  )
    throw new Error(
      'This funding has linked refund cases. Reconcile those actual returns before correcting the expense; descriptive edits remain available.',
    );
  const rewards = (
    await tx.query(
      'SELECT e.id,u.status FROM expected_events e JOIN LATERAL(SELECT status FROM expected_event_updates WHERE event_id=e.id ORDER BY created_at DESC,id DESC LIMIT 1) u ON true WHERE e.funding_component_id=$1',
      [funding.id],
    )
  ).rows;
  if (rewards.some((e) => e.status === 'Posted'))
    throw new Error('Reverse the actual posted rebate before correcting its original redemption');
  for (const event of rewards.filter((e) => !['Denied', 'Reversed'].includes(e.status)))
    await insert(tx, 'expected_event_updates', {
      event_id: event.id,
      status: 'Denied',
      effective_on: date,
      reason: 'Original fulfillment corrected; no pending reward was realized',
      command_id,
    });
  if (funding.asset_id) {
    const originals = (
      await tx.query(
        'SELECT m.* FROM funding_asset_uses u JOIN asset_movements m ON m.id=u.movement_id WHERE u.funding_component_id=$1',
        [funding.id],
      )
    ).rows;
    if (!originals.length)
      throw new Error(
        'Original acquisition-lot use is not linked; review that provenance before reversing inventory',
      );
    for (const original of originals)
      await insert(tx, 'asset_movements', {
        asset_id: original.asset_id,
        lot_id: original.lot_id,
        booking_id: funding.booking_id,
        quantity: -n(original.quantity),
        basis: original.basis == null ? null : -n(original.basis),
        kind: 'fulfillment_entry_reversal',
        effective_on: date,
        original_movement_id: original.id,
        command_id,
      });
  }
  const owned = funding.asset_id && funding.ownership === 'Padova';
  await line(
    tx,
    command_id,
    date,
    owned ? 'travel_inventory' : 'supplier_payable',
    'booking_cost',
    n(funding.cost),
    funding.booking_id,
    funding.seller_id,
  );
  return funding;
}

async function allocate(
  tx: SQL,
  command_id: string,
  payment_id: string,
  booking_id: string,
  amount: number,
  obligation_id?: string | null,
) {
  const p = await one(tx, 'SELECT * FROM payment_balances WHERE id=$1', [payment_id]);
  const b = await economics(tx, booking_id);
  if (!['customer', 'supplier'].includes(p.direction))
    throw new Error('Payment direction cannot allocate to bookings');
  if (n(p.current_amount) - n(p.allocated) < amount) throw new Error('Allocation exceeds payment');
  if (
    p.direction === 'customer' &&
    p.party_id !== b.customer_id &&
    !(
      await tx.query('SELECT 1 FROM booking_payers WHERE booking_id=$1 AND party_id=$2', [
        booking_id,
        p.party_id,
      ])
    ).rows.length
  )
    throw new Error('Authorize this third-party payer on the booking first');
  if (p.direction === 'customer' && amount > b.customer_balance)
    throw new Error('Allocation exceeds booking balance; retain excess as customer credit');
  if (p.direction === 'supplier') {
    const payable = await supplierOutstanding(tx, booking_id, p.party_id);
    if (amount > n(payable.amount)) throw new Error('Supplier or obligation allocation mismatch');
    if (!obligation_id) {
      const candidates = (
        await tx.query(
          'SELECT o.id FROM supplier_obligations o WHERE o.booking_id=$1 AND o.supplier_id=$2 AND o.amount>COALESCE((SELECT sum(a.net_amount) FROM obligation_settlements s JOIN net_allocations a ON a.id=s.allocation_id WHERE s.obligation_id=o.id),0)',
          [booking_id, p.party_id],
        )
      ).rows;
      if (candidates.length !== 1)
        throw new Error('Choose the exact seller obligation when multiple obligations exist');
      obligation_id = candidates[0].id;
    }
  }
  if (obligation_id && p.direction !== 'supplier')
    throw new Error('Only seller payments settle obligations');
  if (obligation_id) {
    const o = await one(tx, 'SELECT * FROM supplier_obligations WHERE id=$1', [obligation_id]);
    if (o.booking_id !== booking_id || o.supplier_id !== p.party_id)
      throw new Error('Seller obligation does not match booking and seller');
    const used = await one(
      tx,
      'SELECT COALESCE(sum(a.net_amount),0) amount FROM obligation_settlements s JOIN net_allocations a ON a.id=s.allocation_id WHERE s.obligation_id=$1',
      [obligation_id],
    );
    if (amount > n(o.amount) - n(used.amount))
      throw new Error('Allocation exceeds exact seller obligation');
  }
  const allocation = await insert(tx, 'payment_allocations', {
    payment_id,
    booking_id,
    amount,
    command_id,
  });
  if (obligation_id)
    await insert(tx, 'obligation_settlements', {
      allocation_id: allocation.id,
      obligation_id,
      command_id,
    });
  return allocation;
}
async function assetSourceProfile(tx: SQL, asset_id: string) {
  const exists = (
    await tx.query('SELECT to_regclass($1) name', [
      tx.storage === 'padova' ? 'padova.source_profile_assets' : 'public.source_profile_assets',
    ])
  ).rows[0].name;
  return exists
    ? (await tx.query('SELECT profile_id FROM source_profile_assets WHERE asset_id=$1', [asset_id]))
        .rows[0]?.profile_id
    : undefined;
}
async function postFunding(tx: SQL, command_id: string, d: Row, date: string) {
  if (
    d.asset_id &&
    (
      await tx.query('SELECT to_regclass($1) name', [
        tx.storage === 'padova' ? 'padova.source_profile_assets' : 'public.source_profile_assets',
      ])
    ).rows[0].name
  ) {
    const link = (
      await tx.query('SELECT profile_id FROM source_profile_assets WHERE asset_id=$1', [d.asset_id])
    ).rows[0];
    if (link) {
      const booking = await one(tx, 'SELECT itinerary FROM bookings WHERE id=$1', [d.booking_id]);
      if (booking.itinerary.operational_entry?.source_profile_id !== link.profile_id)
        throw new Error('Credit belongs to a different booking source profile');
    }
  }
  if (d.seller_id) await requirePartyRole(tx, d.seller_id, 'seller');
  if (d.unit) await requireFulfillmentSchema(tx);
  const b = await economics(tx, d.booking_id);
  if (b.reservation_status === 'Cancelled' && !d.allow_cancelled_fee)
    throw new Error('Cannot fund a cancelled booking; use the actual cancellation-cost workflow');
  let cost = d.cost ?? d.face_amount,
    firstMovement,
    usedMovements: Row[] = [],
    external = false,
    customerOwned = false,
    payee =
      d.seller_id ??
      b.itinerary?.acquisition_source_id ??
      (!b.itinerary?.operational_entry &&
      isDirectBookingChannel(b.channel) &&
      b.itinerary?.acquisition_source_status !== 'Unknown'
        ? b.supplier_id
        : null);
  if (d.asset_id) {
    const a = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id]);
    if (a.unit && !d.unit) d.unit = assetUnit(a);
    if (d.unit && d.unit !== assetUnit(a))
      throw new Error('Funding quantity unit does not match the asset');
    external = a.ownership === 'External';
    customerOwned = a.ownership === 'Customer';
    if (customerOwned) {
      if (d.settled || (d.cost !== undefined && d.cost !== 0))
        throw new Error(
          'Customer-owned value has zero Padova use cost and is not a supplier payment',
        );
      const linked =
        a.holder_id === b.customer_id ||
        (
          await tx.query(
            'SELECT 1 FROM booking_travelers WHERE booking_id=$1 AND person_id=$2 UNION ALL SELECT 1 FROM booking_payers WHERE booking_id=$1 AND party_id=$2',
            [d.booking_id, a.holder_id],
          )
        ).rows.length;
      if (!a.holder_id || !linked)
        throw new Error(
          'Customer-owned value must belong to this customer, traveler or authorized payer',
        );
    }
    if (external && (d.cost === undefined || !a.seller_id))
      throw new Error('Seller-funded points require exact cost and a seller');
    const c = await consume(
      tx,
      command_id,
      d.asset_id,
      d.face_amount,
      date,
      'booking_use',
      d.booking_id,
      external || customerOwned,
    );
    cost = customerOwned ? 0 : external ? d.cost : c.basis;
    firstMovement = c.movements[0].id;
    usedMovements = c.movements;
    if (external) payee = a.seller_id;
  }
  const result = await insert(tx, 'funding_components', {
    booking_id: d.booking_id,
    kind: d.kind,
    face_amount: d.face_amount,
    unit: d.unit,
    cost,
    asset_id: d.asset_id,
    asset_movement_id: firstMovement,
    account_id: d.account_id,
    seller_id: !d.asset_id || external ? payee : d.seller_id,
    reference: d.reference,
    effective_on: date,
    command_id,
  });
  if (usedMovements.length && (await hasFulfillmentSchema(tx)))
    for (const used of usedMovements)
      await insert(tx, 'funding_asset_uses', {
        funding_component_id: result.id,
        movement_id: used.id,
        command_id,
      });
  if ((!d.asset_id || external) && payee && cost > 0)
    result.obligation_id = (
      await insert(tx, 'supplier_obligations', {
        booking_id: d.booking_id,
        supplier_id: payee,
        amount: cost,
        effective_on: date,
        description: d.kind,
        command_id,
      })
    ).id;
  if ((!d.asset_id || external) && !payee && cost > 0)
    throw new Error(
      'Choose the actual supplier/payee or acquisition source; an indirect channel does not identify who Padova owes',
    );
  await line(
    tx,
    command_id,
    date,
    'booking_cost',
    d.asset_id && !external ? 'travel_inventory' : 'supplier_payable',
    cost,
    d.booking_id,
    payee,
  );
  if (d.settled && (!d.asset_id || external) && cost > 0) {
    const p = await insert(tx, 'payments', {
      direction: 'supplier',
      party_id: payee,
      amount: cost,
      paid_on: date,
      method: d.payment_method ?? d.kind,
      reference: d.reference,
      account_id: d.account_id,
    });
    await allocate(tx, command_id, p.id, d.booking_id, cost, result.obligation_id);
    await line(tx, command_id, date, 'supplier_payable', 'cash', cost, d.booking_id, payee);
  }
  return result;
}

async function postAdditionalFulfillmentFees(tx: SQL, command_id: string, d: Row, date: string) {
  if (!d.fee_amount) return;
  if (!d.fee_source_id) throw new Error('Choose the actual taxes/fees payee');
  return postFulfillment(
    tx,
    command_id,
    {
      booking_id: d.booking_id,
      travel_component_id: d.travel_component_id,
      mode: 'Cash/Card',
      cash_method: 'Card',
      role: 'Ancillary',
      unit: 'money',
      quantity: d.fee_amount,
      cost: d.fee_amount,
      source_id: d.fee_source_id,
      settled: d.fee_settled,
      payment_method: d.fee_payment_method,
      account_id: d.fee_account_id,
      terms: {
        reference: `${d.terms.reference ?? ''} taxes/fees`.trim(),
        notes:
          'Separate actual cash taxes/fees linked to this travel; not included in points quantity or lot basis.',
      },
      confirm_cost: d.confirm_cost,
    },
    date,
  );
}
async function postFulfillment(tx: SQL, command_id: string, d: Row, date: string): Promise<Row> {
  await requireFulfillmentSchema(tx);
  if (d.mode !== 'Outside source' && !d.quantity)
    throw new Error('Cash and owned-value use require an actual positive quantity');
  if (d.mode === 'Outside source' && !d.quantity && !d.cost)
    throw new Error(
      'Zero-cost seller value requires its actual quantity; otherwise preserve it as Draft',
    );
  if (
    d.source_paid &&
    (d.settled ||
      d.mode === 'Owned inventory' ||
      d.asset_id ||
      d.cost === undefined ||
      d.source_paid > d.cost ||
      !d.payment_method)
  )
    throw new Error(
      'Partial source payment requires exact outside cost, actual payment method, no inventory and no duplicate paid-in-full flag',
    );
  if (d.settled && !d.payment_method)
    throw new Error('Choose the actual source payment method before posting a settlement');
  const bookingBefore = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
  const component = (await effectiveTravelComponents(tx, d.booking_id)).find(
    (t) => t.id === d.travel_component_id,
  );
  if (!component) throw new Error('Travel component not found on this booking');
  if (
    ['Cancelled', 'Refund Pending'].includes(bookingBefore.reservation_status) ||
    (
      await tx.query(
        "SELECT id FROM commands WHERE kind='cancel' AND payload->>'travel_component_id'=$1",
        [component.id],
      )
    ).rows.length
  )
    throw new Error(
      'This travel is canceled; use the cancellation-cost/refund actions or add a replacement travel component',
    );
  const ownedAsset =
    d.mode === 'Owned inventory' && d.asset_id
      ? await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id])
      : null;
  const ownedProfile = ownedAsset
    ? (await tx.query('SELECT * FROM inventory_profiles WHERE asset_id=$1', [ownedAsset.id]))
        .rows[0]
    : null;
  if (ownedProfile) {
    d.instrument_id ??= ownedProfile.instrument_id;
    d.program_account_id ??= ownedProfile.program_account_id;
    const catalog = (
      await tx.query('SELECT role FROM instruments WHERE id=$1', [ownedProfile.instrument_id])
    ).rows[0];
    if (catalog?.role === 'Ancillary') d.role = 'Ancillary';
  } else if (ownedAsset && (d.instrument_id || d.program_account_id))
    throw new Error(
      'This existing asset has no configured catalog profile; use its recorded issuer without choosing a different instrument/account',
    );
  const instrument = await validateInstrument(tx, d);
  const customerAsset =
    d.mode === 'Outside source' && d.asset_id
      ? await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id])
      : null;
  if (customerAsset && customerAsset.ownership !== 'Customer')
    throw new Error(
      'Outside managed value must be customer-owned; use Owned inventory for Padova assets',
    );
  if (customerAsset && (d.settled || (d.cost !== undefined && d.cost !== 0)))
    throw new Error('Customer-owned value has zero Padova use cost and is not a supplier payment');
  if (customerAsset && d.program_account_id)
    await validateInstrument(tx, {
      ...d,
      ownership: 'Customer',
      holder_id: customerAsset.holder_id,
    });
  if (
    d.mode !== 'Cash/Card' &&
    !instrument &&
    !ownedAsset &&
    !customerAsset &&
    !(d.mode === 'Outside source' && (d.unit === 'money' || d.terms?.supplied))
  )
    throw new Error('Choose a configured instrument');
  if (d.mode === 'Cash/Card' && (d.unit !== 'money' || d.asset_id))
    throw new Error('Cash/card uses money and no inventory');
  if (
    d.mode === 'Outside source' &&
    !customerAsset &&
    (!d.source_id || d.asset_id || d.cost === undefined)
  )
    throw new Error(
      'Outside fulfillment requires the actual source and exact cost, without owned inventory',
    );
  if (d.mode === 'Owned inventory') {
    if (!d.asset_id || d.settled)
      throw new Error(
        'Owned fulfillment requires an asset; its use is not another supplier payment',
      );
    const asset = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id]);
    if (asset.ownership !== 'Padova')
      throw new Error('Only Padova-owned inventory can fund an owned fulfillment');
    const profile = ownedProfile;
    if (
      profile &&
      (profile.instrument_id !== d.instrument_id ||
        (d.program_account_id && profile.program_account_id !== d.program_account_id))
    )
      throw new Error('Asset program/instrument/account does not match fulfillment');
  } else if (!customerAsset && d.cost === undefined)
    throw new Error('Actual cost is required; unknown does not mean zero');
  const source =
    d.source_id ??
    component.acquisition_source_id ??
    (!bookingBefore.itinerary?.operational_entry &&
    component.channel?.startsWith('Direct ') &&
    component.details?.acquisition_source_status !== 'Unknown'
      ? component.provider_id
      : null);
  if (d.mode !== 'Owned inventory' && !customerAsset && !source)
    throw new Error(
      'Select the actual payee; an indirect travel provider is not assumed to be the source',
    );
  if (d.program_account_id) {
    const account = await one(tx, 'SELECT * FROM program_accounts WHERE id=$1', [
      d.program_account_id,
    ]);
    if (d.mode === 'Outside source' && !customerAsset && account.ownership !== 'External')
      throw new Error('Outside-source account must be external');
    if (
      customerAsset &&
      (account.ownership !== 'Customer' || account.holder_id !== customerAsset.holder_id)
    )
      throw new Error('Customer-owned account must match the credit owner');
    if (d.terms.account_holder_id && account.holder_id !== d.terms.account_holder_id)
      throw new Error('Account holder does not match the selected program account');
  }
  if (d.terms.account_holder_id)
    await one(tx, 'SELECT id FROM parties WHERE id=$1', [d.terms.account_holder_id]);
  if (
    d.rebate_expected &&
    (d.mode !== 'Owned inventory' || d.unit !== 'points' || d.rebate_expected > d.quantity)
  )
    throw new Error(
      'Pending Padova rebate requires an owned-points use and cannot exceed the original redemption',
    );
  const funding = await postFunding(
    tx,
    command_id,
    {
      booking_id: d.booking_id,
      kind:
        instrument?.name ??
        ownedAsset?.kind ??
        customerAsset?.kind ??
        d.terms?.supplied ??
        d.cash_method,
      payment_method: d.payment_method,
      unit: d.quantity == null ? 'money' : d.unit,
      face_amount: d.quantity ?? d.cost,
      cost: customerAsset ? 0 : d.cost,
      asset_id: d.asset_id,
      seller_id: customerAsset ? null : source,
      account_id: d.account_id,
      reference: d.terms.reference ?? '',
      settled: d.settled,
    },
    date,
  );
  const result = await insert(tx, 'fulfillment_details', {
    booking_id: d.booking_id,
    travel_component_id: component.id,
    instrument_id: d.instrument_id,
    program_account_id: d.program_account_id,
    source_id: customerAsset ? null : source,
    mode: d.mode,
    role: d.role,
    unit: d.unit,
    quantity: d.quantity ?? null,
    funding_component_id: funding.id,
    terms: { ...d.terms, cost_complete: d.role === 'Core' && d.confirm_cost },
    command_id,
  });
  if (d.source_paid) {
    const payment = await insert(tx, 'payments', {
      direction: 'supplier',
      party_id: source,
      amount: d.source_paid,
      paid_on: date,
      method: d.payment_method,
      account_id: d.account_id,
      reference: d.terms.reference ?? '',
    });
    await allocate(tx, command_id, payment.id, d.booking_id, d.source_paid, funding.obligation_id);
    await line(
      tx,
      command_id,
      date,
      'supplier_payable',
      'cash',
      d.source_paid,
      d.booking_id,
      source,
    );
    result.source_payment_id = payment.id;
  }
  const fee = await postAdditionalFulfillmentFees(tx, command_id, d, date);
  if (fee) result.fee_fulfillment_id = fee.id;
  if (d.rebate_expected) {
    const event = await insert(tx, 'expected_events', {
      booking_id: d.booking_id,
      kind: 'Points rebate',
      source_asset_id: d.asset_id,
      target_asset_id: d.asset_id,
      funding_component_id: funding.id,
      quantity_sent: d.quantity,
      quantity_expected: d.rebate_expected,
      reference: d.terms.reference ?? '',
      terms: { mechanism: d.terms.mechanism },
      command_id,
    });
    await insert(tx, 'expected_event_updates', {
      event_id: event.id,
      status: 'Pending',
      effective_on: date,
      reason: 'Expected issuer rebate only; no points or profit recognized before actual posting',
      command_id,
    });
    result.expected_event_id = event.id;
  }
  const pending = await pendingTravelCosts(tx, d.booking_id);
  result.cost_status = pending ? 'Pending' : 'Confirmed';
  if (!pending)
    await tx.query(
      "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}','\"Confirmed\"'::jsonb) WHERE id=$1",
      [d.booking_id],
    );
  else
    await tx.query(
      "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}','\"Pending\"'::jsonb) WHERE id=$1",
      [d.booking_id],
    );
  return result;
}

async function postCommissionReceipt(tx: SQL, command_id: string, d: Row, date: string) {
  const c = await one(tx, 'SELECT * FROM commissions WHERE id=$1', [d.commission_id]);
  const p = await one(tx, 'SELECT * FROM payment_balances WHERE id=$1', [d.payment_id]);
  const received = await one(
    tx,
    'SELECT COALESCE(sum(amount),0) amount FROM commission_allocations WHERE commission_id=$1',
    [c.id],
  );
  if (
    p.direction !== 'commission' ||
    p.party_id !== (c.collector_id ?? c.payer_id) ||
    d.amount > n(p.current_amount) - n(p.commission_allocated) ||
    d.amount > n(c.gross) - n(c.retained) - n(received.amount)
  )
    throw new Error('Invalid commission receipt allocation');
  const result = await insert(tx, 'commission_allocations', {
    commission_id: c.id,
    payment_id: p.id,
    amount: d.amount,
    command_id,
  });
  await line(
    tx,
    command_id,
    date,
    'commission_clearing',
    'commission_receivable',
    d.amount,
    c.booking_id,
  );
  return { result, booking_id: c.booking_id };
}

/** Accrue hotel commission receivable from booking-entry operational terms. */
async function postOperationalHotelCommission(
  tx: SQL,
  command_id: string,
  date: string,
  bookingId: string,
  sale: number,
  saleKnown: boolean,
  commission: Row | undefined,
  label: 'primary' | 'secondary',
  actor: { id: string },
) {
  if (!commission) return;
  const title = label === 'secondary' ? 'Secondary commission' : 'Commission';
  if (
    commission.expected !== 'Yes' &&
    (commission.amount !== undefined ||
      commission.percentage_bps !== undefined ||
      commission.received)
  )
    throw new Error(`No/Unknown ${title.toLowerCase()} cannot submit stale commission amounts`);
  if (commission.amount !== undefined && commission.percentage_bps !== undefined)
    throw new Error(`Enter ${title.toLowerCase()} dollars or percentage, not both`);
  if (
    commission.received &&
    (commission.expected !== 'Yes' ||
      !commission.payer_id ||
      (commission.amount === undefined && commission.percentage_bps === undefined))
  )
    throw new Error(
      `Actual ${title.toLowerCase()} receipt needs an identified payer and expected amount`,
    );
  if (
    commission.expected !== 'Yes' ||
    !commission.payer_id ||
    (commission.amount === undefined && commission.percentage_bps === undefined)
  )
    return;
  if (
    commission.percentage_bps !== undefined &&
    commission.basis_kind &&
    commission.basis_kind !== 'Customer sale' &&
    commission.basis_amount === undefined
  )
    throw new Error(`Enter the agreed ${title.toLowerCase()} basis amount`);
  if (
    commission.percentage_bps !== undefined &&
    commission.basis_amount === undefined &&
    !saleKnown
  )
    throw new Error(
      `${title} percentage requires a known customer price or an explicit provider/agreed basis`,
    );
  const commissionBasis = commission.basis_amount ?? sale;
  const numerator = BigInt(commissionBasis) * BigInt(commission.percentage_bps ?? 0);
  if (commission.percentage_bps !== undefined && numerator % 10000n)
    throw new Error(
      `${title} percentage produces fractional cents; enter the exact dollar amount`,
    );
  const gross = commission.amount ?? Number(numerator / 10000n);
  if (commission.received && gross === 0)
    throw new Error(`Expected ${title.toLowerCase()} must cover the actual receipt`);
  if (gross <= 0) return;
  const priorSamePayer = (
    await tx.query('SELECT id FROM commissions WHERE booking_id=$1 AND payer_id=$2', [
      bookingId,
      commission.payer_id,
    ])
  ).rows;
  if (priorSamePayer.length)
    throw new Error(
      `${title} payer already has a receivable on this booking; do not double-post from Add commission and New Booking`,
    );
  const iataReady = await commissionIataPartnerReady(tx);
  const c = await insert(tx, 'commissions', {
    booking_id: bookingId,
    payer_id: commission.payer_id,
    gross,
    retained: 0,
    due_on: commission.due_on ?? date,
    ...(iataReady ? { is_iata_partner: label === 'primary' } : {}),
    command_id,
  });
  const noteBody = [
    label === 'secondary'
      ? '[secondary] Secondary expected commission receivable (not IATA primary, not org payable).'
      : '[primary] Primary IATA / partner commission receivable.',
    commission.notes ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  await insert(tx, 'notes', {
    record_type: 'booking',
    record_id: bookingId,
    actor: actor.id,
    body: noteBody,
  });
  await movement(tx, command_id, date, 'commission_accrual', gross, bookingId);
  await line(
    tx,
    command_id,
    date,
    'commission_receivable',
    'commission_revenue',
    gross,
    bookingId,
  );
  if (commission.received) {
    if (!commission.received_on || !commission.method)
      throw new Error(`Actual ${title.toLowerCase()} receipt requires date and method`);
    await postPayment(
      tx,
      command_id,
      schemas.payment.parse({
        party_id: commission.payer_id,
        direction: 'commission',
        amount: commission.received,
        date: commission.received_on,
        method: commission.method,
        reference:
          label === 'secondary'
            ? 'Booking secondary commission receipt'
            : 'Booking commission receipt',
        account_id: commission.account_id,
        commission_allocations: [{ commission_id: c.id, amount: commission.received }],
      }),
      commission.received_on,
    );
  }
}

/** Create Commission Payable from an accepted partnership agreement in one booking save. */
async function applyReferringOrganization(
  tx: SQL,
  command_id: string,
  date: string,
  bookingId: string,
  travelEnd: string | null | undefined,
  organizationId: string | null | undefined,
  actor: { id: string },
) {
  if (!organizationId) return;
  await requirePayableTerms(tx);
  const partnerships = Boolean(
    (
      await tx.query('SELECT to_regclass($1) name', [
        tx.storage === 'padova' ? 'padova.pt_organizations' : 'public.pt_organizations',
      ])
    ).rows[0].name,
  );
  if (!partnerships)
    throw new Error('Partnerships is not installed; choose the organization after CRM setup');
  const org = await one(tx, 'SELECT * FROM pt_organizations WHERE id=$1', [organizationId]);
  if (!org.accounting_party_id)
    throw new Error('Link this organization to an accounting payee before using it on a booking');
  await one(tx, 'SELECT id FROM parties WHERE id=$1 AND archived_at IS NULL', [
    org.accounting_party_id,
  ]);
  const agreement = (
    await tx.query(
      `SELECT * FROM pt_agreements WHERE organization_id=$1 AND status='accepted'
         AND version=(SELECT max(x.version) FROM pt_agreements x WHERE x.organization_id=$1)
         AND starts_on<=$2::date AND (ends_on IS NULL OR ends_on>=$2::date)
       ORDER BY version DESC LIMIT 1`,
      [organizationId, date],
    )
  ).rows[0];
  if (!agreement?.terms?.calculation)
    throw new Error('No accepted partnership agreement with commission terms for this organization');
  const terms = agreement.terms;
  const dueOn =
    terms.payable_when === 'On date' && terms.due_on
      ? terms.due_on
      : (travelEnd ?? date);
  const referral = await insert(tx, 'referrals', {
    booking_id: bookingId,
    referrer_id: org.accounting_party_id,
    basis: terms.calculation === 'fixed' ? 'fixed' : 'profit',
    rate_bps: terms.rate_bps ?? 0,
    fixed_amount: terms.fixed_amount ?? 0,
    after_receipt: terms.payable_when === 'After commission received',
    due_on: dueOn,
    command_id,
  });
  const payableRevision = await insert(tx, 'commission_payable_revisions', {
    referral_id: referral.id,
    revision: 1,
    calculation: terms.calculation,
    percentage_basis: terms.percentage_basis ?? 'profit',
    rate_bps: terms.rate_bps ?? 0,
    fixed_amount: terms.fixed_amount ?? 0,
    agreed_basis: terms.agreed_basis,
    earned: true,
    earned_on: date,
    payable_when: terms.payable_when,
    due_on: dueOn,
    cancellation_rule: terms.cancellation_rule ?? 'Realized economics',
    reason: `Booking entry · ${org.name} agreement`,
    effective_on: date,
    command_id,
  });
  const ptReferrals = Boolean(
    (
      await tx.query('SELECT to_regclass($1) name', [
        tx.storage === 'padova' ? 'padova.pt_referrals' : 'public.pt_referrals',
      ])
    ).rows[0].name,
  );
  if (ptReferrals) {
    await insert(tx, 'pt_referrals', {
      organization_id: organizationId,
      agreement_id: agreement.id,
      booking_id: bookingId,
      accounting_referral_id: referral.id,
      accounting_terms_revision_id: payableRevision.id,
      kind: 'booking',
      occurred_on: date,
      reference: `Booking ${bookingId}`,
      source_url: null,
      actor_id: actor.id,
    });
  }
}

async function postAssetTransfer(tx: SQL, command_id: string, d: Row, date: string) {
  if (d.sending_asset_id === d.receiving_asset_id) throw new Error('Transfer accounts must differ');
  const source = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.sending_asset_id]);
  const target = await one(tx, 'SELECT * FROM assets WHERE id=$1 FOR UPDATE', [
    d.receiving_asset_id,
  ]);
  if (source.ownership !== 'Padova' || target.ownership !== 'Padova')
    throw new Error('Transfer accounts must be Padova-owned');
  if (assetUnit(source) !== 'points' || assetUnit(target) !== 'points')
    throw new Error(
      'Points transfer requires two points accounts; use conversion for other instruments',
    );
  const used = await consume(tx, command_id, source.id, d.quantity_sent, date, 'transfer_out');
  const lot = await insert(tx, 'asset_lots', {
    asset_id: target.id,
    quantity: d.quantity_received,
    cost: used.basis + d.fees,
    acquired_on: date,
    source_lot_id: used.movements.length === 1 ? used.movements[0].lot_id : undefined,
    command_id,
  });
  await insert(tx, 'asset_movements', {
    asset_id: target.id,
    lot_id: lot.id,
    quantity: d.quantity_received,
    basis: used.basis + d.fees,
    kind: 'transfer_in',
    effective_on: date,
    command_id,
  });
  const result = await insert(tx, 'asset_transfers', {
    sending_asset_id: source.id,
    receiving_asset_id: target.id,
    quantity_sent: d.quantity_sent,
    quantity_received: d.quantity_received,
    basis: used.basis,
    fees: d.fees,
    effective_on: date,
    command_id,
  });
  await line(tx, command_id, date, 'travel_inventory', 'asset_acquisition_payable', d.fees);
  return result;
}

async function rebateMovements(
  tx: SQL,
  command_id: string,
  event: Row,
  quantity: number,
  date: string,
) {
  const component = await one(tx, 'SELECT * FROM funding_components WHERE id=$1', [
    event.funding_component_id,
  ]);
  const asset = await one(tx, 'SELECT * FROM assets WHERE id=$1', [component.asset_id]);
  if (asset.ownership !== 'Padova' || assetUnit(asset) !== 'points')
    throw new Error('Only Padova-owned points generate a Padova inventory rebate');
  const originals = (
    await tx.query(
      'SELECT m.* FROM funding_asset_uses u JOIN asset_movements m ON m.id=u.movement_id WHERE u.funding_component_id=$1 ORDER BY m.id',
      [component.id],
    )
  ).rows;
  if (!originals.length)
    throw new Error('Exact original lot-use mapping is required before posting a rebate');
  let left = quantity,
    basis = 0;
  for (const original of originals) {
    const returned = await one(
      tx,
      'SELECT COALESCE(sum(quantity),0) quantity,COALESCE(sum(basis),0) basis FROM asset_movements WHERE original_movement_id=$1',
      [original.id],
    );
    const available = -n(original.quantity) - n(returned.quantity);
    const qty = Math.min(left, available);
    if (qty <= 0) continue;
    const restored = proportional(-n(original.basis) - n(returned.basis), qty, available);
    await insert(tx, 'asset_movements', {
      asset_id: asset.id,
      lot_id: original.lot_id,
      booking_id: component.booking_id,
      quantity: qty,
      basis: restored,
      kind: 'points_rebate',
      effective_on: date,
      original_movement_id: original.id,
      command_id,
    });
    basis += restored;
    left -= qty;
    if (!left) break;
  }
  if (left) throw new Error('Rebate exceeds original points use after previous returns');
  await line(
    tx,
    command_id,
    date,
    'travel_inventory',
    'supplier_recovery',
    basis,
    component.booking_id,
  );
  await movement(tx, command_id, date, 'supplier_recovery', basis, component.booking_id);
  return { id: event.id, basis, quantity, booking_id: component.booking_id };
}

async function appendPriceMatch(tx: SQL, actor: Actor, command_id: string, data: Row) {
  const booking = await one(tx, 'SELECT itinerary FROM bookings WHERE id=$1', [data.booking_id]);
  const { booking_id: _, name: __, kind: ___, expires_on: ____, ...event } = data;
  const entry = {
    ...event,
    id: command_id,
    actor: actor.id,
    recorded_at: new Date().toISOString(),
  };
  const itinerary = bookingItinerary.parse({
    ...booking.itinerary,
    price_match_history: [...(booking.itinerary.price_match_history ?? []), entry],
  });
  await tx.query('UPDATE bookings SET itinerary=$2 WHERE id=$1', [
    data.booking_id,
    JSON.stringify(itinerary),
  ]);
  return { id: command_id, booking_id: data.booking_id };
}

async function postPayment(tx: SQL, command_id: string, d: Row, date: string) {
  if (d.direction === 'supplier') await requirePartyRole(tx, d.party_id, 'seller');
  if (d.direction === 'supplier') await validatePaymentAccount(tx, d.account_id, d.method);
  let result: Row = {};
  const touched = new Set<string>();
  if (!['customer', 'supplier', 'commission'].includes(d.direction))
    throw new Error('Use the dedicated linked workflow for this payment direction');
  const { date: _, allocations, commission_allocations, ...values } = d;
  if (d.direction !== 'commission' && commission_allocations.length)
    throw new Error('Commission allocations require a commission receipt');
  if (d.direction === 'commission' && allocations.length)
    throw new Error('Select commission receivables instead of booking payment allocations');
  result = await insert(tx, 'payments', { ...values, paid_on: date });
  const incoming = ['customer', 'commission', 'supplier_refund', 'asset_sale'].includes(
    d.direction,
  );
  const account =
    d.direction === 'customer'
      ? 'customer_credit'
      : d.direction === 'supplier'
        ? 'supplier_payable'
        : `${d.direction}_clearing`;
  await line(
    tx,
    command_id,
    date,
    incoming ? 'cash' : account,
    incoming ? account : 'cash',
    d.amount,
    undefined,
    d.party_id,
  );
  for (const a of allocations) {
    await allocate(tx, command_id, result.id, a.booking_id, a.amount, a.obligation_id);
    touched.add(a.booking_id);
    if (d.direction === 'customer')
      await line(
        tx,
        command_id,
        date,
        'customer_credit',
        'customer_receivable',
        a.amount,
        a.booking_id,
        d.party_id,
      );
  }
  for (const allocation of commission_allocations) {
    const posted = await postCommissionReceipt(
      tx,
      command_id,
      { ...allocation, payment_id: result.id },
      date,
    );
    touched.add(posted.booking_id);
  }
  return { result, bookings: [...touched] };
}

async function appendTravelReferences(tx: SQL, command_id: string, travel: Row) {
  const relation =
    tx.storage === 'padova' ? 'padova.booking_references' : 'public.booking_references';
  if (!(await one(tx, 'SELECT to_regclass($1) name', [relation])).name) return;
  const origin = (await tx.query('SELECT payload FROM commands WHERE id=$1', [travel.command_id]))
    .rows[0];
  const primary = origin?.payload?.operational
    ? travel.product === 'Flight'
      ? 'airline_pnr'
      : travel.product === 'Hotel'
        ? 'hotel_confirmation'
        : travel.product === 'Car'
          ? 'car_confirmation'
          : 'other_reference'
    : 'other_reference';
  for (const [type, values] of [
    [primary, travel.details.confirmations ?? []],
    ['ticket_number', travel.details.ticket_numbers ?? []],
    ['booking_source_confirmation', travel.details.booking_source_confirmation ?? []],
  ] as [string, string[]][]) {
    for (const value of new Set(values)) {
      if (
        !(
          await tx.query(
            'SELECT id FROM booking_references WHERE booking_id=$1 AND reference_type=$2 AND value=$3',
            [travel.booking_id, type, value],
          )
        ).rows.length
      )
        await insert(tx, 'booking_references', {
          booking_id: travel.booking_id,
          travel_component_id: travel.id,
          reference_type: type,
          value,
          command_id,
        });
    }
  }
}

async function postOperationalComponent(
  tx: SQL,
  command_id: string,
  booking: Row,
  travel: Row,
  c: Row,
  actor: Actor,
) {
  requirePermission(actor, 'manage_funding');
  if (c.seller_id) await requirePartyRole(tx, c.seller_id, 'seller');
  if (c.bp_gross_points !== undefined) {
    if (
      c.type !== 'Outside seller' ||
      c.supplied !== 'Points / Miles' ||
      c.bp_rebate_bps === undefined ||
      c.rebate_expected
    )
      throw new Error(
        'Outside Business Platinum economics require seller-owned points and an agreed rebate basis; no Padova rebate is created.',
      );
    const net = Number(
      (BigInt(c.bp_gross_points) * BigInt(10000 - c.bp_rebate_bps) + 5000n) / 10000n,
    );
    if (c.quantity !== undefined && c.quantity !== net && !c.bp_net_override_reason?.trim())
      throw new Error('Explain the agreed net-points exception.');
    c.original_quantity = c.bp_gross_points;
    c.quantity ??= net;
  }
  if (c.supplied === 'Points / Miles' && c.unit !== 'points')
    throw new Error('Points / Miles requires whole point quantity');
  if (c.supplied === 'Certificate / Award' && c.unit !== 'count')
    throw new Error('Certificate requires certificate quantity, not points or dollars');
  if (c.supplied === 'Voucher / Travel Credit' && c.unit !== 'money')
    throw new Error('Voucher amount must use money units');
  if ((c.quoted_rate || c.rate_unit) && c.supplied !== 'Points / Miles')
    throw new Error('Point rate is incompatible with this purchase');
  if (c.quoted_rate && c.rate_unit !== 'Fixed supplier price') {
    const calculated = exactPointCost(c.quantity, c.quoted_rate, c.rate_unit);
    if (c.cost !== undefined && c.cost !== calculated)
      throw new Error(
        'Point quote differs from dollar cost; use Fixed supplier price for an agreed override',
      );
    c.cost = calculated;
  }
  if (c.supplied === 'Certificate / Award' && c.unit === 'points')
    throw new Error('Certificate cannot contain stale points quantity');
  if (c.type === 'Padova payment' || c.paid)
    await validatePaymentAccount(tx, c.account_id, c.method);
  if (c.program_id) {
    const program = await one(tx, 'SELECT * FROM programs WHERE id=$1', [c.program_id]);
    if (c.supplied === 'Points / Miles' && !['Airline', 'Hotel', 'Bank'].includes(program.category))
      throw new Error('Choose a loyalty or reward program for points');
  }
  if (c.instrument_id) {
    const instrument = await validateInstrument(tx, c);
    if (c.program_id && instrument?.program_id !== c.program_id)
      throw new Error('Certificate instrument belongs to a different program');
  }
  if (c.account_id)
    await one(tx, 'SELECT id FROM payment_accounts WHERE id=$1 AND archived_at IS NULL', [
      c.account_id,
    ]);
  const terms = {
    operational_kind: c.type,
    supplied: c.supplied,
    program_id: c.program_id ?? undefined,
    reference: c.reference,
    notes: c.notes,
    account_holder_id: c.holder_id ?? undefined,
    quoted_rate: c.quoted_rate,
    rate_unit: c.rate_unit,
    cost_complete: true,
    original_quantity: c.original_quantity,
    bp_gross_points: c.bp_gross_points,
    bp_rebate_bps: c.bp_rebate_bps,
    bp_net_override_reason: c.bp_net_override_reason,
    expires_on: c.expires_on,
    description: c.description,
  };
  if (c.type === 'Customer card') {
    if (!c.owner_id || !c.cost) throw new Error('Customer card requires owner and positive amount');
    if (
      c.paid ||
      c.new_asset ||
      c.asset_id ||
      c.account_id ||
      c.seller_id ||
      c.program_id ||
      c.instrument_id ||
      c.quantity ||
      c.quoted_rate ||
      c.rate_unit ||
      c.unit !== 'money'
    )
      throw new Error('Customer direct card is not a Padova payment or asset');
    const linked =
      c.owner_id === booking.customer_id ||
      (
        await tx.query('SELECT 1 FROM booking_travelers WHERE booking_id=$1 AND person_id=$2', [
          booking.id,
          c.owner_id,
        ])
      ).rows.length;
    if (!linked) throw new Error('Customer card owner must be the customer or a selected traveler');
    const f = await insert(tx, 'funding_components', {
      booking_id: booking.id,
      kind: 'Customer direct card',
      unit: 'money',
      face_amount: c.cost,
      cost: 0,
      reference: c.reference,
      effective_on: c.date,
      command_id,
    });
    return insert(tx, 'fulfillment_details', {
      booking_id: booking.id,
      travel_component_id: travel.id,
      funding_component_id: f.id,
      mode: 'Cash/Card',
      role: 'Core',
      unit: 'money',
      quantity: c.cost,
      terms: {
        ...terms,
        customer_card_owner_id: c.owner_id,
        card_nickname: c.card_nickname,
        last_four: c.last_four,
        direct_amount: c.cost,
      },
      command_id,
    });
  }
  if (c.type === 'Owned value' || c.new_asset) {
    let asset_id = c.asset_id;
    if (c.new_asset) {
      if (c.cost !== undefined && c.cost !== c.new_asset.cost)
        throw new Error('Acquisition cost must match the agreed seller cost');
      if (!c.seller_id) throw new Error('Acquisition requires its seller');
      const a = await createAsset(tx, command_id, {
        ...c.new_asset,
        unit: c.unit,
        instrument_id: c.instrument_id,
        date: c.date,
        seller_id: c.seller_id,
        holder_id: c.holder_id,
        ownership: 'Padova',
        source_booking_id: booking.id,
        restrictions: c.notes,
      });
      asset_id = a.id;
      await line(
        tx,
        command_id,
        c.date,
        'travel_inventory',
        'asset_acquisition_payable',
        c.new_asset.cost,
        undefined,
        c.seller_id,
      );
      if (c.paid) {
        if (!c.method || c.paid > c.new_asset.cost)
          throw new Error('Acquisition payment requires method and cannot exceed cost');
        const payment = await insert(tx, 'payments', {
          direction: 'asset_purchase',
          party_id: c.seller_id,
          amount: c.paid,
          paid_on: c.date,
          method: c.method,
          account_id: c.account_id,
          reference: c.reference,
        });
        await insert(tx, 'asset_acquisition_payments', {
          asset_id: a.id,
          payment_id: payment.id,
          amount: c.paid,
          command_id,
        });
        await line(
          tx,
          command_id,
          c.date,
          'asset_acquisition_payable',
          'cash',
          c.paid,
          undefined,
          c.seller_id,
        );
      }
    }
    if (!asset_id || !c.quantity) throw new Error('Choose owned inventory and quantity used');
    return postFulfillment(
      tx,
      command_id,
      {
        booking_id: booking.id,
        travel_component_id: travel.id,
        mode: 'Owned inventory',
        asset_id,
        unit: c.unit,
        quantity: c.quantity,
        role: 'Core',
        terms,
        confirm_cost: true,
        rebate_expected: c.rebate_expected,
      },
      c.date,
    );
  }
  // Missing cost/source is an explicit operational claim, never a zero invoice.
  if (c.cost === undefined || (c.type !== 'Padova payment' && !c.seller_id)) {
    if (c.paid)
      throw new Error(
        'Identify seller and cost before recording its actual payment; incomplete details can be saved as Draft',
      );
    await insert(tx, 'notes', {
      record_type: 'booking',
      record_id: booking.id,
      actor: actor.id,
      body: `Needs Attention: unposted ${c.type}; cost/source unknown. ${c.notes}`,
    });
    return;
  }
  if (c.type === 'Padova payment') {
    if (!c.cost) throw new Error('An actual Padova payment must be positive');
    if (!c.method || (c.method === 'Card' && !c.account_id))
      throw new Error('Select payment method and saved card/account');
    if (c.seller_id || c.asset_id || c.new_asset)
      throw new Error('Direct Padova payment must not fabricate a seller/asset');
    const f = await insert(tx, 'funding_components', {
      booking_id: booking.id,
      kind: c.method,
      unit: 'money',
      face_amount: c.cost || 1,
      cost: c.cost,
      account_id: c.account_id,
      reference: c.reference,
      effective_on: c.date,
      command_id,
    });
    await line(tx, command_id, c.date, 'booking_cost', 'cash', c.cost, booking.id);
    return insert(tx, 'fulfillment_details', {
      booking_id: booking.id,
      travel_component_id: travel.id,
      funding_component_id: f.id,
      mode: 'Cash/Card',
      role: 'Core',
      unit: 'money',
      quantity: c.cost || 1,
      terms: { ...terms, direct_payment: true },
      command_id,
    });
  }
  if (c.asset_id || c.rebate_expected)
    throw new Error('Seller-owned value does not create Padova inventory or rebates');
  if ((c.paid ?? 0) > c.cost || (c.paid && !c.method))
    throw new Error('Seller payment needs a method and cannot exceed the obligation');
  if (c.quantity == null && !c.cost)
    throw new Error(
      'Zero-cost supplied value needs its actual quantity; an incomplete claim can be saved as Draft',
    );
  const f = await postFunding(
    tx,
    command_id,
    {
      booking_id: booking.id,
      kind: c.supplied,
      unit: c.quantity == null ? 'money' : c.unit,
      face_amount: c.quantity ?? c.cost,
      cost: c.cost,
      seller_id: c.seller_id,
      reference: c.reference,
      settled: false,
    },
    c.date,
  );
  const detail = await insert(tx, 'fulfillment_details', {
    booking_id: booking.id,
    travel_component_id: travel.id,
    funding_component_id: f.id,
    source_id: c.seller_id,
    instrument_id: c.instrument_id,
    mode: 'Outside source',
    role: 'Core',
    unit: c.unit,
    quantity: c.quantity ?? null,
    terms,
    command_id,
  });
  if (c.paid)
    await postPayment(
      tx,
      command_id,
      schemas.payment.parse({
        direction: 'supplier',
        party_id: c.seller_id,
        amount: c.paid,
        date: c.date,
        method: c.method,
        account_id: c.account_id,
        reference: c.reference,
        allocations: [{ booking_id: booking.id, amount: c.paid, obligation_id: f.obligation_id }],
      }),
      c.date,
    );
  return detail;
}

/** Only the evidence-bound importer supplies this server-side context. HTTP callers cannot. */
export type ReviewedHistoricalSource = {
  event_key: string;
  evidence_id: string;
  capture_batch_id: string;
};

export async function execute(
  db: Database,
  actor: Actor,
  command: Command,
  reviewedHistory?: ReviewedHistoricalSource,
): Promise<Row> {
  const command_id = id.parse(command.id);
  if (!(command.kind in schemas)) throw new Error('Unknown command');
  const kind = command.kind;
  const permission = commandPermission(kind);
  requirePermission(actor, permission);
  const d: Row = schemas[kind].parse(sanitizeOperationalInput(command.data));
  const historicalOpening = kind === 'acquire_asset' && d.historical_opening === true;
  const historicalRefund = kind === 'payment' && d.historical_refund_settlement === true;
  const historicalUndated = kind === 'booking' && d.historical_undated_booking === true;
  const historicalReturnLink = kind === 'reconcile_supplier_return';
  if (
    Boolean(historicalOpening || historicalRefund || historicalUndated || historicalReturnLink) !==
    Boolean(reviewedHistory)
  )
    throw new Error('Historical value or settlement requires the reviewed source importer');
  if (kind === 'booking') {
    if (historicalUndated) {
      if (
        d.product !== 'Hotel' ||
        !d.itinerary.hotel_name?.trim() ||
        d.itinerary.sale_known !== true ||
        d.itinerary.cost_status !== 'Pending' ||
        d.sale <= 0 ||
        d.travel_start !== null ||
        d.travel_end !== null ||
        d.operational ||
        d.create_initial_travel ||
        d.travel_components_input ||
        d.funding.length ||
        d.customer_payment
      )
        throw new Error(
          'Reviewed undated hotel requires blank stay dates and separate financial events',
        );
    } else if (d.travel_start === null || d.travel_end === null) {
      throw new Error('Travel dates are required outside the reviewed undated hotel import');
    }
  }
  if (['fulfill', 'revise_fulfillment'].includes(kind) && d.rebate_expected)
    requirePermission(actor, 'manage_assets');
  const payload = JSON.stringify(d);
  return db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    if (['fulfill', 'revise_fulfillment'].includes(kind) && d.rebate_expected)
      requirePermission(actor, 'manage_assets');
    const appToday = await businessDate(tx);
    if (tx.storage === 'padova') {
      await tx.query(
        "SELECT set_config('request.jwt.claim.sub',$1,true),set_config('padova.reason',$2,true)",
        [actor.id, d.reason ?? kind],
      );
      if (!['note', 'resolve_attention'].includes(kind)) {
        const gate = await one(
          tx,
          'SELECT operational_entry_enabled,backup_verified_at FROM padova.settings WHERE id=true',
        );
        if (!gate.operational_entry_enabled || !gate.backup_verified_at)
          throw new Error(
            'Operational entry is locked until independent backup and restore verification',
          );
      }
      if (
        d.booking_id &&
        !(
          await tx.query('SELECT id FROM padova.bookings WHERE id=$1 AND app_managed=true', [
            d.booking_id,
          ])
        ).rows.length
      )
        throw new Error(
          'Existing booking requires explicit compatibility review before new-engine posting',
        );
    }
    requirePermission(actor, permission);
    if (reviewedHistory) {
      requirePermission(actor, 'manage_settings');
      if (actor.role !== 'OWNER' || tx.storage !== 'padova')
        throw new Error(
          'Historical owned value requires an individual Owner and existing foundation',
        );
      if ((d.date ?? d.booked_on) > appToday)
        throw new Error('Historical events cannot be future dated');
      if (
        historicalOpening &&
        (d.kind !== 'Voucher' ||
          d.ownership !== 'Padova' ||
          (d.unit !== undefined && d.unit !== 'money') ||
          d.cost == null ||
          d.cost <= 0 ||
          !d.reference.trim() ||
          d.seller_id ||
          d.source_booking_id)
      )
        throw new Error(
          'Opening requires owned monetary voucher, confirmed positive basis and reference; no inferred seller or source-booking expense',
        );
      if ((await tx.query("SELECT to_regclass('padova.qa_environment') name")).rows[0]?.name)
        throw new Error('Historical value cannot be posted to QA');
      if (
        historicalRefund &&
        (!['customer_refund', 'supplier_refund'].includes(d.direction) ||
          d.allocations.length ||
          d.commission_allocations.length ||
          !d.reference.trim() ||
          !d.account_id ||
          d.amount <= 0)
      )
        throw new Error(
          'Historical refund settlement requires its account/reference and leaves allocations unresolved',
        );
      await tx.query('SELECT padova.check_financial_import_source($1,$2,$3,$4)', [
        reviewedHistory.event_key,
        id.parse(reviewedHistory.evidence_id),
        id.parse(reviewedHistory.capture_batch_id),
        command_id,
      ]);
    }
    if (kind === 'booking') await requirePartyRole(tx, d.customer_id, 'customer');
    if (['booking', 'revise'].includes(kind)) {
      if (d.supplier_id) await requirePartyRole(tx, d.supplier_id, 'seller');
      for (const travelerId of d.traveler_ids) await requirePartyRole(tx, travelerId, 'traveler');
    }
    if (['travel_component', 'revise_travel'].includes(kind)) {
      assertBookingProductData(d.product, d.details);
      if (d.details.trip_type === 'Multi-City') {
        const segments = validateSegments(d.details.segments, d.travel_start, d.travel_end);
        d.details.route = segments.map((s) => `${s.origin}-${s.destination}`).join(' / ');
      }
      if (
        d.product === 'Flight' &&
        d.details.trip_type === 'One Way' &&
        (d.travel_end !== d.travel_start || d.details.end_date_known)
      )
        throw new Error('One Way cannot contain a return date');
      if (d.provider_id) await requirePartyRole(tx, d.provider_id, providerRole(d.product));
      for (const key of ['marketing_carrier_id', 'operating_carrier_id'])
        if (d.details?.[key]) await requirePartyRole(tx, d.details[key], 'airline');
    }
    if (kind === 'booking' && d.travel_components_input)
      for (const travel of d.travel_components_input) {
        assertBookingProductData(travel.product, travel.details, d.operational?.references);
        if (
          travel.product === 'Flight' &&
          travel.details.trip_type === 'One Way' &&
          (travel.travel_end !== travel.travel_start || travel.details.end_date_known)
        )
          throw new Error('One Way cannot contain a return date');
        if (travel.provider_id)
          await requirePartyRole(tx, travel.provider_id, providerRole(travel.product));
      }
    if (['party', 'edit_party'].includes(kind)) {
      const policy = z
        .object({
          tier: z.enum(['1', '2', '3']).nullish(),
          comfort_level: z.enum(['A', 'B', 'C']).nullish(),
        })
        .passthrough();
      if (d.details.corporate_policy) policy.parse(d.details.corporate_policy);
      for (const [company_id, settings] of Object.entries(d.details.company_policies ?? {})) {
        id.parse(company_id);
        policy.parse(settings);
      }
    }
    if (['booking', 'revise'].includes(kind)) {
      const product =
        d.product ??
        (await one(tx, 'SELECT product FROM bookings WHERE id=$1', [d.booking_id])).product;
      assertBookingProductData(product, d.itinerary, d.operational?.references);
      if (
        product === 'Flight' &&
        d.itinerary.trip_type === 'One Way' &&
        (d.travel_end !== d.travel_start || d.itinerary.end_date_known)
      )
        throw new Error('One Way cannot contain a return date');
      if (d.itinerary.acquisition_source_status === 'Unknown' && d.itinerary.acquisition_source_id)
        throw new Error('Unknown acquisition source cannot also name an identified source');
      if (
        d.itinerary.acquisition_source_status === 'Identified' &&
        !d.itinerary.acquisition_source_id
      )
        throw new Error('Choose the identified acquisition source, or mark its identity Unknown');
      for (const key of ['airline_id', 'acquisition_source_id']) {
        if (d.itinerary[key]) {
          if (key === 'airline_id') await requirePartyRole(tx, d.itinerary[key], 'airline');
          else await one(tx, 'SELECT id FROM parties WHERE id=$1', [d.itinerary[key]]);
        }
      }
    }
    if (kind === 'booking' && d.sale > 0) requirePermission(actor, 'edit_customer_charges');
    if (kind === 'booking' && d.funding.length) requirePermission(actor, 'manage_funding');
    if (kind === 'booking' && d.customer_payment) requirePermission(actor, 'edit_payments');
    if (kind === 'booking' && d.operational) {
      if (d.operational.components.length) requirePermission(actor, 'manage_funding');
      if (taxesCreateFunding(d.operational.taxes)) requirePermission(actor, 'manage_funding');
      if (d.operational.sale_known) requirePermission(actor, 'edit_customer_charges');
      if (d.operational.components.some((c: Row) => c.new_asset || c.rebate_expected))
        requirePermission(actor, 'manage_assets');
      if (d.operational.additional_charge) requirePermission(actor, 'edit_customer_charges');
      if (
        d.operational.commission?.expected === 'Yes' ||
        d.operational.secondary_commission?.expected === 'Yes' ||
        d.operational.referring_organization_id
      )
        requirePermission(actor, 'manage_commissions');
    }
    if (kind === 'booking' && d.itinerary.price_match_history?.length)
      throw new Error('Use the dedicated price-match workflow to record case history');
    if (kind === 'booking' && d.itinerary.historical_sources && actor.role !== 'OWNER')
      throw new Error('Only the Owner can attach unreviewed historical source payloads');
    if (kind === 'booking' && ['Confirmed', 'No supplier cost'].includes(d.itinerary.cost_status))
      requirePermission(actor, 'manage_funding');
    if (kind === 'revise') {
      if (d.fare_difference || d.supplier_change_fee) requirePermission(actor, 'manage_funding');
      if (d.change_seller_id) await requirePartyRole(tx, d.change_seller_id, 'seller');
      if (d.additional_customer_charge || d.padova_change_fee)
        requirePermission(actor, 'edit_customer_charges');
      if (d.padova_change_fee > d.additional_customer_charge)
        throw new Error('The total additional customer charge must include the Padova fee');
      const previous = await one(tx, 'SELECT itinerary FROM bookings WHERE id=$1', [d.booking_id]);
      if (
        d.itinerary.historical_sources !== undefined &&
        JSON.stringify(d.itinerary.historical_sources) !==
          JSON.stringify(previous.itinerary.historical_sources)
      )
        throw new Error(
          'Historical source payloads cannot be overwritten through an operational booking edit',
        );
      if (
        d.itinerary.price_match_history !== undefined &&
        JSON.stringify(d.itinerary.price_match_history) !==
          JSON.stringify(bookingItinerary.parse(previous.itinerary).price_match_history ?? [])
      )
        throw new Error('Price-match history is append-only; use the dedicated case workflow');
      if (
        d.itinerary.operational_entry !== undefined &&
        JSON.stringify(d.itinerary.operational_entry) !==
          JSON.stringify(previous.itinerary.operational_entry)
      )
        throw new Error(
          'Operational entry metadata is preserved; use dedicated financial or source profile commands',
        );
      if (d.itinerary.cost_status !== previous.itinerary?.cost_status) {
        requirePermission(actor, 'manage_funding');
        if (d.itinerary.cost_status === 'Pending' || !d.itinerary.cost_status)
          throw new Error(
            'A confirmed cost cannot be silently changed to unknown; use a reviewed financial correction',
          );
      }
    }
    if (kind === 'payment' && d.direction !== 'customer')
      requirePermission(
        actor,
        historicalRefund
          ? 'issue_refunds'
          : d.direction === 'supplier'
            ? 'manage_funding'
            : 'manage_commissions',
      );
    if (kind === 'allocate') {
      const payment = await one(tx, 'SELECT direction FROM payments WHERE id=$1', [d.payment_id]);
      if (payment.direction === 'supplier') requirePermission(actor, 'manage_funding');
    }
    if (
      d.booking_id &&
      [
        'revise',
        'charge',
        'confirm_sale',
        'fund',
        'commission',
        'referral',
        'cancel',
        'reconcile_supplier_return',
        'benefit',
        'price_match_event',
        'booking_source_profile_link',
        'voucherize',
        'travel_component',
        'revise_travel',
        'revise_fulfillment',
        'reverse_fulfillment',
        'fulfill',
        'link_fulfillment',
        'confirm_travel_no_cost',
        'cancellation_cost',
      ].includes(kind)
    ) {
      const booking = await one(
        tx,
        'SELECT reservation_status,travel_end FROM bookings WHERE id=$1',
        [d.booking_id],
      );
      if (booking.reservation_status === 'Traveled' || booking.travel_end < appToday)
        requirePermission(actor, 'edit_completed_bookings');
    }
    const old = await tx.query('SELECT * FROM commands WHERE id=$1', [command_id]);
    if (old.rows[0]) {
      if (
        old.rows[0].kind !== kind ||
        JSON.stringify(old.rows[0].payload) !== JSON.stringify(JSON.parse(payload)) ||
        old.rows[0].actor !== actor.id
      ) {
        // JSONB key ordering differs from JS insertion order; compare sorted canonical objects below.
        const stable = (v: any): any =>
          Array.isArray(v)
            ? v.map(stable)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                  Object.keys(v)
                    .sort()
                    .map((k) => [k, stable(v[k])]),
                )
              : v;
        const canonical = (v: Row) => JSON.stringify(stable(v));
        if (
          old.rows[0].kind !== kind ||
          canonical(schemas[kind].parse(old.rows[0].payload)) !== canonical(d) ||
          old.rows[0].actor !== actor.id
        )
          throw new Error('Idempotency key already used for a different command');
      }
      return old.rows[0].result;
    }
    await insert(tx, 'commands', { id: command_id, actor: actor.id, kind, payload: d });
    let result: Row = {},
      before: Row | null = null;
    const date = d.date ?? d.booked_on ?? appToday;
    const touched = new Set<string>();
    if (d.booking_id) touched.add(d.booking_id);
    switch (kind) {
      case 'booking_source_method': {
        result = await insert(tx, 'booking_source_methods', { ...d, created_by: actor.id });
        break;
      }
      case 'booking_source_profile': {
        await one(tx, 'SELECT id FROM booking_source_methods WHERE id=$1', [d.source_method_id]);
        if (d.holder_id) await one(tx, 'SELECT id FROM parties WHERE id=$1', [d.holder_id]);
        result = await insert(tx, 'booking_source_profiles', { ...d, created_by: actor.id });
        break;
      }
      case 'booking_source_profile_link': {
        const booking = await one(tx, 'SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [
          d.booking_id,
        ]);
        const profile = await one(tx, 'SELECT * FROM booking_source_profiles WHERE id=$1', [
          d.profile_id,
        ]);
        if (
          !booking.itinerary.operational_entry ||
          profile.status !== 'Active' ||
          profile.source_method_id !== booking.itinerary.operational_entry.source_method_id
        )
          throw new Error('Profile must be active and match this booking source');
        const credits = latestCreditRequests(booking.itinerary.price_match_history);
        if (credits.some((r) => r.profile_id && r.profile_id !== profile.id))
          throw new Error('Existing credit requests retain their original account/profile');
        const uses = await tx.query(
          'SELECT l.profile_id FROM funding_components f JOIN source_profile_assets l ON l.asset_id=f.asset_id WHERE f.booking_id=$1',
          [d.booking_id],
        );
        if (uses.rows.some((r) => r.profile_id !== profile.id))
          throw new Error('Used credit belongs to another profile');
        before = booking;
        await tx.query('UPDATE bookings SET itinerary=$2 WHERE id=$1', [
          d.booking_id,
          JSON.stringify({
            ...booking.itinerary,
            operational_entry: {
              ...booking.itinerary.operational_entry,
              source_profile_id: profile.id,
            },
          }),
        ]);
        result = { id: d.booking_id, profile_id: profile.id };
        break;
      }
      case 'booking_draft': {
        // Draft entry contains no posting; access is actor-scoped on read.
        result = await insert(tx, 'booking_drafts', { ...d, created_by: actor.id, command_id });
        result.draft = true;
        break;
      }
      case 'expected_event': {
        await requireFulfillmentSchema(tx);
        if (d.kind === 'Points transfer') {
          if (
            !d.source_asset_id ||
            !d.target_asset_id ||
            !d.quantity_sent ||
            d.funding_component_id
          )
            throw new Error('Select sending and receiving accounts and whole points sent');
          for (const asset_id of [d.source_asset_id, d.target_asset_id]) {
            const asset = await one(tx, 'SELECT * FROM assets WHERE id=$1', [asset_id]);
            if (asset.ownership !== 'Padova' || assetUnit(asset) !== 'points')
              throw new Error('Transfer requires Padova-owned points accounts');
          }
          if (d.source_asset_id === d.target_asset_id)
            throw new Error('Transfer accounts must differ');
          if (Boolean(d.terms.ratio_numerator) !== Boolean(d.terms.ratio_denominator))
            throw new Error('Specify both parts of the transfer ratio');
          if (d.terms.ratio_numerator) {
            const numerator =
              BigInt(d.quantity_sent) *
              BigInt(d.terms.ratio_numerator) *
              BigInt(10000 + (d.terms.bonus_bps ?? 0));
            const denominator = BigInt(d.terms.ratio_denominator) * 10000n;
            if (
              numerator % denominator !== 0n ||
              numerator / denominator !== BigInt(d.quantity_expected)
            )
              throw new Error(
                'Expected quantity must match the exact transfer ratio and bonus; do not round or guess',
              );
          }
        } else {
          requirePermission(actor, 'manage_funding');
          if (!d.funding_component_id || d.terms.fees)
            throw new Error(
              'A rebate requires the original funding component and has no transfer fee',
            );
          const component = await one(tx, 'SELECT * FROM funding_components WHERE id=$1', [
            d.funding_component_id,
          ]);
          const asset = await one(tx, 'SELECT * FROM assets WHERE id=$1', [component.asset_id]);
          if (asset.ownership !== 'Padova' || assetUnit(asset) !== 'points')
            throw new Error('Outside source rebates are not Padova inventory');
          if (d.booking_id && d.booking_id !== component.booking_id)
            throw new Error('Rebate booking must match the original funding component');
          d.booking_id = component.booking_id;
          d.source_asset_id = asset.id;
          d.target_asset_id = asset.id;
          touched.add(component.booking_id);
          const previous = await one(
            tx,
            "SELECT count(*) count FROM expected_events e WHERE e.funding_component_id=$1 AND e.kind='Points rebate'",
            [component.id],
          );
          if (n(previous.count))
            throw new Error(
              'A rebate event already exists for this component; update the existing event',
            );
          if (d.quantity_expected > n(component.face_amount))
            throw new Error('Expected rebate exceeds original points use');
        }
        const { date: ignored, ...values } = d;
        result = await insert(tx, 'expected_events', { ...values, command_id });
        await insert(tx, 'expected_event_updates', {
          event_id: result.id,
          status: 'Requested',
          effective_on: date,
          reason: 'Expected only; no inventory or profit posted',
          command_id,
        });
        break;
      }
      case 'update_expected_event': {
        await requireFulfillmentSchema(tx);
        // The existing financial transaction lock serializes this append-only event stream.
        const event = await one(tx, 'SELECT * FROM expected_events WHERE id=$1', [d.event_id]);
        const updates = (
          await tx.query(
            'SELECT * FROM expected_event_updates WHERE event_id=$1 ORDER BY created_at,id',
            [event.id],
          )
        ).rows;
        const latest = updates.at(-1)!;
        if (event.booking_id) {
          const booking = await one(
            tx,
            'SELECT travel_end,reservation_status FROM bookings WHERE id=$1',
            [event.booking_id],
          );
          if (booking.travel_end < appToday || booking.reservation_status === 'Traveled')
            requirePermission(actor, 'edit_completed_bookings');
          touched.add(event.booking_id);
        }
        if (event.kind === 'Points rebate') requirePermission(actor, 'manage_funding');
        if (['Denied', 'Reversed'].includes(latest.status))
          throw new Error('This event is closed; preserve its history');
        if (d.status === 'Pending' || d.status === 'Denied') {
          if (latest.status === 'Posted')
            throw new Error(
              'Posted value requires a supported reversal, not a pending/denied edit',
            );
        } else if (d.status === 'Posted') {
          if (latest.status === 'Posted') throw new Error('This event has already been posted');
          if (!d.quantity_actual) throw new Error('Record the actual received quantity');
          if (event.kind === 'Points transfer')
            result = await postAssetTransfer(
              tx,
              command_id,
              {
                sending_asset_id: event.source_asset_id,
                receiving_asset_id: event.target_asset_id,
                quantity_sent: n(event.quantity_sent),
                quantity_received: d.quantity_actual,
                fees: event.terms.fees ?? 0,
              },
              date,
            );
          else result = await rebateMovements(tx, command_id, event, d.quantity_actual, date);
        } else {
          if (latest.status !== 'Posted' || event.kind !== 'Points rebate')
            throw new Error(
              'Only a posted points rebate can be reversed here; transfer recovery needs the actual issuer outcome',
            );
          const originals = (
            await tx.query(
              "SELECT * FROM asset_movements WHERE command_id=$1 AND kind='points_rebate'",
              [latest.posting_command_id],
            )
          ).rows;
          for (const original of originals) {
            await insert(tx, 'asset_movements', {
              asset_id: original.asset_id,
              lot_id: original.lot_id,
              booking_id: event.booking_id,
              quantity: -n(original.quantity),
              basis: -n(original.basis),
              kind: 'points_rebate_reversal',
              effective_on: date,
              original_movement_id: original.id,
              command_id,
            });
          }
          const basis = originals.reduce((sum, r) => sum + n(r.basis), 0);
          await line(
            tx,
            command_id,
            date,
            'supplier_recovery',
            'travel_inventory',
            basis,
            event.booking_id,
          );
          await movement(tx, command_id, date, 'supplier_recovery', -basis, event.booking_id);
        }
        result = await insert(tx, 'expected_event_updates', {
          event_id: event.id,
          status: d.status,
          effective_on: date,
          reason: d.reason,
          posting_command_id: ['Posted', 'Reversed'].includes(d.status) ? command_id : undefined,
          command_id,
        });
        break;
      }
      case 'program':
      case 'instrument':
      case 'program_account': {
        await requireFulfillmentSchema(tx);
        const table = {
          program: 'programs',
          instrument: 'instruments',
          program_account: 'program_accounts',
        }[kind];
        result = await insert(tx, table, { ...d, command_id });
        break;
      }
      case 'revise_travel': {
        await requireFulfillmentSchema(tx);
        const components = await effectiveTravelComponents(tx, d.booking_id);
        before = components.find((t) => t.id === d.travel_component_id) ?? null;
        if (!before) throw new Error('Travel component does not belong to this booking');
        if (Number(before.edit_version ?? 0) !== d.expected_version)
          throw new Error(
            'Travel changed since this form opened. Reload the booking before saving.',
          );
        if (d.travel_end < d.travel_start) throw new Error('Travel end date is before start date. Fix the dates before saving.');
        for (const person_id of d.details.traveler_ids ?? []) {
          const person = await one(tx, 'SELECT kind FROM parties WHERE id=$1', [person_id]);
          if (person.kind !== 'person') throw new Error('Travelers must be individual people');
          if (
            !(
              await tx.query(
                'SELECT person_id FROM booking_travelers WHERE booking_id=$1 AND person_id=$2',
                [d.booking_id, person_id],
              )
            ).rows.length
          )
            await insert(tx, 'booking_travelers', { booking_id: d.booking_id, person_id });
        }
        for (const party_id of [
          d.provider_id,
          d.acquisition_source_id,
          d.details.marketing_carrier_id,
          d.details.operating_carrier_id,
        ].filter(Boolean))
          await one(tx, 'SELECT id FROM parties WHERE id=$1', [party_id]);
        result = {
          ...before,
          product: d.product,
          summary: d.summary,
          provider_id: d.provider_id ?? null,
          channel: d.channel ?? null,
          acquisition_source_id: d.acquisition_source_id ?? null,
          travel_start: d.travel_start,
          travel_end: d.travel_end,
          details: { ...before.details, ...d.details },
          edit_version: d.expected_version + 1,
        };
        await appendTravelReferences(tx, command_id, result);
        const revised = components.map((t) => (t.id === result.id ? result : t));
        const active = revised.filter((t) => !['Cancelled', 'Refund Pending'].includes(t.status));
        const envelope = active.length ? active : revised;
        const updated = await one(
          tx,
          'UPDATE bookings SET travel_start=$2,travel_end=$3,summary=$4,revision=revision+1 WHERE id=$1 RETURNING *',
          [
            d.booking_id,
            envelope.map((t) => t.travel_start).sort()[0],
            envelope
              .map((t) => t.travel_end)
              .sort()
              .at(-1),
            envelope.length === 1 && envelope[0].details?.summary_generated
              ? envelope[0].summary
              : (await one(tx, 'SELECT summary FROM bookings WHERE id=$1', [d.booking_id])).summary,
          ],
        );
        for (const reference of new Set(d.details.confirmations as string[]))
          if (
            !(
              await tx.query('SELECT id FROM confirmations WHERE booking_id=$1 AND reference=$2', [
                d.booking_id,
                reference,
              ])
            ).rows.length
          )
            await insert(tx, 'confirmations', { booking_id: d.booking_id, reference });
        await insert(tx, 'itinerary_revisions', {
          booking_id: d.booking_id,
          revision: updated.revision,
          snapshot: { ...updated, travel_components: revised },
          actor: actor.id,
        });
        break;
      }
      case 'travel_component': {
        await requireFulfillmentSchema(tx);
        const booking = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        if (['Cancelled', 'Refund Pending'].includes(booking.reservation_status))
          throw new Error(
            'Review the whole-booking cancellation status before adding travel; cancel a specific component for partial replacements',
          );
        if (d.travel_end < d.travel_start) throw new Error('Travel end date is before start date. Fix the dates before saving.');
        before = booking;
        result = await insert(tx, 'travel_components', { ...d, command_id });
        const updated = await one(
          tx,
          "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}','\"Pending\"'::jsonb),travel_start=LEAST(travel_start,$2::date),travel_end=GREATEST(travel_end,$3::date),revision=revision+1 WHERE id=$1 RETURNING *",
          [d.booking_id, d.travel_start, d.travel_end],
        );
        const provider = d.provider_id
          ? (await one(tx, 'SELECT name FROM parties WHERE id=$1', [d.provider_id])).name
          : '';
        for (const reference of new Set(d.details.confirmations as string[]))
          if (
            !(
              await tx.query('SELECT id FROM confirmations WHERE booking_id=$1 AND reference=$2', [
                d.booking_id,
                reference,
              ])
            ).rows.length
          )
            await insert(tx, 'confirmations', { booking_id: d.booking_id, reference, provider });
        const components = (
          await tx.query(
            'SELECT * FROM travel_components WHERE booking_id=$1 ORDER BY created_at,id',
            [d.booking_id],
          )
        ).rows;
        await insert(tx, 'itinerary_revisions', {
          booking_id: d.booking_id,
          revision: updated.revision,
          snapshot: { ...updated, travel_components: components },
          actor: actor.id,
        });
        result.cost_status = 'Pending';
        break;
      }
      case 'cancellation_cost': {
        const booking = await economics(tx, d.booking_id);
        if (d.travel_component_id) {
          await requireFulfillmentSchema(tx);
          await one(tx, 'SELECT id FROM travel_components WHERE id=$1 AND booking_id=$2', [
            d.travel_component_id,
            d.booking_id,
          ]);
          const canceled = (
            await tx.query(
              "SELECT id FROM commands WHERE kind='cancel' AND payload->>'travel_component_id'=$1",
              [d.travel_component_id],
            )
          ).rows.length;
          if (!canceled && !['Cancelled', 'Refund Pending'].includes(booking.reservation_status))
            throw new Error(
              'This travel has no cancellation case; use ordinary funding for normal costs',
            );
        } else if (!['Cancelled', 'Refund Pending'].includes(booking.reservation_status))
          throw new Error('Choose the canceled component or a canceled booking');
        if (d.settled && !d.method) throw new Error('Choose the actual supplier payment method');
        if (
          (
            await tx.query(
              "SELECT id FROM funding_components WHERE booking_id=$1 AND kind='Cancellation fee' AND reference=$2 AND seller_id=$3",
              [d.booking_id, d.reference, d.payee_id],
            )
          ).rows.length
        )
          throw new Error('This cancellation-cost reference is already recorded');
        before = booking;
        result = await postFunding(
          tx,
          command_id,
          {
            booking_id: d.booking_id,
            kind: 'Cancellation fee',
            face_amount: d.amount,
            cost: d.amount,
            seller_id: d.payee_id,
            reference: d.reference,
            settled: d.settled,
            payment_method: d.method,
            account_id: d.account_id,
            allow_cancelled_fee: true,
          },
          date,
        );
        if (d.travel_component_id)
          await insert(tx, 'fulfillment_details', {
            booking_id: d.booking_id,
            travel_component_id: d.travel_component_id,
            source_id: d.payee_id,
            mode: 'Cash/Card',
            role: 'Ancillary',
            unit: 'money',
            quantity: d.amount,
            funding_component_id: result.id,
            terms: {
              cancellation_cost: true,
              reference: d.reference,
              reason: d.reason,
              cost_complete: !(await pendingTravelCosts(tx, d.booking_id, d.travel_component_id)),
            },
            command_id,
          });
        if (booking.itinerary.cost_status === 'No supplier cost')
          await tx.query(
            "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}','\"Confirmed\"'::jsonb) WHERE id=$1",
            [d.booking_id],
          );
        break;
      }
      case 'confirm_travel_no_cost': {
        await requireFulfillmentSchema(tx);
        const component = await one(
          tx,
          'SELECT * FROM travel_components WHERE id=$1 AND booking_id=$2',
          [d.travel_component_id, d.booking_id],
        );
        const cost = await one(
          tx,
          "SELECT COALESCE(sum(f.cost),0) cost FROM fulfillment_details d JOIN funding_components f ON f.id=d.funding_component_id WHERE d.travel_component_id=$1 AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text)",
          [component.id],
        );
        if (n(cost.cost))
          throw new Error('This travel already has a recorded cost; do not declare it free');
        before = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        const pending = await pendingTravelCosts(tx, d.booking_id);
        const funding = await one(
          tx,
          "SELECT count(*) count FROM funding_components f WHERE booking_id=$1 AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text)",
          [d.booking_id],
        );
        const status = pending ? 'Pending' : n(funding.count) ? 'Confirmed' : 'No supplier cost';
        await tx.query(
          "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}',$2::jsonb) WHERE id=$1",
          [d.booking_id, JSON.stringify(status)],
        );
        result = { id: component.id, cost_status: status, explicit_no_cost: true };
        break;
      }
      case 'link_fulfillment': {
        await requireFulfillmentSchema(tx);
        const component = await one(
          tx,
          'SELECT * FROM travel_components WHERE id=$1 AND booking_id=$2',
          [d.travel_component_id, d.booking_id],
        );
        const funding = await one(
          tx,
          'SELECT * FROM funding_components WHERE id=$1 AND booking_id=$2',
          [d.funding_component_id, d.booking_id],
        );
        const asset = funding.asset_id
          ? await one(tx, 'SELECT * FROM assets WHERE id=$1', [funding.asset_id])
          : null;
        const unit = funding.unit ?? assetUnit(asset ?? funding);
        if (asset) {
          const profile = (
            await tx.query('SELECT * FROM inventory_profiles WHERE asset_id=$1', [asset.id])
          ).rows[0];
          if (profile) {
            d.instrument_id ??= profile.instrument_id;
            d.program_account_id ??= profile.program_account_id;
          }
        }
        await validateInstrument(tx, { ...d, unit });
        const mode =
          asset?.ownership === 'Padova'
            ? 'Owned inventory'
            : unit === 'money'
              ? 'Cash/Card'
              : 'Outside source';
        if (mode !== 'Cash/Card' && !d.instrument_id && !asset)
          throw new Error('Select the matching configured instrument');
        before = funding;
        result = await insert(tx, 'fulfillment_details', {
          booking_id: d.booking_id,
          travel_component_id: component.id,
          funding_component_id: funding.id,
          instrument_id: d.instrument_id,
          source_id: funding.seller_id,
          mode,
          role: d.role,
          unit,
          quantity: n(funding.face_amount),
          terms: { cost_complete: d.confirm_cost, linked_existing_funding: true, reason: d.reason },
          command_id,
        });
        const pending = await pendingTravelCosts(tx, d.booking_id);
        await tx.query(
          "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}',$2::jsonb) WHERE id=$1",
          [d.booking_id, JSON.stringify(pending ? 'Pending' : 'Confirmed')],
        );
        break;
      }
      case 'revise_fulfillment':
      case 'reverse_fulfillment': {
        await requireFulfillmentSchema(tx);
        before =
          (await effectiveFulfillments(tx, d.booking_id)).find((f) => f.id === d.fulfillment_id) ??
          null;
        if (!before || before.status !== 'Active')
          throw new Error('Choose an active fulfillment belonging to this booking');
        if (Number(before.edit_version ?? 0) !== d.expected_version)
          throw new Error('Fulfillment changed since this form opened. Reload before saving.');
        if (kind === 'reverse_fulfillment') {
          const funding = await reverseFulfillmentFunding(tx, command_id, before, date);
          await tx.query(
            "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}','\"Pending\"'::jsonb) WHERE id=$1",
            [d.booking_id],
          );
          result = {
            id: before.id,
            booking_id: d.booking_id,
            reversed_funding_id: funding.id,
            edit_version: d.expected_version + 1,
          };
          break;
        }
        const resolvedSource = d.source_id ?? before.source_id;
        const financialChange =
          d.travel_component_id !== before.travel_component_id ||
          d.mode !== before.mode ||
          (d.instrument_id ?? null) !== (before.instrument_id ?? null) ||
          (d.program_account_id ?? null) !== (before.program_account_id ?? null) ||
          (d.asset_id ?? null) !== (before.asset_id ?? null) ||
          d.unit !== before.unit ||
          (d.quantity ?? null) !== (before.quantity == null ? null : n(before.quantity)) ||
          !!d.rebate_expected ||
          (d.mode !== 'Owned inventory' && (d.cost ?? n(before.cost)) !== n(before.cost)) ||
          (d.mode !== 'Owned inventory' && resolvedSource !== before.source_id);
        if (d.settled || d.source_paid)
          throw new Error(
            'Editing never creates a duplicate supplier payment. Use the existing supplier payment/allocations action.',
          );
        if (financialChange) {
          const funding = await reverseFulfillmentFunding(tx, command_id, before, date);
          const replacement = await postFulfillment(
            tx,
            command_id,
            { ...d, source_id: resolvedSource, settled: false },
            date,
          );
          result = {
            ...replacement,
            reversed_funding_id: funding.id,
            replacement_fulfillment_id: replacement.id,
            edit_version: d.expected_version + 1,
          };
        } else {
          const instrument = await validateInstrument(tx, d);
          const fee = await postAdditionalFulfillmentFees(tx, command_id, d, date);
          result = {
            ...before,
            instrument: instrument?.name ?? null,
            source_id: resolvedSource,
            reference: d.terms.reference ?? '',
            instrument_id: d.instrument_id ?? null,
            program_account_id: d.program_account_id ?? null,
            role: d.role,
            terms: { ...d.terms, cost_complete: d.confirm_cost },
            ...(fee ? { fee_fulfillment_id: fee.id } : {}),
            edit_version: d.expected_version + 1,
          };
        }
        break;
      }
      case 'fulfill': {
        before = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        result = await postFulfillment(tx, command_id, d, date);
        break;
      }
      case 'party':
        result = await insert(tx, 'parties', d);
        break;
      case 'edit_party':
        before = await one(tx, 'SELECT * FROM parties WHERE id=$1', [d.party_id]);
        for (const key of [
          'source_provenance',
          'traveler_source_claims',
          'raw_text',
          'raw_cell',
          'original_fields',
        ]) {
          if (before.details?.[key] !== undefined) {
            if (
              d.details[key] !== undefined &&
              sourceFingerprint(d.details[key]) !== sourceFingerprint(before.details[key])
            )
              throw new Error('Preserved party source evidence cannot be overwritten');
            d.details[key] = before.details[key];
          }
        }
        result = await one(
          tx,
          'UPDATE parties SET name=$2,email=$3,phone=$4,roles=$5,details=$6 WHERE id=$1 RETURNING *',
          [d.party_id, d.name, d.email, d.phone, d.roles, JSON.stringify(d.details)],
        );
        break;
      case 'relationship': {
        const p = await one(tx, 'SELECT * FROM parties WHERE id=$1', [d.person_id]);
        if (p.kind !== 'person') throw new Error('Membership requires a canonical person');
        const group = await one(tx, 'SELECT * FROM parties WHERE id=$1', [d.group_id]);
        if (!['company', 'family'].includes(group.kind))
          throw new Error('Select a company or family group');
        if (d.relationship === 'employee' && group.kind !== 'company')
          throw new Error('Employee assignments require a company');
        const { tier, comfort_level, ...membership } = d;
        const existing = await tx.query(
          'SELECT * FROM party_relationships WHERE person_id=$1 AND group_id=$2 AND relationship=$3',
          [d.person_id, d.group_id, d.relationship],
        );
        result = existing.rows[0] ?? (await insert(tx, 'party_relationships', membership));
        if (d.relationship === 'employee') {
          before = { person: p, relationship: existing.rows[0] ?? null };
          const details = {
            ...p.details,
            company_policies: {
              ...(p.details?.company_policies ?? {}),
              [group.id]: { tier: tier ?? null, comfort_level: comfort_level ?? null },
            },
          };
          await tx.query('UPDATE parties SET details=$2 WHERE id=$1', [
            p.id,
            JSON.stringify(details),
          ]);
        } else if (tier || comfort_level)
          throw new Error('Tier and comfort level apply to company employees');
        break;
      }
      case 'authorize_payer':
        result = await insert(tx, 'booking_payers', { ...d, command_id });
        break;
      case 'payment_account': {
        const { issuer, owner_id, notes, ...account } = d;
        account.supported_methods ??=
          account.kind === 'Card'
            ? ['Card']
            : account.kind === 'Bank'
              ? ['Bank', 'ACH', 'Wire', 'Check', 'Zelle']
              : account.kind === 'Cash'
                ? ['Cash']
                : [];
        account.owner_id = owner_id;
        if (owner_id) await one(tx, 'SELECT id FROM parties WHERE id=$1', [owner_id]);
        result = await insert(tx, 'payment_accounts', account);
        if (issuer || owner_id || notes)
          await insert(tx, 'notes', {
            record_type: 'payment_account',
            record_id: result.id,
            body: JSON.stringify({ issuer, owner_id, notes }),
            actor: actor.id,
          });
        break;
      }
      case 'transfer_asset': {
        if (d.sending_asset_id === d.receiving_asset_id)
          throw new Error('Transfer accounts must differ');
        const sourceProfile = await assetSourceProfile(tx, d.sending_asset_id);
        const targetProfile = await assetSourceProfile(tx, d.receiving_asset_id);
        if (sourceProfile !== targetProfile && (sourceProfile || targetProfile))
          throw new Error(
            'Account-linked credit cannot transfer to a different or unlinked profile',
          );
        const target = await one(tx, 'SELECT * FROM assets WHERE id=$1 FOR UPDATE', [
          d.receiving_asset_id,
        ]);
        if (target.ownership !== 'Padova')
          throw new Error('Transfer destination must be Padova-owned');
        const used = await consume(
          tx,
          command_id,
          d.sending_asset_id,
          d.quantity_sent,
          date,
          'transfer_out',
        );
        const lot = await insert(tx, 'asset_lots', {
          asset_id: target.id,
          quantity: d.quantity_received,
          cost: used.basis + d.fees,
          acquired_on: date,
          source_lot_id: used.movements.length === 1 ? used.movements[0].lot_id : undefined,
          command_id,
        });
        await insert(tx, 'asset_movements', {
          asset_id: target.id,
          lot_id: lot.id,
          quantity: d.quantity_received,
          basis: used.basis + d.fees,
          kind: 'transfer_in',
          effective_on: date,
          command_id,
        });
        result = await insert(tx, 'asset_transfers', {
          sending_asset_id: d.sending_asset_id,
          receiving_asset_id: target.id,
          quantity_sent: d.quantity_sent,
          quantity_received: d.quantity_received,
          basis: used.basis,
          fees: d.fees,
          effective_on: date,
          command_id,
        });
        await line(tx, command_id, date, 'travel_inventory', 'asset_acquisition_payable', d.fees);
        break;
      }
      case 'convert_asset': {
        const source = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id]);
        if (source.ownership !== 'Padova')
          throw new Error('Only Padova-owned inventory can be converted through this workflow');
        const consumed = await consume(
          tx,
          command_id,
          d.asset_id,
          d.quantity_sent,
          date,
          'transfer_out',
        );
        result = await createAsset(tx, command_id, {
          name: d.name,
          kind: d.kind,
          issuer: d.issuer,
          quantity: d.quantity_received,
          cost: consumed.basis,
          date,
          expires_on: d.expires_on,
          restrictions: d.restrictions,
          reference: d.reference,
          ownership: 'Padova',
          holder_id: source.holder_id,
          source_booking_id: source.source_booking_id,
          source_lot_id: consumed.movements.length === 1 ? consumed.movements[0].lot_id : undefined,
          movement_kind: 'transfer_in',
        });
        const profile_id = await assetSourceProfile(tx, source.id);
        if (profile_id)
          await insert(tx, 'source_profile_assets', { asset_id: result.id, profile_id });
        break;
      }
      case 'expire_asset': {
        const used = await consume(tx, command_id, d.asset_id, d.quantity, date, 'expiration');
        await movement(tx, command_id, date, 'asset_expiration', -knownBasis(used.basis));
        await line(tx, command_id, date, 'asset_expiration_cost', 'travel_inventory', used.basis);
        result = { id: d.asset_id, basis: used.basis, quantity: d.quantity };
        break;
      }
      case 'receive_asset_sale': {
        const sale = await one(tx, 'SELECT * FROM asset_sales WHERE id=$1', [d.sale_id]);
        const paid = await one(
          tx,
          'SELECT COALESCE(sum(amount),0) amount FROM asset_sale_receipts WHERE sale_id=$1',
          [sale.id],
        );
        if (sale.payment_id || d.amount > n(sale.proceeds) - n(paid.amount))
          throw new Error('Receipt exceeds asset sale receivable');
        const p = await insert(tx, 'payments', {
          direction: 'asset_sale',
          party_id: sale.buyer_id,
          amount: d.amount,
          paid_on: date,
          method: d.method,
          reference: d.reference,
        });
        result = await insert(tx, 'asset_sale_receipts', {
          sale_id: sale.id,
          payment_id: p.id,
          amount: d.amount,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          'cash',
          'asset_sale_receivable',
          d.amount,
          undefined,
          sale.buyer_id,
        );
        break;
      }
      case 'pay_asset_purchase': {
        const a = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id]);
        if (a.ownership !== 'Padova' || !a.seller_id)
          throw new Error('Purchase settlement requires a Padova asset with a recorded seller');
        const balance = await one(
          tx,
          `SELECT COALESCE((SELECT sum(cost) FROM asset_lots WHERE asset_id=$1),0)-COALESCE((SELECT sum(amount) FROM asset_acquisition_payments WHERE asset_id=$1),0) amount`,
          [a.id],
        );
        if (d.amount > n(balance.amount)) throw new Error('Asset purchase payment exceeds payable');
        const p = await insert(tx, 'payments', {
          direction: 'asset_purchase',
          party_id: a.seller_id,
          amount: d.amount,
          paid_on: date,
          method: d.method,
          reference: d.reference,
          account_id: d.account_id,
        });
        result = await insert(tx, 'asset_acquisition_payments', {
          asset_id: a.id,
          payment_id: p.id,
          amount: d.amount,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          'asset_acquisition_payable',
          'cash',
          d.amount,
          undefined,
          a.seller_id,
        );
        break;
      }
      case 'traveler': {
        const p = await one(tx, 'SELECT * FROM parties WHERE id=$1 FOR UPDATE', [d.person_id]);
        if (p.kind !== 'person') throw new Error('Traveler must be a person');
        before =
          (await tx.query('SELECT * FROM traveler_private WHERE person_id=$1', [d.person_id]))
            .rows[0] ?? null;
        if (d.ticketing_only) {
          const current = {
            dob: before?.dob?.slice(0, 10) ?? '',
            sex: before?.preferences?.sex ?? '',
            nationality: before?.preferences?.nationality ?? '',
          };
          if (
            Object.keys(current).some(
              (key) => current[key as keyof typeof current] !== d.expected[key],
            )
          )
            throw new Error(
              'Traveler details changed in another session. Reload this traveler before saving.',
            );
          result = await one(
            tx,
            `INSERT INTO traveler_private(person_id,dob,preferences) VALUES($1,$2,$3)
            ON CONFLICT(person_id) DO UPDATE SET dob=excluded.dob,preferences=excluded.preferences RETURNING person_id AS id`,
            [
              d.person_id,
              d.dob || null,
              JSON.stringify({
                ...(before?.preferences ?? {}),
                sex: d.sex,
                nationality: d.nationality,
              }),
            ],
          );
          break;
        }
        result = await one(
          tx,
          `INSERT INTO traveler_private(person_id,legal_first,middle_name,last_name,dob,ktn,memberships,preferences,documents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(person_id) DO UPDATE SET legal_first=excluded.legal_first,middle_name=excluded.middle_name,last_name=excluded.last_name,dob=excluded.dob,ktn=excluded.ktn,memberships=excluded.memberships,preferences=excluded.preferences,documents=excluded.documents RETURNING person_id AS id`,
          [
            d.person_id,
            d.legal_first,
            d.middle_name,
            d.last_name,
            d.dob,
            d.ktn,
            JSON.stringify(d.memberships),
            JSON.stringify(d.preferences),
            JSON.stringify(d.documents),
          ],
        );
        break;
      }
      case 'booking': {
        if (d.travel_end < d.travel_start) throw new Error('Travel end date is before start date. Fix the dates before saving.');
        const {
          historical_undated_booking,
          traveler_ids,
          confirmations,
          sale,
          funding,
          customer_payment,
          create_initial_travel,
          travel_components_input,
          operational,
          ...values
        } = d;
        if (historical_undated_booking)
          values.itinerary = { ...values.itinerary, travel_dates_unknown: true };
        if (operational) {
          await requirePartyRole(tx, d.customer_id, 'customer');
          for (const traveler of traveler_ids) await requirePartyRole(tx, traveler, 'traveler');
          const travel = travel_components_input?.[0];
          if (travel?.provider_id)
            await requirePartyRole(tx, travel.provider_id, providerRole(d.product));
          if (d.product === 'Other' && !operational.other_description?.trim())
            throw new Error('Describe what the Other product is');
          if (
            d.product === 'Flight' &&
            operational.trip_type === 'One Way' &&
            (d.travel_end !== d.travel_start ||
              travel?.travel_end !== travel?.travel_start ||
              travel?.details.end_date_known)
          )
            throw new Error('One Way cannot contain a return date');
          if (d.product !== 'Flight' && operational.trip_type)
            throw new Error('Trip Type only applies to Flight');
          if (operational.trip_type === 'Multi-City') {
            const segments = validateSegments(operational.segments, d.travel_start, d.travel_end);
            travel.details.segments = segments;
            travel.details.trip_type = 'Multi-City';
          } else if (operational.segments?.length || travel?.details.segments?.length)
            throw new Error('Segments only apply to Multi-City');
          if (operational.pricing?.method === 'Percentage Off Comparable Online Price') {
            const pricing = operational.pricing;
            if (
              pricing.comparable_price === undefined ||
              pricing.discount_bps === undefined ||
              !operational.sale_known
            )
              throw new Error('Comparable price, discount and final customer price are required');
            const calculated = percentagePrice(pricing.comparable_price, pricing.discount_bps);
            if (!pricing.manual_override && sale !== calculated)
              throw new Error('Customer price differs from the percentage calculation');
            requirePermission(actor, 'edit_customer_charges');
          }
          if (
            d.product === 'Flight' &&
            operational.trip_type === 'Round Trip' &&
            !travel?.details.end_date_known
          )
            throw new Error('Round Trip requires an explicit return date');
          const tax = operational.taxes;
          if (tax?.customer_recovery !== undefined) {
            if (tax.customer_recovery > tax.amount)
              throw new Error('Tax recovery cannot exceed the tax amount');
            if (tax.customer_recovery > 0 && tax.economic_bearer !== 'Customer')
              throw new Error('Customer tax recovery requires Customer as the economic bearer');
            if (tax.customer_recovery > 0 && !operational.sale_known)
              throw new Error(
                'Include recovered tax in a known customer price; no automatic duplicate charge is created',
              );
            if (tax.customer_recovery > sale + operational.additional_charge)
              throw new Error('Tax recovery must fit within the actual customer price');
          }
          if (
            tax &&
            tax.bearer !== 'Padova' &&
            (tax.method || tax.account_id || tax.included_in_component)
          )
            throw new Error('Only Padova-paid taxes can use Padova payment details');
          if (tax?.owed_to_seller && (tax.bearer !== 'Seller' || !tax.seller_id))
            throw new Error('Separate seller tax obligation requires its seller');
          if (d.product !== 'Hotel' && (operational.commission || operational.secondary_commission))
            throw new Error('Commission entry only applies to Hotel');
          if (operational.draft_id) {
            await one(tx, 'SELECT id FROM booking_drafts WHERE id=$1 AND created_by=$2', [
              operational.draft_id,
              actor.id,
            ]);
            if (
              (
                await tx.query(
                  "SELECT id FROM commands WHERE kind='booking' AND payload->'operational'->>'draft_id'=$1 AND result IS NOT NULL",
                  [operational.draft_id],
                )
              ).rows.length
            )
              throw new Error('This draft has already been booked');
          }
          if (
            funding.length ||
            create_initial_travel ||
            !travel_components_input ||
            travel_components_input.length !== 1
          )
            throw new Error('Operational entry requires one explicit travel and component funding');
          if (!['Flight', 'Hotel', 'Car', 'Other'].includes(d.product))
            throw new Error('Unsupported new booking product');
          if (d.supplier_id)
            throw new Error('Travel brand must not be assigned as financial seller');
          if (
            !operational.sale_known &&
            (sale || operational.additional_charge || customer_payment?.allocate_to_booking)
          )
            throw new Error('Unknown sale cannot create a charge or booking allocation');
          if (operational.source_method_id) {
            const method = await one(tx, 'SELECT * FROM booking_source_methods WHERE id=$1', [
              operational.source_method_id,
            ]);
            if (!method.products.includes(d.product))
              throw new Error('Booking method does not support this product');
            if (!method.award && operational.award_program_id)
              throw new Error('Non-award booking cannot contain a loyalty program');
            values.channel = method.name;
            travel_components_input[0].channel = method.name;
          }
          if (operational.award_program_id)
            await one(
              tx,
              "SELECT id FROM programs WHERE id=$1 AND category IN ('Airline','Hotel','Bank')",
              [operational.award_program_id],
            );
          if (operational.award_program_id && !operational.source_method_id)
            throw new Error('Choose Award Booking before a loyalty program');
          if (operational.source_profile_id) {
            const profile = await one(tx, 'SELECT * FROM booking_source_profiles WHERE id=$1', [
              operational.source_profile_id,
            ]);
            if (
              profile.status !== 'Active' ||
              profile.source_method_id !== operational.source_method_id
            )
              throw new Error('Booking source profile must be active and match Booked Through');
          }
          for (const c of operational.components) {
            if (c.supplied === 'Points / Miles' && !c.program_id && operational.award_program_id)
              c.program_id = operational.award_program_id;
            if (c.asset_id && operational.source_profile_id) {
              const link = (
                await tx.query('SELECT profile_id FROM source_profile_assets WHERE asset_id=$1', [
                  c.asset_id,
                ])
              ).rows[0];
              if (link && link.profile_id !== operational.source_profile_id)
                throw new Error('Credit belongs to a different booking source profile');
            }
          }
          for (const name of operational.new_travelers) {
            // A typed name is an explicit create decision, never a fuzzy merge.
            const person = await insert(tx, 'parties', {
              name,
              kind: 'person',
              roles: ['traveler'],
              details: { raw_entered_name: name, origin: 'booking-entry', command_id },
            });
            traveler_ids.push(person.id);
          }
          travel_components_input[0].details.traveler_ids = [...new Set(traveler_ids)];
          values.itinerary = {
            ...values.itinerary,
            operational_entry: operational,
            sale_known: operational.sale_known,
          };
          if (d.product === 'Flight')
            values.confirmation_status =
              travel_components_input[0].details.ticketing_status ?? 'Not Ticketed / Unknown';
        }
        if (create_initial_travel && travel_components_input)
          throw new Error('Use either one initial travel or explicit travel components');
        if (
          !create_initial_travel &&
          !travel_components_input &&
          funding.some((f: Row) => f.travel_index !== undefined)
        )
          throw new Error('Funding travel assignment requires travel components in this command');
        if (create_initial_travel || travel_components_input) await requireFulfillmentSchema(tx);
        if (travel_components_input) {
          for (const travel of travel_components_input)
            if (travel.travel_end < travel.travel_start)
              throw new Error('Travel end date is before start date. Fix the dates before saving.');
          values.travel_start = travel_components_input.map((t: Row) => t.travel_start).sort()[0];
          values.travel_end = travel_components_input
            .map((t: Row) => t.travel_end)
            .sort()
            .at(-1);
        }
        result = await insert(tx, 'bookings', values);
        touched.add(result.id);
        const initialTravels: Row[] = [];
        for (const travel of travel_components_input ??
          (create_initial_travel
            ? [
                {
                  product: d.product,
                  summary: d.summary,
                  provider_id: d.itinerary.airline_id ?? d.supplier_id,
                  channel: d.channel,
                  acquisition_source_id: d.itinerary.acquisition_source_id,
                  travel_start: d.travel_start,
                  travel_end: d.travel_end,
                  details: {
                    ...Object.fromEntries(
                      itineraryEntryKeys
                        .filter((key) => d.itinerary[key] !== undefined)
                        .map((key) => [key, d.itinerary[key]]),
                    ),
                    confirmations: [...new Set(confirmations)],
                    traveler_ids,
                  },
                },
              ]
            : []))
          initialTravels.push(
            await insert(tx, 'travel_components', {
              ...travel,
              booking_id: result.id,
              command_id,
            }),
          );
        for (const person_id of new Set(traveler_ids as string[])) {
          const p = await one(tx, 'SELECT kind FROM parties WHERE id=$1', [person_id]);
          if (p.kind !== 'person') throw new Error('Booking traveler must be a person');
          await insert(tx, 'booking_travelers', { booking_id: result.id, person_id });
        }
        const allConfirmations = [
          ...new Set<string>([
            ...confirmations,
            ...initialTravels.flatMap((t) => t.details.confirmations ?? []),
          ]),
        ];
        for (const reference of allConfirmations)
          await insert(tx, 'confirmations', { booking_id: result.id, reference });
        await insert(tx, 'itinerary_revisions', {
          booking_id: result.id,
          revision: 1,
          snapshot: {
            ...result,
            traveler_ids: [...new Set(traveler_ids)],
            confirmations: allConfirmations,
            ...(initialTravels.length ? { travel_components: initialTravels } : {}),
          },
          actor: actor.id,
        });
        if (sale) {
          await insert(tx, 'charges', {
            booking_id: result.id,
            kind: 'sale',
            amount: sale,
            effective_on: date,
            command_id,
          });
          await line(
            tx,
            command_id,
            date,
            'customer_receivable',
            'booking_revenue',
            sale,
            result.id,
            d.customer_id,
          );
        }
        const initialRoles = initialTravels.length
          ? await Promise.all(
              funding.map(async (component: Row) => {
                if (!component.asset_id) return 'Core';
                const asset = await one(
                  tx,
                  'SELECT a.*,p.instrument_id,p.program_account_id FROM assets a LEFT JOIN inventory_profiles p ON p.asset_id=a.id WHERE a.id=$1',
                  [component.asset_id],
                );
                return asset.instrument_id
                  ? (
                      await one(tx, 'SELECT role FROM instruments WHERE id=$1', [
                        asset.instrument_id,
                      ])
                    ).role === 'Ancillary'
                    ? 'Ancillary'
                    : 'Core'
                  : 'Core';
              }),
            )
          : [];
        for (const [index, component] of funding.entries()) {
          if (initialTravels.length > 1 && component.travel_index === undefined)
            throw new Error('Choose the travel component for each funding source');
          const initialTravel = initialTravels[component.travel_index ?? 0];
          if (initialTravels.length && !initialTravel)
            throw new Error('Funding travel component is outside this booking');
          let componentPayee = component.seller_id;
          if (travel_components_input && initialTravel && !componentPayee) {
            componentPayee =
              initialTravel.acquisition_source_id ??
              (isDirectBookingChannel(initialTravel.channel ?? '')
                ? initialTravel.provider_id
                : null);
            if (!componentPayee && !component.asset_id && component.cost > 0)
              throw new Error('Choose the actual payee for this travel component');
          }
          const posted = await postFunding(
            tx,
            command_id,
            { ...component, seller_id: componentPayee, booking_id: result.id },
            component.date,
          );
          if (initialTravel) {
            const asset = component.asset_id
              ? await one(
                  tx,
                  'SELECT a.*,p.instrument_id,p.program_account_id FROM assets a LEFT JOIN inventory_profiles p ON p.asset_id=a.id WHERE a.id=$1',
                  [component.asset_id],
                )
              : null;
            await insert(tx, 'fulfillment_details', {
              booking_id: result.id,
              travel_component_id: initialTravel.id,
              funding_component_id: posted.id,
              instrument_id: asset?.instrument_id,
              program_account_id: asset?.program_account_id,
              source_id: posted.seller_id,
              mode:
                asset?.ownership === 'Padova'
                  ? 'Owned inventory'
                  : asset || !['Card', 'Cash', 'Bank'].includes(component.kind)
                    ? 'Outside source'
                    : 'Cash/Card',
              role: initialRoles[index],
              unit: asset ? assetUnit(asset) : 'money',
              quantity: posted.face_amount,
              terms: {
                cost_complete:
                  d.itinerary.cost_status === 'Confirmed' &&
                  funding.some(
                    (f: Row, i: number) =>
                      (f.travel_index ?? 0) === (component.travel_index ?? 0) &&
                      initialRoles[i] === 'Core',
                  ),
                reference: component.reference,
              },
              command_id,
            });
          }
        }
        if (operational?.additional_charge) {
          const feeNote = String(operational.additional_charge_note || '')
            .trim()
            .slice(0, 200);
          await insert(tx, 'charges', {
            booking_id: result.id,
            kind: feeNote || 'booking/service fee',
            amount: operational.additional_charge,
            effective_on: date,
            command_id,
          });
          await line(
            tx,
            command_id,
            date,
            'customer_receivable',
            'booking_revenue',
            operational.additional_charge,
            result.id,
            d.customer_id,
          );
          if (feeNote)
            await insert(tx, 'notes', {
              record_type: 'booking',
              record_id: result.id,
              body: `Extra charge / fee: ${feeNote} (${operational.additional_charge}¢).`,
              actor: actor.id,
            });
        }
        if (customer_payment)
          await postPayment(
            tx,
            command_id,
            schemas.payment.parse({
              ...customer_payment,
              party_id: d.customer_id,
              direction: 'customer',
              allocations: customer_payment.allocate_to_booking
                ? [{ booking_id: result.id, amount: customer_payment.amount }]
                : [],
            }),
            customer_payment.date,
          );
        if (operational) {
          const travel = initialTravels[0];
          for (const reference of operational.references) {
            if (reference.provider_id) await requirePartyRole(tx, reference.provider_id, 'airline');
            await insert(tx, 'booking_references', {
              booking_id: result.id,
              travel_component_id: travel.id,
              reference_type: reference.type,
              value: reference.value,
              command_id,
            });
          }
          if (operational.notes)
            await insert(tx, 'notes', {
              record_type: 'booking',
              record_id: result.id,
              body: operational.notes,
              actor: actor.id,
            });
          for (const component of operational.components)
            await postOperationalComponent(tx, command_id, result, travel, component, actor);
          const tax = operational.taxes;
          if (tax?.amount && !tax.included_in_component) {
            if (tax.bearer === 'Padova')
              await postOperationalComponent(
                tx,
                command_id,
                result,
                travel,
                {
                  type: 'Padova payment',
                  supplied: 'Taxes / Fees',
                  cost: tax.amount,
                  method: tax.method,
                  account_id: tax.account_id,
                  date: d.booked_on,
                  unit: 'money',
                  reference: '',
                  notes: '',
                },
                actor,
              );
            if (tax.bearer === 'Seller' && tax.owed_to_seller)
              await postOperationalComponent(
                tx,
                command_id,
                result,
                travel,
                {
                  type: 'Outside seller',
                  supplied: 'Taxes / Fees',
                  cost: tax.amount,
                  seller_id: tax.seller_id,
                  date: d.booked_on,
                  unit: 'money',
                  reference: '',
                  notes: '',
                },
                actor,
              );
          }
          const pending =
            (!!operational.taxes?.amount && operational.taxes.bearer === 'Unknown') ||
            !operational.components.length ||
            operational.components.some(
              (c: Row) =>
                (c.type !== 'Owned value' && c.cost === undefined) ||
                (['Outside seller', 'Other'].includes(c.type) && !c.seller_id),
            );
          await tx.query(
            "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}',$2::jsonb) WHERE id=$1",
            [result.id, JSON.stringify(pending ? 'Pending' : 'Confirmed')],
          );
          await postOperationalHotelCommission(
            tx,
            command_id,
            date,
            result.id,
            sale,
            !!operational.sale_known,
            operational.commission,
            'primary',
            actor,
          );
          await postOperationalHotelCommission(
            tx,
            command_id,
            date,
            result.id,
            sale,
            !!operational.sale_known,
            operational.secondary_commission,
            'secondary',
            actor,
          );
          await applyReferringOrganization(
            tx,
            command_id,
            date,
            result.id,
            result.travel_end ?? d.travel_end,
            operational.referring_organization_id,
            actor,
          );
        }
        break;
      }
      case 'charge': {
        const b = await economics(tx, d.booking_id);
        if (n(b.sale) + d.amount < 0) throw new Error('Charges cannot become negative');
        result = await insert(tx, 'charges', {
          booking_id: d.booking_id,
          kind: d.kind,
          amount: d.amount,
          effective_on: date,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          'customer_receivable',
          'booking_revenue',
          d.amount,
          d.booking_id,
          b.customer_id,
        );
        break;
      }
      case 'confirm_sale': {
        before = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        if (before.itinerary?.sale_known !== false)
          throw new Error('Customer price is already known; use dated charge/change adjustments');
        const current = Number(
          (
            await one(
              tx,
              'SELECT COALESCE(sum(amount),0) amount FROM charges WHERE booking_id=$1',
              [d.booking_id],
            )
          ).amount,
        );
        const delta = d.total - current;
        if (delta) {
          await insert(tx, 'charges', {
            booking_id: d.booking_id,
            kind: 'Confirmed customer total',
            amount: delta,
            effective_on: date,
            command_id,
          });
          await line(
            tx,
            command_id,
            date,
            'customer_receivable',
            'booking_revenue',
            delta,
            d.booking_id,
            before.customer_id,
          );
        }
        await tx.query(
          "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{sale_known}','true'::jsonb) WHERE id=$1",
          [d.booking_id],
        );
        result = { id: d.booking_id, total: d.total };
        break;
      }
      case 'payment': {
        if (historicalRefund) {
          const supplierReturn = d.direction === 'supplier_refund';
          await requirePartyRole(tx, d.party_id, supplierReturn ? 'seller' : 'customer');
          await validatePaymentAccount(tx, d.account_id, d.method);
          await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `historical-refund:${d.reference}`,
          ]);
          if (
            (
              await tx.query('SELECT id FROM payments WHERE reference=$1 AND direction=$2', [
                d.reference,
                d.direction,
              ])
            ).rows.length
          )
            throw new Error('This refund settlement already exists; reuse its original payment');
          result = await insert(tx, 'payments', {
            party_id: d.party_id,
            direction: d.direction,
            amount: d.amount,
            paid_on: date,
            method: d.method,
            reference: d.reference,
            account_id: d.account_id,
          });
          await line(
            tx,
            command_id,
            date,
            supplierReturn ? 'cash' : 'historical_refund_clearing',
            supplierReturn ? 'historical_refund_clearing' : 'cash',
            d.amount,
            undefined,
            d.party_id,
          );
          await insert(tx, 'tasks', {
            title: supplierReturn
              ? 'Historical supplier return needs reconciliation'
              : 'Historical refund allocation needs reconciliation',
            record_type: 'party',
            record_id: d.party_id,
            assignee_id: actor.id,
            priority: 'High',
            notes: supplierReturn
              ? `Actual incoming supplier return ${d.reference} is recorded once. Its booking and original funding allocation remain Unreconciled. No customer repayment, cancellation or net cost is inferred. Use preserved source evidence; do not create another receipt to allocate this settlement.`
              : 'Actual outgoing refund is recorded once. Its booking allocation remains Unreconciled. Use preserved source evidence; do not create another payment to allocate this settlement.',
          });
          result.historical_allocation_status = 'Unreconciled';
          break;
        }
        if (d.direction === 'customer')
          before = {
            customer_balances: Object.fromEntries(
              await Promise.all(
                (d.allocations ?? []).map(async (a: Row) => [
                  a.booking_id,
                  (await economics(tx, a.booking_id)).customer_balance,
                ]),
              ),
            ),
          };
        const posted = await postPayment(tx, command_id, d, date);
        result = posted.result;
        for (const booking_id of posted.bookings) touched.add(booking_id);
        break;
      }
      case 'allocate': {
        result = await allocate(
          tx,
          command_id,
          d.payment_id,
          d.booking_id,
          d.amount,
          d.obligation_id,
        );
        const p = await one(tx, 'SELECT * FROM payments WHERE id=$1', [d.payment_id]);
        if (p.direction === 'customer')
          await line(
            tx,
            command_id,
            date,
            'customer_credit',
            'customer_receivable',
            d.amount,
            d.booking_id,
            p.party_id,
          );
        break;
      }
      case 'correct_payment': {
        before = await one(tx, 'SELECT * FROM payment_balances WHERE id=$1', [d.payment_id]);
        if (!['customer', 'supplier'].includes(before.direction))
          throw new Error('Use the linked commission, refund or inventory correction.');
        const supplierCorrection = before.direction === 'supplier';
        if (supplierCorrection) {
          requirePermission(actor, 'manage_funding');
          await requirePayableTerms(tx);
          if (d.amount > n(before.current_amount))
            throw new Error(
              'Record an additional seller payment separately; this action corrects or reverses an existing outflow.',
            );
        }
        if (date < String(before.paid_on))
          throw new Error('Correction date precedes the actual payment');
        if (d.amount < n(before.allocated)) {
          const allocations = (
            await tx.query(
              'SELECT * FROM net_allocations WHERE payment_id=$1 AND net_amount>0 ORDER BY id',
              [d.payment_id],
            )
          ).rows;
          const bookings = [...new Set(allocations.map((a) => a.booking_id))];
          const target = d.reduce_booking_id ?? (bookings.length === 1 ? bookings[0] : null);
          if (!target)
            throw new Error('Choose which booking allocation to reduce for this grouped payment');
          let left = n(before.allocated) - d.amount;
          const eligible = allocations.filter((a) => a.booking_id === target);
          if (eligible.reduce((sum, a) => sum + n(a.net_amount), 0) < left)
            throw new Error('Selected booking allocation cannot cover this correction');
          for (const a of eligible) {
            const amount = Math.min(left, n(a.net_amount));
            if (amount > 0) {
              await insert(tx, 'payment_allocation_reversals', {
                allocation_id: a.id,
                amount,
                command_id,
              });
              if (!supplierCorrection)
                await line(
                  tx,
                  command_id,
                  date,
                  'customer_receivable',
                  'customer_credit',
                  amount,
                  a.booking_id,
                  before.party_id,
                );
              left -= amount;
            }
            if (!left) break;
          }
          touched.add(target);
        }
        if (supplierCorrection && d.amount === n(before.current_amount)) {
          result = { id: before.id, current_amount: d.amount };
          break;
        }
        result = await insert(
          tx,
          supplierCorrection ? 'commission_payout_adjustments' : 'payment_adjustments',
          {
            payment_id: d.payment_id,
            delta: d.amount - n(before.current_amount),
            reason: d.reason,
            command_id,
          },
        );
        await line(
          tx,
          command_id,
          date,
          supplierCorrection ? 'supplier_payable' : 'cash',
          supplierCorrection ? 'cash' : 'customer_credit',
          d.amount - n(before.current_amount),
          undefined,
          before.party_id,
        );
        break;
      }
      case 'revise_asset': {
        before = await effectiveAsset(
          tx,
          await one(tx, 'SELECT * FROM assets WHERE id=$1 FOR UPDATE', [d.asset_id]),
        );
        if (before.edit_version !== d.expected_version)
          throw new Error('Asset details changed since this form opened. Reload before saving.');
        result = {
          id: before.id,
          name: d.name,
          issuer: d.issuer,
          expires_on: d.expires_on ?? null,
          restrictions: d.restrictions,
          reference: d.reference,
          edit_version: d.expected_version + 1,
        };
        break;
      }
      case 'acquire_asset': {
        if (historicalOpening) {
          await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `historical-voucher:${d.issuer}:${d.reference}`,
          ]);
          if (
            (
              await tx.query('SELECT id FROM assets WHERE issuer=$1 AND reference=$2', [
                d.issuer,
                d.reference,
              ])
            ).rows.length
          )
            throw new Error('This historical voucher already exists; reuse its original asset');
          result = await createAsset(tx, command_id, { ...d, movement_kind: 'historical_opening' });
          await line(
            tx,
            command_id,
            date,
            'travel_inventory',
            'historical_funding_unreconciled',
            d.cost,
          );
          await insert(tx, 'tasks', {
            title: 'Historical voucher funding needs reconciliation',
            record_type: 'asset',
            record_id: result.id,
            assignee_id: actor.id,
            priority: 'High',
            notes:
              'Owned voucher and original basis are established. Original payment settlement and any separate customer reimbursement remain Unreconciled. Use preserved source evidence; do not invent a payment or seller obligation to clear this task.',
          });
          result.historical_funding_status = 'Unreconciled';
          break;
        }
        if (d.ownership === 'External' && d.cost !== 0)
          throw new Error('External points are paid on use; opening Padova cost must be zero');
        result = await createAsset(tx, command_id, d);
        if (d.ownership === 'Padova')
          await line(
            tx,
            command_id,
            date,
            'travel_inventory',
            d.ownership === 'Padova' ? 'asset_acquisition_payable' : 'customer_asset_liability',
            d.cost,
            undefined,
            d.seller_id,
          );
        break;
      }
      case 'fund': {
        before = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        result = await postFunding(tx, command_id, d, date);
        const booking = await one(tx, 'SELECT itinerary FROM bookings WHERE id=$1', [d.booking_id]);
        if (
          d.confirm_cost &&
          ['Pending', 'No supplier cost'].includes(booking.itinerary.cost_status)
        )
          await tx.query('UPDATE bookings SET itinerary=$2 WHERE id=$1', [
            d.booking_id,
            JSON.stringify({ ...booking.itinerary, cost_status: 'Confirmed' }),
          ]);
        else if (!d.confirm_cost)
          await tx.query('UPDATE bookings SET itinerary=$2 WHERE id=$1', [
            d.booking_id,
            JSON.stringify({ ...booking.itinerary, cost_status: 'Pending' }),
          ]);
        break;
      }
      case 'sell_asset': {
        const c = await consume(tx, command_id, d.asset_id, d.quantity, date, 'sale');
        let payment_id;
        if (d.paid && d.proceeds > 0) {
          const p = await insert(tx, 'payments', {
            direction: 'asset_sale',
            party_id: d.buyer_id,
            amount: d.proceeds,
            paid_on: date,
            method: d.method,
            reference: d.reference,
          });
          payment_id = p.id;
        }
        result = await insert(tx, 'asset_sales', {
          asset_id: d.asset_id,
          buyer_id: d.buyer_id,
          quantity: d.quantity,
          proceeds: d.proceeds,
          basis: c.basis,
          effective_on: date,
          payment_id,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          d.paid ? 'cash' : 'asset_sale_receivable',
          'asset_sale_revenue',
          d.proceeds,
          undefined,
          d.buyer_id,
        );
        await line(tx, command_id, date, 'asset_sale_cost', 'travel_inventory', c.basis);
        await movement(tx, command_id, date, 'asset_gain_loss', d.proceeds - knownBasis(c.basis));
        break;
      }
      case 'benefit': {
        const source = await one(tx, 'SELECT itinerary FROM bookings WHERE id=$1', [d.booking_id]);
        if (source.itinerary.operational_entry?.source_profile_id)
          throw new Error(
            'Use the account-linked credit request Received workflow for this booking',
          );
        if (
          d.reference &&
          (source.itinerary.price_match_history ?? []).some(
            (event: Row) =>
              event.status === 'Verified available' && event.reference === d.reference,
          )
        )
          throw new Error(
            'This price-match reference already created a credit; use the existing asset rather than posting it again',
          );
        if (d.final_rate !== undefined && d.original_rate === undefined)
          d.original_rate = originalConfirmedRate(await economics(tx, d.booking_id));
        if ((d.original_rate === undefined) !== (d.final_rate === undefined))
          throw new Error('Enter both original and final rate, or leave both blank');
        if (d.original_rate !== undefined && d.original_rate - d.final_rate !== d.amount)
          throw new Error('Generated credit must equal original rate minus final confirmed rate');
        result = await createAsset(tx, command_id, {
          name: d.name,
          kind: d.kind,
          issuer: 'Capital One',
          source_booking_id: d.booking_id,
          quantity: d.amount,
          cost: d.amount,
          date,
          expires_on: d.expires_on,
          movement_kind: 'earned_credit',
        });
        await movement(tx, command_id, date, 'earned_credit', d.amount, d.booking_id);
        await line(
          tx,
          command_id,
          date,
          'travel_inventory',
          'credit_benefit_income',
          d.amount,
          d.booking_id,
        );
        await appendPriceMatch(tx, actor, command_id, {
          ...d,
          status: 'Verified available',
          asset_id: result.id,
        });
        break;
      }
      case 'price_match_event': {
        const booking = await one(tx, 'SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [
          d.booking_id,
        ]);
        const prior = d.request_id
          ? latestCreditRequests(booking.itinerary.price_match_history).find(
              (e) => e.request_id === d.request_id,
            )
          : undefined;
        if (d.request_id && !prior)
          throw new Error('Credit request does not belong to this booking');
        if (prior && ['Received', 'Cancelled', 'Denied'].includes(prior.status))
          throw new Error('Credit request is closed; retain history and create a new request');
        const event: Row = { ...prior, ...d, request_id: d.request_id ?? command_id };
        const inheritedRate =
          prior?.original_rate ?? originalConfirmedRate(await economics(tx, d.booking_id));
        if (
          d.original_rate !== undefined &&
          inheritedRate !== undefined &&
          d.original_rate !== inheritedRate &&
          !d.original_rate_reason?.trim()
        )
          throw new Error('An original rate override requires an exceptional reason');
        event.original_rate ??= inheritedRate;
        // A selected source profile is mandatory for new account-owned reusable value.
        event.profile_id ??= booking.itinerary.operational_entry?.source_profile_id;
        if (event.profile_id) {
          const profile = await one(tx, 'SELECT * FROM booking_source_profiles WHERE id=$1', [
            event.profile_id,
          ]);
          if (profile.source_method_id !== booking.itinerary.operational_entry?.source_method_id)
            throw new Error('Credit receiving profile must match the booking source');
          if (prior?.profile_id && prior.profile_id !== profile.id)
            throw new Error('A request cannot change its receiving profile');
        }
        if (d.status !== 'Received' && (d.received_amount || d.received_on))
          throw new Error('Actual receipt details require Received status');
        if (d.status === 'Received') {
          requirePermission(actor, 'manage_assets');
          if (!event.profile_id || !d.received_amount || !d.received_on)
            throw new Error(
              'Received credit needs its account/profile, actual amount and received date',
            );
          if (!/capital one/i.test(booking.channel))
            throw new Error('This received-credit workflow requires Capital One Travel');
          if (!d.reference.trim())
            throw new Error('Received credit requires a unique credit reference');
          const duplicate = await tx.query(
            "SELECT id FROM commands WHERE kind='price_match_event' AND payload->>'status'='Received' AND payload->>'reference'=$1 AND result IS NOT NULL",
            [d.reference],
          );
          if (duplicate.rows.length)
            throw new Error('This credit reference has already been received');
          const asset = await createAsset(tx, command_id, {
            name: `Price-match credit · ${d.reference || event.request_id}`,
            kind: 'Capital One credit',
            issuer: 'Capital One',
            ownership: 'Padova',
            source_booking_id: d.booking_id,
            quantity: d.received_amount,
            cost: d.received_amount,
            date: d.received_on,
            movement_kind: 'earned_credit',
            reference: d.reference,
          });
          await insert(tx, 'source_profile_assets', {
            asset_id: asset.id,
            profile_id: event.profile_id,
          });
          await movement(
            tx,
            command_id,
            d.received_on,
            'earned_credit',
            d.received_amount,
            d.booking_id,
          );
          await line(
            tx,
            command_id,
            d.received_on,
            'travel_inventory',
            'credit_benefit_income',
            d.received_amount,
            d.booking_id,
          );
          event.asset_id = asset.id;
          event.amount = d.received_amount;
        }
        result = await appendPriceMatch(tx, actor, command_id, event);
        break;
      }
      case 'voucherize': {
        const b = await economics(tx, d.booking_id);
        const existing = await one(
          tx,
          "SELECT COALESCE(sum(l.cost),0) amount FROM assets a JOIN asset_lots l ON l.asset_id=a.id WHERE a.source_booking_id=$1 AND a.kind='Voucher'",
          [d.booking_id],
        );
        if (d.basis + n(existing.amount) > n(b.funding_cost))
          throw new Error('Voucher basis exceeds source cost');
        result = await createAsset(tx, command_id, {
          name: d.name,
          kind: 'Voucher',
          issuer: b.channel,
          source_booking_id: d.booking_id,
          holder_id: b.customer_id,
          ownership: d.ownership,
          quantity: d.quantity,
          cost: d.basis,
          date,
          expires_on: d.expires_on,
          movement_kind: 'voucherization',
        });
        await line(
          tx,
          command_id,
          date,
          'travel_inventory',
          'voucherization_liability',
          d.basis,
          d.booking_id,
        );
        break;
      }
      case 'commission': {
        const payers = (
          d.payers?.length
            ? d.payers
            : d.payer_id && d.gross != null
              ? [
                  {
                    payer_id: d.payer_id,
                    collector_id: d.collector_id,
                    gross: d.gross,
                    retained: d.retained ?? 0,
                    due_on: d.due_on,
                    is_iata_partner: d.is_iata_partner ?? false,
                  },
                ]
              : []
        ) as Row[];
        if (!payers.length) throw new Error('Add at least one commission payer');
        const iataReady = await commissionIataPartnerReady(tx);
        const existing = (
          await tx.query('SELECT payer_id FROM commissions WHERE booking_id=$1', [d.booking_id])
        ).rows as Row[];
        const posted: Row[] = [];
        for (const p of payers) {
          if (p.retained > p.gross) throw new Error('Collector retention exceeds commission');
          if (existing.some((e) => e.payer_id === p.payer_id))
            throw new Error(
              'Commission receivable for this payer already exists on the booking; do not double-post',
            );
          const row = await insert(tx, 'commissions', {
            booking_id: d.booking_id,
            payer_id: p.payer_id,
            collector_id: p.collector_id,
            gross: p.gross,
            retained: p.retained ?? 0,
            due_on: p.due_on ?? date,
            ...(iataReady ? { is_iata_partner: Boolean(p.is_iata_partner) } : {}),
            command_id,
          });
          posted.push(row);
          existing.push({ payer_id: p.payer_id });
          const net = p.gross - (p.retained ?? 0);
          await movement(tx, command_id, date, 'commission_accrual', net, d.booking_id);
          await line(
            tx,
            command_id,
            date,
            'commission_receivable',
            'commission_revenue',
            net,
            d.booking_id,
          );
          if (p.is_iata_partner) {
            await insert(tx, 'notes', {
              record_type: 'booking',
              record_id: d.booking_id,
              actor: actor.id,
              body: '[primary] Primary IATA / partner commission receivable.',
            });
          } else {
            await insert(tx, 'notes', {
              record_type: 'booking',
              record_id: d.booking_id,
              actor: actor.id,
              body: '[secondary] Secondary expected commission receivable (not IATA primary, not org payable).',
            });
          }
        }
        if (d.referral) {
          await requirePayableTerms(tx);
          const priorReferral = (
            await tx.query('SELECT id FROM referrals WHERE booking_id=$1', [d.booking_id])
          ).rows;
          if (priorReferral.length)
            throw new Error(
              'Commission Payable already exists on this booking; do not double-post the referrer',
            );
          await one(tx, 'SELECT id FROM parties WHERE id=$1 AND archived_at IS NULL', [
            d.referral.referrer_id,
          ]);
          if (
            !d.referral.reason &&
            (d.referral.payable_when ||
              d.referral.percentage_basis ||
              d.referral.earned !== undefined)
          )
            throw new Error('Commission Payable terms require their reason/source');
          if (
            d.referral.basis !== 'fixed' &&
            d.referral.percentage_basis === 'agreed_amount' &&
            d.referral.agreed_basis == null
          )
            throw new Error('Enter the agreed percentage basis amount; Unknown is not zero');
          const referralDue = d.referral.due_on ?? date;
          const referralRow = await insert(tx, 'referrals', {
            booking_id: d.booking_id,
            referrer_id: d.referral.referrer_id,
            basis: d.referral.basis === 'fixed' ? 'fixed' : 'profit',
            rate_bps: d.referral.rate_bps,
            fixed_amount: d.referral.fixed_amount,
            after_receipt: d.referral.after_receipt,
            due_on: referralDue,
            command_id,
          });
          if (d.referral.reason)
            await insert(tx, 'commission_payable_revisions', {
              referral_id: referralRow.id,
              revision: 1,
              calculation: d.referral.basis === 'fixed' ? 'fixed' : 'percentage',
              percentage_basis: d.referral.percentage_basis ?? 'profit',
              rate_bps: d.referral.rate_bps,
              fixed_amount: d.referral.fixed_amount,
              agreed_basis: d.referral.agreed_basis,
              earned: d.referral.earned ?? true,
              earned_on: (d.referral.earned ?? true) ? date : undefined,
              payable_when: d.referral.payable_when ?? 'After travel',
              due_on: referralDue,
              cancellation_rule: d.referral.cancellation_rule,
              reason: d.referral.reason,
              effective_on: date,
              command_id,
            });
          posted.push({ referral_id: referralRow.id });
        }
        result = posted[0];
        touched.add(d.booking_id);
        break;
      }
      case 'commission_receipt': {
        const posted = await postCommissionReceipt(tx, command_id, d, date);
        result = posted.result;
        touched.add(posted.booking_id);
        break;
      }
      case 'referral': {
        await requirePayableTerms(tx);
        await one(tx, 'SELECT id FROM parties WHERE id=$1 AND archived_at IS NULL', [
          d.referrer_id,
        ]);
        if (!d.reason && (d.payable_when || d.percentage_basis || d.earned !== undefined))
          throw new Error('Commission Payable terms require their reason/source');
        if (d.basis !== 'fixed' && d.percentage_basis === 'agreed_amount' && d.agreed_basis == null)
          throw new Error('Enter the agreed percentage basis amount; Unknown is not zero');
        result = await insert(tx, 'referrals', {
          booking_id: d.booking_id,
          referrer_id: d.referrer_id,
          basis: d.basis === 'fixed' ? 'fixed' : 'profit',
          rate_bps: d.rate_bps,
          fixed_amount: d.fixed_amount,
          after_receipt: d.after_receipt,
          due_on: d.due_on,
          command_id,
        });
        touched.add(d.booking_id);
        if (d.reason)
          await insert(tx, 'commission_payable_revisions', {
            referral_id: result.id,
            revision: 1,
            calculation: d.basis === 'fixed' ? 'fixed' : 'percentage',
            percentage_basis: d.percentage_basis ?? 'profit',
            rate_bps: d.rate_bps,
            fixed_amount: d.fixed_amount,
            agreed_basis: d.agreed_basis,
            earned: d.earned ?? true,
            earned_on: (d.earned ?? true) ? date : undefined,
            payable_when: d.payable_when ?? 'After travel',
            due_on: d.due_on,
            cancellation_rule: d.cancellation_rule,
            reason: d.reason,
            effective_on: date,
            command_id,
          });
        break;
      }
      case 'revise_referral':
      case 'reverse_referral': {
        await requirePayableTerms(tx);
        const r = await one(tx, 'SELECT * FROM referrals WHERE id=$1', [d.referral_id]);
        const b = await economics(tx, r.booking_id);
        if (b.travel_end < appToday) requirePermission(actor, 'edit_completed_bookings');
        const current: Row = b.commission_payables.find((x: Row) => x.id === r.id);
        before = current;
        if (current.revision !== d.revision)
          throw new Error('Commission Payable terms changed; refresh before correcting');
        if (current.active === false)
          throw new Error('Reversed agreement remains in history; record a new agreement');
        const lastDate = String(current.effective_on ?? current.created_on);
        if (date < lastDate) throw new Error('Correction date precedes the current agreement');
        if (
          kind === 'revise_referral' &&
          d.basis !== 'fixed' &&
          d.percentage_basis === 'agreed_amount' &&
          d.agreed_basis == null
        )
          throw new Error('Enter the agreed percentage basis amount; Unknown is not zero');
        const terms =
          kind === 'reverse_referral'
            ? {
                calculation: current.calculation,
                percentage_basis: current.percentage_basis,
                rate_bps: current.rate_bps,
                fixed_amount: current.fixed_amount,
                agreed_basis: current.agreed_basis,
                earned: current.earned,
                earned_on: current.earned_on,
                payable_when: current.payable_when,
                due_on: current.due_on,
                cancellation_rule: current.cancellation_rule ?? 'Realized economics',
                active: false,
              }
            : {
                calculation: d.basis === 'fixed' ? 'fixed' : 'percentage',
                percentage_basis: d.percentage_basis,
                rate_bps: d.rate_bps,
                fixed_amount: d.fixed_amount,
                agreed_basis: d.agreed_basis,
                earned: d.earned,
                earned_on: d.earned ? (current.earned ? current.earned_on : date) : undefined,
                payable_when: d.payable_when,
                due_on: d.due_on,
                cancellation_rule: d.cancellation_rule,
              };
        result = await insert(tx, 'commission_payable_revisions', {
          ...terms,
          referral_id: r.id,
          revision: d.revision + 1,
          reason: d.reason,
          effective_on: date,
          command_id,
        });
        touched.add(b.id);
        break;
      }
      case 'reverse_referral_payment': {
        const p = await one(tx, 'SELECT * FROM payment_balances WHERE id=$1', [d.payment_id]);
        if (p.direction !== 'referral') throw new Error('Select a Commission Payable payout');
        const r = await one(
          tx,
          'SELECT r.* FROM referral_payments rp JOIN referrals r ON r.id=rp.referral_id WHERE rp.payment_id=$1',
          [p.id],
        );
        if (d.amount > n(p.current_amount) || date < String(p.paid_on))
          throw new Error('Reversal exceeds the remaining payout or precedes it');
        before = p;
        await requirePayableTerms(tx);
        result = await insert(tx, 'commission_payout_adjustments', {
          payment_id: p.id,
          delta: -d.amount,
          reason: d.reason,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          'cash',
          'referral_payable',
          d.amount,
          r.booking_id,
          r.referrer_id,
        );
        touched.add(r.booking_id);
        break;
      }
      case 'pay_referral': {
        const r = await one(tx, 'SELECT * FROM referrals WHERE id=$1', [d.referral_id]);
        const b = await economics(tx, r.booking_id);
        touched.add(b.id);
        const state = (await payableStates(tx, b, date)).find((x) => x.id === r.id)!;
        if (date < String(state.effective_on ?? state.created_on))
          throw new Error('Payout precedes its agreement');
        if (state.hold_reason === 'Reversed / cancelled')
          throw new Error(
            'Commission payout exceeds payable: agreement reversed or booking cancelled',
          );
        if (state.hold_reason)
          throw new Error(
            state.hold_reason === 'Commission receipt pending'
              ? 'Commission must arrive before commission payout'
              : `Commission Payable is blocked: ${state.hold_reason}`,
          );
        if (d.amount > state.payable_now) throw new Error('Commission payout exceeds payable');
        const p = await insert(tx, 'payments', {
          direction: 'referral',
          account_id: d.account_id,
          party_id: r.referrer_id,
          amount: d.amount,
          paid_on: date,
          method: d.method,
          reference: d.reference,
        });
        result = await insert(tx, 'referral_payments', {
          referral_id: r.id,
          payment_id: p.id,
          amount: d.amount,
          command_id,
        });
        await line(tx, command_id, date, 'referral_payable', 'cash', d.amount, b.id, r.referrer_id);
        break;
      }
      case 'cancel': {
        const b = await economics(tx, d.booking_id);
        const reduction = d.charge_reduction ?? d.customer_due;
        let component: Row | undefined;
        if (d.funding_component_id) {
          component = await one(
            tx,
            'SELECT f.*,a.kind asset_kind,a.ownership asset_ownership FROM funding_components f LEFT JOIN assets a ON a.id=f.asset_id WHERE f.id=$1',
            [d.funding_component_id],
          );
          if (component.booking_id !== b.id)
            throw new Error('Funding component belongs to another booking');
          if (
            (
              await tx.query(
                "SELECT id FROM commands WHERE kind IN ('revise_fulfillment','reverse_fulfillment') AND result->>'reversed_funding_id'=$1",
                [component.id],
              )
            ).rows.length
          )
            throw new Error(
              'Original funding was reversed. Choose its active replacement for actual refunds.',
            );
        }
        if (d.travel_component_id) {
          await requireFulfillmentSchema(tx);
          await one(tx, 'SELECT id FROM travel_components WHERE id=$1 AND booking_id=$2', [
            d.travel_component_id,
            d.booking_id,
          ]);
          if (d.traveler_id)
            throw new Error(
              'Use either a booking traveler cancellation or a travel-component cancellation',
            );
          if (component) {
            if (
              !(
                await tx.query(
                  'SELECT id FROM fulfillment_details WHERE travel_component_id=$1 AND funding_component_id=$2',
                  [d.travel_component_id, component.id],
                )
              ).rows.length
            )
              throw new Error(
                'Link the original funding to this travel before recording its refund',
              );
          } else if (d.supplier_expected)
            throw new Error('Choose the original funding component for a supplier refund');
        }
        const prior = await one(
          tx,
          'SELECT COALESCE(sum(customer_due),0) amount FROM refunds WHERE booking_id=$1',
          [b.id],
        );
        if (d.customer_due > n(b.paid) - n(prior.amount))
          throw new Error(
            'Customer refund cannot exceed actual allocated payments without reviewed adjustment',
          );
        if (reduction > n(b.sale))
          throw new Error('Cancellation credit exceeds remaining customer charges');
        if (d.customer_due > reduction)
          throw new Error('Customer refund due cannot exceed this cancellation charge reduction');
        if (component) {
          const previous = await one(
            tx,
            'SELECT COALESCE(sum(supplier_expected),0) amount FROM refunds WHERE funding_component_id=$1',
            [component.id],
          );
          const limit =
            component.asset_id && component.asset_ownership === 'Padova'
              ? n(component.face_amount)
              : n(component.cost);
          if (d.supplier_expected + n(previous.amount) > limit)
            throw new Error('Refund exceeds original funding component');
        }
        if (d.traveler_id) {
          const member = await one(
            tx,
            'SELECT * FROM booking_travelers WHERE booking_id=$1 AND person_id=$2',
            [b.id, d.traveler_id],
          );
          if (member.status === 'Cancelled') throw new Error('Traveler already cancelled');
          await tx.query(
            "UPDATE booking_travelers SET status='Cancelled' WHERE booking_id=$1 AND person_id=$2",
            [b.id, d.traveler_id],
          );
        } else if (!d.travel_component_id) {
          if (
            (b.reservation_status === 'Cancelled' || b.reservation_status === 'Refund Pending') &&
            !component
          )
            throw new Error('Add subsequent refund cases against their specific funding component');
          await tx.query("UPDATE bookings SET reservation_status='Refund Pending' WHERE id=$1", [
            b.id,
          ]);
        }
        const quantityUnit = component ? refundQuantityUnit(component) : 'money';
        const pointUnit = quantityUnit !== 'money';
        const expectedBasis =
          component && component.asset_id && component.asset_ownership === 'Padova'
            ? component.cost == null
              ? null
              : proportional(n(component.cost), d.supplier_expected, n(component.face_amount))
            : d.supplier_expected;
        result = await insert(tx, 'refunds', {
          booking_id: b.id,
          traveler_id: d.traveler_id,
          funding_component_id: d.funding_component_id,
          supplier_expected: d.supplier_expected,
          expected_basis: expectedBasis,
          unit: pointUnit ? 'points' : 'cents',
          ...(quantityUnit === 'count' ? { quantity_unit: 'count' } : {}),
          customer_due: d.customer_due,
          due_on: d.due_on,
          reason: d.reason,
          command_id,
        });
        if (d.travel_component_id) result.travel_component_id = d.travel_component_id;
        if (reduction) {
          await insert(tx, 'charges', {
            booking_id: b.id,
            kind: 'cancellation_credit',
            amount: -reduction,
            effective_on: date,
            command_id,
          });
          await line(
            tx,
            command_id,
            date,
            'booking_revenue',
            'customer_receivable',
            reduction,
            b.id,
          );
        }
        break;
      }
      case 'reconcile_supplier_return': {
        // Reuse money already received into historical clearing. Never create cash or cancel travel.
        requirePermission(actor, 'manage_funding');
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `historical-return-link:${d.payment_id}`,
        ]);
        await tx.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [d.booking_id]);
        const payment = await one(tx, 'SELECT * FROM payments WHERE id=$1', [d.payment_id]);
        const funding = await one(tx, 'SELECT * FROM funding_components WHERE id=$1', [
          d.funding_component_id,
        ]);
        const fundingCommand = await one(tx, 'SELECT kind FROM commands WHERE id=$1', [
          funding.command_id,
        ]);
        if (fundingCommand.kind !== 'fund')
          throw new Error(
            'Historical return linking requires a separately recorded original funding event',
          );
        const original = (
          await tx.query(
            "SELECT * FROM commands WHERE kind='payment' AND result->>'id'=$1 AND payload->>'historical_refund_settlement'='true'",
            [payment.id],
          )
        ).rows;
        if (
          original.length !== 1 ||
          payment.direction !== 'supplier_refund' ||
          funding.booking_id !== d.booking_id ||
          funding.kind !== 'Card' ||
          funding.asset_id ||
          !funding.account_id ||
          funding.account_id !== payment.account_id ||
          !funding.seller_id ||
          funding.seller_id !== payment.party_id ||
          date !== String(payment.paid_on) ||
          d.amount !== n(payment.amount)
        )
          throw new Error(
            'Return must match the exact historical cash receipt, original card funding, seller, account, amount and date',
          );
        if (
          (
            await tx.query(
              "SELECT id FROM commands WHERE kind IN ('revise_fulfillment','reverse_fulfillment') AND result->>'reversed_funding_id'=$1",
              [funding.id],
            )
          ).rows.length
        )
          throw new Error('Original return funding was reversed');
        if (
          (await tx.query('SELECT id FROM refund_movements WHERE payment_id=$1', [payment.id])).rows
            .length
        )
          throw new Error('Historical supplier return is already linked');
        const clearing = await one(
          tx,
          "SELECT COALESCE(sum(credit-debit),0) amount FROM journal_lines WHERE command_id=$1 AND account='historical_refund_clearing'",
          [original[0].id],
        );
        const prior = await one(
          tx,
          'SELECT COALESCE(sum(supplier_expected),0) amount FROM refunds WHERE funding_component_id=$1',
          [funding.id],
        );
        const settled = await one(
          tx,
          "SELECT COALESCE(sum(a.net_amount),0) amount FROM supplier_obligations o JOIN obligation_settlements s ON s.obligation_id=o.id JOIN net_allocations a ON a.id=s.allocation_id JOIN payments p ON p.id=a.payment_id WHERE o.command_id=$1 AND o.booking_id=$2 AND o.supplier_id=$3 AND p.direction='supplier' AND p.account_id=$4 AND p.paid_on<=$5::date",
          [funding.command_id, d.booking_id, payment.party_id, payment.account_id, date],
        );
        if (
          n(clearing.amount) !== d.amount ||
          funding.cost == null ||
          date < String(funding.effective_on) ||
          d.amount + n(prior.amount) > n(settled.amount) ||
          d.amount + n(prior.amount) > n(funding.cost)
        )
          throw new Error('Return exceeds original funding or its recorded clearing amount');
        const refund = await insert(tx, 'refunds', {
          booking_id: d.booking_id,
          funding_component_id: funding.id,
          supplier_expected: d.amount,
          expected_basis: d.amount,
          unit: 'cents',
          customer_due: 0,
          due_on: date,
          reason: d.reason,
          command_id,
        });
        result = await insert(tx, 'refund_movements', {
          refund_id: refund.id,
          kind: 'supplier_received',
          form: 'cash',
          amount: d.amount,
          recognized_basis: d.amount,
          payment_id: payment.id,
          effective_on: date,
          command_id,
        });
        await movement(tx, command_id, date, 'supplier_recovery', d.amount, d.booking_id);
        await line(
          tx,
          command_id,
          date,
          'historical_refund_clearing',
          'booking_cost',
          d.amount,
          d.booking_id,
          payment.party_id,
        );
        result.refund_id = refund.id;
        result.payment_id = payment.id;
        break;
      }
      case 'receive_refund': {
        if (d.form === 'cash' && (d.asset_id || d.original_movement_id || d.new_asset))
          throw new Error('A cash refund cannot also restore or create inventory');
        const r = await one(tx, 'SELECT * FROM refunds WHERE id=$1', [d.refund_id]);
        touched.add(r.booking_id);
        const received = await one(
          tx,
          "SELECT COALESCE(sum(amount),0) amount FROM refund_movements WHERE refund_id=$1 AND kind='supplier_received'",
          [r.id],
        );
        if (d.amount > n(r.supplier_expected) - n(received.amount))
          throw new Error('Refund receipt exceeds expected amount');
        let basis = d.amount,
          debitAccount = 'travel_inventory';
        const payableCredit = d.form === 'Supplier payable credit';
        if (payableCredit) {
          if (
            r.unit === 'points' ||
            !r.funding_component_id ||
            d.asset_id ||
            d.new_asset ||
            d.original_movement_id
          )
            throw new Error(
              'A payable credit must reference an unpaid cash/card component and cannot create inventory',
            );
          const component = await one(
            tx,
            'SELECT f.*,a.ownership asset_ownership FROM funding_components f LEFT JOIN assets a ON a.id=f.asset_id WHERE f.id=$1',
            [r.funding_component_id],
          );
          if (component.asset_id && component.asset_ownership === 'Padova')
            throw new Error('Use the original asset-return workflow for asset funding');
          const priorComponent = await one(
            tx,
            "SELECT COALESCE(sum(m.recognized_basis),0) amount FROM refund_movements m JOIN refunds r ON r.id=m.refund_id WHERE r.funding_component_id=$1 AND m.kind='supplier_received'",
            [component.id],
          );
          if (d.amount + n(priorComponent.amount) > n(component.cost))
            throw new Error('Payable credit exceeds the original component cost');
          const booking = await economics(tx, r.booking_id);
          const payee = component.seller_id ?? booking.supplier_id;
          if (!payee || d.amount > n((await supplierOutstanding(tx, r.booking_id, payee)).amount))
            throw new Error('Supplier credit exceeds the unpaid obligation for this counterparty');
          debitAccount = 'supplier_payable';
        }
        let restoredComponent = false;
        if (
          !payableCredit &&
          d.form !== 'cash' &&
          !d.new_asset &&
          !d.original_movement_id &&
          r.funding_component_id
        ) {
          const f = await one(
            tx,
            'SELECT f.*,a.ownership asset_ownership FROM funding_components f LEFT JOIN assets a ON a.id=f.asset_id WHERE f.id=$1',
            [r.funding_component_id],
          );
          if (f.asset_id && f.asset_ownership !== 'Padova')
            throw new Error(
              'Outside-source returns require actual cash, payable credit or a separately verified Padova-owned credit; do not restore the source inventory',
            );
          if (f.asset_id && (!d.asset_id || d.asset_id === f.asset_id)) {
            d.asset_id = f.asset_id;
            const originals = (
              await tx.query(
                (await hasFulfillmentSchema(tx))
                  ? 'SELECT m.* FROM asset_movements m WHERE m.asset_id=$2 AND m.command_id=$1 AND m.quantity<0 AND (EXISTS(SELECT 1 FROM funding_asset_uses u WHERE u.funding_component_id=$3 AND u.movement_id=m.id) OR NOT EXISTS(SELECT 1 FROM funding_asset_uses u WHERE u.funding_component_id=$3)) ORDER BY m.id'
                  : 'SELECT * FROM asset_movements WHERE command_id=$1 AND asset_id=$2 AND quantity<0 ORDER BY id',
                (await hasFulfillmentSchema(tx))
                  ? [f.command_id, f.asset_id, f.id]
                  : [f.command_id, f.asset_id],
              )
            ).rows;
            let left = d.amount;
            basis = 0;
            for (const original of originals) {
              const restored = await one(
                tx,
                'SELECT COALESCE(sum(quantity),0) qty,COALESCE(sum(basis),0) basis FROM asset_movements WHERE original_movement_id=$1',
                [original.id],
              );
              const available = -n(original.quantity) - n(restored.qty),
                quantity = Math.min(left, available);
              if (quantity <= 0) continue;
              const restoredBasis =
                original.basis == null
                  ? null
                  : proportional(-n(original.basis) - n(restored.basis), quantity, available);
              await insert(tx, 'asset_movements', {
                asset_id: f.asset_id,
                lot_id: original.lot_id,
                booking_id: r.booking_id,
                quantity,
                basis: restoredBasis,
                kind: 'cancellation_return',
                effective_on: date,
                original_movement_id: original.id,
                command_id,
              });
              basis = basis == null || restoredBasis == null ? null : basis + restoredBasis;
              left -= quantity;
              if (!left) break;
            }
            if (left) throw new Error('Returned quantity exceeds original component use');
            restoredComponent = true;
          }
        }
        if (!payableCredit && d.form !== 'cash' && !d.asset_id && !d.new_asset)
          throw new Error('Noncash refund requires the actual returned asset');
        if (d.new_asset) {
          if (d.form === 'cash' || d.asset_id || d.original_movement_id)
            throw new Error('Choose either a new credit or a returned original asset');
          basis =
            d.basis ??
            (r.expected_basis == null
              ? null
              : proportional(n(r.expected_basis), d.amount, n(r.supplier_expected)));
          const a = await createAsset(tx, command_id, {
            ...d.new_asset,
            kind: d.form,
            quantity: d.amount,
            cost: basis,
            source_booking_id: r.booking_id,
            date,
            movement_kind: 'supplier_refund',
          });
          d.asset_id = a.id;
        }
        if (d.original_movement_id) {
          const original = await one(tx, 'SELECT * FROM asset_movements WHERE id=$1', [
            d.original_movement_id,
          ]);
          const originalAsset = await one(tx, 'SELECT ownership FROM assets WHERE id=$1', [
            original.asset_id,
          ]);
          if (originalAsset.ownership !== 'Padova')
            throw new Error('Outside-source inventory cannot be restored as a Padova refund');
          if (
            original.booking_id !== r.booking_id ||
            original.asset_id !== d.asset_id ||
            n(original.quantity) >= 0
          )
            throw new Error('Refund provenance mismatch');
          if (r.funding_component_id) {
            const f = await one(tx, 'SELECT * FROM funding_components WHERE id=$1', [
              r.funding_component_id,
            ]);
            if (f.command_id !== original.command_id)
              throw new Error('Return must match the selected funding component');
          }
          const restored = await one(
            tx,
            'SELECT COALESCE(sum(quantity),0) qty,COALESCE(sum(basis),0) basis FROM asset_movements WHERE original_movement_id=$1',
            [original.id],
          );
          if (d.amount > -n(original.quantity) - n(restored.qty))
            throw new Error('Returned quantity exceeds original use');
          basis =
            original.basis == null
              ? null
              : proportional(
                  -n(original.basis) - n(restored.basis),
                  d.amount,
                  -n(original.quantity) - n(restored.qty),
                );
          await insert(tx, 'asset_movements', {
            asset_id: d.asset_id,
            lot_id: original.lot_id,
            booking_id: r.booking_id,
            quantity: d.amount,
            basis,
            kind: 'cancellation_return',
            effective_on: date,
            original_movement_id: original.id,
            command_id,
          });
        } else if (d.asset_id && !d.new_asset && !restoredComponent) {
          const a = await one(tx, 'SELECT * FROM assets WHERE id=$1', [d.asset_id]);
          if (a.source_booking_id !== r.booking_id)
            throw new Error('Returned asset must link to source booking');
          // Newly issued travel credit is created at its actual basis by acquire_asset.
          basis = d.basis ?? d.amount;
          const balance = await one(tx, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
          const linked = await one(
            tx,
            "SELECT COALESCE(sum(amount),0) amount,COALESCE(sum(recognized_basis),0) basis FROM refund_movements WHERE asset_id=$1 AND kind='supplier_received'",
            [a.id],
          );
          if (
            basis + n(linked.basis) > n(balance.remaining_basis) ||
            d.amount + n(linked.amount) > n(balance.balance)
          )
            throw new Error('Returned value exceeds recorded asset');
          const source = await one(
            tx,
            'SELECT c.kind FROM asset_lots l JOIN commands c ON c.id=l.command_id WHERE l.asset_id=$1 ORDER BY l.acquired_on LIMIT 1',
            [a.id],
          );
          if (!['acquire_asset', 'voucherize'].includes(source.kind))
            throw new Error('Existing earned value cannot be recognized again as a refund');
          debitAccount =
            source.kind === 'voucherize'
              ? 'voucherization_liability'
              : a.ownership === 'Customer'
                ? 'customer_asset_liability'
                : 'asset_acquisition_payable';
        }
        if (d.form === 'cash' && r.unit === 'points')
          throw new Error('Points-unit refund must preserve its actual noncash form');
        let payment_id;
        if (d.form === 'cash') {
          if (d.account_id) await validatePaymentAccount(tx, d.account_id, d.method);
          const b = await economics(tx, r.booking_id);
          const component = r.funding_component_id
            ? await one(tx, 'SELECT seller_id FROM funding_components WHERE id=$1', [
                r.funding_component_id,
              ])
            : null;
          const payee = component?.seller_id ?? b.itinerary?.acquisition_source_id ?? b.supplier_id;
          const direct =
            r.funding_component_id &&
            (
              await tx.query(
                "SELECT 1 FROM fulfillment_details WHERE funding_component_id=$1 AND terms->>'direct_payment'='true'",
                [r.funding_component_id],
              )
            ).rows.length;
          if (!payee && !direct)
            throw new Error('Cash refund needs a supplier or acquisition counterparty');
          const p = payee
            ? await insert(tx, 'payments', {
                direction: 'supplier_refund',
                account_id: d.account_id,
                party_id: payee,
                amount: d.amount,
                paid_on: date,
                method: d.method,
                reference: d.reference,
              })
            : null;
          payment_id = p?.id;
        }
        result = await insert(tx, 'refund_movements', {
          refund_id: r.id,
          kind: 'supplier_received',
          form: d.form,
          amount: d.amount,
          recognized_basis: basis,
          payment_id,
          asset_id: d.asset_id,
          effective_on: date,
          command_id,
        });
        await movement(tx, command_id, date, 'supplier_recovery', basis, r.booking_id);
        await line(
          tx,
          command_id,
          date,
          d.form === 'cash' ? 'cash' : debitAccount,
          'booking_cost',
          basis,
          r.booking_id,
        );
        break;
      }
      case 'pay_refund': {
        const r = await one(tx, 'SELECT * FROM refunds WHERE id=$1', [d.refund_id]);
        const b = await economics(tx, r.booking_id);
        touched.add(b.id);
        const totals = await one(
          tx,
          "SELECT COALESCE(sum(amount) FILTER (WHERE kind='supplier_received' AND form='cash'),0) received,COALESCE(sum(amount) FILTER (WHERE kind IN ('customer_paid','customer_credit_handed_over')),0) paid FROM refund_movements WHERE refund_id=$1",
          [r.id],
        );
        if (d.amount > n(r.customer_due) - n(totals.paid))
          throw new Error('Refund payout exceeds liability');
        if (n(totals.received) < n(r.supplier_expected) && !d.override_reason?.trim())
          throw new Error('Wait for supplier cash refund or record an explicit handling override');
        const p = await insert(tx, 'payments', {
          direction: 'customer_refund',
          account_id: d.account_id,
          party_id: b.customer_id,
          amount: d.amount,
          paid_on: date,
          method: d.method,
          reference: d.reference,
        });
        result = await insert(tx, 'refund_movements', {
          refund_id: r.id,
          kind: 'customer_paid',
          form: 'cash',
          amount: d.amount,
          payment_id: p.id,
          effective_on: date,
          command_id,
        });
        await line(
          tx,
          command_id,
          date,
          'customer_receivable',
          'cash',
          d.amount,
          b.id,
          b.customer_id,
        );
        break;
      }
      case 'revise': {
        before = await one(tx, 'SELECT * FROM bookings WHERE id=$1', [d.booking_id]);
        if (await hasFulfillmentSchema(tx)) {
          const trips = await effectiveTravelComponents(tx, d.booking_id);
          if (
            trips.filter((t) => !['Cancelled', 'Refund Pending'].includes(t.status)).length > 1 &&
            (d.travel_start !== before.travel_start ||
              d.travel_end !== before.travel_end ||
              ['route', 'origin', 'destination', 'airline_id', 'trip_type'].some(
                (key) => (d.itinerary[key] ?? '') !== (before?.itinerary?.[key] ?? ''),
              ) ||
              d.traveler_ids.length > 0 ||
              d.confirmations.length > 0)
          )
            throw new Error(
              'This booking contains several trips. Change the individual flight or stay so each trip keeps the correct dates.',
            );
        }
        if (d.travel_end < d.travel_start) throw new Error('Travel end date is before start date. Fix the dates before saving.');
        result = await one(
          tx,
          'UPDATE bookings SET summary=$2,travel_start=$3,travel_end=$4,itinerary=$5,reservation_status=$6,confirmation_status=$7,document_status=$8,product=COALESCE($9,product),channel=COALESCE($10,channel),supplier_id=COALESCE($11,supplier_id),revision=revision+1 WHERE id=$1 RETURNING *',
          [
            d.booking_id,
            d.summary,
            d.travel_start,
            d.travel_end,
            JSON.stringify({
              ...d.itinerary,
              price_match_history: before.itinerary.price_match_history,
              historical_sources: before.itinerary.historical_sources,
            }),
            d.reservation_status,
            d.confirmation_status,
            d.document_status,
            d.product ?? null,
            d.channel ?? null,
            d.supplier_id ?? null,
          ],
        );
        for (const person_id of new Set(d.traveler_ids as string[])) {
          const person = await one(tx, 'SELECT kind FROM parties WHERE id=$1', [person_id]);
          if (person.kind !== 'person') throw new Error('Booking traveler must be a person');
          const existing = await tx.query(
            'SELECT person_id FROM booking_travelers WHERE booking_id=$1 AND person_id=$2',
            [d.booking_id, person_id],
          );
          if (!existing.rows.length)
            await insert(tx, 'booking_travelers', { booking_id: d.booking_id, person_id });
        }
        for (const reference of new Set(d.confirmations as string[])) {
          const existing = await tx.query(
            'SELECT id FROM confirmations WHERE booking_id=$1 AND reference=$2',
            [d.booking_id, reference],
          );
          if (!existing.rows.length)
            await insert(tx, 'confirmations', { booking_id: d.booking_id, reference });
        }
        const travelerIds = (
          await tx.query('SELECT person_id,status FROM booking_travelers WHERE booking_id=$1', [
            d.booking_id,
          ])
        ).rows;
        const confirmationRefs = (
          await tx.query('SELECT reference FROM confirmations WHERE booking_id=$1', [d.booking_id])
        ).rows;
        const revisedTravel = (await hasFulfillmentSchema(tx))
          ? await effectiveTravelComponents(tx, d.booking_id, result)
          : [];
        for (const travel of revisedTravel) {
          travel.details.confirmations = [
            ...new Set([...(travel.details.confirmations ?? []), ...d.confirmations]),
          ];
          await appendTravelReferences(tx, command_id, travel);
        }
        await insert(tx, 'itinerary_revisions', {
          booking_id: d.booking_id,
          revision: result.revision,
          snapshot: {
            ...result,
            travelers: travelerIds,
            confirmations: confirmationRefs.map((r) => r.reference),
            ...(revisedTravel.length ? { travel_components: revisedTravel } : {}),
          },
          actor: actor.id,
        });
        const changeSources = (
          await tx.query(
            "SELECT DISTINCT seller_id FROM funding_components f WHERE booking_id=$1 AND seller_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text)",
            [d.booking_id],
          )
        ).rows;
        const changeSeller =
          d.change_seller_id ??
          (changeSources.length === 1 ? changeSources[0].seller_id : before.supplier_id);
        for (const [kind, amount] of [
          ['Fare difference', d.fare_difference],
          ['Supplier change fee', d.supplier_change_fee],
        ] as const) {
          if (amount)
            await postFunding(
              tx,
              command_id,
              {
                booking_id: d.booking_id,
                kind,
                face_amount: amount,
                cost: amount,
                seller_id: changeSeller,
                reference: d.reason,
                settled: false,
              },
              date,
            );
        }
        for (const [kind, amount] of [
          ['Change fare / customer adjustment', d.additional_customer_charge - d.padova_change_fee],
          ['Padova change fee', d.padova_change_fee],
        ] as const) {
          if (!amount) continue;
          await insert(tx, 'charges', {
            booking_id: d.booking_id,
            kind,
            amount,
            effective_on: date,
            command_id,
          });
          await line(
            tx,
            command_id,
            date,
            'customer_receivable',
            'booking_revenue',
            amount,
            d.booking_id,
            before.customer_id,
          );
        }
        break;
      }
      case 'note':
        result = await insert(tx, 'notes', { ...d, actor: actor.id });
        break;
      case 'task':
      case 'update_task': {
        if (Boolean(d.record_type) !== Boolean(d.record_id))
          throw new Error('Select both a linked record type and a record, or leave both empty');
        if (
          d.assignee_id &&
          !(await tx.query('SELECT id FROM staff WHERE id=$1 AND active=true', [d.assignee_id]))
            .rows.length
        )
          throw new Error('Task assignee must be an active staff member');
        if (d.record_type) {
          if (d.record_type === 'asset' && !hasPermission(actor, 'manage_assets'))
            requirePermission(actor, 'view_asset_basis');
          if (d.record_type === 'commission' && !hasPermission(actor, 'manage_commissions'))
            requirePermission(actor, 'view_commissions');
          if (d.record_type === 'refund' && !hasPermission(actor, 'issue_refunds'))
            requirePermission(actor, 'view_refunds');
          const table = {
            booking: 'bookings',
            party: 'parties',
            asset: 'assets',
            commission: 'commissions',
            refund: 'refunds',
          }[d.record_type as string];
          if (!(await tx.query(`SELECT id FROM ${table} WHERE id=$1`, [d.record_id])).rows.length)
            throw new Error('Linked task record does not exist');
        }
        if (kind === 'update_task') {
          before = await one(tx, 'SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [d.task_id]);
          result = await one(
            tx,
            `UPDATE tasks SET title=$2,record_type=$3,record_id=$4,assignee_id=$5,due_on=$6,priority=$7,notes=$8,status=$9 WHERE id=$1 RETURNING *`,
            [
              d.task_id,
              d.title,
              d.record_type ?? null,
              d.record_id ?? null,
              d.assignee_id ?? null,
              d.due_on ?? null,
              d.priority,
              d.notes,
              d.status,
            ],
          );
          break;
        }
        result = await insert(tx, 'tasks', d);
        break;
      }
      case 'complete_task':
        before = await one(tx, 'SELECT * FROM tasks WHERE id=$1', [d.task_id]);
        result = await one(tx, "UPDATE tasks SET status='Done' WHERE id=$1 RETURNING *", [
          d.task_id,
        ]);
        await insert(tx, 'notes', {
          record_type: 'task',
          record_id: d.task_id,
          body: d.note,
          actor: actor.id,
        });
        break;
      case 'review_resolution':
        await validateTravelerDecision(tx, actor, d);
        await validateHistoricalDraftReview(tx, actor, d);
        result = await insert(tx, 'review_resolution_events', {
          ...d,
          actor: actor.id,
          command_id,
        });
        break;
      case 'resolve_attention':
        if (
          d.key.startsWith('supplier:') ||
          d.key.startsWith('supplier-payment:') ||
          d.key.startsWith('cost:')
        )
          requirePermission(actor, 'manage_funding');
        if (d.key.startsWith('referral:')) requirePermission(actor, 'manage_commissions');
        if (d.key.startsWith('commission:')) requirePermission(actor, 'manage_commissions');
        if (d.key.startsWith('expiry:') || d.key.startsWith('negative-inventory:'))
          requirePermission(actor, 'manage_assets');
        if (d.key.startsWith('negative-inventory:')) {
          const assetId = d.key.slice('negative-inventory:'.length);
          id.parse(assetId);
          const asset = await one(tx, 'SELECT balance FROM asset_balances WHERE id=$1', [assetId]);
          if (n(asset.balance) < 0)
            throw new Error(
              'The rewards deficit remains negative. Record its actual resolution before closing this attention item.',
            );
        }
        if (d.key.startsWith('refund:')) requirePermission(actor, 'issue_refunds');
        result = await insert(tx, 'attention_resolutions', {
          attention_key: d.key,
          fingerprint: d.fingerprint,
          resolver: actor.id,
          note: d.note,
        });
        break;
    }
    // Publish the command result inside this still-atomic transaction before
    // computing derived states that include its append-only correction.
    await tx.query('UPDATE commands SET result=$2 WHERE id=$1', [
      command_id,
      JSON.stringify(result),
    ]);
    if (kind === 'revise_fulfillment') {
      const pending = await pendingTravelCosts(tx, d.booking_id);
      await tx.query(
        "UPDATE bookings SET itinerary=jsonb_set(itinerary,'{cost_status}',$2::jsonb) WHERE id=$1",
        [d.booking_id, JSON.stringify(pending ? 'Pending' : 'Confirmed')],
      );
    }
    for (const booking_id of touched) {
      const b = await economics(tx, booking_id);
      if (b.itinerary?.cost_status === 'No supplier cost' && Number(b.funding_cost) !== 0)
        throw new Error('No supplier cost conflicts with the recorded funding cost');
      if (b.itinerary?.cost_status === 'Confirmed') {
        const components = await one(
          tx,
          'SELECT count(*) count FROM funding_components WHERE booking_id=$1',
          [booking_id],
        );
        if (!Number(components.count))
          throw new Error(
            'Record the funding/cost before confirming it; use No supplier cost for an explicitly verified zero cost',
          );
      }
      const bookedReferral = await one(
        tx,
        "SELECT COALESCE(sum(debit-credit),0) amount FROM journal_lines WHERE booking_id=$1 AND account='referral_cost'",
        [booking_id],
      );
      if (b.referral_accrued != null)
        await line(
          tx,
          command_id,
          date,
          'referral_cost',
          'referral_payable',
          b.referral_accrued - n(bookedReferral.amount),
          booking_id,
        );
      const previousRecovery = await one(
        tx,
        "SELECT COALESCE(sum(debit-credit),0) amount FROM journal_lines WHERE booking_id=$1 AND account='referral_recovery_receivable'",
        [booking_id],
      );
      const recoveryDue = b.referral_recovery;
      if (recoveryDue != null)
        await line(
          tx,
          command_id,
          date,
          'referral_recovery_receivable',
          'referral_payable',
          recoveryDue - n(previousRecovery.amount),
          booking_id,
        );
      await recognize(tx, command_id, date, booking_id);
      if (b.reservation_status === 'Refund Pending') {
        const pending = await one(
          tx,
          `SELECT count(*) count FROM refunds r WHERE r.booking_id=$1 AND (
          r.supplier_expected>COALESCE((SELECT sum(amount) FROM refund_movements m WHERE m.refund_id=r.id AND m.kind='supplier_received'),0)
          OR r.customer_due>COALESCE((SELECT sum(amount) FROM refund_movements m WHERE m.refund_id=r.id AND m.kind IN ('customer_paid','customer_credit_handed_over')),0))`,
          [booking_id],
        );
        if (n(pending.count) === 0)
          await tx.query("UPDATE bookings SET reservation_status='Cancelled' WHERE id=$1", [
            booking_id,
          ]);
      }
    }
    const totals = await one(
      tx,
      'SELECT COALESCE(sum(debit-credit),0) balance FROM journal_lines WHERE command_id=$1',
      [command_id],
    );
    if (n(totals.balance) !== 0) throw new Error('Journal is not balanced');
    const auditTargets = new Set<string>(
      [
        ...(['task', 'update_task', 'complete_task'].includes(kind)
          ? [result.id, before?.record_id]
          : []),
        d.booking_id ?? d.record_id ?? result.id ?? d.person_id,
        ...touched,
        d.party_id ?? result.party_id,
        d.customer_id ?? result.customer_id,
        d.asset_id ?? result.asset_id,
        d.referrer_id,
        d.person_id,
        d.group_id,
        d.seller_id,
        d.travel_component_id,
        d.payee_id,
        result.seller_id,
        result.source_id,
        d.buyer_id,
      ].filter(Boolean),
    );
    for (const booking_id of touched) {
      const b = await one(tx, 'SELECT customer_id,supplier_id FROM bookings WHERE id=$1', [
        booking_id,
      ]);
      auditTargets.add(b.customer_id);
      if (b.supplier_id) auditTargets.add(b.supplier_id);
    }
    const customer_balances =
      kind === 'payment' && d.direction === 'customer'
        ? Object.fromEntries(
            await Promise.all(
              [...touched].map(async (id) => [id, (await economics(tx, id)).customer_balance]),
            ),
          )
        : undefined;
    for (const record_id of auditTargets)
      await insert(tx, 'audit_events', {
        command_id,
        actor: actor.id,
        kind,
        record_id,
        before_value: before,
        after_value: { input: d, result, ...(customer_balances ? { customer_balances } : {}) },
        reason: d.reason ?? d.override_reason,
      });
    return result;
  });
}
