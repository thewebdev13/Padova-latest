/**
 * Plan v1 — Sruly GDS fees are optional adds, never automatic.
 * $50 per PNR when fare is not commissionable; +$30 when a voucher is used on a Sruly booking.
 */

export const SRULY_PNR_FEE_CENTS = 5000;
export const SRULY_VOUCHER_EXTRA_FEE_CENTS = 3000;

export const SRULY_PNR_FEE_LABEL = 'Booking fee';
export const SRULY_VOUCHER_FEE_LABEL = 'Sruly voucher booking fee';

export type SrulyFeePreset = {
  id: 'pnr_50' | 'voucher_30' | 'pnr_and_voucher';
  label: string;
  amount_cents: number;
  note: string;
};

export const SRULY_FEE_PRESETS: SrulyFeePreset[] = [
  {
    id: 'pnr_50',
    label: '+ $50 PNR fee',
    amount_cents: SRULY_PNR_FEE_CENTS,
    note: SRULY_PNR_FEE_LABEL,
  },
  {
    id: 'voucher_30',
    label: '+ $30 voucher fee',
    amount_cents: SRULY_VOUCHER_EXTRA_FEE_CENTS,
    note: SRULY_VOUCHER_FEE_LABEL,
  },
  {
    id: 'pnr_and_voucher',
    label: '+ $50 + $30',
    amount_cents: SRULY_PNR_FEE_CENTS + SRULY_VOUCHER_EXTRA_FEE_CENTS,
    note: `${SRULY_PNR_FEE_LABEL} + voucher`,
  },
];

export function srulyFeePresetById(id: string): SrulyFeePreset | undefined {
  return SRULY_FEE_PRESETS.find((p) => p.id === id);
}

/** Dollars string for booking-entry money fields (two decimals). */
export function centsToUsdInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
