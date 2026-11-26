import type { HowBookedPreset } from '@/lib/entry-options';

/** Plan v1 — which New Booking panels matter for each How-booked preset. */
export type HowBookedVisibility = {
  showBookedThrough: boolean;
  showSourceProfile: boolean;
  showCap1Hints: boolean;
  showPointsFunding: boolean;
  showOutsideSeller: boolean;
  showVoucherFunding: boolean;
  showHotelCommissionHints: boolean;
  showFhrHints: boolean;
  showSrulyFeeHints: boolean;
  /** Preferred first payment-card type label in booking-entry componentTypes. */
  defaultPaymentType: string;
  /** Narrow Cost & Payment type list for this preset (empty = all types). */
  paymentTypes: string[];
};

const ALL_PAYMENT_TYPES = [
  'Padova payment',
  'Customer card',
  'Outside seller',
  'Owned value',
  'Other',
];

const ALL_HIDDEN: HowBookedVisibility = {
  showBookedThrough: false,
  showSourceProfile: false,
  showCap1Hints: false,
  showPointsFunding: false,
  showOutsideSeller: false,
  showVoucherFunding: false,
  showHotelCommissionHints: false,
  showFhrHints: false,
  showSrulyFeeHints: false,
  defaultPaymentType: 'Padova payment',
  paymentTypes: ALL_PAYMENT_TYPES,
};

export function howBookedVisibility(preset: HowBookedPreset | '' | null | undefined): HowBookedVisibility {
  if (!preset)
    return { ...ALL_HIDDEN, showBookedThrough: true, defaultPaymentType: 'Padova payment' };

  switch (preset) {
    case 'Cash / GDS':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showSrulyFeeHints: true,
        defaultPaymentType: 'Padova payment',
        paymentTypes: ['Padova payment', 'Customer card', 'Other'],
      };
    case 'Capital One':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showSourceProfile: true,
        showCap1Hints: true,
        defaultPaymentType: 'Padova payment',
        // Card amount + old Cap1 credit; price-match credit is after save.
        paymentTypes: ['Padova payment', 'Owned value', 'Customer card', 'Other'],
      };
    case 'Points (Padova-owned)':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showPointsFunding: true,
        defaultPaymentType: 'Owned value',
        paymentTypes: ['Owned value', 'Padova payment', 'Other'],
      };
    case 'Outside seller':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showOutsideSeller: true,
        defaultPaymentType: 'Outside seller',
        paymentTypes: ['Outside seller', 'Other', 'Padova payment'],
      };
    case 'Hotel with commission':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showHotelCommissionHints: true,
        showSrulyFeeHints: true,
        defaultPaymentType: 'Padova payment',
        paymentTypes: ['Padova payment', 'Outside seller', 'Customer card', 'Other'],
      };
    case 'Voucher / credit':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showVoucherFunding: true,
        // Optional +$30 when voucher used on a Sruly GDS booking (never auto).
        showSrulyFeeHints: true,
        defaultPaymentType: 'Owned value',
        paymentTypes: ['Owned value', 'Padova payment', 'Other'],
      };
    case 'Hotel at program rate (FHR)':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        // Plan: whose account (always someone else's) — reuse Cap1-style profile picker.
        showSourceProfile: true,
        showFhrHints: true,
        defaultPaymentType: 'Padova payment',
        paymentTypes: ['Padova payment', 'Owned value', 'Other'],
      };
    case 'Other':
      return {
        ...ALL_HIDDEN,
        showBookedThrough: true,
        showOutsideSeller: true,
        defaultPaymentType: 'Other',
        paymentTypes: ALL_PAYMENT_TYPES,
      };
    default:
      return { ...ALL_HIDDEN, showBookedThrough: true, defaultPaymentType: 'Padova payment' };
  }
}

/** Cap1 Travel portal card spend is not a Padova-saved payment_account by default. */
export function cap1PortalCardAllowsMissingAccount(args: {
  howBooked?: string | null;
  channel?: string | null;
}): boolean {
  if (args.howBooked === 'Capital One') return true;
  return /capital\s*one/i.test(String(args.channel || ''));
}

/** Short staff hint under the selected preset (Plan field matrix). */
export function howBookedHint(preset: HowBookedPreset | '' | null | undefined): string {
  if (!preset) return 'Choose how it was booked before filling cost details.';
  switch (preset) {
    case 'Cash / GDS':
      return 'Card paid; commissionable yes/no; optional Sruly $50/PNR and $30 voucher fee.';
    case 'Capital One':
      return 'Cap1 account profile; card amount; old credit used. Price match is added later.';
    case 'Points (Padova-owned)':
      return 'Program; account; points used; cost from the points batch; cash taxes.';
    case 'Outside seller':
      return 'Seller; agreed cost; paid or unpaid (pay ASAP — unpaid stays on to-do). Points and seller rebate are information only — not Padova income.';
    case 'Hotel with commission':
      return 'Property; check-in/out; commission payer (default Sruly 90/10); pick how the hotel is paid.';
    case 'Voucher / credit':
      return 'Which credit/voucher balance is used; face value as cost.';
    case 'Hotel at program rate (FHR)':
      return 'Program-rate hotel; customer price minus Padova cost. No default commission. Program name + perks in More.';
    case 'Other':
      return 'Free cost line — enter what Padova actually paid.';
    default:
      return '';
  }
}
