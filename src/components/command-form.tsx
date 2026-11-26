'use client';
import { countryNames } from '@/lib/traveler-ticketing';
import { useState, useEffect, useRef, FormEvent, type ReactNode } from 'react';
import { Plus, X, Check } from 'lucide-react';
import SearchableSelect from './searchable-select';
import ChoiceInput from './choice-input';
import RolesInput from './roles-input';
import BookingFunding from './booking-funding';
import BookingTravel from './booking-travel';
import TravelerRecords from './traveler-records';
import {
  TRAVELER_PERSONAL_OPTIONAL_KEYS,
  travelerPersonalOptionalShouldOpen,
} from '@/lib/traveler-personal-fields';
import BookingEntry from './booking-entry';
import CommissionBundleForm from './commission-bundle-form';
import BookingPartySelect from './booking-party-select';
import { eligibleProfileContact } from '@/lib/booking-ux';
import FlightSegments from './flight-segments';
import { derivedTravel, travelDateLabels, originalConfirmedRate } from '@/lib/booking-derived';
import { sourceConfirmationLabel } from '@/lib/v1-entry';
import { eligibleParty, providerRole, accountSupports } from '@/lib/directory-eligibility';
import { itineraryEntryKeys } from '@/lib/booking-itinerary';
import { fulfillmentEntryTerms } from '@/lib/fulfillment-entry';
import { assetUnit, formatQuantity, refundQuantityUnit } from '@/lib/asset-units';
import { countLabel } from '@/lib/count-label';
import {
  BOOKING_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_OTHER,
  FUNDING_KINDS,
  LOYALTY_PROGRAM_OTHER,
  LOYALTY_PROGRAMS,
  SEAT_PREFERENCES,
  mergeLoyaltyProgramOptions,
  mergePaymentMethodOptions,
  parseList,
  decimalUnits,
  resolveLoyaltyProgram,
  resolvePaymentMethod,
} from '@/lib/entry-options';
import {
  cancelScopeFieldErrors,
  isEmptyFieldValue,
  mapErrorMessageToFields,
  requiredFieldMessage,
  type FieldErrorMap,
} from '@/lib/form-field-errors';
import { FieldError, FormAlert, ReqMark } from './form-feedback';
import { useConfirmDialog } from './confirm-dialog';
import { isCardPaymentMethod, suggestPaymentCardFees } from '@/lib/card-fees';
import { partyReferralRateBps } from '@/lib/referrer-defaults';
import { inlinePartyCreateDefaults } from '@/lib/inline-party-defaults';
import {
  STANDING_DEAL_BASES,
  STANDING_DEAL_PRODUCTS,
  partyStandingDeals,
  upsertPrimaryStandingDeal,
  type StandingDealBasis,
  type StandingDealProduct,
} from '@/lib/standing-deals';
import {
  TRADE_DEFAULT_STOCK_MODE,
  TRADE_STATUSES,
  TRADE_STOCK_MODE_OPTIONS,
  TRADE_WHAT_OTHER,
  TRADE_WHATS,
  formatTradeRateLabel,
  mergeTradeWhatOptions,
  resolveTradeWhat,
  suggestTradeStatus,
  tradeStatusLabel,
  tradeToComplete,
  tradeUnit,
  type TradeStatus,
} from '@/lib/trade-desk';
import {
  EXPIRY_RULE_OTHER,
  EXPIRY_RULES,
  mergeExpiryRuleOptions,
  parseExpiryRuleFromRestrictions,
  resolveExpiryRule,
  suggestExpiresOn,
} from '@/lib/expiry-rules';
import {
  POINTS_BATCH_SOURCES,
  normalizePointsBatchSource,
} from '@/lib/points-batch-source';
import {
  expectedTransferQuantity,
  pointsReceivedWithBonus,
  transferBonusPlanHint,
  transferSpreadSummary,
} from '@/lib/points-transfer-bonus';
import { formatRefundCallNoteBody } from '@/lib/refund-call-notes';
import { cancelFormMoneyDefaults, suggestCancelRefundAmounts } from '@/lib/refund-card-fee';
import { proportionalRefundPlanHint } from '@/lib/proportional-refund';
import { BOOKING_RELATION_KINDS } from '@/lib/booking-relations';
import {
  PLAN_RESERVATION_STATUS_OPTIONS,
  reservationStatusForForm,
  reservationStatusPlanHint,
  toStoredReservationStatus,
} from '@/lib/booking-status';
import { REFUND_HOW_GIVEN, refundHowGivenPlanHint } from '@/lib/refund-how-given';
import {
  SUPPLIER_REFUND_DENIED_FORM,
  supplierRefundDenyPlanHint,
} from '@/lib/supplier-refund-status';
import { BOOKING_DOCUMENT_KINDS } from '@/lib/booking-documents';
type R = Record<string, any>;
const pretty = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (v: any) =>
  v === null
    ? 'Unknown'
    : v === undefined || !Number.isFinite(Number(v))
      ? 'Restricted'
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
          Number(v ?? 0) / 100,
        );
const isPoints = (a: R) => /points|miles/i.test(a?.kind ?? '');
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: any[];
  source?: string;
  required?: boolean;
  help?: string;
  full?: boolean;
  pattern?: string;
  maxLength?: number;
};
const F = (key: string, label: string, type = 'text', extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type,
  ...extra,
});
const booking = F('booking_id', 'Booking', 'select', { source: 'bookings', required: true });
const amount = F('amount', 'Amount (USD)', 'money', { required: true });
const dateField = F('date', 'Effective date', 'date', { required: true });
const party = (key = 'party_id', label = 'Person / company', required = true) =>
  F(key, label, 'select', { source: 'parties', required });
