import { z } from 'zod';
export const stages = [
  'needs_research',
  'ready_for_outreach',
  'contacted',
  'awaiting_reply',
  'follow_up_due',
  'interested',
  'discussing_terms',
  'active_partner',
  'paused',
  'declined',
  'do_not_contact',
  'ended',
] as const;
export const relationships = [
  'prospect',
  'interested',
  'awaiting_reply',
  'active',
  'paused',
  'declined',
  'ended',
  'do_not_contact',
] as const;
export const campaignKinds = [
  'historical_affiliate',
  'historical_direct',
  'historical_unclear',
  'current_direct',
  'other',
] as const;
export const closedStages = new Set(['paused', 'declined', 'do_not_contact', 'ended']);
const id = z.string().uuid();
const text = z.string().trim().min(1).max(10000);
const optionalText = z.string().max(10000).default('');
export const day = z.iso.date();
export const safeURL = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a complete http(s) source link');
const version = z.number().int().positive();
const edit = { id: id.optional(), version: version.optional() };
const organization = z
  .object({
    ...edit,
    name: text,
    legacy_id: z.string().max(100).nullable().optional(),
    parent_id: id.nullable().optional(),
    accounting_party_id: id.nullable().optional(),
    location: optionalText,
    country: optionalText,
    region: optionalText,
    service_areas: optionalText,
    summary: optionalText,
  })
  .strict();
const opportunity = z
  .object({
    ...edit,
    organization_id: id,
    campaign_id: id,
    stage: z.enum(stages),
    owner_id: id,
    next_action: text,
    due_on: day.nullable(),
    unscheduled_reason: z.string().max(2000).nullable(),
    priority: z.number().int().min(1).max(5),
    rationale: optionalText,
  })
  .strict()
  .refine(
    (d) => d.due_on || d.unscheduled_reason?.trim(),
    'Choose a due date or explain why unscheduled',
  );
export const agreementTerms = z
  .object({
    calculation: z.enum(['fixed', 'percentage']),
    fixed_amount: z.number().int().nonnegative().max(9e12).nullable(),
    rate_bps: z.number().int().min(0).max(10000).nullable(),
    percentage_basis: z
      .enum(['profit', 'sale', 'commission', 'commission_received', 'agreed_amount'])
      .nullable(),
    agreed_basis: z.number().int().nonnegative().max(9e12).nullable().default(null),
    due_on: day.nullable().default(null),
    payable_when: z.enum([
      'When earned',
      'After travel',
      'After customer paid',
      'After commission confirmed',
      'After commission received',
      'On date',
    ]),
    eligibility: text,
    cancellation_rule: z.enum(['Realized economics', 'Retain agreed amount']),
    currency: z.literal('USD'),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.calculation === 'fixed' && d.fixed_amount === null)
      ctx.addIssue({ code: 'custom', message: 'Fixed amount must be explicit' });
    if (d.calculation === 'percentage' && (d.rate_bps === null || d.percentage_basis === null))
      ctx.addIssue({ code: 'custom', message: 'Percentage and basis must be explicit' });
    if (
      d.calculation === 'percentage' &&
      d.percentage_basis === 'agreed_amount' &&
      d.agreed_basis === null
    )
      ctx.addIssue({ code: 'custom', message: 'Agreed percentage basis amount must be explicit' });
    if (d.payable_when === 'On date' && !d.due_on)
      ctx.addIssue({ code: 'custom', message: 'Agreed payment date must be explicit' });
  });
