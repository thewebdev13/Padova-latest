/**
 * Plan v1 — Cash / GDS: commissionable yes/no.
 * Not commissionable → optional $50/PNR fee (never auto).
 * Commissionable → Sruly ~50/50 split (Owner ☐ still open on 60/50 by PNR creator — default 50/50).
 * Never invent commission amounts.
 */

export const GDS_COMMISSIONABLE_OPTIONS = ['Yes', 'No', 'Unknown'] as const;
export type GdsCommissionable = (typeof GDS_COMMISSIONABLE_OPTIONS)[number];

export const GDS_COMMISSIONABLE_NOTES_50_50 =
  'Sruly GDS commissionable ~50/50 (Padova / collector)';

export function isGdsCommissionable(value: unknown): value is GdsCommissionable {
  return (GDS_COMMISSIONABLE_OPTIONS as readonly string[]).includes(String(value || ''));
}

export function notesIndicateSruly5050(notes: unknown): boolean {
  const s = String(notes ?? '');
  return /50\s*\/\s*50|50\s*%\s*\/\s*50|~50\/50|gds commissionable/i.test(s);
}

/**
 * Expected amount is Padova net under 50/50 → gross = 2×net, retained = net.
 * Only when exact; never invent.
 */
export function grossRetainedFromNet5050(netCents: number): {
  gross: number;
  retained: number;
} | null {
  if (!Number.isInteger(netCents) || netCents <= 0) return null;
  const gross = netCents * 2;
  const retained = netCents;
  return { gross, retained };
}

/** Seed Money Back expected commission from GDS commissionable answer. */
export function gdsCommissionExpectedSeed(
  answer: GdsCommissionable | '' | null | undefined,
): { expected: 'Yes' | 'No' | 'Unknown'; notes?: string } | undefined {
  if (answer === 'Yes')
    return { expected: 'Yes', notes: GDS_COMMISSIONABLE_NOTES_50_50 };
  if (answer === 'No') return { expected: 'No' };
  if (answer === 'Unknown') return { expected: 'Unknown' };
  return undefined;
}

export function gdsCommissionableHint(
  answer: GdsCommissionable | '' | null | undefined,
): string {
  switch (answer) {
    case 'Yes':
      return 'Commissionable: expected Money Back uses Sruly ~50/50. Amount stays Unknown until Confirm — never invent.';
    case 'No':
      return 'Not commissionable: no commission expected. Optional +$50 PNR fee below when it applies.';
    case 'Unknown':
      return 'Commissionable unknown — stays Unknown, not $0. Confirm later.';
    default:
      return 'Is the fare commissionable? Yes → 50/50 Money Back expected. No → optional $50/PNR fee.';
  }
}
