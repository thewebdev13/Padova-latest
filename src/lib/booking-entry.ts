import { z } from 'zod';
import { BOOKING_DOCUMENT_KINDS } from './booking-documents';
import { flightSegment, pricingSchema } from './v1-entry';

const uuid = z.string().uuid();
const cents = z.number().int().min(0).max(9_000_000_000_000);
const label = z.string().trim().min(1).max(200);
const note = z.string().max(5000).default('');
export const bookingReference = z.object({
  type: z.enum([
    'airline_pnr',
    'ticket_number',
    'booking_source_confirmation',
    'hotel_confirmation',
    'car_confirmation',
    'other_reference',
  ]),
  value: label,
  provider_id: uuid.nullish(),
});
export const entryComponent = z.object({
  type: z.enum(['Padova payment', 'Customer card', 'Outside seller', 'Owned value', 'Other']),
  supplied: label.default('Complete Booking / Ticket'),
  seller_id: uuid.nullish(),
  owner_id: uuid.nullish(),
  asset_id: uuid.nullish(),
  program_id: uuid.nullish(),
  instrument_id: uuid.nullish(),
  original_quantity: cents.optional(),
  expires_on: z.iso.date().optional(),
  description: z.string().max(2000).optional(),
  quantity: cents.positive().optional(),
  unit: z.enum(['money', 'points', 'count']).default('money'),
  cost: cents.optional(),
  /** Plan: USD not final (e.g. hotel billed in EUR later). Does not post as confirmed cost. */
  cost_is_estimate: z.boolean().optional(),
  /** Plan: other currency note — information only; never changes profit math. */
  other_currency: z
    .object({
      code: z.string().trim().min(1).max(12),
      amount: z.string().trim().max(40).optional(),
      rate: z.string().trim().max(40).optional(),
    })
    .optional(),
  paid: cents.optional(),
  method: label.optional(),
  account_id: uuid.nullish(),
  date: z.iso.date(),
  reference: z.string().max(200).default(''),
  notes: note,
  card_nickname: z
    .string()
    .max(100)
    .refine((v) => !/\d[\d .-]{10,}\d/.test(v), 'Use a nickname, never a full card number')
    .optional(),
  last_four: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  holder_id: uuid.nullish(),
  quoted_rate: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/)
    .optional(),
  rate_unit: z
    .enum(['USD per point', 'USD per 1,000 points', 'cents per point', 'Fixed supplier price'])
    .optional(),
  rebate_expected: cents.optional(),
  bp_gross_points: cents.positive().optional(),
  bp_rebate_bps: z.number().int().min(0).max(10000).optional(),
  bp_net_override_reason: z.string().trim().max(1000).optional(),
  new_asset: z
    .object({
      name: label,
      kind: label,
      issuer: label,
      quantity: cents.positive(),
      cost: cents,
      expires_on: z.iso.date().optional(),
      reference: z.string().max(200).default(''),
    })
    .optional(),
});
export const operationalEntry = z.object({
  version: z.literal(1),
  trip_type: z.enum(['One Way', 'Round Trip', 'Multi-City']).optional(),
  segments: z.array(flightSegment).min(2).max(30).optional(),
  source_profile_id: uuid.nullish(),
  pricing: pricingSchema.optional(),
  other_description: label.optional(),
  taxes: z
    .object({
      amount: cents,
      bearer: z.enum(['Unknown', 'Padova', 'Customer', 'Seller', 'Included in Seller Price']),
      economic_bearer: z.enum(['Padova', 'Customer', 'Seller', 'Unknown']).optional(),
      customer_recovery: cents.optional(),
      method: label.optional(),
      account_id: uuid.nullish(),
      included_in_component: z.boolean().default(false),
      owed_to_seller: z.boolean().default(false),
      seller_id: uuid.nullish(),
    })
    .optional(),
  draft_id: uuid.optional(),
  /** Plan Held PNR ticketing deadline (YYYY-MM-DD). */
  ticketing_deadline: z.iso.date().optional().nullable(),
  /** Plan v1 How-booked preset (drives cost fields; Cap1 portal card may omit Padova card). */
  how_booked: z
    .enum([
      'Cash / GDS',
      'Capital One',
      'Points (Padova-owned)',
      'Outside seller',
      'Hotel with commission',
      'Voucher / credit',
      'Hotel at program rate (FHR)',
      'Other',
    ])
    .optional(),
  /** FHR / program-rate hotel: program name (e.g. FHR) — More only; never invent. */
  program_rate_name: z.string().trim().max(200).optional(),
  /** FHR / program-rate hotel: short perks note (breakfast, credit, upgrade). */
  program_perks: z.string().trim().max(500).optional(),
  /**
   * FHR More: Amex credit or points gained (default none).
   * Information only — never counted as Padova income.
   */
  program_benefit_gained: z.string().trim().max(500).optional(),
  /**
   * Optional per-traveler / per-flight price note (Plan).
   * One booking keeps one customer total — this never splits sale or invents dollars.
   * Blank = omit; never required or shown by default.
   */
  price_breakdown_note: z.string().trim().max(1000).optional(),
  /** Plan: hotel with commission — how the hotel is paid (four ways). */
  hotel_paid_by: z
    .enum([
      'Padova card',
      'Customer card (Padova prepays)',
      'Customer pays at checkout',
      'Split',
    ])
    .optional(),
  /** Plan Cash / GDS: fare commissionable yes/no (drives 50/50 vs optional $50 PNR). */
  gds_commissionable: z.enum(['Yes', 'No', 'Unknown']).optional(),
  /** How the booking was captured: whatsapp | email | staff_paste | staff_upload | manual. */
  intake_source: z
    .enum(['whatsapp', 'email', 'staff_paste', 'staff_upload', 'instinct', 'manual'])
    .optional(),
  source_method_id: uuid.nullish(),
  award_program_id: uuid.nullish(),
  new_travelers: z.array(label).max(100).default([]),
  references: z.array(bookingReference).max(100).default([]),
  notes: note,
  sale_known: z.boolean(),
  components: z.array(entryComponent).max(30).default([]),
  additional_charge: cents.default(0),
  /** What the extra fee is (booking fee, service fee, etc.) — evidence only, not invented. */
  additional_charge_note: z.string().trim().max(500).optional(),
  commission: z
    .object({
      expected: z.enum(['Yes', 'No', 'Unknown']),
      amount: cents.optional(),
      percentage_bps: z.number().int().min(0).max(10000).optional(),
      basis_kind: z.enum(['Customer sale', 'Provider amount', 'Custom']).optional(),
      basis_amount: cents.optional(),
      basis_description: z.string().trim().max(500).optional(),
      payer_id: uuid.nullish(),
      due_on: z.iso.date().optional(),
      received: cents.optional(),
      received_on: z.iso.date().optional(),
      method: label.optional(),
      account_id: uuid.nullish(),
      notes: note,
    })
    .optional(),
  // Extra receivable when another party also owes commission (e.g. second account path).
  // Stays expected until a real receipt is allocated; independent of IATA-partner primary and org referral payable.
  secondary_commission: z
    .object({
      expected: z.enum(['Yes', 'No', 'Unknown']),
      amount: cents.optional(),
      percentage_bps: z.number().int().min(0).max(10000).optional(),
      basis_kind: z.enum(['Customer sale', 'Provider amount', 'Custom']).optional(),
      basis_amount: cents.optional(),
      basis_description: z.string().trim().max(500).optional(),
      payer_id: uuid.nullish(),
      due_on: z.iso.date().optional(),
      received: cents.optional(),
      received_on: z.iso.date().optional(),
      method: label.optional(),
      account_id: uuid.nullish(),
      notes: note,
    })
    .optional(),
  // Partnership org with accepted agreement + accounting party — creates Commission Payable in one place.
  referring_organization_id: uuid.nullish(),
  /** Plan standing deals seeded from customer/partner (expected Money Back; amount may be Unknown). */
  standing_deals: z
    .array(
      z.object({
        deal_id: z.string().trim().min(1).max(64),
        label: label,
        rate_bps: z.number().int().min(0).max(10000),
        basis: z.enum(['sale_ex_tax', 'sale']),
        amount_cents: cents.nullish(),
        payer_party_id: uuid.nullish(),
        notes: note,
      }),
    )
    .max(20)
    .optional(),
  /** Plan Money Back voids (append-only). Voided ≠ denied. */
  money_back_voids: z
    .array(
      z.object({
        target_kind: z.enum([
          'expected_primary',
          'expected_secondary',
          'standing_deal',
          'commission',
          'referral',
          'price_match',
        ]),
        target_id: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
        voided_at: z.string().trim().min(1).max(64),
        voided_by: uuid.optional(),
        command_id: uuid.optional(),
      }),
    )
    .max(200)
    .optional(),
  /** Plan Money Back denials (append-only). Issuer/payer refused — ≠ voided. */
  money_back_denials: z
    .array(
      z.object({
        target_kind: z.enum([
          'expected_primary',
          'expected_secondary',
          'standing_deal',
          'commission',
          'referral',
          'price_match',
        ]),
        target_id: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
        denied_at: z.string().trim().min(1).max(64),
        denied_by: uuid.optional(),
        command_id: uuid.optional(),
      }),
    )
    .max(200)
    .optional(),
  /** Plan Money Back deductions (append-only). Paid less / remittance deducted — ≠ overwrite gross. */
  money_back_deductions: z
    .array(
      z.object({
        target_kind: z.literal('commission'),
        target_id: z.string().trim().min(1).max(200),
        amount_cents: z.number().int().positive().max(9_000_000_000_000),
        how_received: z.literal('deducted'),
        reason: z.string().trim().min(1).max(2000),
        deducted_at: z.string().trim().min(1).max(64),
        deducted_by: uuid.optional(),
        command_id: uuid.optional(),
      }),
    )
    .max(200)
    .optional(),
  /**
   * Plan More: document links (itinerary / screenshot / PDF) — metadata only, never invent files.
   * Same shape as booking_document append; hide flags allowed for history continuity.
   */
  document_links: z
    .array(
      z.object({
        id: uuid,
        label: label,
        kind: z.enum(BOOKING_DOCUMENT_KINDS),
        url: z.string().trim().max(2000).optional(),
        note: z.string().trim().max(2000).optional(),
        added_on: z.iso.date(),
        hidden: z.boolean().optional(),
        hidden_at: z.string().trim().max(64).optional(),
        hidden_reason: z.string().trim().max(2000).optional(),
      }),
    )
    .max(50)
    .optional(),
});

export const sourceMethodSchema = z.object({
  name: label,
  products: z.array(z.enum(['Flight', 'Hotel', 'Car', 'Other'])).min(1),
  award: z.boolean().default(false),
});

export const draftSchema = z.object({
  title: label,
  // Drafts preserve missing values without manufacturing dated financial records.
  entry: z.record(z.string(), z.unknown()),
});