export const schemas = {
  organization,
  contact: z
    .object({
      ...edit,
      organization_id: id,
      name: text,
      role_title: optionalText,
      preferred_channel: optionalText,
      verification: z.enum(['unverified', 'verified', 'invalid']),
      do_not_contact: z.boolean(),
    })
    .strict(),
  contact_method: z
    .object({
      ...edit,
      organization_id: id,
      contact_id: id.nullable(),
      kind: z.enum(['email', 'phone', 'website', 'whatsapp', 'other']),
      value: z.string().trim().min(1).max(2000),
      verification: z.enum(['unverified', 'verified', 'invalid']),
      source_url: safeURL.nullable(),
      do_not_contact: z.boolean(),
    })
    .strict(),
  campaign: z
    .object({
      key: z.string().regex(/^[a-z0-9_-]{1,100}$/),
      name: text,
      kind: z.enum(campaignKinds),
      historical: z.boolean(),
      starts_on: day.nullable(),
      ends_on: day.nullable(),
    })
    .strict(),
  opportunity,
  relationship: z
    .object({
      id,
      version,
      relationship: z.enum(relationships),
      dnc_reason: z.string().max(2000).nullable(),
    })
    .strict(),
  interaction: z
    .object({
      organization_id: id,
      campaign_id: id.nullable(),
      kind: z.enum(['note', 'call', 'email', 'whatsapp', 'meeting', 'document']),
      direction: z.enum(['inbound', 'outbound', 'internal', 'unknown', 'automated']),
      occurred_at: z.iso.datetime({ offset: true }).nullable(),
      original_date: z.string().max(200).nullable(),
      original_timezone: z.string().max(100).nullable(),
      subject: optionalText,
      body: z.string().min(1).max(200000),
      source_url: safeURL.nullable(),
    })
    .strict(),
  research: z
    .object({
      organization_id: id,
      kind: z.enum([
        'research',
        'hotel_recommendation',
        'hotel_agreement',
        'restriction',
        'published_contact',
        'reported_inquiry',
      ]),
      title: text,
      body: z.string().min(1).max(200000),
      source_url: safeURL,
      observed_on: day.nullable(),
      verified_on: day.nullable(),
      rank: z.number().int().positive().nullable(),
    })
    .strict(),
  agreement: z
    .object({
      organization_id: id,
      version,
      status: z.enum(['proposed', 'accepted', 'superseded', 'unconfirmed', 'ended']),
      supersedes_id: id.nullable(),
      original_wording: text,
      confirmed_on: day.nullable(),
      confirmation_method: z.string().max(2000).nullable(),
      evidence_url: safeURL.nullable(),
      starts_on: day.nullable(),
      ends_on: day.nullable(),
      terms: agreementTerms.nullable(),
    })
    .strict(),
  referral: z
    .object({
      organization_id: id,
      agreement_id: id.nullable(),
      booking_id: id.nullable(),
      accounting_referral_id: id.nullable(),
      kind: z.enum(['reported_inquiry', 'verified_inquiry', 'booking']),
      occurred_on: day.nullable(),
      reference: text,
      source_url: safeURL.nullable(),
    })
    .strict(),
  review: z
    .object({
      id,
      version,
      status: z.enum(['resolved', 'deferred']),
      resolution: text,
      organization_id: id.nullable().optional(),
    })
    .strict(),
  review_reply: z
    .object({
      id,
      version,
      next_action: text,
      due_on: day.nullable(),
      unscheduled_reason: z.string().max(2000).nullable(),
    })
    .strict()
    .refine(
      (d) => d.due_on || d.unscheduled_reason?.trim(),
      'Choose a due date or explain why unscheduled',
    ),
  draft: z
    .object({
      opportunity_id: id,
      method_id: id,
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
    })
    .strict(),
  approve_draft: z
    .object({ id, version, approval_hash: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
  reject_draft: z.object({ id, version }).strict(),
  manually_sent: z
    .object({
      id,
      version,
      source_url: safeURL,
      occurred_at: z.iso.datetime({ offset: true }),
      next_action: text,
      due_on: day.nullable(),
      unscheduled_reason: z.string().max(2000).nullable(),
    })
    .strict()
    .refine(
      (d) => d.due_on || d.unscheduled_reason?.trim(),
      'Choose a due date or explain why unscheduled',
    ),
} as const;
export type CommandKind = keyof typeof schemas;
export const commandEnvelope = z
  .object({
    id,
    kind: z.enum(Object.keys(schemas) as [CommandKind, ...CommandKind[]]),
    data: z.unknown(),
    reason: text,
  })
  .strict();
export const aiWriteKinds = new Set<CommandKind>([
  'interaction',
  'research',
  'contact',
  'contact_method',
  'opportunity',
  'review_reply',
]);
export function displayStage(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase());
}