const assetField = F('asset_id', 'Travel asset', 'select', { source: 'assets' });
const itineraryFields = [
  F('route', 'Route'),
  F('trip_type', 'Trip type', 'select', { options: ['One Way', 'Round Trip', 'Multi-City'] }),
  F('cost_status', 'Cost confirmation', 'select', {
    options: ['Pending', 'Confirmed', 'No supplier cost'],
    help: 'Pending excludes unconfirmed profit. Confirm only after all funding/cost is recorded. No supplier cost is an explicit zero-cost decision.',
  }),
  F('origin', 'Origin / departure airport'),
  F('destination', 'Destination / arrival airport'),
  party('airline_id', 'Operating airline', false),
  party('acquisition_source_id', 'Acquisition seller / source', false),
  F('acquisition_source_status', 'Acquisition source identity', 'select', {
    options: ['Identified', 'Unknown', 'Not applicable'],
    help: 'Unknown means an outside source exists but has not been identified. It does not create an assumed supplier or payable.',
  }),
  F('flight_numbers', 'Flight numbers', 'textarea', {
    help: 'One per line or separated by commas.',
  }),
  F('ticket_numbers', 'Ticket numbers', 'textarea', {
    help: 'Keep the full issued number; one per line.',
  }),
  F('hotel_name', 'Hotel / property name'),
  F('hotel_address', 'Hotel / property address'),
  F('room_type', 'Room type / accommodation'),
];
const fields: Record<string, Field[]> = {
  confirm_sale: [
    booking,
    F('total', 'Confirmed Customer Sale Price (USD)', 'money', { required: true }),
    dateField,
    F('reason', 'Reason / billing note', 'textarea', { required: true, full: true }),
  ],
  booking_source_method: [
    F('name', 'Booking method name', 'text', { required: true }),
    F('products', 'Used for', 'products', {
      required: true,
    }),
    F('award', 'Award booking', 'checkbox', {
      help: 'Bookings through this method are paid with points or miles.',
    }),
  ],
  booking_source_profile: [
    F('name', 'Profile nickname', 'text', { required: true }),
    F('source_method_id', 'Booked Through', 'select', {
      source: 'bookingSourceMethods',
      required: true,
    }),
    F('provider', 'Provider', 'text', { required: true }),
    party('holder_id', 'Contact / account owner (optional)', false),
    F('safe_identifier', 'Last four / safe identifier', 'text', { maxLength: 20 }),
    F('status', 'Profile status', 'select', { options: ['Active', 'Inactive'] }),
    F('notes', 'Profile notes (no credentials)', 'textarea'),
  ],
  booking_source_profile_link: [
    booking,
    F('profile_id', 'Account / Profile', 'select', {
      source: 'bookingSourceProfiles',
      required: true,
    }),
    dateField,
    F('reason', 'Reason for linking profile', 'text', { required: true }),
  ],
  cancellation_cost: [
    booking,
    F('travel_component_id', 'Canceled flight / stay (optional)', 'select', {
      source: 'travelComponents',
    }),
    party('payee_id', 'Actual supplier / source owed'),
    F('amount', 'Additional actual cancellation cost (USD)', 'money', {
      required: true,
      help: 'Only a new expense not already included in recorded funding. This does not automatically charge the customer.',
    }),
    dateField,
    F('reference', 'Unique supplier fee / invoice reference', 'text', { required: true }),
    F('settled', 'Actual supplier fee has already been paid', 'checkbox'),
    F('method', 'Actual payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('account_id', 'Payment account / card', 'select', { source: 'paymentAccounts' }),
    F('reason', 'Actual fee and why it is additional', 'textarea', { required: true, full: true }),
  ],
  confirm_travel_no_cost: [
    booking,
    F('travel_component_id', 'Travel with verified zero Padova expense', 'select', {
      source: 'travelComponents',
      required: true,
    }),
    dateField,
    F('reason', 'Evidence / reason confirming no supplier cost', 'textarea', {
      required: true,
      full: true,
    }),
  ],
  link_fulfillment: [
    booking,
    F('travel_component_id', 'Flight / stay being paid for', 'select', {
      source: 'travelComponents',
      required: true,
    }),
    F('funding_component_id', 'Already recorded cost', 'select', {
      source: 'fundingComponents',
      required: true,
    }),
    F('instrument_id', 'Points / voucher type', 'select', {
      source: 'instruments',
    }),
    F('role', 'Role in this travel', 'select', { options: ['Core', 'Ancillary'], required: true }),
    F('confirm_cost', 'This completes the cost for this travel', 'checkbox'),
    dateField,
    F('reason', 'Why this existing funding belongs to this travel', 'textarea', {
      required: true,
      full: true,
    }),
  ],
  program: [
    F('name', 'Program name', 'text', { required: true }),
    F('category', 'Program category', 'select', {
      options: ['Airline', 'Hotel', 'Bank', 'Portal', 'Other'],
      required: true,
    }),
    party('provider_id', 'Program provider', false),
  ],
  instrument: [
    F('program_id', 'Program', 'select', { source: 'programs', required: true }),
    F('name', 'Points / voucher type name', 'text', { required: true }),
    F('unit', 'Quantity unit', 'select', {
      options: ['money', 'points', 'count'],
      required: true,
      help: 'Money uses USD face value; points/miles and certificates use whole units.',
    }),
    F('role', 'Allowed booking role', 'select', {
      options: ['Core', 'Ancillary', 'Both'],
      required: true,
    }),
    F('restrictions', 'Usage restrictions', 'textarea', { full: true }),
    F('rebate_bps', 'Optional expected rebate (%)', 'percent'),
    F('redemption_cents_numerator', 'Optional redemption quote (USD)', 'money'),
    F('redemption_points_denominator', 'Points represented by that quote', 'integer', {
      help: 'For example, $300 for 20,000 points. Reference value is not Padova cost or earned profit.',
    }),
  ],
  program_account: [
    F('program_id', 'Program', 'select', { source: 'programs', required: true }),
    party('holder_id', 'Account holder'),
    F('name', 'Account nickname', 'text', { required: true }),
    F('masked_reference', 'Last four / masked reference', 'text', {
      maxLength: 4,
      help: 'Nickname and up to four characters only. Never store passwords or full account/card numbers.',
    }),
    F('ownership', 'Account ownership', 'select', {
      options: ['Padova', 'External', 'Customer'],
      required: true,
    }),
  ],
  travel_component: [
    booking,
    F('product', 'Travel product', 'select', {
      options: ['Flight', 'Hotel', 'Car', 'Other'],
      required: true,
    }),
    F('summary', 'Flight / stay summary', 'text', { required: true, full: true }),
    party('provider_id', 'Actual travel provider', false),
    F('channel', 'Booked through', 'choice', { options: BOOKING_CHANNELS }),
    F('booking_source_confirmation', 'Booking Source Confirmation', 'textarea'),
    F('reservation_summary', 'Reservation Summary', 'textarea', { full: true }),
    party('acquisition_source_id', 'Purchased from / acquisition source', false),
    F('travel_start', 'Travel start', 'date', { required: true }),
    F('travel_end', 'Travel end', 'date', { required: true }),
    F('confirmations', 'PNRs / confirmations', 'textarea', { full: true }),
    F('traveler_ids', 'Travelers on this flight / stay', 'travelers', { full: true }),
    F('route', 'Route / itinerary'),
    F('description', 'What is it?'),
    F('pickup_location', 'Pickup location'),
    F('dropoff_location', 'Drop-off location'),
    F('hotel', 'Hotel / property'),
    F('origin', 'Origin / departure airport'),
    F('destination', 'Destination / arrival airport'),
    F('departure_local', 'Local departure date and time', 'datetime-local'),
    F('arrival_local', 'Local arrival date and time', 'datetime-local'),
    party('marketing_carrier_id', 'Marketing carrier', false),
    party('operating_carrier_id', 'Operating carrier', false),
    F('flight_numbers', 'Flight numbers', 'textarea'),
    F('ticket_numbers', 'Ticket numbers', 'textarea'),
    F('cabin', 'Cabin', 'choice', { options: ['Economy', 'Premium economy', 'Business', 'First'] }),
    F('brand', 'Hotel brand'),
    F('hotel_address', 'Property address'),
    F('room_type', 'Room type'),
    F('benefits', 'Benefits / included amenities', 'textarea', { full: true }),
    F('restrictions', 'Fare / cancellation restrictions', 'textarea', { full: true }),
  ],
  fulfill: [
    booking,
    F('travel_component_id', 'Flight / stay being paid for', 'select', {
      source: 'travelComponents',
      required: true,
    }),
    F('mode', 'How Padova fulfills it', 'select', {
      options: ['Cash/Card', 'Outside source', 'Owned inventory'],
      required: true,
    }),
    F('instrument_id', 'Points / voucher type', 'select', { source: 'instruments' }),
    F('cash_method', 'Cash funding type', 'select', {
      options: ['Card', 'Cash', 'Bank'],
      required: true,
    }),
    F('role', 'Role in this travel', 'select', { options: ['Core', 'Ancillary'], required: true }),
    F('unit', 'Quantity unit', 'select', { options: ['money', 'points', 'count'], required: true }),
    F('quantity', 'Quantity / USD face amount', 'quantity', {
      help: 'Outside seller quantity may remain Unknown when only the fixed cost is known.',
    }),
    assetField,
    F('program_account_id', 'Program / holder account', 'select', { source: 'programAccounts' }),
    party('source_id', 'Actual outside source / payee', false),
    F('cost', 'Actual Padova cost (USD)', 'money'),
    F('account_id', 'Padova payment account / card', 'select', { source: 'paymentAccounts' }),
    F('settled', 'Actual source has already been paid', 'checkbox'),
    F('source_paid', 'Partial amount already paid to source (USD)', 'money', {
      help: 'For a partial payment, leave the paid-in-full checkbox clear. The remaining invoice balance stays payable.',
    }),
    F('payment_method', 'Actual source payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('payment_method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('confirm_cost', 'This completes the cost for this travel', 'checkbox'),
    dateField,
    F('reference', 'Reference'),
    party('account_holder_id', 'Account holder', false),
    F('mechanism', 'Transaction mechanism', 'choice', {
      options: [
        'Outside points award',
        'Amex Business Platinum Pay With Points',
        'Chase Points Boost',
        'Other',
        'Unknown',
      ],
    }),
    F('booked_through', 'Booked through'),
    F('quoted_rate', 'Quoted rate (exact decimal)'),
    F('rate_unit', 'Quote unit', 'select', {
      options: ['USD per point', 'USD per 1,000 points', 'cents per point', 'Fixed supplier price'],
    }),
    F('notes', 'How it was booked / paid', 'textarea', { full: true }),
    F('fee_amount', 'Additional cash taxes / fees (USD)', 'money', {
      help: 'Creates a separate linked cash component. Do not include an amount already recorded in supplier price or existing fees.',
    }),
    party('fee_source_id', 'Actual taxes / fees payee', false),
    F('fee_settled', 'These additional taxes / fees were actually paid', 'checkbox'),
    F('fee_payment_method', 'Taxes / fees payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('fee_payment_method_custom', 'New taxes / fees method', 'text', {
      help: 'Required when taxes / fees method is Other…',
    }),
    F('fee_account_id', 'Taxes / fees payment account', 'select', { source: 'paymentAccounts' }),
    F('rebate_expected', 'Expected whole points back (pending only)', 'integer', {
      help: 'Use the actual expected issuer amount. No inventory or profit is recognized until the reward posts.',
    }),
    F('portal_price', 'Portal cash price (USD)', 'money'),
    F('reference_price', 'Reference / online price (USD)', 'money'),
    F('rate_cents_numerator', 'Actual redemption quote (USD)', 'money'),
    F('rate_points_denominator', 'Actual points represented by the quote', 'integer'),
    F('restrictions', 'Usage restrictions / terms', 'textarea', { full: true }),
  ],
  expected_event: [
    F('kind', 'Expected event', 'select', {
      options: ['Points transfer', 'Points rebate'],
      required: true,
    }),
    booking,
    F('source_asset_id', 'Sending points account', 'select', {
      source: 'assets',
      required: true,
    }),
    F('target_asset_id', 'Receiving points account', 'select', {
      source: 'assets',
      required: true,
    }),
    F('funding_component_id', 'Original owned-points use', 'select', {
      source: 'fundingComponents',
    }),
    F('quantity_sent', 'Whole points sent', 'integer', { required: true }),
    F('quantity_expected', 'Whole points expected', 'integer', { required: true }),
    F('ratio_numerator', 'Transfer ratio (received units)', 'integer'),
    F('ratio_denominator', 'Transfer ratio (sending units)', 'integer'),
    F('bonus_bps', 'Transfer bonus (%)', 'percent', {
      help: 'Optional. Seeds expected points (e.g. 30% on 100,000 → 130,000). Exact match required — no rounding.',
    }),
    F('fees', 'Actual transfer fee (USD)', 'money'),
    F('due_on', 'Expected receipt date', 'date'),
    dateField,
    F('reference', 'Issuer reference'),
  ],
  update_expected_event: [
    F('event_id', 'Pending / posted event', 'select', { source: 'expectedEvents', required: true }),
    F('status', 'New status', 'select', {
      options: ['Pending', 'Posted', 'Reversed', 'Denied'],
      required: true,
    }),
    F('quantity_actual', 'Actual whole points received', 'integer'),
    dateField,
    F('reason', 'Actual issuer result / reason', 'textarea', { required: true, full: true }),
  ],
  edit_party: [
    party('party_id', 'Person / organization'),
    F('name', 'Display name', 'text', { required: true }),
    F('email', 'Email', 'email'),
    F('phone', 'Phone', 'tel'),
    F('whatsapp', 'WhatsApp contact', 'tel'),
    F('relationship_notes', 'Relationship notes', 'textarea', { full: true }),
    F('company_tier', 'Usual flexibility · Tier', 'select', {
      options: ['1', '2', '3'],
      help: 'Tier 1: deepest discount; Tier 2: some flexibility; Tier 3: greater flexibility.',
    }),
    F('company_comfort_level', 'Usual cabin · Level', 'select', {
      options: ['A', 'B', 'C'],
      help: 'Independent of purchasing Tier. Monetary upgrade thresholds are not assumed.',
    }),
    F('roles', 'Roles', 'roles', { full: true }),
    F('referral_rate_bps', 'Default referrer share of profit', 'percent', {
      help: 'Plan: per-referrer %, changeable. Typical hint ~20%. Blank = Unknown (do not invent).',
    }),
    F('standing_deal_label', 'Standing deal label', 'text', {
      help: 'Plan: e.g. Extra 10% cash. Blank + blank % clears the primary standing deal.',
    }),
    F('standing_deal_rate_bps', 'Standing deal %', 'percent', {
      help: 'Of stay/sale (basis below). Blank = no standing deal. Never invent.',
    }),
    F('standing_deal_basis', 'Standing deal basis', 'select', {
      options: ['sale_ex_tax', 'sale'],
      help: 'sale_ex_tax = price excluding taxes (Marriott example). sale = full customer price.',
    }),
    F('standing_deal_product', 'Standing deal product', 'select', {
      options: ['Hotel', 'Flight', 'Car', 'Other', 'Any'],
      help: 'Only seeds onto matching new bookings (Any = all products).',
    }),
    F('source_offerings', 'What do they sell?', 'multi_choice', {
      options: ['Points / miles', 'Award tickets', 'Certificates', 'Vouchers', 'Other'],
      full: true,
    }),
    F('travel_rules', 'Company / customer travel rules', 'textarea', { full: true }),
    F('reason', 'Reason for edit', 'text', { required: true }),
  ],
  merge_party: [
    party('keep_id', 'Keep this person (canonical)'),
    party('merge_id', 'Merge this duplicate into Keep'),
    dateField,
    F('reason', 'Why these are the same person', 'textarea', {
      required: true,
      full: true,
      help: 'Roles union onto Keep. Duplicate is archived with merged-into. Bookings/travelers remap. No silent identity guess.',
    }),
  ],
  authorize_payer: [
    booking,
    party(),
    F('reason', 'Why this person/company pays for this booking', 'textarea', {
      required: true,
      full: true,
    }),
  ],
  payment_account: [
    F('ownership', 'Account belongs to', 'choice', {
      options: ['Padova', 'Customer', 'Unknown'],
      required: true,
    }),
    F('name', 'Card / account nickname', 'text', { required: true }),
    F('issuer', 'Issuer'),
    party('owner_id', 'Account owner', false),
    F('notes', 'Account notes', 'textarea', { full: true }),
    F('kind', 'Account type', 'choice', {
      options: ['Card', 'Bank', 'Cash', 'Source account'],
      required: true,
    }),
    F('last_four', 'Last four digits only', 'text', { pattern: '[0-9]{4}', maxLength: 4 }),
  ],
  update_fee_settings: [
    F('customer_card_fee_bps', 'Customer card fee (pass-through %)', 'percent', {
      required: true,
      help: 'Default charged to the customer when they pay by card (Plan default 2.9%). Editable per booking via Card fee.',
    }),
    F('padova_card_fee_bps', 'Padova card cost (%)', 'percent', {
      required: true,
      help: 'Processor percent Padova pays (Plan default ~2.7%).',
    }),
    F('padova_card_fee_flat_cents', 'Padova card cost flat (USD)', 'money', {
      required: true,
      help: 'Flat processor fee Padova pays in addition to the percent (Plan default $0.30).',
    }),
  ],
  transfer_asset: [
    F('sending_asset_id', 'Sending points / asset account', 'select', {
      source: 'assets',
      required: true,
    }),
    F('receiving_asset_id', 'Receiving account', 'select', { source: 'assets', required: true }),
    F('quantity_sent', 'Amount sent (USD) or whole points', 'quantity', {
      required: true,
    }),
    F('transfer_bonus_percent', 'Transfer bonus (%)', 'percent', {
      help: 'Optional. Seeds amount received (e.g. 30 → 100k sent becomes 130k received). Cost still spreads over all received.',
    }),
    F('quantity_received', 'Amount received (USD) or whole points, including bonus', 'quantity', {
      required: true,
      help: 'Plan: with a bonus, enter the full points received. Whole cost basis spreads over this quantity.',
    }),
    F('fees', 'Transfer fees (USD)', 'money'),
    dateField,
  ],
  expire_asset: [
    F('asset_id', 'Asset', 'select', { source: 'assets', required: true }),
    F('quantity', 'Amount expired (USD) or whole points', 'quantity', {
      required: true,
      help: 'Plan: unused points/vouchers expire as a loss equal to remaining cost. Cap1 credits do not expire — use Void unused credit.',
    }),
    dateField,
    F('reason', 'Reason', 'textarea', {
      required: true,
      help: 'Remaining acquisition cost posts as an expiration loss. Blank / Unknown basis stays Unknown ≠ $0.',
    }),
  ],
  void_credit: [
    F('asset_id', 'Capital One credit', 'select', { source: 'assets', required: true }),
    dateField,
    F('reason', 'Why voided', 'textarea', {
      required: true,
      full: true,
      help: 'Plan: unused Cap1 credit voided when itinerary cancels after price match. No warning popup.',
    }),
  ],
  void_money_back: [
    booking,
    F('target_kind', 'Line type', 'select', {
      options: [
        'expected_primary',
        'expected_secondary',
        'standing_deal',
        'commission',
        'referral',
        'price_match',
      ],
      required: true,
    }),
    F('target_id', 'Line id', 'text', { required: true }),
    dateField,
    F('reason', 'Why voided', 'textarea', {
      required: true,
      full: true,
      help: 'Plan: void cancels an expected Money Back line. Denied is a separate issuer outcome.',
    }),
  ],
  deny_money_back: [
    booking,
    F('target_kind', 'Line type', 'select', {
      options: [
        'expected_primary',
        'expected_secondary',
        'standing_deal',
        'commission',
        'referral',
        'price_match',
      ],
      required: true,
    }),
    F('target_id', 'Line id', 'text', { required: true }),
    dateField,
    F('reason', 'Why denied', 'textarea', {
      required: true,
      full: true,
      help: 'Plan: issuer/payer refused (e.g. Cap1 price match denied, hotel no commission). Not the same as void.',
    }),
  ],
  deduct_money_back: [
    booking,
    F('target_kind', 'Line type', 'select', {
      options: ['commission'],
      required: true,
    }),
    F('target_id', 'Commission id', 'text', { required: true }),
    F('amount', 'Amount deducted', 'money', {
      required: true,
      help: 'Plan: paid less / remittance deducted. Does not overwrite the original expected amount.',
    }),
    dateField,
    F('reason', 'Why deducted', 'textarea', {
      required: true,
      full: true,
      help: 'E.g. Sruly remittance short, fee taken, cancel clawback. How received = deducted.',
    }),
  ],
  convert_asset: [
    F('asset_id', 'Source Padova asset', 'select', { source: 'assets', required: true }),
    F('quantity_sent', 'Source face amount (USD) or whole points converted', 'quantity', {
      required: true,
    }),
    F('name', 'New asset name', 'text', { required: true }),
    F('kind', 'New asset type', 'select', {
      options: [
        'Voucher',
        'Airline credit',
        'Hotel credit',
        'Capital One credit',
        'Points',
        'Gift card',
      ],
      required: true,
    }),
    F('issuer', 'New issuer / program', 'choice', {
      options: [...LOYALTY_PROGRAMS, LOYALTY_PROGRAM_OTHER],
      required: true,
      help: 'Plan: program list the owner can extend — Other… for a new name.',
    }),
    F('issuer_custom', 'New program name', 'text'),
    F('quantity_received', 'New face amount (USD) or whole points received', 'quantity', {
      required: true,
    }),
    dateField,
    F('expires_on', 'New expiration', 'date'),
    F('restrictions', 'New restrictions', 'textarea'),
    F('reference', 'Conversion reference'),
    F('reason', 'Reason for conversion', 'textarea', {
      required: true,
      full: true,
      help: 'Carries the exact source basis into the new asset. Conversion alone creates no profit or acquisition payable.',
    }),
  ],
  receive_asset_sale: [
    F('sale_id', 'Asset sale', 'select', { source: 'sales', required: true }),
    amount,
    dateField,
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
  ],
  pay_asset_purchase: [
    F('asset_id', 'Asset', 'select', { source: 'assets', required: true }),
    amount,
    dateField,
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
    F('account_id', 'Reusable payment account / card', 'select', { source: 'paymentAccounts' }),
  ],
  charge: [
    booking,
    F('amount', 'Charge adjustment (USD; negative for a reduction)', 'signed_money', {
      required: true,
    }),
    F('kind', 'Description / fee kind', 'choice', {
      options: [
        'Booking fee',
        'Card fee',
        'Service fee',
        'Change fee',
        'Cancellation fee',
        'Sale adjustment',
      ],
      required: true,
    }),
    dateField,
  ],
  booking_extra: [
    booking,
    F('category', 'Extra type', 'select', {
      options: ['Seat', 'Bag', 'Other'],
      required: true,
    }),
    F('description', 'What (optional)', 'text', {
      help: 'e.g. 1A extra legroom, 2 checked bags',
    }),
    F('customer_amount', 'Customer price (USD)', 'money', {
      help: 'Leave blank when Unknown — never invent $0',
    }),
    F('cost_amount', 'Padova cost (USD)', 'money', {
      help: 'Leave blank when Unknown — never invent $0',
    }),
    party('payee_id', 'Paid to (when cost known)', false),
    F('reference', 'Confirmation / EMD / reference'),
    dateField,
    F('trip_shared', 'Shared across trip (related bookings)', 'checkbox', {
      help: 'Plan: enter once at trip level. Money stays on this booking; Related bookings lists the shared line.',
    }),
    F('reason', 'Note', 'textarea', { full: true }),
  ],
  booking_change: [
    booking,
    F('summary', 'Updated route / stay (optional)', 'text', {
      full: true,
      help: 'Leave blank to keep the current summary. Full itinerary edit stays on Edit booking.',
    }),
    F('travel_start', 'New travel start (optional)', 'date'),
    F('travel_end', 'New travel end (optional)', 'date'),
    party('change_seller_id', 'Seller for fare / change fee', false),
    F('fare_difference', 'Additional supplier fare (USD)', 'money', {
      help: 'Airline fare difference. Leave blank for a note- or date-only change.',
    }),
    F('supplier_change_fee', 'Supplier change fee (USD)', 'money'),
    F('padova_change_fee', 'Padova change fee (USD)', 'money'),
    F(
      'additional_customer_charge',
      'Total additional customer charge, including Padova fee (USD)',
      'money',
    ),
    dateField,
    F('reason', 'Reason for change', 'textarea', { required: true, full: true }),
  ],
  party: [
    F('kind', 'Person or organization', 'select', {
      options: ['person', 'company', 'family', 'supplier', 'partner'],
      required: true,
    }),
    F('name', 'Name', 'text', { required: true }),
    F('relationship_notes', 'Relationship notes', 'textarea', { full: true }),
    F('email', 'Email', 'email'),
    F('phone', 'Phone', 'tel'),
    F('whatsapp', 'WhatsApp contact', 'tel'),
    F('company_tier', 'Usual flexibility · Tier', 'select', {
      options: ['1', '2', '3'],
    }),
    F('company_comfort_level', 'Usual cabin · Level', 'select', {
      options: ['A', 'B', 'C'],
    }),
    F('source_offerings', 'What do they sell?', 'multi_choice', {
      options: ['Points / miles', 'Award tickets', 'Certificates', 'Vouchers', 'Other'],
      full: true,
    }),
    F('roles', 'Roles', 'roles', {
      full: true,
      help: 'Pick every hat this contact wears. One contact can be traveler, payer, seller, and more.',
    }),
    F('referral_rate_bps', 'Default referrer share of profit', 'percent', {
      help: 'Shown when role includes referrer. Typical Plan hint ~20% of profit; leave blank if Unknown.',
    }),
  ],
  relationship: [
    party('person_id', 'Person'),
    party('group_id', 'Family / company'),
    F('relationship', 'Relationship', 'select', {
      options: [
        'family member',
        'family head',
        'financially responsible',
        'employee',
        'billing contact',
      ],
      required: true,
    }),
    F('tier', 'Employee purchasing / flexibility Tier', 'select', {
      options: ['1', '2', '3'],
      help: 'Leave blank to inherit the company default.',
    }),
    F('comfort_level', 'Employee comfort / cabin Level', 'select', {
      options: ['A', 'B', 'C'],
      help: 'Leave blank to inherit the company default. Tier and Level are separate.',
    }),
  ],
  traveler: [
    party('person_id', 'Person'),
    F('legal_first', 'Legal first name', 'text', { required: true }),
    F('middle_name', 'Middle name'),
    F('last_name', 'Legal last name', 'text', { required: true }),
    F('dob', 'Date of birth', 'date'),
    F('sex', 'Sex for travel', 'choice', { options: ['F', 'M', 'X'] }),
    F('nationality', 'Nationality', 'choice', { options: countryNames }),
    F('redress', 'Redress number'),
    F('ktn', 'Known Traveler Number'),
    F('seat', 'Seat preference', 'choice', { options: SEAT_PREFERENCES }),
    F('loyalty_program', 'Loyalty program', 'choice', {
      options: [...LOYALTY_PROGRAMS, LOYALTY_PROGRAM_OTHER],
      help: 'Plan: owner can add program names — pick Other… for a new one.',
    }),
    F('loyalty_program_custom', 'New program name', 'text', {
      help: 'Owner-added loyalty program (saved on this traveler).',
    }),
    F('loyalty_number', 'Loyalty number'),
    F('passport_number', 'Passport number (protected)'),
    F('passport_country', 'Passport issuing country', 'choice', {
      options: [
        'United States',
        'Israel',
        'United Kingdom',
        'Canada',
        'France',
        'Germany',
        'Australia',
        'South Africa',
      ],
    }),
    F('passport_expiry', 'Passport expiration', 'date'),
  ],
  booking: [
    party('customer_id', 'Financially responsible customer / company'),
    party('supplier_id', 'Actual supplier', false),
    F('product', 'Product', 'select', {
      options: ['Flight', 'Hotel', 'Car', 'Other'],
      required: true,
    }),
    F('channel', 'Booking channel', 'choice', {
      options: BOOKING_CHANNELS,
      required: true,
      help: 'GDS, Direct Airline, Direct Hotel, Expedia TAAP, BedsOnline, Capital One, Award Program, Seller / Source Partner, or another channel.',
    }),
    F('summary', 'Route / stay / reservation summary', 'text', { required: true, full: true }),
    F('booked_on', 'Booked date', 'date', { required: true }),
    F('sale', 'Customer total payable to Padova (USD)', 'money', {
      required: true,
      help: 'Use 0 when the customer pays the supplier directly.',
    }),
    F('travel_start', 'Travel start', 'date', { required: true }),
    F('travel_end', 'Travel end', 'date', { required: true }),
    ...itineraryFields,
    F('confirmations', 'PNRs / confirmations', 'textarea', {
      full: true,
      help: 'Separate confirmations with a comma or a new line. Keep the supplier reference exactly as issued.',
    }),
    F('traveler_ids', 'Travelers', 'travelers', {
      full: true,
      help: 'Select saved canonical people; the payer can be a different person or company.',
    }),
  ],
  payment: [
    party(),
    F('direction', 'Payment direction', 'select', {
      options: ['customer', 'supplier', 'commission'],
      required: true,
      help: 'Use the dedicated refund, referral, or asset workflow to preserve links. General entry supports customer, supplier, and commission receipts.',
    }),
    amount,
    dateField,
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: customer payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('customer_card_fee', 'Customer card fee (USD)', 'money', {
      help: 'Separate charge line on the booking (Plan). Suggested from Settings when method is Card. Leave blank or 0 for none.',
    }),
    F('padova_card_cost', 'Padova card cost (USD)', 'money', {
      help: 'Processor cost Padova pays (settings % + flat). Audit only — not charged to the customer.',
    }),
    F('reference', 'Reference / proof identifier'),
    F('account_id', 'Reusable payment account / card', 'select', { source: 'paymentAccounts' }),
    F('allocations', 'Allocate to bookings', 'allocations', { full: true }),
  ],
  allocate: [
    F('payment_id', 'Payment', 'select', { source: 'payments', required: true }),
    booking,
    amount,
    dateField,
  ],
  correct_payment: [
    F('payment_id', 'Payment', 'select', { source: 'payments', required: true }),
    F('amount', 'Correct total payment (USD)', 'money', { required: true }),
    F('reduce_booking_id', 'Booking allocation to reduce (grouped payments)', 'select', {
      source: 'bookings',
    }),
    dateField,
    F('reason', 'Reason for correction', 'textarea', { required: true, full: true }),
  ],
  trade: [
    F('side', 'Buy or Sell', 'choice', {
      options: ['Buy', 'Sell'],
      required: true,
      help: 'Plan trading desk — 10-second entry. Rate is calculated from amount + price.',
    }),
    F('what', 'What', 'choice', {
      options: [...TRADE_WHATS, TRADE_WHAT_OTHER],
      required: true,
      help: 'Plan: short drop-down the owner can extend — pick Other… to add a new kind.',
    }),
    F('what_custom', 'New kind name', 'text', {
      help: 'Owner-added trade type (saved on this trade; appears next time from existing assets).',
    }),
    F('amount', 'Amount (points or face USD)', 'quantity', {
      required: true,
      help: 'Points: whole points. Credits/vouchers/FHR: face value in dollars.',
    }),
    F('price', 'Total price (USD)', 'money', {
      required: true,
      help: 'What Padova pays (buy) or receives (sell). Rate is calculated — do not type a rate.',
    }),
    party('counterparty_id', 'Counterparty', false),
    F('asset_id', 'Asset / batch to sell', 'select', {
      source: 'assets',
      help: 'Required for Sell.',
    }),
    F('stock_mode', 'Stock', 'select', {
      options: TRADE_STOCK_MODE_OPTIONS.map((o) => o.value),
      help: 'Plan default: for this booking. Switch to hold in stock when buying for later.',
    }),
    F('booking_id', 'Linked booking', 'select', { source: 'bookings' }),
    dateField,
    F('expires_on', 'Expiration', 'date'),
    F('paid', 'Payment already received (sell)', 'checkbox'),
    F('status', 'Trade status', 'choice', {
      options: [...TRADE_STATUSES],
      required: true,
      help: 'Plan: offered · agreed · paid · delivered. Suggested from desk facts; change when the deal stage differs.',
    }),
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
    F('notes', 'Notes', 'textarea', { full: true }),
  ],
  acquire_asset: [
    F('name', 'Asset / account name', 'text', { required: true }),
    F('kind', 'Asset kind', 'choice', {
      options: [
        'Voucher',
        'Airline credit',
        'Hotel credit',
        'Capital One credit',
        'Points',
        'Gift card',
        'Free-night certificate',
        'Suite upgrade',
        'Companion certificate',
        'Other benefit',
      ],
      required: true,
    }),
    F('profile_id', 'Cap1 account / profile', 'select', {
      source: 'bookingSourceProfiles',
      required: true,
      help: 'Required for Capital One credit. Which Cap1 profile holds this credit — never invent a profile.',
    }),
    F('issuer', 'Issuer / loyalty program', 'choice', {
      options: [...LOYALTY_PROGRAMS, LOYALTY_PROGRAM_OTHER],
      required: true,
      help: 'Plan: program names are owner-extensible — Other… adds a new program.',
    }),
    F('issuer_custom', 'New program name', 'text', {
      help: 'Required when Issuer is Other…',
    }),
    F('quantity', 'Face amount (USD) or points quantity', 'quantity', {
      required: true,
      help: 'For Points enter whole points received (with bonus: e.g. 130,000 for 100k+30%). Monetary assets use dollars. Whole cost spreads over that total.',
    }),
    F('cost', 'Padova purchase cost (USD)', 'money', {
      help: 'Leave blank if unknown. Enter 0 only when the original cost was actually zero. With a points bonus, enter the full acquisition cost — it spreads over all points received.',
    }),
    F('purchase_percent', 'Or purchase percentage of face value', 'percent', {
      help: 'Enter either total cost or a percentage for monetary assets.',
    }),
    party('seller_id', 'Purchased from', false),
    party('holder_id', 'Locked to traveler (optional)', false),
    F('ownership', 'Ownership', 'select', { options: ['Padova', 'External', 'Customer'] }),
    dateField,
    F('points_source', 'Points batch source', 'choice', {
      options: [...POINTS_BATCH_SOURCES],
      help: 'Plan Points batch: purchase · transfer with bonus · sold on. Optional; blank stays Unknown.',
    }),
    F('expiry_rule', 'Expiry rule', 'choice', {
      options: [...EXPIRY_RULES, EXPIRY_RULE_OTHER],
      help: 'Plan Points: expiry rules are a list the owner can extend — Other… for a new rule. Exact date stays below.',
    }),
    F('expiry_rule_custom', 'New expiry rule', 'text', {
      help: 'Required when Expiry rule is Other…',
    }),
    F('expires_on', 'Expiration', 'date', {
      help: 'Actual expiry date when known. Suggested from the rule when purchase date is set — never invent.',
    }),
    F('restrictions', 'Restrictions / responsibility', 'textarea', {
      full: true,
      help: 'Plan: when Locked to traveler is set on a Padova voucher, it can only be used on bookings that include that person. Cap1/points use other locks.',
    }),
    F('reference', 'Voucher / account reference'),
  ],
  revise_asset: [
    F('name', 'Asset name', 'text', { required: true }),
    F('issuer', 'Issuer / program', 'text', { required: true }),
    F('expiry_rule', 'Expiry rule', 'choice', {
      options: [...EXPIRY_RULES, EXPIRY_RULE_OTHER],
      help: 'Plan Points: owner-extensible expiry rule list — Other… adds a new rule.',
    }),
    F('expiry_rule_custom', 'New expiry rule', 'text', {
      help: 'Required when Expiry rule is Other…',
    }),
    F('expires_on', 'Expiration', 'date'),
    F('restrictions', 'Restrictions / responsibility', 'textarea', { full: true }),
    F('reference', 'Voucher / account reference'),
    dateField,
    F('reason', 'Reason for asset detail correction', 'textarea', { required: true, full: true }),
  ],
  fund: [
    booking,
    F('kind', 'Funding type', 'choice', {
      options: FUNDING_KINDS,
      required: true,
      help: 'How Padova paid. Never enter a full card number.',
    }),
    assetField,
    F('face_amount', 'Face amount (USD) or points used', 'quantity', { required: true }),
    F('cost', 'Actual cost (USD)', 'money', {
      help: 'For card/cash/bank enter what Padova paid. Owned assets use lot cost automatically.',
    }),
    F('confirm_cost', 'This completes the known Padova cost', 'checkbox', {
      full: true,
      help: 'Uncheck if more costs are still missing. Profit stays pending until cost is confirmed.',
    }),
    party('seller_id', 'Purchased From / payee', false),
    F('reference', 'Reference'),
    F('account_id', 'Reusable payment account', 'select', { source: 'paymentAccounts' }),
    F('settled', 'Supplier already paid (also post the linked payment)', 'checkbox', {
      full: true,
    }),
    dateField,
  ],
  sell_asset: [
    F('asset_id', 'Voucher / asset', 'select', { source: 'assets', required: true }),
    party('buyer_id', 'Buyer'),
    F('quantity', 'Face amount (USD) or points sold', 'quantity', { required: true }),
    F('proceeds', 'Sale proceeds (USD)', 'money'),
    F('sale_percent', 'Or sale percentage of face value', 'percent'),
    F('paid', 'Payment received', 'checkbox'),
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
    dateField,
  ],
  benefit: [
    booking,
    F('name', 'Credit name', 'text', { required: true }),
    F('profile_id', 'Cap1 account / profile', 'select', {
      source: 'bookingSourceProfiles',
      required: true,
      help: 'Required. Which Cap1 profile holds this credit — links the asset to that account.',
    }),
    amount,
    F('original_rate', 'Original confirmed rate (USD)', 'money', {
      help: 'Optional paired rate check; final rate must produce exactly the generated credit.',
    }),
    F('original_rate_reason', 'Reason for exceptional original rate', 'text'),
    F('final_rate', 'Final / new confirmed rate (USD)', 'money'),
    F('reference', 'Price-match confirmation / evidence reference'),
    dateField,
    F('expires_on', 'Expiration', 'date'),
  ],
  price_match_event: [
    booking,
    F('status', 'Price-match case status', 'select', {
      options: ['Pending', 'Approved', 'Denied', 'Received', 'Cancelled'],
      required: true,
    }),
    F('profile_id', 'Credit receiving account / profile', 'select', {
      source: 'bookingSourceProfiles',
    }),
    F('requested_amount', 'Requested amount (USD)', 'money'),
    F('expected_credit', 'Expected credit (USD)', 'money'),
    F('approved_amount', 'Approved amount (USD)', 'money'),
    F('received_amount', 'Actually received (USD)', 'money'),
    F('received_on', 'Received date', 'date'),
    F('original_rate', 'Original rate (USD)', 'money'),
    F('original_rate_reason', 'Reason for exceptional original rate', 'text'),
    F('final_rate', 'Proposed / confirmed new rate (USD)', 'money'),
    F('reference', 'Case / evidence reference'),
    dateField,
    F('reason', 'Case update / outcome', 'textarea', {
      required: true,
      full: true,
      help: 'Pending and approved do not change balances. Record Received only when the credit is visible in the account.',
    }),
  ],
  voucherize: [
    booking,
    F('name', 'Voucher name', 'text', { required: true }),
    F('quantity', 'Voucher face amount (USD)', 'money', { required: true }),
    F('basis', 'Transferred cost basis (USD)', 'money', { required: true }),
    F('ownership', 'Owner', 'select', {
      options: ['Customer', 'Padova'],
      help: 'Issuance posts a liability; it does not create profit. Release/settlement needs reviewed accounting policy.',
    }),
    dateField,
    F('expires_on', 'Expiration', 'date'),
  ],
  commission: [
    booking,
    party('payer_id', 'Commission payer'),
    party('collector_id', 'Paid through / collecting agency', false),
    F('gross', 'Gross commission (USD)', 'money', { required: true }),
    F('retained', 'Collector keeps (USD)', 'money'),
    F('due_on', 'Expected receipt date', 'date', { required: true }),
    dateField,
  ],
  commission_receipt: [
    F('commission_id', 'Commission receivable', 'select', {
      source: 'commissions',
      required: true,
    }),
    F('payment_id', 'Commission payment', 'select', { source: 'payments', required: true }),
    amount,
    dateField,
  ],
  referral: [
    booking,
    party('referrer_id', 'Payee'),
    F('reason', 'Reason / agreement source', 'textarea', { required: true }),
    F('basis', 'Amount type', 'select', { options: ['percentage', 'fixed'], required: true }),
    F('percentage_basis', 'Percentage of', 'select', {
      options: ['profit', 'sale', 'commission', 'commission_received', 'agreed_amount'],
      required: true,
      help: 'profit = profit before commissions paid out; sale = customer charges; commission = net commission earned; commission_received = actual commission collected; agreed_amount = explicitly agreed dollar basis.',
    }),
    F('agreed_basis', 'Agreed basis amount (USD)', 'money', { required: true }),
    F('rate_bps', 'Percentage', 'percent', { required: true }),
    F('fixed_amount', 'Fixed amount (USD)', 'money', { required: true }),
    F('earned', 'Amount earned / accrued', 'checkbox', {
      help: 'Leave off for a planned agreement. Correct the agreement when the amount is actually earned.',
    }),
    F('payable_when', 'Payable when', 'select', {
      options: [
        'When earned',
        'After travel',
        'After customer paid',
        'After commission confirmed',
        'After commission received',
        'On date',
      ],
      required: true,
      help: 'Plan default: owed when commission is confirmed (receivable recorded), not when the customer pays.',
    }),
    F('cancellation_rule', 'Cancellation agreement', 'select', {
      options: ['Realized economics', 'Retain agreed amount'],
      help: 'Default: unpaid unearned referral is canceled when the booking cancels. Retain only when the actual relationship agreement requires it.',
    }),
    F('due_on', 'Earliest payout date', 'date', { required: true }),
    dateField,
  ],
  pay_referral: [
    F('account_id', 'Payment account', 'select', { source: 'paymentAccounts' }),
    F('referral_id', 'Commission Payable', 'select', { source: 'referrals', required: true }),
    amount,
    dateField,
    F('method', 'Payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
  ],
  revise_referral: [],
  reverse_referral: [
    F('referral_id', 'Commission Payable', 'select', { source: 'referrals', required: true }),
    F('revision', 'Current terms revision', 'number', { required: true }),
    dateField,
    F('reason', 'Reversal reason', 'textarea', { required: true }),
  ],
  reverse_referral_payment: [
    F('payment_id', 'Original payout', 'select', { source: 'referralPayments', required: true }),
    F('amount', 'Amount to reverse / returned (USD)', 'money', { required: true }),
    dateField,
    F('reason', 'Correction / return reason', 'textarea', { required: true }),
  ],
  cancel: [
    booking,
    F('travel_component_id', 'Only this flight / stay (blank means whole booking)', 'select', {
      source: 'travelComponents',
      help: 'Leave blank to cancel the whole booking. Do not also pick a traveler, choose one scope only.',
    }),
    party('traveler_id', 'Only this traveler (optional)', false),
    F('funding_component_id', 'Original funding component', 'select', {
      source: 'fundingComponents',
      help: 'Required when a supplier refund is expected for owned points / cost.',
    }),
    F('supplier_expected', 'Supplier refund expected (USD or points units)', 'quantity', {
      required: true,
      help: proportionalRefundPlanHint(),
    }),
    F('customer_due', 'Customer refund due (USD)', 'money', {
      required: true,
      help: 'Plan default: proportional to what the customer paid, scaled by supplier return / original cost (less retained card fee). Editable.',
    }),
    F('charge_reduction', 'Cancelled customer charges to credit (USD)', 'money', {
      required: true,
      help: 'The amount removed from what the customer owes, after retained fees. Scaled with supplier return when known. For an unpaid cancellation this can be positive while actual customer refund due is $0.',
    }),
    F('refund_card_fee', 'Also refund customer card fee', 'checkbox', {
      help: 'Plan default: no. When unchecked, card fee stays on the booking as Padova profit.',
    }),
    F('due_on', 'Follow-up date', 'date', { required: true }),
    dateField,
    F('reason', 'Cancellation reason', 'textarea', { required: true, full: true }),
    F('chargeback_status', 'Chargeback status (rare)', 'select', {
      options: ['', 'disputed', 'won', 'lost'],
      help: 'Plan: chargebacks are refund-type lines with disputed / won / lost. Leave blank when not a chargeback.',
    }),
    F('call_notes', 'Call notes (chase refund)', 'textarea', {
      full: true,
      help: 'Plan: refund stays on follow-up until settled. Optional chase notes are saved on the refund case.',
    }),
  ],
  receive_refund: [
    F('account_id', 'Payment account', 'select', { source: 'paymentAccounts' }),
    F('refund_id', 'Refund case', 'select', { source: 'refunds', required: true }),
    F('form', 'Actual returned value', 'select', {
      options: [
        'cash',
        'Supplier payable credit',
        'Voucher',
        'Certificate',
        'Airline credit',
        'Hotel credit',
        'Capital One credit',
        'points',
        SUPPLIER_REFUND_DENIED_FORM,
      ],
      required: true,
      help: supplierRefundDenyPlanHint(),
    }),
    F('amount', 'Received amount (USD), points or certificate count', 'quantity', {
      required: true,
      help: 'For Denied, enter the remaining expected amount being closed (not recovered).',
    }),
    assetField,
    F('basis', 'Basis of newly issued credit (USD)', 'money'),
    F('new_asset_name', 'New credit name (when not restoring an existing asset)'),
    F('new_asset_issuer', 'New credit issuer'),
    F('new_asset_expiry', 'New credit expiration', 'date'),
    dateField,
    F('method', 'Cash payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference', 'text', {
      help: 'Required when marking Denied.',
    }),
  ],
  pay_refund: [
    F('refund_id', 'Refund case', 'select', { source: 'refunds', required: true }),
    amount,
    dateField,
    F('how_given', 'How given', 'choice', {
      options: [...REFUND_HOW_GIVEN],
      required: true,
      help: refundHowGivenPlanHint(),
    }),
    F('voucher_name', 'Voucher name', 'text', {
      help: 'Defaults to “Refund voucher — {booking code}”. Customer-owned; Padova cost stays $0.',
    }),
    F('voucher_expires_on', 'Voucher expiration', 'date'),
    F('account_id', 'Payment account', 'select', { source: 'paymentAccounts' }),
    F('method', 'Refund payment method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference', 'text', {
      help: 'Required when how given is Other.',
    }),
    F('override_reason', 'Handling override reason (if supplier cash not received)', 'textarea', {
      full: true,
    }),
  ],
  return_customer_credit: [
    party('party_id', 'Customer'),
    F('account_id', 'Payment account', 'select', { source: 'paymentAccounts' }),
    amount,
    dateField,
    F('method', 'Return method', 'choice', {
      options: [...PAYMENT_METHODS, PAYMENT_METHOD_OTHER],
      required: true,
      help: 'Plan: payment methods can be extended — Other… for a new name.',
    }),
    F('method_custom', 'New payment method', 'text', {
      help: 'Required when method is Other…',
    }),
    F('reference', 'Reference'),
    F('reason', 'Why returned', 'textarea', {
      required: true,
      full: true,
      help: 'Plan: held deposit/credit returned to the customer as a payment out.',
    }),
  ],
  revise: [
    booking,
    F('product', 'Product', 'select', {
      options: ['Flight', 'Hotel', 'Car', 'Other'],
    }),
    F('channel', 'Booking channel', 'choice', { options: BOOKING_CHANNELS }),
    party('change_seller_id', 'Seller for additional fare / change fee', false),
    F('summary', 'Current route / stay', 'text', { required: true, full: true }),
    F('travel_start', 'Travel start', 'date', { required: true }),
    F('travel_end', 'Travel end', 'date', { required: true }),
    ...itineraryFields,
    F('confirmations', 'Additional PNRs / confirmations', 'textarea', {
      full: true,
      help: 'Adds references without deleting earlier confirmations or history.',
    }),
    F('traveler_ids', 'Additional travelers', 'travelers', {
      full: true,
      help: 'Adds active travelers. Use partial cancellation for a traveler leaving the reservation.',
    }),
    F('reservation_status', 'Reservation status', 'select', {
      options: [...PLAN_RESERVATION_STATUS_OPTIONS],
      required: true,
      help: reservationStatusPlanHint(),
    }),
    F('ticketing_deadline', 'Ticketing deadline', 'date', {
      help: 'Required when status is Held. Reminders fire within 3 days / overdue.',
    }),
    F('confirmation_status', 'Confirmation / ticketing', 'select', {
      options: ['Confirmed', 'Ticketed', 'Pending', 'Cancelled', 'Not Ticketed / Unknown'],
    }),
    F('document_status', 'Itinerary / documents', 'select', {
      options: ['Not prepared', 'Draft', 'Ready', 'Issued'],
    }),
    F('fare_difference', 'Additional supplier fare (USD)', 'money', {
      help: 'Leave blank for an itinerary-only change. Reductions use the linked refund workflow.',
    }),
    F('supplier_change_fee', 'Supplier change fee (USD)', 'money'),
    F('padova_change_fee', 'Padova change fee (USD)', 'money'),
    F(
      'additional_customer_charge',
      'Total additional customer charge, including Padova fee (USD)',
      'money',
    ),
    dateField,
    F('reason', 'Reason for change', 'textarea', { required: true, full: true }),
  ],
  note: [
    F('record_type', 'Record type', 'select', {
      options: ['booking', 'party', 'asset', 'commission', 'refund'],
      required: true,
    }),
    F('record_id', 'Linked record', 'select', { source: 'taskLinks', required: true }),
    F('body', 'Note', 'textarea', {
      required: true,
      full: true,
      help: 'For refund chase notes, start with the facts of the call — saved as Call note on the refund.',
    }),
  ],
  link_booking: [
    F('from_booking_id', 'This booking', 'select', { source: 'bookings', required: true }),
    F('to_booking_id', 'Related booking', 'select', { source: 'bookings', required: true }),
    F('kind', 'Link type', 'select', {
      options: [...BOOKING_RELATION_KINDS],
      required: true,
      help: 'Change/extension, rebooking, voucher chain, or same trip. Money stays on each booking.',
    }),
    F('note', 'Optional note', 'textarea', { full: true }),
  ],
  unlink_booking: [
    F('relation_id', 'Booking link id', 'text', { required: true }),
    F('reason', 'Why remove this link', 'textarea', { required: true, full: true }),
  ],
  booking_document: [
    booking,
    F('label', 'Document name', 'text', { required: true }),
    F('kind', 'Type', 'select', {
      options: [...BOOKING_DOCUMENT_KINDS],
      required: true,
      help: 'Plan: itineraries, screenshots, PDFs — link metadata for now (no binary upload).',
    }),
    F('url', 'Link / URL', 'text', {
      help: 'Optional. Drive, WhatsApp export, or shared file link.',
    }),
    F('note', 'Note', 'textarea', { full: true }),
    dateField,
  ],
  booking_document_hide: [
    booking,
    F('document_id', 'Document id', 'text', { required: true }),
    F('reason', 'Why hide', 'textarea', { required: true, full: true }),
  ],
  booking_taxes: [
    booking,
    F('tax_amount', 'Taxes (USD)', 'money', {
      help: 'Part of the customer price — not an extra charge. Leave blank to clear (Unknown). Used for sale-excluding-taxes standing deals.',
    }),
    dateField,
    F('reason', 'Note', 'textarea', { full: true }),
  ],
  task: [
    F('title', 'Task title', 'text', { required: true, full: true }),
    F('due_on', 'Due date', 'date'),
    F('assignee_id', 'Assignee', 'select', { source: 'staff' }),
    F('priority', 'Priority', 'select', { options: ['Normal', 'High', 'Urgent'] }),
    F('notes', 'Notes', 'textarea', { full: true }),
    F('record_type', 'Linked record type', 'select', {
      options: ['booking', 'party', 'asset', 'commission', 'refund'],
    }),
    F('record_id', 'Linked record', 'select', { source: 'taskLinks' }),
  ],
  complete_task: [
    F('task_id', 'Task', 'select', { source: 'tasks', required: true }),
    F('note', 'Completion note', 'textarea', { required: true, full: true }),
  ],
  resolve_attention: [
    F('key', 'Exception reference'),
    F('fingerprint', 'Current exception fingerprint'),
    F('note', 'Resolution note', 'textarea', {
      required: true,
      full: true,
      help: 'Resolver and date are retained. Changed exceptions may reappear.',
    }),
  ],
  review_resolution: [
    F('source_key', 'Stable source / issue key', 'text', { required: true }),
    F('evidence_id', 'Evidence ID (if known)'),
    F('source_link', 'Source locator / restricted evidence link', 'text', { required: true }),
    F('issue_type', 'Issue type', 'text', { required: true }),
    F('status', 'Decision status', 'choice', {
      options: ['Proposed', 'Held', 'Approved', 'Rejected', 'Resolved'],
      required: true,
    }),
    F('decision', 'Reviewer decision / reason', 'textarea', { required: true, full: true }),
    F('destination_id', 'Resolved destination ID (if applicable)'),
  ],
};
fields.update_task = [
  ...fields.task,
  F('status', 'Status', 'select', { options: ['Open', 'Done'], required: true }),
  F('reason', 'Reason for change', 'textarea', { required: true, full: true }),
];
fields.revise_travel = [
  ...fields.travel_component,
  dateField,
  F('reason', 'Reason for travel revision', 'textarea', { required: true, full: true }),
];
fields.revise_fulfillment = [
  ...fields.fulfill.filter((f) => !['settled', 'source_paid', 'payment_method'].includes(f.key)),
  F('reason', 'Reason for fulfillment correction', 'textarea', {
    required: true,
    full: true,
    help: 'Prior entries, actual payments and allocations remain in history. Changing cost, source or quantity creates a dated reversal and replacement.',
  }),
];
fields.reverse_fulfillment = [
  booking,
  dateField,
  F('reason', 'Reason to reverse this recorded fulfillment', 'textarea', {
    required: true,
    full: true,
    help: 'This corrects the recorded expense/use. It does not claim a supplier cash refund or delete an actual payment. Use Cancellation/Refund for actual returns.',
  }),
];
fields.acquire_asset.splice(
  2,
  0,
  F('instrument_id', 'Configured program instrument', 'select', { source: 'instruments' }),
  F('unit', 'Quantity unit', 'select', { options: ['money', 'points', 'count'] }),
  F('program_account_id', 'Program / holder account', 'select', { source: 'programAccounts' }),
);
fields.revise_referral = [
  F('referral_id', 'Commission Payable', 'select', { source: 'referrals', required: true }),
  F('revision', 'Current revision', 'number', { required: true }),
  ...fields.referral.filter((f) => !['booking_id', 'referrer_id'].includes(f.key)),
];
const titles: Record<string, string> = {
  booking_source_method: 'New Booking Method',
  booking_source_profile: 'New Account / Profile',
  revise_fulfillment: 'Edit fulfillment component',
  revise_asset: 'Edit asset details',
  reverse_fulfillment: 'Reverse recorded fulfillment',
  revise_travel: 'Edit travel component',
  cancellation_cost: 'Record actual cancellation cost',
  fulfill: 'Fulfill this travel',
  link_fulfillment: 'Link funding already recorded',
  expected_event: 'Track expected transfer / rebate',
  update_expected_event: 'Record actual issuer result',
  update_task: 'Edit / reopen follow-up task',
  booking: 'New booking',
  party: 'Add person / organization',
  merge_party: 'Merge duplicate people',
  charge: 'Adjust customer charge',
  booking_extra: 'Add extra (seat / bag)',
  booking_change: 'Record change (fees / dates)',
  authorize_payer: 'Authorize payer',
  booking_source_profile_link: 'Link account / profile',
  payment: 'Record payment',
  fund: 'Record booking cost',
  trade: 'Trade desk (buy / sell)',
  void_credit: 'Void unused Cap1 credit',
  void_money_back: 'Void Money Back line',
  deny_money_back: 'Mark Money Back denied',
  deduct_money_back: 'Deduct Money Back',
  acquire_asset: 'Buy / register travel asset',
  transfer_asset: 'Transfer points / asset',
  sell_asset: 'Sell voucher / travel asset',
  benefit: 'Record verified price-match credit',
  price_match_event: 'Update price-match case',
  voucherize: 'Voucherize existing booking',
  commission: 'Add commission',
  referral: 'Add Commission Payable',
  revise_referral: 'Correct Commission Payable',
  reverse_referral: 'Reverse Commission Payable agreement',
  reverse_referral_payment: 'Reverse recorded commission payout',
  cancel: 'Cancellation / partial cancellation',
  receive_refund: 'Record supplier refund received',
  pay_refund: 'Refund customer (cash or keep as credit)',
  return_customer_credit: 'Return held customer credit',
  correct_payment: 'Correct payment amount',
  allocate: 'Allocate existing payment / apply held credit',
  revise: 'Change booking',
  commission_receipt: 'Allocate commission receipt',
  pay_referral: 'Mark referrer paid',
  traveler: 'Edit protected traveler details',
  relationship: 'Link a person',
  note: 'Add note',
  // call_note uses kind note with a custom title via config.title
  link_booking: 'Link related booking',
  unlink_booking: 'Remove booking link',
  booking_document: 'Add booking document',
  booking_document_hide: 'Hide booking document',
  booking_taxes: 'Edit booking taxes',
  task: 'New follow-up task',
  complete_task: 'Complete task',
  resolve_attention: 'Acknowledge follow-up',
};
const actionHelp: Record<string, string> = {
  payment: 'Record money that actually moved. Allocate this one payment to the bookings it covers.',
  fund: 'Record Padova’s acquisition cost and who was paid. Card/cash need Actual cost + Purchased From; vouchers/points use the asset lot.',
  trade:
    'Buy or sell points, FHR/hotel credits, vouchers. Four fields first; rate is calculated. Posts to the same asset ledgers.',
  transfer_asset: transferBonusPlanHint(),
  void_credit:
    'Mark remaining Cap1 credit as voided (cancel after price match). Append-only; reverses unused earned credit.',
  void_money_back:
    'Cancel an expected Money Back line (commission, standing deal, price match, referral). Not the same as denied.',
  deny_money_back:
    'Issuer or payer refused this Money Back line. Cap1 price matches: prefer Update price match → Denied.',
  deduct_money_back:
    'Reduce a posted commission receivable when remittance pays less or something is deducted. Append-only; original expected stays in history.',
  return_customer_credit:
    'Pay out held deposit or unallocated customer credit. Apply to a booking with Allocate instead when they use it.',
  fulfill: 'Record the cost, points or voucher used for this travel item.',
  revise: 'Update this booking. Existing costs and payments remain in its history.',
  charge:
    'Add a customer charge or enter a negative amount to give a discount. This does not record a payment.',
  booking_extra:
    'Seat, bag, or other ancillary on this booking. Customer price and cost are both optional; blank stays Unknown.',
  booking_change:
    'Dated change on this booking: optional new dates/summary, optional airline cost and customer fee. Original details stay in history. Full Edit booking is separate.',
  authorize_payer: 'Allow another person or company to pay for this booking.',
  cancel:
    'Record the canceled travel and expected returns. A requested refund stays pending until received; optional call notes chase the refund.',
  voucherize:
    'Link the canceled booking to a travel voucher. Ownership and acquisition cost remain separate.',
  benefit: 'Record a credit only when the provider has actually confirmed it.',
  price_match_event: 'Track the price-match request and its actual outcome separately.',
  booking_source_profile_link: 'Choose the account or profile used to obtain this booking.',
  commission:
    'Record who owes Padova (IATA partner and any secondary payer) and optionally who Padova pays out to.',
  referral:
    'Record money Padova owes an agent, referrer or partner, including when it is earned and payable.',
  note: 'Add a note to this record’s permanent activity history.',
  link_booking:
    'Link bookings in a family tree (change, extension, voucher, same trip). Money stays on each booking.',
  unlink_booking: 'Remove a related-booking link (append-only void).',
  booking_document:
    'Attach an itinerary, screenshot, or PDF link to this booking. Hide removes from view — history stays.',
  booking_document_hide: 'Hide a document link from the booking view (append-only).',
  booking_taxes:
    'Set or clear taxes that are part of the customer price (not an extra charge). Blank = Unknown. Recomputes sale-ex-tax standing deals when known.',
  party: 'Create a reusable contact. One person or organization can have several roles.',
  merge_party:
    'Fold a duplicate person into the record you keep. One person, many roles. Duplicate stays archived with merged-into history.',
};
const actionSave: Record<string, string> = {
  payment: 'Record payment',
  fund: 'Record cost',
  fulfill: 'Record cost / payment',
  revise: 'Save booking changes',
  charge: 'Save charge adjustment',
  booking_extra: 'Save extra',
  booking_change: 'Save change',
  authorize_payer: 'Authorize payer',
  cancel: 'Cancel booking',
  voucherize: 'Create linked voucher',
  benefit: 'Record confirmed credit',
  price_match_event: 'Save price-match update',
  booking_source_profile_link: 'Save account / profile',
  commission: 'Save Commission Receivable',
  referral: 'Save Commission Payable',
  note: 'Save note',
  link_booking: 'Save booking link',
  unlink_booking: 'Remove link',
  booking_document: 'Save document',
  booking_document_hide: 'Hide document',
  booking_taxes: 'Save taxes',
  trade: 'Save trade',
  void_credit: 'Void credit',
  void_money_back: 'Void Money Back line',
  deny_money_back: 'Mark denied',
  deduct_money_back: 'Record deduction',
  return_customer_credit: 'Return credit',
  traveler: 'Save traveler details',
  edit_party: 'Save profile',
  merge_party: 'Merge into Keep',
  party: 'Add contact',
};
export default function CommandForm(props: Parameters<typeof LegacyCommandForm>[0]) {
  if (props.config.kind === 'booking' && props.state.bookingEntryEnabled)
    return <BookingEntry {...props} />;
  if (props.config.kind === 'commission') return <CommissionBundleForm {...props} />;
  return <LegacyCommandForm {...props} />;
}
const DESTRUCTIVE_KINDS = new Set([
  'cancel',
  'expire_asset',
  'reverse_fulfillment',
  'reverse_referral',
  'reverse_referral_payment',
  'reverse_asset',
  'correct_payment',
  'merge_party',
  'unlink_booking',
]);

function LegacyCommandForm({
  config,
  state,
  onClose,
  onSubmit,
  onCreateParty,
  onInlineCommand,
  extraFields,
}: {
  config: R;
  state: R;
  onClose: () => void;
  onSubmit: (d: R) => Promise<void>;
  onCreateParty?: (d: R, key: string) => Promise<R>;
  onInlineCommand?: (kind: string, d: R, key: string) => Promise<R>;
  extraFields?: ReactNode;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();
  const [newContacts, setNewContacts] = useState<R[]>([]);
  const creationKey = useRef('');
  const createInline = (kind: 'customer' | 'traveler' | 'seller') => {
    creationKey.current = crypto.randomUUID();
    setCreating(kind);
  };
  const [funding, setFunding] = useState<R[]>([]);
  const [travelRows, setTravelRows] = useState<R[]>([]);
  const [initialPayment, setInitialPayment] = useState<R | null>(null);
  const [advanced, setAdvanced] = useState(!!config.defaults.show_advanced);
  const [creating, setCreating] = useState<'' | 'customer' | 'traveler' | 'seller'>('');
  const [creatingAsset, setCreatingAsset] = useState(false);
  const fundingAssetRow = useRef<number | null>(null);
  const [inlineCreation, setInlineCreation] = useState<{
    kind: 'party' | 'program' | 'instrument' | 'program_account';
    target: string;
    defaults: R;
  } | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(false);
  closeRef.current = onClose;
  const [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({}),
    [attempted, setAttempted] = useState(false),
    [busy, setBusy] = useState(false),
    [travelerSearch, setTravelerSearch] = useState(''),
    [vals, setVals] = useState<R>(() => ({
      date: state.today,
      booked_on: state.today,
      kind:
        config.kind === 'party'
          ? 'person'
          : config.kind === 'acquire_asset'
            ? 'Voucher'
            : undefined,
      product: 'Flight',
      status: config.kind === 'price_match_event' ? 'Pending' : undefined,
      channel: '',
      direction: 'customer',
      priority: 'Normal',
      confirm_cost: true,
      mode: 'Cash/Card',
      cash_method: 'Card',
      role: 'Core',
      method: '',
      how_given: config.kind === 'pay_refund' ? 'original_method' : undefined,
      ownership: 'Padova',
      basis: config.kind === 'referral' ? 'percentage' : undefined,
      percentage_basis: 'profit',
      earned: true,
      payable_when: 'After commission confirmed',
      due_on: ['referral', 'revise_referral'].includes(config.kind) ? state.today : undefined,
      cancellation_rule: 'Realized economics',
      rate_bps: 0,
      fixed_amount: 0,
      after_receipt: false,
      source_offerings: config.defaults.details?.source_offerings ?? [],
      seat: config.defaults.preferences?.seat ?? '',
      sex: config.defaults.preferences?.sex ?? '',
      nationality: config.defaults.preferences?.nationality ?? '',
      redress: config.defaults.preferences?.redress ?? '',
      ...config.defaults,
      ...(config.kind === 'revise' && config.defaults.reservation_status
        ? {
            reservation_status: reservationStatusForForm(config.defaults.reservation_status),
          }
        : {}),
      // Cancel scope is exclusive: travel-component cancel must not also send traveler_id.
      ...(config.kind === 'cancel' && config.defaults.travel_component_id
        ? { traveler_id: '' }
        : {}),
      ...(config.kind === 'cancel'
        ? (() => {
            const booking = state.bookings?.find(
              (b: R) => b.id === (config.defaults.booking_id ?? config.defaults.id),
            );
            const funding = state.fundingComponents?.find(
              (f: R) => f.id === config.defaults.funding_component_id,
            );
            const unit = funding ? refundQuantityUnit(funding) : 'money';
            const recoverable =
              funding == null
                ? null
                : funding.asset_id
                  ? funding.face_amount == null
                    ? null
                    : Number(funding.face_amount)
                  : funding.cost == null
                    ? null
                    : Number(funding.cost);
            const seeded =
              config.defaults.customer_due != null || config.defaults.charge_reduction != null
                ? null
                : booking
                  ? cancelFormMoneyDefaults(booking, {
                      quantity_unit: unit,
                      supplier_expected_cents: unit === 'money' ? recoverable : null,
                      original_cost_cents: unit === 'money' ? recoverable : null,
                    })
                  : null;
            return {
              refund_card_fee: config.defaults.refund_card_fee === true,
              ...(seeded
                ? {
                    customer_due: seeded.customer_due,
                    charge_reduction: seeded.charge_reduction,
                  }
                : {}),
            };
          })()
        : {}),
      ...(config.kind === 'revise_referral'
        ? {
            fixed_amount: (Number(config.defaults.fixed_amount ?? 0) / 100).toFixed(2),
            rate_bps: (Number(config.defaults.rate_bps ?? 0) / 100).toFixed(2),
            agreed_basis:
              config.defaults.agreed_basis == null
                ? ''
                : (Number(config.defaults.agreed_basis) / 100).toFixed(2),
          }
        : {}),
      ...(config.kind === 'update_fee_settings'
        ? {
            customer_card_fee_bps: (
              Number(config.defaults.customer_card_fee_bps ?? 290) / 100
            ).toFixed(2),
            padova_card_fee_bps: (
              Number(config.defaults.padova_card_fee_bps ?? 270) / 100
            ).toFixed(2),
            padova_card_fee_flat_cents: (
              Number(config.defaults.padova_card_fee_flat_cents ?? 30) / 100
            ).toFixed(2),
          }
        : {}),
      ...(config.kind === 'trade'
        ? {
            side: config.defaults.side || 'Buy',
            what: config.defaults.what || 'Points',
            stock_mode: config.defaults.stock_mode || TRADE_DEFAULT_STOCK_MODE,
            method: config.defaults.method || 'Zelle',
            status:
              config.defaults.status ||
              suggestTradeStatus({
                side: config.defaults.side || 'Buy',
                paid: config.defaults.paid === true,
              }),
          }
        : {}),
      ...(['travel_component', 'revise_travel'].includes(config.kind) &&
      config.defaults.details?.end_date_known === false
        ? { travel_end: '' }
        : {}),
      ...(['travel_component', 'revise_travel'].includes(config.kind)
        ? {
            departure_local: config.defaults.departure_local?.slice(11, 16) || '',
            arrival_local: config.defaults.arrival_local?.slice(11, 16) || '',
          }
        : {}),
      whatsapp: config.defaults.details?.whatsapp ?? '',
      company_tier: config.defaults.details?.corporate_policy?.tier ?? '',
      company_comfort_level: config.defaults.details?.corporate_policy?.comfort_level ?? '',
      referral_rate_bps:
        config.defaults.details?.referral_rate_bps != null
          ? (Number(config.defaults.details.referral_rate_bps) / 100).toFixed(2)
          : '',
      ...(() => {
        if (config.kind !== 'edit_party') return {};
        const primary = partyStandingDeals({ details: config.defaults.details }).find(
          (d) => d.id === 'primary',
        );
        return {
          standing_deal_label: primary?.label ?? '',
          standing_deal_rate_bps:
            primary?.rate_bps != null ? (primary.rate_bps / 100).toFixed(2) : '',
          standing_deal_basis: primary?.basis ?? 'sale_ex_tax',
          standing_deal_product: primary?.product ?? 'Hotel',
        };
      })(),
      ...(config.kind === 'revise' ? { traveler_ids: [], confirmations: '' } : {}),
      cost_status: config.defaults.itinerary?.cost_status ?? '',
      ticketing_deadline:
        config.defaults.itinerary?.ticketing_deadline ||
        config.defaults.itinerary?.operational_entry?.ticketing_deadline ||
        '',
      ...(['booking', 'revise'].includes(config.kind)
        ? Object.fromEntries(
            itineraryEntryKeys.map((key) => [
              key,
              Array.isArray(config.defaults.itinerary?.[key])
                ? config.defaults.itinerary[key].join('\n')
                : (config.defaults.itinerary?.[key] ?? ''),
            ]),
          )
        : {}),
      booking_id:
        config.defaults.booking_id ?? (config.kind === 'revise' ? config.defaults.id : undefined),
    })),
    [allocs, setAllocs] = useState<R[]>(() => {
      if (
        config.kind === 'payment' &&
        Array.isArray(config.defaults.commission_allocations) &&
        config.defaults.commission_allocations.length
      ) {
        return config.defaults.commission_allocations.map((a: R) => ({
          commission_id: a.commission_id,
          amount: a.amount === '' || a.amount == null ? '' : String(a.amount),
        }));
      }
      if (config.defaults.commission_id && config.kind === 'payment')
        return [{ commission_id: config.defaults.commission_id, amount: '' }];
      if (config.defaults.booking_id && config.kind === 'payment')
        return [{ booking_id: config.defaults.booking_id, amount: '' }];
      return [];
    });
  const allowed = (p: string) =>
    state.actor.role === 'OWNER' || state.actor.permissions.includes(p);
  busyRef.current = busy;
  const selectedAsset = state.assets?.find((a: R) => a.id === vals.asset_id);
  const selectedBooking = state.bookings?.find((b: R) => b.id === vals.booking_id);
  const inheritedRate =
    config.defaults.request_id && config.defaults.original_rate !== undefined
      ? decimalUnits(String(config.defaults.original_rate))
      : originalConfirmedRate(selectedBooking);
  const travelEditing = ['travel_component', 'revise_travel'].includes(config.kind);
  let requestedCredit: number | undefined;
  try {
    if (inheritedRate !== undefined && vals.final_rate !== '' && vals.final_rate != null)
      requestedCredit = Math.max(0, inheritedRate - decimalUnits(vals.final_rate));
  } catch {
    /* Incomplete money input is validated on Save. */
  }
  const tripType =
    vals.trip_type ||
    config.defaults.details?.trip_type ||
    (config.kind === 'revise' ? '' : 'One Way');
  const travelDerived = derivedTravel(
    {
      ...vals,
      trip_type: tripType,
      location: vals.hotel_address,
      description: vals.description || vals.summary,
    },
    state.parties?.find((p: R) => p.id === vals.provider_id)?.name || vals.hotel,
  );
  const defs = (fields[config.kind] ?? [])
    .filter(
      (f) =>
        !(
          config.kind === 'link_fulfillment' &&
          state.fundingComponents?.find((r: R) => r.id === vals.funding_component_id)?.asset_id &&
          ['instrument_id', 'role'].includes(f.key)
        ),
    )
    .filter((f) => config.kind !== 'resolve_attention' || !['key', 'fingerprint'].includes(f.key))
    .filter(
      (f) => config.kind !== 'booking_source_profile' || f.key !== 'safe_identifier' || advanced,
    )
    .filter(
      (f) =>
        !(
          ['fulfill', 'revise_fulfillment', 'link_fulfillment'].includes(config.kind) &&
          vals.mode === 'Owned inventory' &&
          vals.asset_id &&
          ['instrument_id', 'program_account_id', 'unit', 'role'].includes(f.key)
        ),
    )
    .map((f) =>
      config.kind === 'party' &&
      f.key === 'kind' &&
      !['family', 'partner', 'supplier'].includes(config.defaults.kind)
        ? { ...f, options: ['person', 'company'] }
        : f,
    )
    .map((f) =>
      config.inline_role && f.key === 'kind' ? { ...f, options: ['person', 'company'] } : f,
    )
    .map((f) =>
      f.key === 'product' &&
      ['revise', 'revise_travel'].includes(config.kind) &&
      config.defaults.product &&
      !['Flight', 'Hotel', 'Car', 'Other'].includes(config.defaults.product)
        ? { ...f, options: [...(f.options ?? []), config.defaults.product] }
        : f,
    )
    .filter((f) => {
      if (
        f.key === 'source_offerings' &&
        config.defaults.entry_context !== 'Sources & Brokers' &&
        !config.defaults.details?.source_offerings
      )
        return false;
      if (config.contact_only && !['name', 'email', 'phone', 'whatsapp'].includes(f.key))
        return false;
      if (config.kind === 'traveler' && config.defaults.person_id && f.key === 'person_id')
        return false;
      if (config.kind === 'revise') {
        if (f.key === 'channel' && config.defaults.itinerary?.operational_entry) return false;
        if (f.key === 'product' && !advanced) return false;
        if (f.key === 'summary' && config.defaults.itinerary?.summary_generated && !advanced)
          return false;
        if (f.key === 'travel_end' && vals.product === 'Flight' && tripType === 'One Way')
          return false;
      }
      if (['booking', 'revise'].includes(config.kind) && f.key === 'supplier_id' && !advanced)
        return false;
      if (f.key === 'booking_id' && config.defaults.booking_id) return false;
      if (
        config.kind === 'note' &&
        (config.defaults.call_note ||
          (config.defaults.record_type && config.defaults.record_id)) &&
        ['record_type', 'record_id'].includes(f.key)
      )
        return false;
      if (['price_match_event', 'benefit'].includes(config.kind)) {
        if (
          config.kind === 'price_match_event' &&
          f.key === 'requested_amount' &&
          vals.final_rate !== '' &&
          vals.final_rate != null &&
          inheritedRate !== undefined &&
          !advanced
        )
          return false;
        if (['original_rate', 'original_rate_reason'].includes(f.key) && !advanced) return false;
        // Plan: Cap1 profile must be visible on credit create (not only in Advanced).
        if (
          config.kind === 'price_match_event' &&
          f.key === 'profile_id' &&
          (config.defaults.profile_id ||
            selectedBooking?.itinerary?.operational_entry?.source_profile_id) &&
          !advanced
        )
          return false;
        if (f.key === 'expected_credit' && !advanced) return false;
      }
      if (
        config.kind === 'booking_source_profile' &&
        config.defaults.source_method_id &&
        ['source_method_id', 'provider'].includes(f.key)
      )
        return false;
      if (config.kind === 'price_match_event') {
        if (['received_amount', 'received_on'].includes(f.key) && vals.status !== 'Received')
          return false;
        if (f.key === 'approved_amount' && !['Approved', 'Received'].includes(vals.status))
          return false;
      }
      if (config.kind === 'party' && config.inline_role) {
        const compact = ['traveler', 'airline', 'property', 'rental'].includes(config.inline_role);
        if (
          !(compact ? ['name'] : ['name', 'kind', 'email', 'phone', 'relationship_notes']).includes(
            f.key,
          )
        )
          return false;
        if (['email', 'phone', 'relationship_notes'].includes(f.key) && !advanced) return false;
      }
      if (['travel_component', 'revise_travel'].includes(config.kind)) {
        if (f.key === 'description' && vals.product !== 'Other') return false;
        if (f.key === 'provider_id' && vals.product === 'Other') return false;
        if (
          (tripType === 'Multi-City' ||
            (vals.product === 'Flight' && tripType === 'One Way' && f.key === 'travel_end')) &&
          ['travel_start', 'travel_end'].includes(f.key)
        )
          return false;
        if (['summary', 'reservation_summary'].includes(f.key) && !advanced) return false;
        if (
          [
            'acquisition_source_id',
            'marketing_carrier_id',
            'operating_carrier_id',
            'departure_local',
            'arrival_local',
            'restrictions',
            'brand',
            'benefits',
          ].includes(f.key) &&
          !advanced
        )
          return false;
        if (f.key === 'hotel' && vals.provider_id) return false;
        if (['origin', 'destination'].includes(f.key) && (vals.route || tripType === 'Multi-City'))
          return false;
        if (f.key === 'route' && (vals.product !== 'Flight' || tripType === 'Multi-City'))
          return false;
        if (f.key === 'flight_numbers' && tripType === 'Multi-City') return false;
        if (['pickup_location', 'dropoff_location'].includes(f.key) && vals.product !== 'Car')
          return false;
        if (
          ['hotel', 'hotel_address', 'brand', 'room_type', 'benefits'].includes(f.key) &&
          vals.product !== 'Hotel'
        )
          return false;
        if (
          [
            'origin',
            'destination',
            'departure_local',
            'arrival_local',
            'marketing_carrier_id',
            'operating_carrier_id',
            'flight_numbers',
            'ticket_numbers',
            'cabin',
          ].includes(f.key) &&
          vals.product !== 'Flight'
        )
          return false;
      }
      if (
        config.kind === 'booking' &&
        travelRows.length &&
        [
          'channel',
          'supplier_id',
          'origin',
          'destination',
          'airline_id',
          'hotel_name',
          'hotel_address',
          'room_type',
          'flight_numbers',
          'ticket_numbers',
          'travel_start',
          'travel_end',
          'confirmations',
        ].includes(f.key)
      )
        return false;
      if (config.kind === 'cancel' && f.key === 'travel_component_id' && !state.fulfillmentEnabled)
        return false;
      if (config.kind === 'cancellation_cost' && ['method', 'account_id'].includes(f.key))
        return !!vals.settled;
      if (
        ['purchase_percent', 'sale_percent'].includes(f.key) &&
        (vals.unit === 'points' ||
          vals.unit === 'count' ||
          (selectedAsset && assetUnit(selectedAsset) !== 'money') ||
          vals.kind === 'Points')
      )
        return false;
      if (
        ['fulfill', 'revise_fulfillment'].includes(config.kind) &&
        !advanced &&
        [
          'program_account_id',
          'account_id',
          'portal_price',
          'reference_price',
          'restrictions',
        ].includes(f.key) &&
        !(
          ['portal_price', 'reference_price'].includes(f.key) &&
          ['Amex Business Platinum Pay With Points', 'Chase Points Boost'].includes(
            vals.mechanism ?? '',
          )
        )
      )
        return false;
      if (
        config.kind === 'acquire_asset' &&
        ['instrument_id', 'program_account_id', 'unit'].includes(f.key) &&
        !state.fulfillmentEnabled
      )
        return false;
      // Plan: Cap1 profile always asked on Buy/register when kind is Capital One credit.
      if (
        config.kind === 'acquire_asset' &&
        f.key === 'profile_id' &&
        vals.kind !== 'Capital One credit'
      )
        return false;
      if (
        config.kind === 'acquire_asset' &&
        f.key === 'points_source' &&
        !/point|mile/i.test(String(vals.kind || ''))
      )
        return false;
      if (
        config.kind === 'acquire_asset' &&
        vals.ownership === 'Customer' &&
        ['cost', 'purchase_percent', 'seller_id'].includes(f.key)
      )
        return false;
      if (['fulfill', 'revise_fulfillment'].includes(config.kind)) {
        if (f.key === 'rebate_expected')
          return (
            vals.mode === 'Owned inventory' &&
            vals.unit === 'points' &&
            vals.mechanism === 'Amex Business Platinum Pay With Points'
          );
        if (f.key.startsWith('fee_')) {
          if (vals.mode === 'Cash/Card') return false;
          if (f.key === 'fee_amount') return true;
          if (!vals.fee_amount || Number(vals.fee_amount) <= 0) return false;
          if (['fee_payment_method', 'fee_account_id'].includes(f.key)) return !!vals.fee_settled;
          return true;
        }
        if (
          ['portal_price', 'reference_price'].includes(f.key) &&
          !['Amex Business Platinum Pay With Points', 'Chase Points Boost'].includes(
            vals.mechanism ?? '',
          )
        )
          return false;
        if (
          ['account_holder_id', 'quoted_rate', 'rate_unit', 'booked_through', 'mechanism'].includes(
            f.key,
          ) &&
          vals.mode === 'Cash/Card'
        )
          return false;
        if (
          ['rate_cents_numerator', 'rate_points_denominator'].includes(f.key) &&
          !advanced &&
          !['Amex Business Platinum Pay With Points', 'Chase Points Boost'].includes(
            vals.mechanism ?? '',
          )
        )
          return false;
        if (f.key === 'cash_method') return vals.mode === 'Cash/Card';
        if (f.key === 'payment_method')
          return (
            vals.mode !== 'Owned inventory' && (!!vals.settled || Number(vals.source_paid) > 0)
          );
        if (f.key === 'quantity') return vals.mode !== 'Cash/Card';
        if (['asset_id'].includes(f.key))
          return (
            vals.mode === 'Owned inventory' ||
            (vals.mode === 'Outside source' && vals.unit === 'money')
          );
        if (['cost', 'settled', 'source_paid', 'source_id', 'account_id'].includes(f.key))
          return (
            vals.mode !== 'Owned inventory' &&
            state.assets.find((a: R) => a.id === vals.asset_id)?.ownership !== 'Customer'
          );
        if (['instrument_id', 'program_account_id'].includes(f.key))
          return vals.mode !== 'Cash/Card';
      }
      if (config.kind === 'expected_event') {
        if (f.key === 'booking_id') return vals.kind === 'Points rebate';
        if (f.key === 'funding_component_id') return vals.kind === 'Points rebate';
        if (
          [
            'source_asset_id',
            'target_asset_id',
            'quantity_sent',
            'ratio_numerator',
            'ratio_denominator',
            'bonus_bps',
            'fees',
          ].includes(f.key)
        )
          return vals.kind === 'Points transfer';
      }
      if (config.kind === 'update_expected_event' && f.key === 'quantity_actual')
        return vals.status === 'Posted';
      if (
        ['booking', 'revise'].includes(config.kind) &&
        !advanced &&
        [
          'airline_id',
          'acquisition_source_id',
          'acquisition_source_status',
          'flight_numbers',
          'ticket_numbers',
          'hotel_address',
          'room_type',
          'cost_status',
        ].includes(f.key)
      )
        return false;
      if (['company_tier', 'company_comfort_level'].includes(f.key))
        return (vals.kind ?? config.defaults.kind) === 'company';
      if (f.key === 'referral_rate_bps' && ['party', 'edit_party'].includes(config.kind))
        return parseList(vals.roles).includes('referrer');
      if (config.kind === 'trade') {
        if (f.key === 'asset_id') return vals.side === 'Sell';
        if (['paid', 'method'].includes(f.key)) return vals.side === 'Sell';
        if (f.key === 'stock_mode') return vals.side === 'Buy';
        if (f.key === 'booking_id')
          return vals.side === 'Buy' && vals.stock_mode === 'for_booking';
        if (f.key === 'what_custom')
          return vals.what === TRADE_WHAT_OTHER || vals.what === 'Other';
      }
      if (f.key === 'issuer_custom')
        return vals.issuer === LOYALTY_PROGRAM_OTHER || vals.issuer === 'Other';
      if (f.key === 'loyalty_program_custom')
        return (
          vals.loyalty_program === LOYALTY_PROGRAM_OTHER || vals.loyalty_program === 'Other'
        );
      if (f.key === 'method_custom')
        return vals.method === PAYMENT_METHOD_OTHER || vals.method === 'Other';
      if (f.key === 'payment_method_custom')
        return (
          vals.payment_method === PAYMENT_METHOD_OTHER || vals.payment_method === 'Other'
        );
      if (f.key === 'fee_payment_method_custom')
        return (
          vals.fee_payment_method === PAYMENT_METHOD_OTHER ||
          vals.fee_payment_method === 'Other'
        );
      if (f.key === 'expiry_rule_custom')
        return vals.expiry_rule === EXPIRY_RULE_OTHER || vals.expiry_rule === 'Other';
      if (f.key === 'ticketing_deadline' && config.kind === 'revise')
        return vals.reservation_status === 'Held';
      if (config.kind === 'relationship' && ['tier', 'comfort_level'].includes(f.key))
        return vals.relationship === 'employee';
      if (['booking', 'revise'].includes(config.kind)) {
        if (f.key === 'supplier_id' && config.defaults.itinerary?.operational_entry) return false;
        if (
          ['hotel_name', 'hotel_address', 'room_type'].includes(f.key) &&
          !['Hotel', 'Flight + Hotel', 'Package'].includes(vals.product)
        )
          return false;
        if (
          ['airline_id', 'flight_numbers', 'ticket_numbers', 'origin', 'destination'].includes(
            f.key,
          ) &&
          !['Flight', 'Flight + Hotel', 'Package'].includes(vals.product)
        )
          return false;
      }
      if (['fare_difference', 'supplier_change_fee'].includes(f.key) && !allowed('manage_funding'))
        return false;
      if (
        ['padova_change_fee', 'additional_customer_charge'].includes(f.key) &&
        !allowed('edit_customer_charges')
      )
        return false;
      if (f.key === 'cost_status' && !allowed('manage_funding')) return false;
      if (config.kind === 'booking' && f.key === 'sale' && !allowed('edit_customer_charges'))
        return false;
      if (config.kind === 'sell_asset' && f.key === 'method') return !!vals.paid;
      if (
        config.kind === 'payment' &&
        ['customer_card_fee', 'padova_card_cost'].includes(f.key)
      )
        return (
          vals.direction === 'customer' &&
          /^card$/i.test(String(vals.method || '')) &&
          allowed('edit_customer_charges')
        );
      if (['referral', 'revise_referral'].includes(config.kind)) {
        if (['percentage_basis', 'rate_bps'].includes(f.key)) return vals.basis !== 'fixed';
        if (f.key === 'agreed_basis')
          return vals.basis !== 'fixed' && vals.percentage_basis === 'agreed_amount';
        if (f.key === 'fixed_amount') return vals.basis === 'fixed';
      }
      if (['revise_referral', 'reverse_referral'].includes(config.kind) && f.key === 'revision')
        return false;
      if (
        ['referral_id', 'payment_id'].includes(f.key) &&
        [
          'revise_referral',
          'reverse_referral',
          'pay_referral',
          'reverse_referral_payment',
        ].includes(config.kind) &&
        config.defaults[f.key]
      )
        return false;
      if (config.kind === 'fund') {
        const kind = String(vals.kind ?? '').trim();
        const cashFund = ['Card', 'Cash', 'Bank', 'Seller-funded reservation'].includes(kind);
        // Hide Travel asset until a non-cash funding type is chosen (keeps the row clean).
        if (f.key === 'asset_id') return Boolean(kind) && !cashFund;
        if (f.key === 'face_amount') return Boolean(kind) && !cashFund;
        if (f.key === 'cost') {
          if (!kind) return true;
          if (cashFund) return true;
          if (selectedAsset && selectedAsset.ownership !== 'External') return false;
          return true;
        }
      }
      if (config.kind === 'receive_refund') {
        const denied = vals.form === SUPPLIER_REFUND_DENIED_FORM;
        if (['method', 'account_id'].includes(f.key)) return vals.form === 'cash';
        if (
          ['asset_id', 'basis', 'new_asset_name', 'new_asset_issuer', 'new_asset_expiry'].includes(
            f.key,
          )
        )
          return (
            !denied && vals.form !== 'cash' && vals.form !== 'Supplier payable credit'
          );
      }
      if (config.kind === 'pay_refund') {
        const how = vals.how_given || 'original_method';
        if (['voucher_name', 'voucher_expires_on'].includes(f.key)) return how === 'voucher';
        if (['method', 'account_id'].includes(f.key))
          return how === 'original_method' || how === 'other';
      }
      return true;
    })
    .map((f) => {
      if (config.kind === 'pay_refund' && f.key === 'method') {
        return {
          ...f,
          required: (vals.how_given || 'original_method') === 'original_method',
        };
      }
      if (config.kind === 'pay_refund' && f.key === 'reference') {
        return {
          ...f,
          required: (vals.how_given || '') === 'other',
        };
      }
      if (config.kind === 'receive_refund' && f.key === 'reference') {
        return {
          ...f,
          required: vals.form === SUPPLIER_REFUND_DENIED_FORM,
        };
      }
      if (config.kind === 'receive_refund' && f.key === 'method') {
        return {
          ...f,
          required: vals.form === 'cash',
        };
      }
      if (!travelEditing) return f;
      if (f.key === 'description') return { ...f, required: vals.product === 'Other' };
      if (f.key === 'provider_id')
        return {
          ...f,
          label:
            vals.product === 'Flight'
              ? 'Airline'
              : vals.product === 'Hotel'
                ? 'Property / Hotel'
                : vals.product === 'Car'
                  ? 'Rental company'
                  : 'Travel provider',
        };
      if (f.key === 'channel')
        return {
          ...f,
          options: [
            ...new Set(
              [
                ...(state.bookingSourceMethods ?? [])
                  .filter((m: R) => m.products.includes(vals.product))
                  .map((m: R) => m.name),
                vals.channel,
              ].filter(Boolean),
            ),
          ],
        };
      if (f.key === 'booking_source_confirmation')
        return { ...f, label: sourceConfirmationLabel(vals.channel) };
      if (f.key === 'confirmations')
        return {
          ...f,
          label:
            vals.product === 'Flight'
              ? 'Airline PNR'
              : vals.product === 'Hotel'
                ? 'Hotel/property confirmation'
                : vals.product === 'Car'
                  ? 'Rental/company confirmation'
                  : 'Primary confirmation',
        };
      if (f.key === 'travel_start')
        return { ...f, label: travelDateLabels(vals.product, tripType).start };
      if (f.key === 'travel_end')
        return {
          ...f,
          label: travelDateLabels(vals.product, tripType).end || 'End date',
          required: vals.product !== 'Other',
        };
      if (['departure_local', 'arrival_local'].includes(f.key))
        return {
          ...f,
          type: 'time',
          label:
            f.key === 'departure_local' ? 'Departure time (optional)' : 'Arrival time (optional)',
        };
      if (config.kind === 'expected_event') {
        if (
          ['source_asset_id', 'target_asset_id', 'quantity_sent'].includes(f.key) &&
          vals.kind === 'Points transfer'
        )
          return { ...f, required: true };
        if (
          ['booking_id', 'funding_component_id'].includes(f.key) &&
          vals.kind === 'Points rebate'
        )
          return { ...f, required: true };
      }
      if (config.kind === 'cancel' && f.key === 'traveler_id')
        return {
          ...f,
          help: 'Whole-booking traveler cancel only. Do not use together with a flight/stay above, clear one.',
        };
      if (config.kind === 'fund') {
        const cashFund = ['Card', 'Cash', 'Bank', 'Seller-funded reservation'].includes(
          String(vals.kind ?? ''),
        );
        if (f.key === 'cost' && cashFund)
          return {
            ...f,
            required: true,
            label: 'Actual cost (USD)',
            help: 'What Padova paid the supplier for this booking.',
          };
        if (f.key === 'face_amount' && !cashFund && selectedAsset) {
          const points = assetUnit(selectedAsset) !== 'money';
          return {
            ...f,
            label:
              selectedAsset.unit === 'count'
                ? 'Whole certificates used'
                : points
                  ? 'Whole points used'
                  : 'Face amount (USD)',
          };
        }
        if (f.key === 'seller_id')
          return {
            ...f,
            label: cashFund
              ? 'Purchased From / payee'
              : 'Purchased From / payee (optional override)',
          };
      }
      return f;
    })
    .map((f) =>
      f.key === 'quantity' && ['fulfill', 'acquire_asset'].includes(config.kind) && vals.unit
        ? {
            ...f,
            label:
              vals.unit === 'count'
                ? 'Whole certificates / benefits'
                : vals.unit === 'points'
                  ? 'Whole points'
                  : 'Face amount (USD)',
            help:
              vals.unit === 'count'
                ? 'Enter the actual whole count. Acquisition cost stays separate.'
                : f.help,
          }
        : f,
    )
    .sort((a, b) => {
      if (config.kind !== 'booking') return 0;
      const order = [
        'customer_id',
        'traveler_ids',
        'product',
        'channel',
        'supplier_id',
        'summary',
        'origin',
        'destination',
        'hotel_name',
        'travel_start',
        'travel_end',
        'confirmations',
        'booked_on',
        'sale',
      ];
      return (
        (order.includes(a.key) ? order.indexOf(a.key) : 100) -
        (order.includes(b.key) ? order.indexOf(b.key) : 100)
      );
    });
  const applyCardFeeSuggestion = (next: R) => {
    if (
      config.kind !== 'payment' ||
      next.direction !== 'customer' ||
      !isCardPaymentMethod(next.method)
    )
      return next;
    const base = decimalUnits(next.amount || 0);
    if (!(base > 0)) return next;
    const suggested = suggestPaymentCardFees(base, state.feeSettings);
    return {
      ...next,
      customer_card_fee:
        next.customer_card_fee === '' || next.customer_card_fee == null
          ? (suggested.customer_card_fee / 100).toFixed(2)
          : next.customer_card_fee,
      padova_card_cost:
        next.padova_card_cost === '' || next.padova_card_cost == null
          ? (suggested.padova_card_cost / 100).toFixed(2)
          : next.padova_card_cost,
    };
  };
  const change = (key: string, value: any) => {
    if (
      key === 'amount' &&
      config.kind === 'payment' &&
      config.defaults.booking_id &&
      allocs.length === 1 &&
      allocs[0].booking_id === config.defaults.booking_id &&
      !allocs[0].manual_amount
    )
      setAllocs((rows) => rows.map((a) => ({ ...a, amount: value })));
    if (key === 'direction' && value !== vals.direction) setAllocs([]);
    if (config.kind === 'payment' && (key === 'method' || key === 'amount' || key === 'direction')) {
      setVals((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'direction' && value !== 'customer') {
          next.customer_card_fee = '';
          next.padova_card_cost = '';
          return next;
        }
        if (key === 'method' && !isCardPaymentMethod(value)) {
          next.customer_card_fee = '';
          next.padova_card_cost = '';
          return next;
        }
        if (key === 'method' && isCardPaymentMethod(value)) {
          next.customer_card_fee = '';
          next.padova_card_cost = '';
        }
        if (key === 'amount' && isCardPaymentMethod(next.method)) {
          next.customer_card_fee = '';
          next.padova_card_cost = '';
        }
        try {
          return applyCardFeeSuggestion(next);
        } catch {
          return next;
        }
      });
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const cleared = { ...prev };
        delete cleared[key];
        return cleared;
      });
      return;
    }
    if (
      config.kind === 'cancel' &&
      ['refund_card_fee', 'supplier_expected', 'funding_component_id'].includes(key)
    ) {
      const booking = state.bookings?.find((b: R) => b.id === vals.booking_id);
      if (booking) {
        const nextFundingId =
          key === 'funding_component_id' ? value : vals.funding_component_id;
        const funding = state.fundingComponents?.find((f: R) => f.id === nextFundingId);
        const unit = funding ? refundQuantityUnit(funding) : 'money';
        const recoverable =
          funding == null
            ? null
            : funding.asset_id
              ? funding.face_amount == null
                ? null
                : Number(funding.face_amount)
              : funding.cost == null
                ? null
                : Number(funding.cost);
        const supplierRaw =
          key === 'supplier_expected' ? value : vals.supplier_expected;
        let supplierCents: number | null = null;
        try {
          if (String(supplierRaw ?? '').trim())
            supplierCents =
              unit === 'money'
                ? decimalUnits(supplierRaw)
                : decimalUnits(supplierRaw, true);
        } catch {
          supplierCents = null;
        }
        const suggested = suggestCancelRefundAmounts({
          paid_cents: booking.paid == null ? null : Number(booking.paid),
          sale_cents: booking.sale == null ? null : Number(booking.sale),
          prior_customer_due_cents:
            booking.refund_due == null ? 0 : Number(booking.refund_due),
          charges: [{ kind: 'Card fee', amount: Number(booking.card_fee_charges ?? 0) }],
          refund_card_fee:
            key === 'refund_card_fee' ? Boolean(value) : Boolean(vals.refund_card_fee),
          ...(unit === 'money'
            ? {
                supplier_expected_cents: supplierCents,
                original_cost_cents: recoverable,
              }
            : {}),
        });
        setVals((prev) => ({
          ...prev,
          [key]: key === 'refund_card_fee' ? Boolean(value) : value,
          customer_due:
            suggested.customer_due_cents == null
              ? prev.customer_due
              : (suggested.customer_due_cents / 100).toFixed(2),
          charge_reduction:
            suggested.charge_reduction_cents == null
              ? prev.charge_reduction
              : (suggested.charge_reduction_cents / 100).toFixed(2),
        }));
        setFieldErrors((prev) => {
          if (!prev[key] && !prev.customer_due && !prev.charge_reduction) return prev;
          const cleared = { ...prev };
          delete cleared[key];
          delete cleared.customer_due;
          delete cleared.charge_reduction;
          return cleared;
        });
        return;
      }
    }
    if (
      key === 'referrer_id' &&
      ['referral', 'revise_referral'].includes(config.kind) &&
      value
    ) {
      const party = state.parties?.find((p: R) => p.id === value);
      const rate = partyReferralRateBps(party);
      setVals((prev) => ({
        ...prev,
        referrer_id: value,
        ...(rate != null
          ? {
              basis: prev.basis === 'fixed' ? 'percentage' : prev.basis || 'percentage',
              percentage_basis: prev.percentage_basis || 'profit',
              rate_bps: (rate / 100).toFixed(2),
            }
          : {}),
      }));
      setFieldErrors((prev) => {
        if (!prev[key] && !prev.rate_bps) return prev;
        const cleared = { ...prev };
        delete cleared[key];
        delete cleared.rate_bps;
        return cleared;
      });
      return;
    }
    if (key === 'kind' && config.kind === 'fund') {
      const cashFund = ['Card', 'Cash', 'Bank', 'Seller-funded reservation'].includes(
        String(value ?? ''),
      );
      if (cashFund) {
        setVals((prev) => ({ ...prev, kind: value, asset_id: '', face_amount: '' }));
        setFieldErrors((prev) => {
          if (!Object.keys(prev).length) return prev;
          const next = { ...prev };
          delete next.kind;
          delete next.asset_id;
          delete next.face_amount;
          return next;
        });
        return;
      }
    }
    if (
      config.kind === 'transfer_asset' &&
      ['quantity_sent', 'transfer_bonus_percent'].includes(key)
    ) {
      setVals((prev) => {
        const next = { ...prev, [key]: value };
        const bonusRaw = String(next.transfer_bonus_percent ?? '').trim();
        if (!bonusRaw) return next;
        try {
          const bonusBps = decimalUnits(bonusRaw);
          const sentRaw = String(next.quantity_sent ?? '').trim();
          if (!/^\d+$/.test(sentRaw)) return next;
          const received = pointsReceivedWithBonus(Number(sentRaw), bonusBps);
          if (received != null) next.quantity_received = String(received);
        } catch {
          /* leave received as-typed until inputs are exact */
        }
        return next;
      });
      setFieldErrors((prev) => {
        if (!prev[key] && !prev.quantity_received) return prev;
        const cleared = { ...prev };
        delete cleared[key];
        delete cleared.quantity_received;
        return cleared;
      });
      return;
    }
    if (
      config.kind === 'expected_event' &&
      ['quantity_sent', 'bonus_bps', 'ratio_numerator', 'ratio_denominator'].includes(key)
    ) {
      setVals((prev) => {
        const next = { ...prev, [key]: value };
        if (String(next.kind ?? '') !== 'Points transfer') return next;
        const sentRaw = String(next.quantity_sent ?? '').trim();
        if (!/^\d+$/.test(sentRaw)) return next;
        const parseOptInt = (raw: unknown) => {
          const t = String(raw ?? '').trim();
          if (!t) return null;
          if (!/^\d+$/.test(t)) return undefined;
          return Number(t);
        };
        let bonusBps: number | null = null;
        const bonusRaw = String(next.bonus_bps ?? '').trim();
        if (bonusRaw) {
          try {
            bonusBps = decimalUnits(bonusRaw);
          } catch {
            return next;
          }
        }
        const ratioNum = parseOptInt(next.ratio_numerator);
        const ratioDen = parseOptInt(next.ratio_denominator);
        if (ratioNum === undefined || ratioDen === undefined) return next;
        const expected = expectedTransferQuantity({
          quantitySent: Number(sentRaw),
          bonusBps,
          ratioNumerator: ratioNum,
          ratioDenominator: ratioDen,
        });
        if (expected != null) next.quantity_expected = String(expected);
        return next;
      });
      setFieldErrors((prev) => {
        if (!prev[key] && !prev.quantity_expected) return prev;
        const cleared = { ...prev };
        delete cleared[key];
        delete cleared.quantity_expected;
        return cleared;
      });
      return;
    }
    setFieldErrors((prev) => {
      if (key === 'kind' && config.kind === 'expected_event') return {};
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      delete next[key];
      if (['travel_component_id', 'traveler_id'].includes(key)) {
        delete next.travel_component_id;
        delete next.traveler_id;
      }
      // Clearing either transfer account side clears the “must differ” pair once they differ.
      const pairKeys = [
        ['source_asset_id', 'target_asset_id'],
        ['sending_asset_id', 'receiving_asset_id'],
      ] as const;
      for (const [a, b] of pairKeys) {
        if (key !== a && key !== b) continue;
        const nextA = key === a ? value : vals[a];
        const nextB = key === b ? value : vals[b];
        if (nextA && nextB && nextA !== nextB) {
          delete next[a];
          delete next[b];
        }
      }
      return next;
    });
    setVals((v) => {
      const clearIneligibleSeller =
        config.kind === 'payment' &&
        key === 'direction' &&
        value === 'supplier' &&
        v.party_id &&
        (() => {
          const party = (state.parties ?? []).find((p: R) => p.id === v.party_id);
          return party ? !eligibleParty(party, 'seller') : false;
        })();
      return {
      ...v,
      [key]: value,
      ...(clearIneligibleSeller ? { party_id: '' } : {}),
      ...(config.kind === 'cancel' && key === 'travel_component_id' && value
        ? { traveler_id: '' }
        : {}),
      ...(config.kind === 'cancel' && key === 'traveler_id' && value
        ? { travel_component_id: '' }
        : {}),
      ...(config.kind === 'revise' &&
      v.product === 'Flight' &&
      key === 'travel_start' &&
      v.trip_type === 'One Way'
        ? { travel_end: value }
        : {}),
      ...(config.kind === 'revise' &&
      v.product === 'Flight' &&
      key === 'trip_type' &&
      value === 'One Way'
        ? { travel_end: v.travel_start }
        : {}),
      ...(key === 'asset_id' && value
        ? { unit: assetUnit(state.assets.find((a: R) => a.id === value) ?? {}) }
        : {}),
      ...(key === 'travel_component_id'
        ? {
            source_id:
              state.travelComponents?.find((t: R) => t.id === value)?.acquisition_source_id ?? '',
          }
        : {}),
      ...(key === 'instrument_id'
        ? {
            unit: state.instruments?.find((i: R) => i.id === value)?.unit ?? '',
            ...(['fulfill', 'revise_fulfillment'].includes(config.kind)
              ? {
                  role:
                    state.instruments?.find((i: R) => i.id === value)?.role === 'Ancillary'
                      ? 'Ancillary'
                      : 'Core',
                }
              : {}),
            ...(config.kind === 'acquire_asset'
              ? {
                  kind: state.instruments?.find((i: R) => i.id === value)?.name ?? vals.kind,
                  issuer:
                    state.programs?.find(
                      (p: R) =>
                        p.id === state.instruments?.find((i: R) => i.id === value)?.program_id,
                    )?.name ?? v.issuer,
                }
              : {}),
            program_account_id: '',
            asset_id: '',
          }
        : {}),
      ...(key === 'mode'
        ? {
            instrument_id: '',
            program_account_id: '',
            asset_id: '',
            cost: '',
            settled: false,
            unit: value === 'Cash/Card' ? 'money' : '',
          }
        : {}),
      ...(key === 'record_type' ? { record_id: '' } : {}),
      ...(key === 'booking_id'
        ? { funding_component_id: '', traveler_id: '', travel_component_id: '' }
        : {}),
      ...(key === 'travel_start' && (!v.travel_end || v.travel_end < value)
        ? { travel_end: value }
        : {}),
      };
    });
  };
  const options = (f: Field) =>
    f.options
      ?.filter(
        (x) =>
          config.kind !== 'payment' ||
          f.key !== 'direction' ||
          x === 'customer' ||
          (x === 'supplier' && allowed('manage_funding')) ||
          (x === 'commission' && allowed('manage_commissions')),
      )
      .map((x) => ({
        value: x,
        label:
          f.key === 'role'
            ? ((
                {
                  Core: 'Main trip',
                  Ancillary: 'Extra benefit',
                  Both: 'Main trip or extra benefit',
                } as R
              )[x] ?? pretty(x))
            : pretty(x),
      })) ??
    (
      state[
        f.source === 'taskLinks'
          ? (
              {
                booking: 'bookings',
                party: 'parties',
                asset: 'assets',
                commission: 'commissions',
                refund: 'refunds',
              } as R
            )[vals.record_type]
          : (f.source ?? '')
      ] ?? []
    )
      .filter((r: R) => {
        if (
          ['price_match_event', 'booking_source_profile_link'].includes(config.kind) &&
          f.source === 'bookingSourceProfiles'
        ) {
          const selected = state.bookings.find((b: R) => b.id === vals.booking_id);
          return r.source_method_id === selected?.itinerary?.operational_entry?.source_method_id;
        }
        if (config.kind === 'acquire_asset' && f.source === 'bookingSourceProfiles') {
          if (r.status && r.status !== 'Active') return false;
          return /capital\s*one/i.test(String(r.provider || r.name || ''));
        }
        if (config.kind === 'payment' && vals.direction === 'supplier' && f.key === 'party_id')
          return eligibleParty(r, 'seller');
        if (f.source === 'paymentAccounts')
          return vals.method || vals.payment_method
            ? accountSupports(r, vals.method || vals.payment_method)
            : r.active !== false && r.ownership === 'Padova';
        if (f.source === 'payments' && config.kind === 'correct_payment')
          return (
            r.direction === 'customer' || (r.direction === 'supplier' && allowed('manage_funding'))
          );
        if (f.source === 'travelComponents') return r.booking_id === vals.booking_id;
        if (f.source === 'instruments' && vals.program_id) return r.program_id === vals.program_id;
        if (f.source === 'programAccounts' && vals.instrument_id)
          return (
            r.program_id ===
            state.instruments?.find((i: R) => i.id === vals.instrument_id)?.program_id
          );
        if (config.kind === 'expected_event' && f.source === 'assets')
          return r.ownership === 'Padova' && assetUnit(r) === 'points';
        if (['fulfill', 'revise_fulfillment'].includes(config.kind) && f.source === 'assets')
          return (
            r.ownership === (vals.mode === 'Outside source' ? 'Customer' : 'Padova') &&
            (!vals.unit || assetUnit(r) === vals.unit)
          );
        if (['airline_id', 'marketing_carrier_id', 'operating_carrier_id'].includes(f.key))
          return eligibleParty(r, 'airline');
        if (f.key === 'provider_id') return eligibleParty(r, providerRole(vals.product));
        if (['supplier_id', 'seller_id', 'change_seller_id'].includes(f.key))
          return eligibleParty(r, 'seller');
        if (f.key === 'customer_id') return eligibleParty(r, 'customer');
        if (f.source === 'parties' && ['person_id', 'traveler_id'].includes(f.key)) {
          if (r.kind !== 'person') return false;
          if (f.key === 'traveler_id' && vals.booking_id)
            return state.travelerLinks?.some(
              (t: R) => t.booking_id === vals.booking_id && t.person_id === r.id,
            );
        }
        if (f.key === 'group_id') return ['family', 'company'].includes(r.kind);
        if (f.source === 'fundingComponents' && vals.booking_id)
          return (
            !r.reversed &&
            r.booking_id === vals.booking_id &&
            (!vals.travel_component_id ||
              config.kind !== 'cancel' ||
              r.travel_component_id === vals.travel_component_id)
          );
        if (f.source === 'payments' && config.kind === 'commission_receipt')
          return r.direction === 'commission';
        if (f.source === 'referralPayments')
          return (
            (!config.defaults.referral_id || r.referral_id === config.defaults.referral_id) &&
            Number(r.current_amount) > 0
          );
        if (f.source === 'staff') return r.active !== false;
        return true;
      })
      .map((r: R) => ({
        value: r.id,
        keywords:
          f.source === 'parties' ? (r.details?.search_aliases ?? r.details?.aliases) : undefined,
        label:
          f.source === 'travelComponents'
            ? `${r.code ?? ''} · ${r.product} · ${r.summary}`
            : f.source === 'expectedEvents'
              ? `${r.kind} · ${r.status} · ${r.reference ?? ''}`
              : f.source === 'taskLinks'
                ? (r.name ??
                  r.title ??
                  `${r.code ?? ''} · ${r.summary ?? r.reason ?? r.payer ?? ''}`)
                : f.source === 'bookings'
                  ? `${r.code} · ${r.customer} · ${r.summary}`
                  : f.source === 'referralPayments'
                    ? `${r.paid_on} · ${money(r.current_amount)} · ${r.method} · ${r.reference}`
                    : f.source === 'payments'
                      ? `${r.party} · ${pretty(r.direction)} · ${money(r.current_amount)} · ${r.reference}`
                      : f.source === 'commissions'
                        ? `${r.code} · ${r.collector ?? r.payer} · ${money(Number(r.gross) - Number(r.retained))}`
                        : f.source === 'fundingComponents'
                          ? `${r.code} · ${r.kind} · ${formatQuantity(r.face_amount, r.unit ?? assetUnit({ kind: r.asset_kind ?? r.kind }))}`
                          : f.source === 'sales'
                            ? `${r.asset} · ${r.buyer} · ${money(r.proceeds)}`
                            : f.source === 'referrals'
                              ? `${r.referrer} · ${r.code}`
                              : f.source === 'refunds'
                                ? `${r.code} · ${r.reason}`
                                : (r.name ?? r.title),
      }));
  const wholeQuantity = (f: Field) => {
    if (
      config.kind === 'receive_refund' &&
      ['points', 'count'].includes(state.refunds?.find((r: R) => r.id === vals.refund_id)?.unit)
    )
      return true;
    if (
      ['fulfill', 'revise_fulfillment'].includes(config.kind) ||
      (config.kind === 'acquire_asset' && vals.unit)
    )
      return vals.unit === 'points' || vals.unit === 'count';
    if (config.kind === 'convert_asset' && f.key === 'quantity_received')
      return vals.kind === 'Points';
    if (f.type !== 'quantity') return false;
    const assetId =
      config.kind === 'transfer_asset'
        ? vals[f.key === 'quantity_sent' ? 'sending_asset_id' : 'receiving_asset_id']
        : vals.asset_id;
    const a = state.assets.find((x: R) => x.id === assetId);
    const component = state.fundingComponents?.find((x: R) => x.id === vals.funding_component_id);
    return config.kind === 'acquire_asset'
      ? vals.kind === 'Points'
      : (a && assetUnit(a) !== 'money') ||
          vals.form === 'points' ||
          (config.kind === 'cancel' && component && refundQuantityUnit(component) !== 'money');
  };
  const collectClientFieldErrors = (nextVals: R = vals): FieldErrorMap => {
    const errors: FieldErrorMap = {};
    for (const f of defs) {
      if (!f.required || f.type === 'allocations' || f.type === 'travelers') continue;
      if (isEmptyFieldValue(nextVals[f.key])) errors[f.key] = requiredFieldMessage(f.label);
    }
    if (
      config.kind === 'expected_event' &&
      nextVals.kind === 'Points transfer' &&
      nextVals.source_asset_id &&
      nextVals.target_asset_id &&
      nextVals.source_asset_id === nextVals.target_asset_id
    ) {
      const msg = 'Sending and receiving accounts must be different';
      errors.source_asset_id = msg;
      errors.target_asset_id = msg;
    }
    if (
      config.kind === 'transfer_asset' &&
      nextVals.sending_asset_id &&
      nextVals.receiving_asset_id &&
      nextVals.sending_asset_id === nextVals.receiving_asset_id
    ) {
      const msg = 'Sending and receiving accounts must be different';
      errors.sending_asset_id = msg;
      errors.receiving_asset_id = msg;
    }
    if (
      config.kind === 'expected_event' &&
      nextVals.kind === 'Points transfer' &&
      Boolean(nextVals.ratio_numerator) !== Boolean(nextVals.ratio_denominator)
    ) {
      const msg = 'Enter both parts of the transfer ratio';
      if (!nextVals.ratio_numerator) errors.ratio_numerator = msg;
      if (!nextVals.ratio_denominator) errors.ratio_denominator = msg;
    }
    if (config.kind === 'cancel') Object.assign(errors, cancelScopeFieldErrors(nextVals));
    return errors;
  };
  const destructiveConfirm = async () => {
    if (!DESTRUCTIVE_KINDS.has(config.kind)) return true;
    if (config.kind === 'cancel') {
      return askConfirm({
        title: 'Cancel this booking?',
        message:
          'This records a cancellation and expected returns. It cannot be undone from this screen, continue only if you meant to cancel.',
        confirmLabel: 'Yes, cancel booking',
        cancelLabel: 'Keep booking',
        tone: 'danger',
      });
    }
    if (config.kind === 'expire_asset') {
      const loss =
        config.defaults?.loss_basis_cents == null
          ? 'remaining cost Unknown (not $0)'
          : money(Number(config.defaults.loss_basis_cents));
      return askConfirm({
        title: 'Expire unused balance?',
        message: `Plan: unused points/vouchers expire as a loss equal to remaining cost (${loss}). History is kept. Continue only if the balance truly expired.`,
        confirmLabel: 'Yes, expire as loss',
        cancelLabel: 'Go back',
        tone: 'danger',
      });
    }
    if (config.kind.startsWith('reverse_') || config.kind === 'correct_payment') {
      return askConfirm({
        title: 'Confirm this reversal?',
        message: 'This posts a reversing financial action with audit history. Continue only if you reviewed the amounts.',
        confirmLabel: 'Yes, continue',
        cancelLabel: 'Go back',
        tone: 'danger',
      });
    }
    return true;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const clientErrors = collectClientFieldErrors();
    if (Object.keys(clientErrors).length) {
      setFieldErrors(clientErrors);
      setError('');
      setBusy(false);
      return;
    }
    const confirmed = await destructiveConfirm();
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const data: R = {};
      if (
        ['fulfill', 'revise_fulfillment'].includes(config.kind) &&
        vals.mode === 'Owned inventory' &&
        vals.asset_id
      )
        data.unit = assetUnit(state.assets.find((a: R) => a.id === vals.asset_id) ?? {});
      if (config.kind === 'resolve_attention') {
        data.key = config.defaults.key;
        data.fingerprint = config.defaults.fingerprint;
      }
      if (config.defaults.booking_id) data.booking_id = config.defaults.booking_id;
      if (
        ['pay_referral', 'revise_referral', 'reverse_referral'].includes(config.kind) &&
        config.defaults.referral_id
      )
        data.referral_id = config.defaults.referral_id;
      if (['revise_referral', 'reverse_referral'].includes(config.kind))
        data.revision = Number(config.defaults.revision ?? 0);
      if (config.kind === 'reverse_referral_payment' && config.defaults.payment_id)
        data.payment_id = config.defaults.payment_id;
      if (['referral', 'revise_referral'].includes(config.kind)) {
        if (vals.basis === 'fixed') {
          data.rate_bps = 0;
          data.percentage_basis = 'profit';
        } else data.fixed_amount = 0;
      }
      if (config.kind === 'note' && config.defaults.record_type && config.defaults.record_id) {
        data.record_type = config.defaults.record_type;
        data.record_id = config.defaults.record_id;
      }
      if (config.kind === 'review_resolution') {
        data.source_locator = { ...(config.defaults.source_locator ?? {}), link: vals.source_link };
        data.destination_ids = vals.destination_id ? { record_id: vals.destination_id } : {};
      }
      if (['revise_fulfillment', 'reverse_fulfillment'].includes(config.kind)) {
        data.fulfillment_id = config.defaults.fulfillment_id;
        data.expected_version = Number(config.defaults.edit_version ?? 0);
      }
      if (config.kind === 'revise_asset') {
        data.asset_id = config.defaults.asset_id ?? config.defaults.id;
        data.expected_version = Number(config.defaults.edit_version ?? 0);
      }
      if (config.kind === 'update_task') data.task_id = config.defaults.task_id;
      if (config.kind === 'price_match_event' && config.defaults.request_id)
        data.request_id = config.defaults.request_id;
      for (const f of defs) {
        const v = vals[f.key];
        if (f.type === 'allocations' || f.type === 'travelers') continue;
        if (v === undefined || v === '' || v === null) {
          if (f.type === 'checkbox') data[f.key] = false;
          continue;
        }
        if (f.type === 'signed_money') {
          data[f.key] = decimalUnits(v, false, true);
        } else if (f.type === 'integer') {
          data[f.key] = decimalUnits(v, true);
        } else if (f.type === 'money' || f.type === 'percent') {
          data[f.key] = decimalUnits(v);
        } else if (f.type === 'quantity') {
          const a = state.assets.find(
            (x: R) =>
              x.id ===
              (config.kind === 'transfer_asset'
                ? vals[f.key === 'quantity_sent' ? 'sending_asset_id' : 'receiving_asset_id']
                : vals.asset_id),
          );
          const component = state.fundingComponents?.find(
            (x: R) => x.id === vals.funding_component_id,
          );
          const points =
            config.kind === 'receive_refund' &&
            ['points', 'count'].includes(
              state.refunds?.find((r: R) => r.id === vals.refund_id)?.unit,
            )
              ? true
              : ['fulfill', 'revise_fulfillment'].includes(config.kind) ||
                  (config.kind === 'acquire_asset' && vals.unit)
                ? vals.unit === 'points' || vals.unit === 'count'
                : config.kind === 'convert_asset' && f.key === 'quantity_received'
                  ? vals.kind === 'Points'
                  : config.kind === 'acquire_asset'
                    ? vals.kind === 'Points'
                    : (a && assetUnit(a) !== 'money') ||
                      vals.form === 'points' ||
                      (config.kind === 'cancel' &&
                        component &&
                        refundQuantityUnit(component) !== 'money');
          data[f.key] = decimalUnits(v, points);
        } else data[f.key] = v;
      }
      if (config.kind === 'booking_source_profile' && config.defaults.source_method_id) {
        data.source_method_id = config.defaults.source_method_id;
        data.provider =
          config.defaults.provider ||
          state.bookingSourceMethods?.find((m: R) => m.id === data.source_method_id)?.name;
      }
      if (['price_match_event', 'benefit'].includes(config.kind)) {
        if (advanced && vals.original_rate !== '' && vals.original_rate !== undefined) {
          data.original_rate = decimalUnits(vals.original_rate);
          if (data.original_rate !== inheritedRate && !data.original_rate_reason?.trim())
            throw new Error('Enter the reason for the exceptional original rate');
        } else if (
          inheritedRate !== undefined &&
          (config.kind === 'price_match_event' || data.final_rate !== undefined)
        )
          data.original_rate = inheritedRate;
        data.profile_id ||=
          config.defaults.profile_id ||
          selectedBooking?.itinerary?.operational_entry?.source_profile_id;
        if (config.kind === 'price_match_event') {
          if (
            (!advanced || data.requested_amount === undefined) &&
            data.final_rate !== undefined &&
            data.original_rate !== undefined
          )
            data.requested_amount = Math.max(0, data.original_rate - data.final_rate);
          data.expected_credit ??= data.requested_amount;
        }
      }
      if (config.kind === 'booking_source_method')
        data.products = Array.isArray(vals.products)
          ? vals.products
          : parseList(vals.products ?? '');
      if (config.kind === 'booking_source_method' && !data.products.length)
        throw Error('Select at least one product.');
      if (config.kind === 'instrument') {
        data.rules = {
          restrictions: data.restrictions,
          rebate_bps: data.rebate_bps,
          redemption_cents_numerator: data.redemption_cents_numerator,
          redemption_points_denominator: data.redemption_points_denominator,
        };
        delete data.restrictions;
        delete data.rebate_bps;
        delete data.redemption_cents_numerator;
        delete data.redemption_points_denominator;
      }
      if (['travel_component', 'revise_travel'].includes(config.kind)) {
        if (!advanced || config.defaults.details?.summary_generated)
          data.summary = travelDerived.summary;
        if (vals.product === 'Flight' && tripType === 'One Way')
          data.travel_end = data.travel_start;
        const detailKeys = [
          'booking_source_confirmation',
          'reservation_summary',
          'description',
          'pickup_location',
          'dropoff_location',
          'additional_airlines',
          'ticketing_status',
          'confirmations',
          'traveler_ids',
          'route',
          'hotel',
          'origin',
          'destination',
          'departure_local',
          'arrival_local',
          'marketing_carrier_id',
          'operating_carrier_id',
          'flight_numbers',
          'ticket_numbers',
          'cabin',
          'brand',
          'hotel_address',
          'room_type',
          'benefits',
          'restrictions',
        ];
        data.details = { ...(config.defaults.details ?? {}) };
        data.details.trip_type = vals.product === 'Flight' ? tripType : undefined;
        if (vals.product === 'Flight') data.details.end_date_known = tripType !== 'One Way';
        if (vals.product === 'Other') {
          data.details.end_date_known = !!vals.travel_end;
          data.travel_end ||= data.travel_start;
        }
        if (tripType !== 'Multi-City' && config.defaults.details?.segments)
          data.details.segments = null;
        if (tripType === 'Multi-City' && vals.product === 'Flight') {
          data.details.segments = vals.segments ?? config.defaults.details.segments;
          data.travel_start = data.details.segments[0]?.date;
          data.travel_end = data.details.segments.at(-1)?.date;
        }
        for (const key of detailKeys) {
          if (vals[key] === undefined) continue;
          data.details[key] =
            key === 'traveler_ids'
              ? (vals.traveler_ids ?? [])
              : [
                    'confirmations',
                    'flight_numbers',
                    'ticket_numbers',
                    'booking_source_confirmation',
                  ].includes(key)
                ? parseList(vals[key])
                : (vals[key] ?? '');
          delete data[key];
        }
        if (vals.departure_local)
          data.details.departure_local = `${data.travel_start}T${vals.departure_local}`;
        if (vals.arrival_local)
          data.details.arrival_local = `${data.travel_end}T${vals.arrival_local}`;
        if (config.defaults.details?.reservation_summary_generated)
          data.details.reservation_summary = travelDerived.summary;
        if (tripType === 'Multi-City') {
          data.details.route = travelDerived.route;
          data.details.flight_numbers = (data.details.segments ?? [])
            .map((s: R) => s.flight_number)
            .filter(Boolean);
        }
        if (config.kind === 'revise_travel') {
          data.travel_component_id = config.defaults.travel_component_id;
          data.expected_version = Number(config.defaults.edit_version ?? 0);
        }
      }
      if (['fulfill', 'revise_fulfillment'].includes(config.kind)) {
        if (data.mode === 'Cash/Card')
          data.quantity =
            vals.operational_kind === 'Customer card' ? decimalUnits(vals.quantity) : data.cost;
        data.program_account_id = vals.program_account_id || null;
        data.terms = fulfillmentEntryTerms(vals);
        for (const key of [
          'account_holder_id',
          'mechanism',
          'booked_through',
          'quoted_rate',
          'rate_unit',
          'notes',
          'reference',
          'portal_price',
          'reference_price',
          'rate_cents_numerator',
          'rate_points_denominator',
          'restrictions',
        ])
          delete data[key];
      }
      if (config.kind === 'expected_event') {
        data.terms = {};
        for (const key of ['ratio_numerator', 'ratio_denominator', 'bonus_bps', 'fees']) {
          if (data[key] !== undefined) data.terms[key] = data[key];
          delete data[key];
        }
      }
      if (config.kind === 'fund') {
        const cashFund = ['Card', 'Cash', 'Bank', 'Seller-funded reservation'].includes(
          String(data.kind ?? vals.kind ?? ''),
        );
        if (cashFund) {
          delete data.asset_id;
          if (data.cost === undefined) throw new Error('Enter the actual cost Padova paid');
          data.face_amount = data.cost;
        } else if (data.face_amount === undefined && data.cost !== undefined) {
          data.face_amount = data.cost;
        }
      }
      if (config.kind === 'transfer_asset') {
        delete data.transfer_bonus_percent;
      }
      if (config.kind === 'note' && config.defaults?.call_note) {
        const formatted = formatRefundCallNoteBody(String(data.body || ''));
        if (!formatted) throw new Error('Enter the call note');
        data.body = formatted;
        data.record_type = 'refund';
        if (config.defaults.record_id) data.record_id = config.defaults.record_id;
      }
      if (config.kind === 'cancel' && data.call_notes !== undefined) {
        const note = String(data.call_notes || '').trim();
        if (!note) delete data.call_notes;
      }
      if (config.kind === 'acquire_asset' || config.kind === 'convert_asset') {
        const issuer = resolveLoyaltyProgram(vals.issuer, vals.issuer_custom);
        if (!issuer) throw new Error('Enter the new program name (or pick a listed issuer)');
        data.issuer = issuer;
        delete data.issuer_custom;
      }
      if (config.kind === 'acquire_asset' || config.kind === 'revise_asset') {
        if (
          vals.expiry_rule === EXPIRY_RULE_OTHER ||
          vals.expiry_rule === 'Other' ||
          vals.expiry_rule_custom ||
          vals.expiry_rule
        ) {
          const rule = resolveExpiryRule(vals.expiry_rule, vals.expiry_rule_custom);
          if (
            (vals.expiry_rule === EXPIRY_RULE_OTHER || vals.expiry_rule === 'Other') &&
            !rule
          )
            throw new Error('Enter the new expiry rule name');
          if (rule) data.expiry_rule = rule;
          else delete data.expiry_rule;
          delete data.expiry_rule_custom;
          if (!data.expires_on && rule) {
            const suggested = suggestExpiresOn(rule, vals.date || data.date);
            if (suggested) data.expires_on = suggested;
          }
        }
      }
      if (
        vals.method === PAYMENT_METHOD_OTHER ||
        vals.method === 'Other' ||
        vals.method_custom
      ) {
        const method = resolvePaymentMethod(vals.method, vals.method_custom);
        if (
          (vals.method === PAYMENT_METHOD_OTHER || vals.method === 'Other') &&
          !method
        )
          throw new Error('Enter the new payment method name');
        if (method) data.method = method;
        delete data.method_custom;
      }
      if (
        vals.payment_method === PAYMENT_METHOD_OTHER ||
        vals.payment_method === 'Other' ||
        vals.payment_method_custom
      ) {
        const method = resolvePaymentMethod(
          vals.payment_method,
          vals.payment_method_custom,
        );
        if (
          (vals.payment_method === PAYMENT_METHOD_OTHER || vals.payment_method === 'Other') &&
          !method
        )
          throw new Error('Enter the new payment method name');
        if (method) data.payment_method = method;
        delete data.payment_method_custom;
      }
      if (
        vals.fee_payment_method === PAYMENT_METHOD_OTHER ||
        vals.fee_payment_method === 'Other' ||
        vals.fee_payment_method_custom
      ) {
        const method = resolvePaymentMethod(
          vals.fee_payment_method,
          vals.fee_payment_method_custom,
        );
        if (
          (vals.fee_payment_method === PAYMENT_METHOD_OTHER ||
            vals.fee_payment_method === 'Other') &&
          !method
        )
          throw new Error('Enter the new taxes / fees payment method name');
        if (method) data.fee_payment_method = method;
        delete data.fee_payment_method_custom;
      }
      if (config.kind === 'acquire_asset') {
        if (data.ownership === 'Customer') data.cost = 0;
        if (data.cost === undefined && data.purchase_percent !== undefined)
          data.cost = Math.round((data.quantity * data.purchase_percent) / 10000);
        if (data.cost === undefined) data.cost = null;
        delete data.purchase_percent;
        if (data.kind === 'Capital One credit') {
          if (!data.profile_id)
            throw new Error('Choose the Cap1 account profile that holds this credit');
        } else {
          delete data.profile_id;
        }
        if (/point|mile/i.test(String(data.kind || ''))) {
          const src = normalizePointsBatchSource(vals.points_source ?? data.points_source);
          if (vals.points_source && !src)
            throw new Error('Points batch source must be purchase, transfer with bonus, or sold on');
          if (src) data.points_source = src;
          else delete data.points_source;
        } else {
          delete data.points_source;
        }
      }
      if (config.kind === 'trade') {
        const what = resolveTradeWhat(vals.what, vals.what_custom);
        if (!what) throw new Error('Enter the new trade kind name (or pick a listed What)');
        const unit = tradeUnit(what);
        const rawAmount = vals.amount;
        const amount_units =
          unit === 'money'
            ? decimalUnits(rawAmount)
            : decimalUnits(rawAmount, true);
        const price_cents = decimalUnits(vals.price);
        data.amount_units = amount_units;
        data.price_cents = price_cents;
        data.side = vals.side;
        data.what = what;
        data.stock_mode = vals.stock_mode || TRADE_DEFAULT_STOCK_MODE;
        data.counterparty_id = vals.counterparty_id || null;
        data.asset_id = vals.asset_id || null;
        data.booking_id = vals.booking_id || null;
        data.notes = vals.notes || '';
        data.reference = vals.reference || '';
        data.paid = vals.paid === true;
        data.method = vals.method || 'Zelle';
        data.status = (TRADE_STATUSES as readonly string[]).includes(String(vals.status || ''))
          ? (String(vals.status) as TradeStatus)
          : suggestTradeStatus({
              side: vals.side,
              paid: vals.paid === true,
              to_complete: tradeToComplete({
                side: vals.side,
                stock_mode: vals.stock_mode || TRADE_DEFAULT_STOCK_MODE,
                booking_id: vals.booking_id,
                counterparty_id: vals.counterparty_id,
                asset_id: vals.asset_id,
                expires_on: vals.expires_on,
                what: what,
              }),
            });
        delete data.amount;
        delete data.price;
        delete data.what_custom;
      }
      if (config.kind === 'sell_asset') {
        if (data.proceeds === undefined && data.sale_percent !== undefined)
          data.proceeds = Math.round((data.quantity * data.sale_percent) / 10000);
        if (data.proceeds === undefined) throw new Error('Enter sale proceeds or percentage');
        delete data.sale_percent;
      }
      if (config.kind === 'booking') {
        data.confirmations = parseList(vals.confirmations);
        data.traveler_ids = vals.traveler_ids ?? [];
        data.sale ??= 0;
        if (initialPayment) {
          const method = resolvePaymentMethod(
            initialPayment.method,
            initialPayment.method_custom,
          );
          if (
            (initialPayment.method === PAYMENT_METHOD_OTHER ||
              initialPayment.method === 'Other') &&
            !method
          )
            throw new Error('Enter the new payment method name');
          const { method_custom: _mc, ...paymentRest } = initialPayment;
          data.customer_payment = {
            ...paymentRest,
            method: method || initialPayment.method,
            amount: decimalUnits(initialPayment.amount),
            account_id: initialPayment.account_id || undefined,
            allocate_to_booking: allowed('edit_customer_charges'),
          };
        }
        if (travelRows.length) {
          data.travel_components_input = travelRows.map((row) => ({
            product: row.product,
            summary: row.summary || `${data.summary} · ${row.product}`,
            provider_id: row.provider_id || undefined,
            acquisition_source_id: row.acquisition_source_id || undefined,
            channel: row.channel || 'Unknown',
            travel_start: row.travel_start || vals.travel_start,
            travel_end: row.travel_end || vals.travel_end,
            details: {
              confirmations: parseList(row.confirmations),
              ...(row.product === 'Hotel'
                ? { hotel: row.route || undefined }
                : { route: row.route || undefined }),
            },
          }));
          data.travel_start = data.travel_components_input.map((t: R) => t.travel_start).sort()[0];
          data.travel_end = data.travel_components_input
            .map((t: R) => t.travel_end)
            .sort()
            .at(-1);
          data.channel = 'Mixed components';
        }
        data.funding = funding.map((row) => {
          const asset = state.assets.find((a: R) => a.id === row.asset_id);
          const owned = asset && asset.ownership !== 'External';
          return {
            ...row,
            travel_index:
              travelRows.length && row.travel_index !== undefined && row.travel_index !== ''
                ? Number(row.travel_index)
                : undefined,
            asset_id: row.asset_id || undefined,
            seller_id: row.seller_id || undefined,
            account_id: row.account_id || undefined,
            face_amount: decimalUnits(
              row.face_amount || row.cost,
              asset && assetUnit(asset) !== 'money',
            ),
            unit: asset?.unit || undefined,
            cost: owned ? undefined : decimalUnits(row.cost),
            settled: owned ? false : !!row.settled,
          };
        });
      }
      if (config.kind === 'revise') {
        data.confirmations = parseList(vals.confirmations);
        data.traveler_ids = vals.traveler_ids ?? [];
        if (vals.product === 'Flight' && tripType === 'One Way') {
          data.travel_end = data.travel_start;
        }
      }
      if (config.kind === 'booking')
        data.create_initial_travel =
          !travelRows.length &&
          !!state.fulfillmentEnabled &&
          !['Flight + Hotel', 'Package'].includes(data.product);
      if (['party', 'edit_party'].includes(config.kind)) {
        if (config.kind === 'party') data.kind = vals.kind;
        data.roles = parseList(vals.roles);
        if (
          config.defaults.entry_context === 'Suppliers' &&
          !data.roles.includes('supplier')
        ) {
          data.roles = ['supplier', ...data.roles];
        }
        data.details = {
          ...(config.defaults.details ?? {}),
          whatsapp: vals.whatsapp ?? config.defaults.details?.whatsapp ?? '',
          ...(config.defaults.entry_context === 'Sources & Brokers' ||
          config.defaults.details?.source_offerings
            ? { source_offerings: parseList(vals.source_offerings) }
            : {}),
          relationship_notes:
            vals.relationship_notes ?? config.defaults.details?.relationship_notes ?? '',
        };
        if ((vals.kind ?? config.defaults.kind) === 'company')
          data.details.corporate_policy = {
            ...(config.defaults.details?.corporate_policy ?? {}),
            tier: vals.company_tier || null,
            comfort_level: vals.company_comfort_level || null,
          };
        if (data.roles.includes('referrer')) {
          data.details.referral_rate_bps =
            vals.referral_rate_bps === '' || vals.referral_rate_bps == null
              ? null
              : data.referral_rate_bps;
        } else if ('referral_rate_bps' in (data.details ?? {})) {
          // Keep stored rate if role removed — staff can clear explicitly while still a referrer.
        }
        if (config.kind === 'edit_party') {
          const existing = partyStandingDeals({ details: config.defaults.details });
          const rate =
            vals.standing_deal_rate_bps === '' || vals.standing_deal_rate_bps == null
              ? null
              : Number(data.standing_deal_rate_bps);
          const label = String(vals.standing_deal_label || '').trim();
          data.details.standing_deals = upsertPrimaryStandingDeal(
            existing,
            rate == null || !label
              ? null
              : {
                  label,
                  rate_bps: rate,
                  basis: (STANDING_DEAL_BASES as readonly string[]).includes(
                    vals.standing_deal_basis,
                  )
                    ? (vals.standing_deal_basis as StandingDealBasis)
                    : 'sale_ex_tax',
                  product: (STANDING_DEAL_PRODUCTS as readonly string[]).includes(
                    vals.standing_deal_product,
                  )
                    ? (vals.standing_deal_product as StandingDealProduct)
                    : 'Hotel',
                },
          );
        }
        delete data.source_offerings;
        delete data.whatsapp;
        delete data.relationship_notes;
        delete data.company_tier;
        delete data.company_comfort_level;
        delete data.referral_rate_bps;
        delete data.standing_deal_label;
        delete data.standing_deal_rate_bps;
        delete data.standing_deal_basis;
        delete data.standing_deal_product;
      }
      if (config.kind === 'review_resolution') {
        delete data.source_link;
        delete data.destination_id;
      }
      if (config.kind === 'edit_party') {
        data.details = {
          ...data.details,
          travel_rules: vals.travel_rules ?? '',
        };
        delete data.travel_rules;
      }
      if (config.kind === 'payment') {
        if (!['customer', 'supplier', 'commission'].includes(data.direction))
          throw new Error(
            'Use the dedicated workflow for refunds, referrals, and asset sales to retain accounting links.',
          );
        const target = data.direction === 'commission' ? 'commission_id' : 'booking_id';
        const allocations = allocs.map((a) => {
          if (!a[target]) throw new Error('Select a linked record for each allocation');
          return {
            [target]: a[target],
            amount: decimalUnits(a.amount),
            ...(data.direction === 'supplier' ? { obligation_id: a.obligation_id || null } : {}),
          };
        });
        if (
          new Set(allocations.map((a: R) => `${a[target]}:${a.obligation_id ?? ''}`)).size !==
          allocations.length
        )
          throw new Error('Combine allocations to the same record into one amount');
        if (allocations.reduce((sum: number, a: R) => sum + a.amount, 0) > data.amount)
          throw new Error('Allocations cannot exceed the payment amount');
        data.allocations = data.direction === 'commission' ? [] : allocations;
        data.commission_allocations = data.direction === 'commission' ? allocations : [];
      }
      if (config.kind === 'traveler') {
        const loyaltyProgram = resolveLoyaltyProgram(
          vals.loyalty_program,
          vals.loyalty_program_custom,
        );
        if (Boolean(loyaltyProgram) !== Boolean(vals.loyalty_number))
          throw new Error('Enter both the loyalty program and membership number');
        if (
          (vals.loyalty_program === LOYALTY_PROGRAM_OTHER || vals.loyalty_program === 'Other') &&
          !loyaltyProgram
        )
          throw new Error('Enter the new loyalty program name');
        data.preferences = {
          ...(config.defaults.preferences ?? {}),
          seat: vals.seat ?? '',
          sex: vals.sex ?? '',
          nationality: vals.nationality ?? '',
          redress: vals.redress ?? '',
        };
        delete data.sex;
        delete data.nationality;
        delete data.redress;
        data.memberships = (vals.memberships ?? config.defaults.memberships ?? []).map((row: R) => {
          const program = resolveLoyaltyProgram(row.program, row.program_custom);
          if (!program && (row.program || row.number))
            throw new Error('Enter the loyalty program name for each membership');
          const { program_custom: _pc, ...rest } = row;
          return { ...rest, program };
        });
        data.documents = (vals.documents ?? config.defaults.documents ?? []).map((row: R) => ({
          ...row,
          expires_on: row.expires_on || undefined,
        }));
        if (vals.passport_number) {
          if (!vals.passport_country) throw new Error('Enter the passport issuing country');
          data.documents = [
            ...data.documents,
            {
              type: 'passport',
              number: vals.passport_number,
              country: vals.passport_country,
              ...(vals.passport_expiry ? { expires_on: vals.passport_expiry } : {}),
            },
          ];
        }
        delete data.passport_number;
        delete data.passport_country;
        delete data.passport_expiry;
        if (loyaltyProgram && vals.loyalty_number)
          data.memberships = [
            ...data.memberships,
            { program: loyaltyProgram, number: vals.loyalty_number },
          ];
        data.memberships = [
          ...new Map(data.memberships.map((r: R) => [`${r.program}\u0000${r.number}`, r])).values(),
        ];
        data.documents = [
          ...new Map(
            data.documents.map((r: R) => [`${r.type}\u0000${r.country}\u0000${r.number}`, r]),
          ).values(),
        ];
        delete data.seat;
        delete data.loyalty_program;
        delete data.loyalty_program_custom;
        delete data.loyalty_number;
      }
      if (config.kind === 'receive_refund' && data.new_asset_name) {
        data.new_asset = {
          name: data.new_asset_name,
          issuer: data.new_asset_issuer ?? 'Supplier',
          ...(data.new_asset_expiry ? { expires_on: data.new_asset_expiry } : {}),
        };
      }
      delete data.new_asset_name;
      delete data.new_asset_issuer;
      delete data.new_asset_expiry;
      if (['booking', 'revise'].includes(config.kind) && data.travel_end < data.travel_start)
        throw new Error('Travel end cannot be before travel start');
      if (['booking', 'revise'].includes(config.kind)) {
        data.itinerary = { ...(config.defaults.itinerary ?? {}) };
        for (const key of itineraryEntryKeys) {
          const value = vals[key];
          if (key === 'flight_numbers' || key === 'ticket_numbers')
            data.itinerary[key] = parseList(value);
          else if (value) data.itinerary[key] = value;
          else delete data.itinerary[key];
          delete data[key];
        }
        data.itinerary.cost_status =
          vals.cost_status ||
          config.defaults.itinerary?.cost_status ||
          (config.kind === 'booking' ? (funding.length ? 'Confirmed' : 'Pending') : undefined);
        if (config.kind === 'revise') {
          if (vals.product === 'Flight' && tripType === 'One Way')
            data.itinerary.end_date_known = false;
          if (data.reservation_status) {
            const stored = toStoredReservationStatus(String(data.reservation_status));
            if (stored) data.reservation_status = stored;
          }
          if (vals.reservation_status === 'Held') {
            if (!vals.ticketing_deadline)
              throw new Error('Held PNR requires a ticketing deadline date');
            data.itinerary.ticketing_deadline = vals.ticketing_deadline;
          } else if (vals.ticketing_deadline) {
            data.itinerary.ticketing_deadline = vals.ticketing_deadline;
          }
          if (config.defaults.itinerary?.summary_generated) {
            const generated = !advanced || vals.summary === config.defaults.summary;
            data.summary = generated ? travelDerived.summary : vals.summary;
            data.itinerary.summary_generated = generated;
            if (config.defaults.itinerary.reservation_summary_generated)
              data.itinerary.reservation_summary = data.summary;
          }
        }
        delete data.cost_status;
        delete data.ticketing_deadline;
      }
      await onSubmit(data);
    } catch (err) {
      const message = (err as Error).message || 'Unable to save';
      const knownKeys = defs.map((f) => f.key);
      const mapped = mapErrorMessageToFields(message, knownKeys);
      setFieldErrors(mapped.fieldErrors);
      setError(mapped.leftover || (Object.keys(mapped.fieldErrors).length ? '' : message));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!attempted || !dialog.current) return;
    const firstField = dialog.current.querySelector<HTMLElement>('.form-field.has-error');
    const banner = dialog.current.querySelector<HTMLElement>('.form-alert');
    const target = firstField || (error ? banner : null);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = firstField?.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus?.({ preventScroll: true });
  }, [attempted, fieldErrors, error]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const fn = (e: KeyboardEvent) => {
      if (!dialog.current) return;
      if (e.key === 'Escape' && !busyRef.current) closeRef.current();
      if (e.key === 'Tab') {
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)',
          ) ?? [],
        ).filter((el) => el.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
      previous?.focus();
    };
  }, []);
  if (inlineCreation && onInlineCommand)
    return (
      <CommandForm
        config={{ kind: inlineCreation.kind, defaults: inlineCreation.defaults }}
        state={state}
        onCreateParty={onCreateParty}
        onInlineCommand={onInlineCommand}
        onClose={() => setInlineCreation(null)}
        onSubmit={async (data) => {
          const result = await onInlineCommand(inlineCreation.kind, data, creationKey.current);
          if (inlineCreation.target.startsWith('funding:')) {
            const index = Number(inlineCreation.target.split(':')[1]);
            setFunding((rows) =>
              rows.map((row, i) => (i === index ? { ...row, seller_id: result.id } : row)),
            );
          } else if (inlineCreation.target.startsWith('travel:')) {
            const [, index, field] = inlineCreation.target.split(':');
            setTravelRows((rows) =>
              rows.map((row, i) => (i === Number(index) ? { ...row, [field]: result.id } : row)),
            );
          } else {
            change(inlineCreation.target, result.id);
            // The parent catalog refresh may not have rendered yet. Use the
            // created record's returned metadata instead of the old choices.
            if (inlineCreation.kind === 'instrument')
              setVals((v) => ({
                ...v,
                unit: result.unit ?? data.unit,
                role: (result.role ?? data.role) === 'Ancillary' ? 'Ancillary' : 'Core',
                ...(config.kind === 'acquire_asset' ? { kind: result.name ?? data.name } : {}),
              }));
          }
          setInlineCreation(null);
        }}
      />
    );
  if (creatingAsset && onInlineCommand)
    return (
      <CommandForm
        config={{
          kind: 'acquire_asset',
          defaults: {
            ownership: vals.mode === 'Outside source' ? 'Customer' : 'Padova',
            instrument_id: vals.instrument_id,
            unit: vals.unit,
            program_account_id: vals.program_account_id,
            kind: state.instruments?.find((i: R) => i.id === vals.instrument_id)?.name ?? 'Voucher',
            issuer:
              state.programs?.find(
                (p: R) =>
                  p.id ===
                  state.instruments?.find((i: R) => i.id === vals.instrument_id)?.program_id,
              )?.name ?? '',
          },
        }}
        state={state}
        onCreateParty={onCreateParty}
        onInlineCommand={onInlineCommand}
        onClose={() => setCreatingAsset(false)}
        onSubmit={async (data) => {
          const result = await onInlineCommand('acquire_asset', data, creationKey.current);
          if (fundingAssetRow.current !== null) {
            const index = fundingAssetRow.current;
            setFunding((rows) =>
              rows.map((row, i) => (i === index ? { ...row, asset_id: result.id } : row)),
            );
            fundingAssetRow.current = null;
          } else change('asset_id', result.id);
          setCreatingAsset(false);
        }}
      />
    );
  if (creating && onCreateParty)
    return (
      <CommandForm
        config={{
          kind: 'party',
          defaults: { roles: [creating] },
        }}
        state={state}
        onClose={() => setCreating('')}
        onSubmit={async (data) => {
          if (creating === 'traveler' && data.kind !== 'person')
            throw new Error('A traveler must be a person');
          const result = await onCreateParty(data, creationKey.current);
          if (creating === 'traveler')
            change('traveler_ids', [...(vals.traveler_ids ?? []), result.id]);
          else
            change(
              creating === 'seller'
                ? ['fulfill', 'revise_fulfillment'].includes(config.kind)
                  ? 'source_id'
                  : 'acquisition_source_id'
                : 'customer_id',
              result.id,
            );
          setCreating('');
        }}
      />
    );
  const optionalKeys = new Set(
    ['party', 'edit_party'].includes(config.kind)
      ? ['relationship_notes', 'company_tier', 'company_comfort_level', 'travel_rules']
      : config.kind === 'traveler'
        ? [...TRAVELER_PERSONAL_OPTIONAL_KEYS]
        : config.kind === 'trade'
          ? ['expires_on', 'notes', 'reference']
          : [
                'payment',
                'fund',
                'charge',
                'authorize_payer',
                'commission',
                'referral',
                'note',
                'cancel',
                'voucherize',
                'booking_source_profile_link',
                'price_match_event',
                'benefit',
              ].includes(config.kind)
            ? ['reference', 'expires_on', 'external_reference']
            : [],
  );
  const renderFields = (items: typeof defs) => (
    <>
      {[...items]
        .sort((a, b) =>
          config.kind === 'party'
            ? (['kind', 'name', 'source_offerings', 'roles', 'email', 'phone', 'whatsapp'].indexOf(
                a.key,
              ) < 0
                ? 99
                : [
                    'kind',
                    'name',
                    'source_offerings',
                    'roles',
                    'email',
                    'phone',
                    'whatsapp',
                  ].indexOf(a.key)) -
              (['kind', 'name', 'source_offerings', 'roles', 'email', 'phone', 'whatsapp'].indexOf(
                b.key,
              ) < 0
                ? 99
                : [
                    'kind',
                    'name',
                    'source_offerings',
                    'roles',
                    'email',
                    'phone',
                    'whatsapp',
                  ].indexOf(b.key))
            : 0,
        )
        .map((f, i) => (
          <div
            className={`form-field ${f.full ? 'full' : ''} ${f.type === 'checkbox' ? 'inline-checkbox-field' : ''} ${
              config.kind === 'fund' &&
              f.key === 'kind' &&
              !['Voucher', 'Airline credit', 'Hotel credit', 'Capital One credit', 'Gift card', 'Points'].includes(
                String(vals.kind ?? ''),
              )
                ? 'fund-kind-alone'
                : ''
            } ${attempted && fieldErrors[f.key] ? 'has-error' : ''}`}
            key={f.key}
          >
            {f.type !== 'checkbox' && (
            <label htmlFor={`f-${f.key}`}>
              {f.key === 'allocations' && vals.direction === 'commission'
                ? 'Allocate to commission receivables'
                : f.label}
              {f.required ? <ReqMark /> : ''}
            </label>
            )}
            {config.kind === 'booking' && f.key === 'customer_id' && onCreateParty && (
              <button type="button" className="btn" onClick={() => createInline('customer')}>
                Create customer without leaving booking
              </button>
            )}
            {config.kind === 'booking' && f.key === 'traveler_ids' && onCreateParty && (
              <button type="button" className="btn" onClick={() => createInline('traveler')}>
                Create traveler without leaving booking
              </button>
            )}
            {['booking', 'revise', 'travel_component', 'fulfill', 'revise_fulfillment'].includes(
              config.kind,
            ) &&
              ['acquisition_source_id', 'source_id'].includes(f.key) &&
              onCreateParty && (
                <button className="btn" type="button" onClick={() => createInline('seller')}>
                  New seller / one-off contact
                </button>
              )}
            {['fulfill', 'revise_fulfillment'].includes(config.kind) &&
              f.key === 'asset_id' &&
              onInlineCommand &&
              allowed('manage_assets') && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    creationKey.current = crypto.randomUUID();
                    fundingAssetRow.current = null;
                    setCreatingAsset(true);
                  }}
                >
                  {vals.mode === 'Outside source'
                    ? 'Add customer-owned credit, then return'
                    : 'Add owned points / credit / certificate, then return'}
                </button>
              )}
            {config.kind === 'booking_source_profile' && f.key === 'holder_id' ? (
              <BookingPartySelect
                id="f-holder_id"
                label="Contact / account owner (optional)"
                role="contact"
                value={vals.holder_id ?? ''}
                initial={[...newContacts, ...state.parties]
                  .filter(eligibleProfileContact)
                  .filter(
                    (p: R) =>
                      p.id === vals.holder_id ||
                      (config.defaults.booking_contact_ids ?? []).includes(p.id) ||
                      p.roles?.includes('contact') ||
                      state.bookingSourceProfiles?.some(
                        (profile: R) =>
                          profile.holder_id === p.id &&
                          profile.source_method_id === config.defaults.source_method_id,
                      ),
                  )
                  .sort(
                    (a: R, b: R) =>
                      Number((config.defaults.booking_contact_ids ?? []).includes(b.id)) -
                      Number((config.defaults.booking_contact_ids ?? []).includes(a.id)),
                  )}
                onChange={(id) => change('holder_id', id)}
                onCreate={
                  onInlineCommand
                    ? async (name, key) => {
                        const data = { name, kind: 'person', roles: ['contact'] };
                        const result = await onInlineCommand('party', data, key);
                        const row = { ...data, ...result };
                        setNewContacts((old) => [...old, row]);
                        return row;
                      }
                    : undefined
                }
              />
            ) : f.type === 'products' ? (
              <div className="product-choices" role="group" aria-label="Used for">
                {['Flight', 'Hotel', 'Car', 'Other'].map((product) => {
                  const selected = Array.isArray(vals.products)
                    ? vals.products
                    : parseList(vals.products ?? '');
                  return (
                    <button
                      type="button"
                      key={product}
                      className={`btn ${selected.includes(product) ? 'selected' : ''}`}
                      aria-pressed={selected.includes(product)}
                      onClick={() =>
                        change(
                          'products',
                          selected.includes(product)
                            ? selected.filter((p: string) => p !== product)
                            : [...selected, product],
                        )
                      }
                    >
                      {product}
                    </button>
                  );
                })}
              </div>
            ) : f.type === 'multi_choice' ||
              (config.kind === 'party' &&
                f.key === 'kind' &&
                !['family', 'partner', 'supplier'].includes(config.defaults.kind)) ||
              (config.kind === 'payment' && f.key === 'direction') ? (
              <div className="role-choices" role="group" aria-label={f.label}>
                {options(f).map((o: any) => (
                  <button
                    type="button"
                    key={o.value}
                    className={`btn small role-choice ${
                      f.type === 'multi_choice'
                        ? parseList(vals[f.key]).includes(o.value)
                          ? 'selected'
                          : ''
                        : vals[f.key] === o.value
                          ? 'selected'
                          : ''
                    }`}
                    aria-pressed={
                      f.type === 'multi_choice'
                        ? parseList(vals[f.key]).includes(o.value)
                        : vals[f.key] === o.value
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      change(
                        f.key,
                        f.type === 'multi_choice'
                          ? parseList(vals[f.key]).includes(o.value)
                            ? parseList(vals[f.key]).filter((v) => v !== o.value)
                            : [...parseList(vals[f.key]), o.value]
                          : o.value,
                      );
                    }}
                  >
                    {(
                      {
                        person: 'Person',
                        company: 'Organization',
                        customer: 'Customer paid Padova',
                        supplier: 'Padova paid seller',
                        commission: 'Commission received',
                      } as R
                    )[o.value] || o.label}
                  </button>
                ))}
              </div>
            ) : f.type === 'select' && f.source ? (
              <SearchableSelect
                id={`f-${f.key}`}
                options={options(f)}
                value={vals[f.key] ?? ''}
                required={f.required}
                autoFocus={defs[0]?.key === f.key}
                onChange={(v) => change(f.key, v)}
              />
            ) : f.type === 'choice' ? (
              <ChoiceInput
                id={`f-${f.key}`}
                label={f.label}
                options={
                  f.key === 'issuer' || f.key === 'loyalty_program'
                    ? mergeLoyaltyProgramOptions([
                        ...(state.programs ?? []).map((p: R) => p.name),
                        ...(state.assets ?? []).map((a: R) => a.issuer),
                        ...state.parties
                          .filter(
                            (p: R) =>
                              p.kind === 'supplier' || (p.roles ?? []).includes('supplier'),
                          )
                          .map((p: R) => p.name),
                      ])
                    : config.kind === 'acquire_asset' && f.key === 'kind'
                      ? [
                          ...new Set([
                            ...(f.options ?? []),
                            ...(state.instruments ?? []).map((i: R) => i.name),
                          ]),
                        ]
                      : config.kind === 'trade' && f.key === 'what'
                        ? mergeTradeWhatOptions([
                            ...(state.assets ?? []).map((a: R) => a.kind),
                            ...(state.instruments ?? []).map((i: R) => i.name),
                          ])
                        : ['method', 'payment_method', 'fee_payment_method'].includes(f.key)
                          ? mergePaymentMethodOptions([
                              ...(state.payments ?? []).map((p: R) => p.method),
                              ...(state.referralPayments ?? []).map((p: R) => p.method),
                            ])
                          : f.key === 'expiry_rule'
                            ? mergeExpiryRuleOptions(
                                (state.assets ?? []).map((a: R) =>
                                  parseExpiryRuleFromRestrictions(a.restrictions),
                                ),
                              )
                            : (f.options ?? [])
                }
                required={f.required}
                autoFocus={defs[0]?.key === f.key}
                value={vals[f.key] ?? ''}
                onChange={(v) => change(f.key, v)}
              />
            ) : f.type === 'roles' ? (
              config.defaults.entry_context === 'Suppliers' ? (
                <div className="roles-supplier-flow">
                  <div className="roles-step">
                    <p className="roles-step-title">1. Contact type</p>
                    <p className="roles-step-copy">
                      This contact is a <strong>Supplier</strong> — someone Padova buys travel from
                      (airline, hotel, car rental, or similar).
                    </p>
                    <span className="role-choice selected role-locked">Supplier</span>
                  </div>
                  <div className="roles-step">
                    <p className="roles-step-title">2. What do they provide?</p>
                    <p className="roles-step-copy">
                      Pick every type that fits. You can leave this blank if you are not sure yet.
                    </p>
                    <div className="role-choices" role="group" aria-label="Supply types">
                      {[
                        ['airline', 'Airline'],
                        ['property', 'Hotel'],
                        ['rental', 'Car rental'],
                      ].map(([key, label]) => {
                        const roles = parseList(vals.roles).map((r) => r.toLowerCase());
                        const on = roles.includes(key);
                        return (
                          <button
                            type="button"
                            key={key}
                            className={`btn small role-choice ${on ? 'selected' : ''}`}
                            aria-pressed={on}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const current = parseList(vals.roles);
                              const next = on
                                ? current.filter((r) => r.toLowerCase() !== key)
                                : [...current, key];
                              if (!next.some((r) => r.toLowerCase() === 'supplier')) {
                                next.push('supplier');
                              }
                              change('roles', [...new Set(next)]);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="roles-step">
                    <p className="roles-step-title">3. Also use this contact as… (optional)</p>
                    <p className="roles-step-copy">
                      Only if the same company is also a customer, seller, partner, etc.
                    </p>
                    <RolesInput
                      value={vals[f.key]}
                      lockedRoles={['supplier']}
                      omitRoles={['airline', 'property', 'rental']}
                      showLockedChips={false}
                      onChange={(v) => {
                        const next = parseList(v);
                        if (!next.some((r) => r.toLowerCase() === 'supplier')) {
                          next.unshift('supplier');
                        }
                        change(f.key, next);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <RolesInput
                  value={vals[f.key]}
                  onChange={(v) => change(f.key, v)}
                  help={
                    f.help ||
                    'One contact can have several roles (traveler, payer, seller, referrer).'
                  }
                />
              )
            ) : f.type === 'select' ? (
              <select
                id={`f-${f.key}`}
                autoFocus={defs[0]?.key === f.key}
                required={f.required}
                value={vals[f.key] ?? ''}
                onChange={(e) => {
                  change(f.key, e.target.value);
                  if (
                    config.kind === 'booking' &&
                    f.key === 'product' &&
                    !travelRows.length &&
                    ['Flight + Hotel', 'Package'].includes(e.target.value)
                  )
                    setTravelRows(
                      e.target.value === 'Flight + Hotel'
                        ? [{ product: 'Flight' }, { product: 'Hotel' }]
                        : [{ product: 'Other' }],
                    );
                }}
              >
                <option value="">Select…</option>
                {options(f).map((o: any) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                id={`f-${f.key}`}
                rows={3}
                required={f.required}
                value={vals[f.key] ?? ''}
                onChange={(e) => change(f.key, e.target.value)}
              />
            ) : f.type === 'checkbox' ? (
              <label className="check-card" htmlFor={`f-${f.key}`}>
                <input
                  id={`f-${f.key}`}
                  type="checkbox"
                  checked={Boolean(vals[f.key])}
                  onChange={(e) => change(f.key, e.target.checked)}
                />
                <span className="check-card-body">
                  <span className="check-card-title">
                    {f.key === 'allocations' && vals.direction === 'commission'
                      ? 'Allocate to commission receivables'
                      : f.label}
                  </span>
                  {f.help ? <small>{f.help}</small> : null}
                </span>
              </label>
            ) : f.type === 'travelers' ? (
              <div>
                <input
                  id={`f-${f.key}`}
                  type="search"
                  placeholder="Search saved travelers…"
                  value={travelerSearch}
                  onChange={(e) => setTravelerSearch(e.target.value)}
                />
                <small>
                  {countLabel((vals.traveler_ids ?? []).length, 'traveler')} selected
                </small>
                <small>
                  Search by name to add travelers. Selected people stay visible; showing up to 20
                  matches.
                </small>
                <div className="entry-checks traveler-choices">
                  {state.parties
                    .filter(
                      (p: R) =>
                        p.kind === 'person' &&
                        ((vals.traveler_ids ?? []).includes(p.id) ||
                          (travelerSearch.trim().length > 0 &&
                            p.name.toLowerCase().includes(travelerSearch.trim().toLowerCase()))),
                    )
                    .sort(
                      (a: R, b: R) =>
                        Number((vals.traveler_ids ?? []).includes(b.id)) -
                        Number((vals.traveler_ids ?? []).includes(a.id)),
                    )
                    .slice(0, Math.max(20, (vals.traveler_ids ?? []).length))
                    .map((p: R) => (
                      <label
                        key={p.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontWeight: 400,
                        }}
                      >
                        <input
                          style={{ width: 15 }}
                          type="checkbox"
                          checked={(vals.traveler_ids ?? []).includes(p.id)}
                          onChange={(e) =>
                            change(
                              'traveler_ids',
                              e.target.checked
                                ? [...(vals.traveler_ids ?? []), p.id]
                                : (vals.traveler_ids ?? []).filter((x: string) => x !== p.id),
                            )
                          }
                        />
                        {p.name}
                      </label>
                    ))}
                </div>
                {!state.parties.some((p: R) => p.kind === 'person') && (
                  <small>Add a person in People first, then select them here.</small>
                )}
              </div>
            ) : f.type === 'allocations' ? (
              <div>
                {allocs.map((a, index) => (
                  <div className="allocation-row" key={index}>
                    <SearchableSelect
                      id={`allocation-${index}-booking`}
                      label={`Allocation ${index + 1} ${vals.direction === 'commission' ? 'commission' : 'booking'}`}
                      required
                      value={
                        (vals.direction === 'commission' ? a.commission_id : a.booking_id) ?? ''
                      }
                      options={
                        vals.direction === 'commission'
                          ? (state.commissions ?? [])
                              .filter((c: R) =>
                                c.collector_id
                                  ? c.collector_id === vals.party_id
                                  : c.payer_id === vals.party_id,
                              )
                              .map((c: R) => ({
                                value: c.id,
                                label: `${c.code} · ${c.payer} · net ${money(Number(c.gross) - Number(c.retained))} · received ${money(c.received)}`,
                              }))
                          : state.bookings.map((b: R) => ({
                              value: b.id,
                              label: `${b.code} · ${b.customer} · ${b.summary}`,
                            }))
                      }
                      onChange={(record_id) =>
                        setAllocs((v) =>
                          v.map((x, j) =>
                            j === index
                              ? {
                                  ...x,
                                  obligation_id: '',
                                  [vals.direction === 'commission'
                                    ? 'commission_id'
                                    : 'booking_id']: record_id,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    {vals.direction === 'supplier' && (
                      <SearchableSelect
                        id={`allocation-${index}-obligation`}
                        label={`Allocation ${index + 1} exact seller obligation`}
                        value={a.obligation_id ?? ''}
                        options={(state.sellerObligations ?? [])
                          .filter(
                            (o: R) =>
                              o.booking_id === a.booking_id && o.supplier_id === vals.party_id,
                          )
                          .map((o: R) => ({
                            value: o.id,
                            label: `${state.parties?.find((p: R) => p.id === o.supplier_id)?.name ?? 'Seller'} · ${state.bookings?.find((b: R) => b.id === o.booking_id)?.code ?? ''} · ${o.description} · remaining ${money(o.exact_remaining ?? o.amount)}`,
                          }))}
                        onChange={(obligation_id) =>
                          setAllocs((v) =>
                            v.map((x, j) => (j === index ? { ...x, obligation_id } : x)),
                          )
                        }
                      />
                    )}
                    <input
                      aria-label={`Allocation ${index + 1} amount`}
                      placeholder="USD amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      required
                      value={a.amount}
                      onChange={(e) =>
                        setAllocs((v) =>
                          v.map((x, j) =>
                            j === index ? { ...x, amount: e.target.value, manual_amount: true } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remove allocation"
                      onClick={() => setAllocs((v) => v.filter((_, j) => j !== index))}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  className="btn small"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() =>
                    setAllocs((v) => [
                      ...v,
                      vals.direction === 'commission'
                        ? { commission_id: '', amount: '' }
                        : { booking_id: '', amount: '' },
                    ])
                  }
                >
                  <Plus size={12} />
                  Add allocation
                </button>
                <small>
                  {vals.direction === 'commission'
                    ? 'Unallocated remittance remains available for commission receivables.'
                    : vals.direction === 'supplier'
                      ? 'Unallocated supplier payments remain available for obligations to the same payee.'
                      : 'Unallocated customer receipts remain available as customer credit.'}
                </small>
                <small>
                  Allocated:{' '}
                  {money(allocs.reduce((sum, a) => sum + (Number(a.amount) || 0) * 100, 0))} ·
                  Payment: {vals.amount ? money(Number(vals.amount) * 100) : 'enter amount'}
                </small>
              </div>
            ) : (
              <input
                id={`f-${f.key}`}
                autoFocus={defs[0]?.key === f.key}
                type={
                  ['date', 'datetime-local', 'email', 'tel'].includes(f.type ?? '')
                    ? f.type
                    : ['money', 'signed_money', 'quantity', 'percent', 'integer'].includes(
                          f.type ?? '',
                        )
                      ? 'number'
                      : 'text'
                }
                step={
                  f.type === 'integer' || wholeQuantity(f)
                    ? '1'
                    : ['money', 'signed_money', 'quantity', 'percent'].includes(f.type ?? '')
                      ? '0.01'
                      : undefined
                }
                min={
                  f.type === 'date' && f.key === 'travel_end'
                    ? vals.travel_start
                    : ['money', 'quantity', 'percent', 'integer'].includes(f.type ?? '')
                      ? '0'
                      : undefined
                }
                max={f.key === 'dob' ? state.today : undefined}
                pattern={f.pattern}
                maxLength={f.maxLength}
                inputMode={
                  f.key === 'last_four' || f.type === 'integer' || wholeQuantity(f)
                    ? 'numeric'
                    : ['money', 'signed_money', 'percent', 'quantity'].includes(f.type ?? '')
                      ? 'decimal'
                      : undefined
                }
                required={f.required}
                value={vals[f.key] ?? ''}
                onInput={(e) => {
                  if (['date', 'datetime-local'].includes(f.type ?? ''))
                    change(f.key, e.currentTarget.value);
                }}
                onChange={(e) => change(f.key, e.target.value)}
              />
            )}{' '}
            {f.type === 'select' &&
              !(config.kind === 'booking_source_profile' && f.key === 'holder_id') &&
              onInlineCommand &&
              ['parties', 'programs', 'instruments', 'programAccounts'].includes(f.source ?? '') &&
              !(config.kind === 'booking' && f.key === 'customer_id') &&
              !(
                ['booking', 'revise', 'travel_component', 'fulfill', 'revise_fulfillment'].includes(
                  config.kind,
                ) && ['acquisition_source_id', 'source_id'].includes(f.key)
              ) &&
              allowed(f.source === 'parties' ? 'operations' : 'manage_settings') && (
                <button
                  className="btn small form-inline-add"
                  type="button"
                  onClick={() => {
                    creationKey.current = crypto.randomUUID();
                    const kind =
                      f.source === 'parties'
                        ? 'party'
                        : f.source === 'programs'
                          ? 'program'
                          : f.source === 'instruments'
                            ? 'instrument'
                            : 'program_account';
                    // Plan: new payer/referrer from Authorize / Money Back / payment
                    // without closing — seed roles so the contact is usable immediately.
                    const partySeed =
                      kind === 'party'
                        ? inlinePartyCreateDefaults({
                            fieldKey: f.key,
                            commandKind: config.kind,
                            paymentDirection: vals.direction,
                          })
                        : null;
                    setInlineCreation({
                      kind,
                      target: f.key,
                      defaults:
                        kind === 'party' && partySeed
                          ? {
                              kind: partySeed.kind,
                              roles: partySeed.roles,
                            }
                          : kind === 'program'
                            ? { category: 'Other' }
                            : kind === 'instrument'
                              ? {
                                  program_id: vals.program_id,
                                  unit: vals.unit || 'points',
                                  role: 'Both',
                                }
                              : {
                                  program_id: state.instruments?.find(
                                    (i: R) => i.id === vals.instrument_id,
                                  )?.program_id,
                                  ownership:
                                    state.assets.find((a: R) => a.id === vals.asset_id)
                                      ?.ownership === 'Customer'
                                      ? 'Customer'
                                      : vals.mode === 'Outside source'
                                        ? 'External'
                                        : 'Padova',
                                },
                    });
                  }}
                >
                  Add new{' '}
                  {f.source === 'programs'
                    ? 'program'
                    : f.source === 'instruments'
                      ? 'instrument'
                      : f.source === 'programAccounts'
                        ? 'account'
                        : f.label.toLocaleLowerCase()}
                </button>
              )}
            {f.key === 'whatsapp' &&
              ['party', 'edit_party'].includes(config.kind) &&
              vals.phone && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => change('whatsapp', vals.phone)}
                >
                  Use phone number for WhatsApp
                </button>
              )}
            {f.type !== 'checkbox' &&
              !(f.type === 'roles' && config.defaults.entry_context === 'Suppliers') &&
              f.help &&
              !fieldErrors[f.key] && <small>{f.help}</small>}
            {config.kind === 'transfer_asset' &&
              f.key === 'quantity_received' &&
              (() => {
                const sentRaw = String(vals.quantity_sent ?? '').trim();
                const recvRaw = String(vals.quantity_received ?? '').trim();
                if (!/^\d+$/.test(sentRaw) || !/^\d+$/.test(recvRaw)) return null;
                let feesCents = 0;
                const feesRaw = String(vals.fees ?? '').trim();
                if (feesRaw) {
                  try {
                    feesCents = decimalUnits(feesRaw);
                  } catch {
                    feesCents = 0;
                  }
                }
                const sending = state.assets?.find((a: R) => a.id === vals.sending_asset_id);
                const summary = transferSpreadSummary({
                  quantitySent: Number(sentRaw),
                  quantityReceived: Number(recvRaw),
                  remainingBasisCents:
                    sending?.remaining_basis == null ? null : Number(sending.remaining_basis),
                  remainingQuantity: sending?.balance == null ? null : Number(sending.balance),
                  feesCents,
                });
                return summary ? <small className="transfer-spread-summary">{summary}</small> : null;
              })()}
            {attempted && fieldErrors[f.key] ? (
              <FieldError id={`err-${f.key}`}>{fieldErrors[f.key]}</FieldError>
            ) : null}
          </div>
        ))}
    </>
  );
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {confirmDialog}
      <form
        ref={dialog}
        className="modal"
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="dialog-title">
              {config.title ??
                (config.kind === 'party'
                  ? (
                      {
                        Companies: 'Add company',
                        Suppliers: 'Add supplier',
                        'Sources & Brokers': 'Add source / broker',
                        'People & Families': 'Add person',
                      } as R
                    )[config.defaults.entry_context]
                  : undefined) ??
                titles[config.kind] ??
                pretty(config.kind)}
            </h2>
            {state.developmentData && (
              <strong className="test-dialog-label">TEST / SYNTHETIC (PRACTICE ONLY)</strong>
            )}
            <p>
              {config.description ??
                actionHelp[config.kind] ??
                (config.inline_notice
                  ? 'Saved for future bookings, even if this booking is canceled.'
                  : 'Save once. Linked records and audit history update together.')}
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {selectedBooking && config.kind !== 'revise' && (
            <p className="booking-context">
              <strong>{selectedBooking.code}</strong> · {selectedBooking.summary}
              <br />
              {selectedBooking.customer ||
                state.parties?.find((p: R) => p.id === selectedBooking.customer_id)?.name}{' '}
              · {selectedBooking.travel_start || 'Travel date unknown'}
            </p>
          )}
          {config.kind === 'traveler' ? null : extraFields}
          {config.kind === 'booking_source_profile' && config.defaults.source_method_id && (
            <p className="note">
              Booked through:{' '}
              <strong>
                {config.defaults.provider ||
                  state.bookingSourceMethods?.find(
                    (m: R) => m.id === config.defaults.source_method_id,
                  )?.name}
              </strong>
            </p>
          )}
          {config.kind === 'revise' && config.defaults.booking_id && (
            <p className="note">
              Changing {config.defaults.code} ·{' '}
              {state.parties?.find((p: R) => p.id === config.defaults.customer_id)?.name ||
                config.defaults.customer ||
                config.defaults.summary}
              <br />
              Current source: {config.defaults.channel} ·{' '}
              {state.bookingSourceProfiles?.find(
                (p: R) => p.id === config.defaults.itinerary?.operational_entry?.source_profile_id,
              )?.name || ''}
              {config.defaults.sale != null && (
                <> · Current customer total: ${(Number(config.defaults.sale) / 100).toFixed(2)}</>
              )}
              <br />
              Provider:{' '}
              {state.parties?.find((p: R) => p.id === config.defaults.provider_id)?.name ||
                'Unknown'}{' '}
              · {config.defaults.product}
              <br />
              Enter only the new fare difference, change fee and additional customer charge below.
              Existing costs remain recorded.
              {config.defaults.itinerary?.summary_generated && (
                <output className="full">Updated itinerary: {travelDerived.summary}</output>
              )}
            </p>
          )}
          {config.kind === 'party' &&
            vals.name?.trim().length >= 3 &&
            state.parties.some(
              (p: R) =>
                p.name.toLocaleLowerCase().includes(vals.name.trim().toLocaleLowerCase()) ||
                vals.name.trim().toLocaleLowerCase().includes(p.name.toLocaleLowerCase()),
            ) && (
              <p role="status" className="form-error">
                A similar name already exists. Check the existing directory before adding a
                duplicate; use a distinct label when these are different people or organizations.
              </p>
            )}
          <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
          <div className="form-grid">
            {config.kind === 'trade' && (
              <output className="full">
                Calculated rate:{' '}
                {(() => {
                  try {
                    const what =
                      resolveTradeWhat(vals.what, vals.what_custom) ||
                      String(vals.what || 'Points');
                    const unit = tradeUnit(what);
                    const amount =
                      vals.amount === '' || vals.amount == null
                        ? null
                        : unit === 'money'
                          ? decimalUnits(vals.amount)
                          : decimalUnits(vals.amount, true);
                    const price =
                      vals.price === '' || vals.price == null ? null : decimalUnits(vals.price);
                    return formatTradeRateLabel(what, amount, price);
                  } catch {
                    return 'Enter amount + total price';
                  }
                })()}
                {(() => {
                  const whatResolved =
                    resolveTradeWhat(vals.what, vals.what_custom) || String(vals.what || '');
                  const missing = tradeToComplete({
                    side: vals.side,
                    stock_mode: vals.stock_mode || TRADE_DEFAULT_STOCK_MODE,
                    booking_id: vals.booking_id,
                    counterparty_id: vals.counterparty_id,
                    asset_id: vals.asset_id,
                    expires_on: vals.expires_on,
                    what: whatResolved,
                  });
                  const suggested = suggestTradeStatus({
                    side: vals.side,
                    paid: vals.paid === true,
                    to_complete: missing,
                  });
                  const chosen = (TRADE_STATUSES as readonly string[]).includes(
                    String(vals.status || ''),
                  )
                    ? String(vals.status)
                    : suggested;
                  return (
                    <>
                      <span className="muted" style={{ display: 'block', marginTop: 4 }}>
                        Status: {tradeStatusLabel(chosen)}
                        {chosen !== suggested
                          ? ` · suggested ${tradeStatusLabel(suggested)}`
                          : ''}
                      </span>
                      {missing.length ? (
                        <span className="muted" style={{ display: 'block', marginTop: 4 }}>
                          To complete: {missing.join(' · ')}
                        </span>
                      ) : null}
                    </>
                  );
                })()}
              </output>
            )}
            {config.kind === 'price_match_event' &&
              vals.final_rate !== '' &&
              vals.final_rate != null &&
              inheritedRate !== undefined &&
              !advanced && (
                <output className="full">
                  Requested credit:{' '}
                  {requestedCredit === undefined
                    ? 'Enter an exact comparable price'
                    : money(requestedCredit)}{' '}
                  · calculated from original amount less comparable price
                </output>
              )}
            {['price_match_event', 'benefit'].includes(config.kind) && (
              <p className="full">
                Original confirmed booking amount:{' '}
                {inheritedRate === undefined
                  ? 'Unknown. Use More Details only when confirmed'
                  : money(inheritedRate)}
                {selectedBooking?.itinerary?.operational_entry?.source_profile_id
                  ? ` · Account: ${state.bookingSourceProfiles?.find((p: R) => p.id === (config.defaults.profile_id || selectedBooking.itinerary.operational_entry.source_profile_id))?.name || 'Saved booking profile'}`
                  : ''}
              </p>
            )}
            {travelEditing && (
              <>
                <output className="full">Reservation Summary: {travelDerived.summary}</output>
                {vals.product === 'Flight' && (
                  <div className="form-field">
                    <label htmlFor="edit-trip-type">Trip Type</label>
                    <select
                      id="edit-trip-type"
                      value={tripType}
                      onChange={(e) => change('trip_type', e.target.value)}
                    >
                      {['One Way', 'Round Trip', 'Multi-City'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {config.kind === 'revise_travel' && tripType === 'Multi-City' && (
              <FlightSegments
                value={vals.segments ?? config.defaults.details?.segments ?? [{}, {}]}
                onChange={(segments) => change('segments', segments)}
              />
            )}
            {renderFields(defs.filter((f) => !optionalKeys.has(f.key) || f.required))}
            {defs.some((f) => optionalKeys.has(f.key) && !f.required) && (
              <details
                className="optional-section full"
                open={
                  config.kind === 'traveler'
                    ? travelerPersonalOptionalShouldOpen(vals)
                    : undefined
                }
              >
                <summary>
                  {config.kind === 'traveler'
                    ? 'Personal travel details · passport, DOB, loyalty (optional)'
                    : 'More options · contact, references & details'}
                </summary>
                <div className="form-grid">
                  {renderFields(defs.filter((f) => optionalKeys.has(f.key) && !f.required))}
                </div>
              </details>
            )}
            {config.kind === 'traveler' ? extraFields : null}
          </div>
          {[
            'booking',
            'revise',
            'fulfill',
            'revise_fulfillment',
            'revise_travel',
            'travel_component',
            'price_match_event',
            'benefit',
          ].includes(config.kind) && (
            <button
              type="button"
              className="btn"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              {['fulfill', 'revise_fulfillment'].includes(config.kind)
                ? advanced
                  ? 'Hide additional payment details'
                  : 'More payment details / reference prices'
                : advanced
                  ? 'Hide additional trip details'
                  : 'More Details'}
            </button>
          )}
          {config.kind === 'traveler' && (
            <details
              className="optional-section full"
              open={
                (vals.memberships ?? config.defaults.memberships ?? []).length > 0 ||
                (vals.documents ?? config.defaults.documents ?? []).length > 0
              }
            >
              <summary>Saved memberships & travel documents (optional)</summary>
              <TravelerRecords
                memberships={vals.memberships ?? config.defaults.memberships ?? []}
                documents={vals.documents ?? config.defaults.documents ?? []}
                onMemberships={(v) => change('memberships', v)}
                onDocuments={(v) => change('documents', v)}
                programExtras={[
                  ...(state.programs ?? []).map((p: R) => p.name),
                  ...(state.assets ?? []).map((a: R) => a.issuer),
                ]}
              />
            </details>
          )}
          {config.kind === 'booking' && state.fulfillmentEnabled && allowed('operations') && (
            <BookingTravel
              rows={travelRows}
              onChange={(rows) => {
                if (!travelRows.length) {
                  setTravelRows([
                    {
                      product: vals.product || 'Flight',
                      summary: vals.summary,
                      provider_id: vals.airline_id || vals.supplier_id,
                      acquisition_source_id: vals.acquisition_source_id,
                      channel: vals.channel || 'Unknown',
                      confirmations: vals.confirmations,
                      travel_start: vals.travel_start,
                      travel_end: vals.travel_end,
                    },
                    ...rows,
                  ]);
                  return;
                }
                if (rows.length < travelRows.length)
                  setFunding((items) => items.map((row) => ({ ...row, travel_index: '' })));
                setTravelRows(rows);
              }}
              state={state}
              start={vals.travel_start}
              end={vals.travel_end}
              onAddParty={
                onInlineCommand && allowed('operations')
                  ? (index, field) => {
                      creationKey.current = crypto.randomUUID();
                      setInlineCreation({
                        kind: 'party',
                        target: `travel:${index}:${field}`,
                        defaults: {
                          kind: field === 'provider_id' ? 'supplier' : 'partner',
                          roles: field === 'provider_id' ? ['supplier'] : ['seller'],
                        },
                      });
                    }
                  : undefined
              }
            />
          )}
          {config.kind === 'booking' && allowed('manage_funding') && (
            <BookingFunding
              rows={funding}
              onChange={setFunding}
              state={state}
              bookingChannel={vals.channel ?? ''}
              acquisitionSourceId={vals.acquisition_source_id ?? ''}
              travelComponents={travelRows}
              onAddSource={
                onInlineCommand && allowed('operations')
                  ? (index) => {
                      creationKey.current = crypto.randomUUID();
                      setInlineCreation({
                        kind: 'party',
                        target: `funding:${index}`,
                        defaults: { kind: 'partner', roles: ['seller'] },
                      });
                    }
                  : undefined
              }
              onAddAsset={
                onInlineCommand && allowed('manage_assets')
                  ? (index) => {
                      creationKey.current = crypto.randomUUID();
                      fundingAssetRow.current = index;
                      setCreatingAsset(true);
                    }
                  : undefined
              }
            />
          )}
          {config.kind === 'booking' && allowed('edit_payments') && (
            <fieldset className="form-field full">
              <legend>Customer payment</legend>
              <label>
                <input
                  type="checkbox"
                  checked={!!initialPayment}
                  onChange={(e) =>
                    setInitialPayment(
                      e.target.checked
                        ? { amount: vals.sale ?? '', date: state.today, method: '', reference: '' }
                        : null,
                    )
                  }
                />{' '}
                Customer has paid. Record receipt now
              </label>
              {initialPayment && (
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="initial-payment-amount">Actually received (USD) *</label>
                    <input
                      id="initial-payment-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={initialPayment.amount}
                      onChange={(e) =>
                        setInitialPayment({ ...initialPayment, amount: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="initial-payment-method">Customer payment method *</label>
                    <ChoiceInput
                      id="initial-payment-method"
                      label="Customer payment method"
                      options={mergePaymentMethodOptions([
                        ...(state.payments ?? []).map((p: R) => p.method),
                      ])}
                      required
                      value={initialPayment.method}
                      onChange={(method) => setInitialPayment({ ...initialPayment, method })}
                    />
                  </div>
                  {(initialPayment.method === PAYMENT_METHOD_OTHER ||
                    initialPayment.method === 'Other') && (
                    <div className="form-field">
                      <label htmlFor="initial-payment-method-custom">New payment method *</label>
                      <input
                        id="initial-payment-method-custom"
                        required
                        value={initialPayment.method_custom ?? ''}
                        onChange={(e) =>
                          setInitialPayment({
                            ...initialPayment,
                            method_custom: e.target.value,
                          })
                        }
                        placeholder="e.g. Venmo"
                      />
                    </div>
                  )}
                  <div className="form-field">
                    <label htmlFor="initial-payment-date">Received on *</label>
                    <input
                      id="initial-payment-date"
                      type="date"
                      required
                      value={initialPayment.date}
                      onChange={(e) =>
                        setInitialPayment({ ...initialPayment, date: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="initial-payment-reference">Payment reference</label>
                    <input
                      id="initial-payment-reference"
                      value={initialPayment.reference}
                      onChange={(e) =>
                        setInitialPayment({ ...initialPayment, reference: e.target.value })
                      }
                    />
                  </div>
                  <p>
                    {allowed('edit_customer_charges')
                      ? 'This receipt is from the billed customer and applies to this booking. Use Payments for grouped receipts, overpayments or another payer.'
                      : 'This receipt stays available as customer credit. Authorized staff can allocate it after confirming the customer charge.'}
                  </p>
                </div>
              )}
            </fieldset>
          )}
          {config.kind === 'booking' && (
            <div className="note">
              {allowed('manage_funding')
                ? 'Sale, funding and source payments save together. You can add customer receipts and commissions from the saved booking. Cost stays incomplete until funding is recorded.'
                : 'Save the travelers, provider, dates and confirmations. Authorized staff can complete payment and cost details afterward.'}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" disabled={busy} type="button" onClick={onClose}>
            {config.kind === 'cancel' ? 'Keep booking' : 'Cancel'}
          </button>
          <button
            className={`btn ${config.kind === 'cancel' ? 'danger' : 'primary'}`}
            disabled={busy}
            type="submit"
          >
            {busy
              ? 'Saving…'
              : config.submit_label
                ? config.submit_label
                : config.kind === 'booking_source_method'
                  ? 'Save booking method'
                  : config.kind === 'booking_source_profile'
                    ? 'Save profile'
                    : config.kind === 'party'
                      ? ((
                          {
                            Companies: 'Add company',
                            Suppliers: 'Add supplier',
                            'Sources & Brokers': 'Add source',
                            'People & Families': 'Add person',
                          } as R
                        )[config.defaults.entry_context] ?? 'Add contact')
                      : (actionSave[config.kind] ?? 'Save changes')}
            <Check size={13} />
          </button>
        </div>
      </form>
    </div>
  );
}
