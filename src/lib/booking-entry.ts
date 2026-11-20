import { z } from 'zod';
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
