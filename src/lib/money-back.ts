/**
 * Plan v1 — unify booking Money Back lines (presentation layer).
 * Does not invent money; maps existing commissions / referrals / price-match events.
 */
import {
  expectedCommissionDisplay,
  expectedCommissionPanelLabel,
  receivableCommissionLabel,
} from '@/lib/commission-line-label';
import {
  listMoneyBackDeductions,
  moneyBackDeductedCents,
} from '@/lib/money-back-deduct';
import { isMoneyBackDenied } from '@/lib/money-back-deny';
import { isMoneyBackVoided, type MoneyBackVoidTargetKind } from '@/lib/money-back-void';
import { latestCreditRequests } from '@/lib/v1-entry';

/** YYYY-MM-DD only when a real date is present — never invent today. */
export function moneyBackIsoDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Plan how received vocabulary: check · Zelle · deducted · credit issued (+ recorded methods). */
export const MONEY_BACK_HOW_RECEIVED = [
  'check',
  'Zelle',
  'deducted',
  'credit issued',
] as const;

/** Normalize known Plan how-received methods; blank → null (never invent). */
export function normalizeMoneyBackHowReceivedMethod(method: unknown): string | null {
  const m = method == null || method === '' ? '' : String(method).trim();
  if (!m) return null;
  if (/^check$/i.test(m)) return 'check';
  if (/^zelle$/i.test(m)) return 'Zelle';
  if (/^credit\s*issued$/i.test(m)) return 'credit issued';
  if (/^deduct/i.test(m)) return 'deducted';
  return m;
}

export function moneyBackHowReceived(
  method: unknown,
  deducted: boolean,
): string | null {
  const parts: string[] = [];
  const m = normalizeMoneyBackHowReceivedMethod(method);
  if (m && m !== 'deducted') parts.push(m);
  if (deducted) parts.push('deducted');
  return parts.length ? parts.join('; ') : null;
}

/** Cap1 / price-match amount in integer cents — never invent $0 when blank. */
export function priceMatchAmountCents(event: Record<string, any> | null | undefined): number | null {
  if (!event) return null;
  for (const key of [
    'received_amount',
    'approved_amount',
    'expected_credit',
    'requested_amount',
    'credit_cents',
  ] as const) {
    if (event[key] != null && event[key] !== '') {
      const n = Number(event[key]);
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  if (event.credit_amount != null && event.credit_amount !== '') {
    const n = Number(event.credit_amount);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  if (event.amount != null && event.amount !== '') {
    const n = Number(event.amount);
    if (!Number.isFinite(n)) return null;
    // Legacy: small dollar figures vs already-cents integers.
    return Math.abs(n) < 1000 && !Number.isInteger(n) ? Math.round(n * 100) : Math.trunc(n);
  }
  return null;
}

/** One Money Back line per price-match request (latest status); keep orphan events without request_id. */
export function priceMatchMoneyBackEvents(history: Record<string, any>[] = []): Record<string, any>[] {
  const byRequest = latestCreditRequests(history);
  const coveredIds = new Set(byRequest.map((e) => e.id).filter(Boolean).map(String));
  const orphanById = new Map<string, Record<string, any>>();
  const orphanNoId: Record<string, any>[] = [];
  for (const event of history) {
    if (event.request_id) continue;
    if (event.id) {
      const id = String(event.id);
      if (coveredIds.has(id)) continue;
      orphanById.set(id, event);
    } else orphanNoId.push(event);
  }
  return [...byRequest, ...orphanById.values(), ...orphanNoId];
}

function closedMoneyBackStatus(
  operational: unknown,
  target_kind: MoneyBackVoidTargetKind,
  target_id: string,
  openStatus: MoneyBackStatus,
): MoneyBackStatus {
  if (isMoneyBackVoided(operational, target_kind, target_id)) return 'voided';
  if (isMoneyBackDenied(operational, target_kind, target_id)) return 'denied';
  return openStatus;
}

export type MoneyBackStatus = 'expected' | 'confirmed' | 'received' | 'denied' | 'voided';
export type MoneyBackDirection = 'in' | 'out';
/** Plan Money Back field: cash remittance vs credit issued to a ledger. */
export type MoneyBackForm = 'cash' | 'credit';
/** Plan: percent of a stated base, or fixed. */
export type MoneyBackAmountBasis = {
  kind: 'fixed' | 'percent';
  /** Basis points (1500 = 15%). Only for percent. */
  rateBps?: number | null;
  /** Human base name: profit, sale, sale excluding taxes, … */
  baseLabel?: string | null;
};

export type MoneyBackLine = {
  id: string;
  direction: MoneyBackDirection;
  kind:
    | 'commission_expected'
    | 'commission_receivable'
    | 'referral_payable'
    | 'price_match'
    | 'standing_deal';
  label: string;
  party: string;
  /** Plan: Cash, or credit. */
  form: MoneyBackForm;
  expectedCents: number | null;
  receivedCents: number | null;
  /** Plan: remittance deducted / paid less (not cash). */
  deductedCents?: number;
  /** Posted receivable gross (when collector keeps a share). */
  grossCents?: number | null;
  /** Collector / IATA retained share (when > 0 show Gross + Padova net). */
  retainedCents?: number | null;
  /** Plan lifecycle dates — blank when unknown (never invent). */
  expectedOn?: string | null;
  confirmedOn?: string | null;
  receivedOn?: string | null;
  /** Cash/Zelle/check method and/or deducted. */
  howReceived?: string | null;
  /**
   * Plan Credit details (credits only): account profile + expiry.
   * Blank when unknown — never invent.
   */
  creditProfile?: string | null;
  creditExpiresOn?: string | null;
  /** Plan: percent of a stated base, or fixed. */
  amountBasis?: MoneyBackAmountBasis | null;
  /** Plan: optional note on the line (never invent). */
  note?: string | null;
  status: MoneyBackStatus;
  /** Opaque source row for UI actions (commission/referral/event). */
  source: Record<string, unknown>;
};

/** Trim Money Back note text; blank → null (never invent placeholder copy). */
export function moneyBackNote(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s.slice(0, 2000) : null;
}

/**
 * Plan Sruly statements: Airline debit memo (ADM) = negative commission correction
 * with a note that an earlier remittance was too high. Flag for staff — never invents money.
 */
export function moneyBackIsAdmCorrection(note: string | null | undefined): boolean {
  if (!note) return false;
  return /\bADM\b|airline\s+debit\s+memo|debit\s+memo/i.test(note);
}

const FIXED_AMOUNT_BASIS: MoneyBackAmountBasis = { kind: 'fixed' };

export function moneyBackPercentLabel(rateBps: number): string {
  if (!Number.isFinite(rateBps)) return 'Unknown %';
  const n = Math.trunc(rateBps);
  return n % 100 === 0 ? `${n / 100}%` : `${(n / 100).toFixed(2)}%`;
}

export function moneyBackAmountBasisLabel(
  basis: MoneyBackAmountBasis | null | undefined,
): string | null {
  if (!basis) return null;
  if (basis.kind === 'fixed') return 'Fixed amount';
  const rate =
    basis.rateBps == null || !Number.isFinite(Number(basis.rateBps))
      ? null
      : moneyBackPercentLabel(Number(basis.rateBps));
  const base = basis.baseLabel ? String(basis.baseLabel).trim() : '';
  if (rate && base) return `${rate} of ${base}`;
  if (rate) return rate;
  if (base) return `% of ${base}`;
  return 'Percent of base';
}

/** Referral / standing-deal percent rows → Plan amount basis. */
export function moneyBackAmountBasisFromRate(input: {
  rate_bps?: unknown;
  basis?: unknown;
  percentage_basis?: unknown;
  calculation?: unknown;
}): MoneyBackAmountBasis {
  const calc = String(input.calculation ?? '').toLowerCase();
  const basisRaw = String(input.basis ?? '').toLowerCase();
  if (calc === 'fixed' || basisRaw === 'fixed') return FIXED_AMOUNT_BASIS;
  const rate = input.rate_bps == null || input.rate_bps === '' ? null : Number(input.rate_bps);
  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    if (basisRaw === 'profit' || basisRaw === 'percentage') {
      return { kind: 'percent', rateBps: null, baseLabel: 'profit' };
    }
    return FIXED_AMOUNT_BASIS;
  }
  const pctBasis = String(input.percentage_basis || input.basis || 'profit')
    .trim()
    .toLowerCase();
  let baseLabel = 'profit';
  if (pctBasis === 'sale' || pctBasis === 'customer sale') baseLabel = 'sale';
  else if (pctBasis === 'sale_ex_tax') baseLabel = 'sale excluding taxes';
  else if (pctBasis === 'commission' || pctBasis === 'net expected commission')
    baseLabel = 'expected commission';
  else if (pctBasis === 'commission_received' || pctBasis === 'commission actually collected')
    baseLabel = 'commission received';
  else if (pctBasis === 'agreed_amount' || pctBasis === 'agreed amount')
    baseLabel = 'agreed amount';
  else if (pctBasis === 'profit' || pctBasis === 'percentage') baseLabel = 'profit';
  else if (pctBasis) baseLabel = pctBasis.replaceAll('_', ' ');
  return { kind: 'percent', rateBps: Math.trunc(rate), baseLabel };
}

/** Pull Cap1/profile + expiry from a price-match / credit event (never invent). */
export function moneyBackCreditDetails(event: Record<string, any> | null | undefined): {
  profile: string | null;
  expiresOn: string | null;
} {
  if (!event) return { profile: null, expiresOn: null };
  const profileRaw =
    event.profile ?? event.account ?? event.holder ?? event.profile_name ?? null;
  const profile =
    profileRaw == null || String(profileRaw).trim() === ''
      ? null
      : String(profileRaw).trim();
  const expiresOn = moneyBackIsoDate(
    event.expires_on ?? event.expiry ?? event.expiration ?? event.new_expiration,
  );
  return { profile, expiresOn };
}

/**
 * Plan form: price-match / Cap1-style lines are credit; hotel/Sruly/referrer/standing are cash.
 * howReceived "credit issued" forces credit even on other kinds.
 */
export function moneyBackFormForKind(
  kind: MoneyBackLine['kind'],
  howReceived?: string | null,
): MoneyBackForm {
  if (kind === 'price_match') return 'credit';
  if (howReceived && /credit\s*issued/i.test(howReceived)) return 'credit';
  return 'cash';
}

export function moneyBackFormLabel(form: MoneyBackForm): string {
  return form === 'credit' ? 'Credit' : 'Cash';
}

type OperationalEntry = {
  commission?: {
    expected?: string;
    payer_id?: string | null;
    amount?: number | null;
    due_on?: string | null;
    notes?: string | null;
  } | null;
  secondary_commission?: {
    expected?: string;
    payer_id?: string | null;
    amount?: number | null;
    due_on?: string | null;
    notes?: string | null;
  } | null;
  standing_deals?: Array<{
    deal_id?: string;
    label?: string;
    amount_cents?: number | null;
    payer_party_id?: string | null;
    notes?: string;
    rate_bps?: number | null;
    basis?: string | null;
  }> | null;
  money_back_voids?: unknown;
  money_back_denials?: unknown;
  money_back_deductions?: unknown;
} | null;

function mapReceivableStatus(received: number, expectedNet: number): MoneyBackStatus {
  if (expectedNet > 0 && received >= expectedNet) return 'received';
  if (received > 0) return 'confirmed';
  return 'expected';
}

function mapReferralStatus(row: {
  status?: string;
  outstanding?: number;
  paid?: number;
  accrued?: number;
}): MoneyBackStatus {
  const status = String(row.status || '').toLowerCase();
  if (/void/.test(status)) return 'voided';
  if (/denied|reject/.test(status)) return 'denied';
  if (/cancel/.test(status)) return 'voided';
  if (Number(row.outstanding ?? 0) <= 0 && Number(row.paid ?? 0) > 0) return 'received';
  if (Number(row.paid ?? 0) > 0 || Number(row.accrued ?? 0) > 0) return 'confirmed';
  return 'expected';
}

function mapPriceMatchStatus(raw: unknown): MoneyBackStatus {
  const s = String(raw ?? 'Pending').toLowerCase();
  if (/denied|reject/.test(s)) return 'denied';
  if (/void/.test(s)) return 'voided';
  if (/received|posted|credited|complete/.test(s)) return 'received';
  if (/confirm|accepted|approved/.test(s)) return 'confirmed';
  return 'expected';
}

export function buildMoneyBackLines(input: {
  bookingId: string;
  operational?: OperationalEntry;
  commissions?: Record<string, any>[];
  referrals?: Record<string, any>[];
  /** Latest referral payouts (paid_on / method) for howReceived. */
  referralPayments?: Record<string, any>[];
  priceMatchHistory?: Record<string, any>[];
  partyName?: (id: string | null | undefined) => string;
  /** Cap1 / booking source profile name for price-match party label. */
  profileName?: (id: string | null | undefined) => string;
}): MoneyBackLine[] {
  const lines: MoneyBackLine[] = [];
  const nameOf = input.partyName ?? ((id) => (id ? String(id) : 'Unknown'));
  const profileOf =
    input.profileName ?? ((id) => (id ? String(id) : ''));
  const commissions = (input.commissions ?? []).filter((r) => r.booking_id === input.bookingId);
  const referrals = (input.referrals ?? []).filter((r) => r.booking_id === input.bookingId);
  const referralPayments = (input.referralPayments ?? []).filter(
    (p) => String(p.booking_id) === String(input.bookingId) || referrals.some((r) => r.id === p.referral_id),
  );
  const priceMatches = priceMatchMoneyBackEvents(
    Array.isArray(input.priceMatchHistory) ? input.priceMatchHistory : [],
  );

  const primary = expectedCommissionDisplay(input.operational?.commission);
  const secondary = expectedCommissionDisplay(input.operational?.secondary_commission);
  if (commissions.length === 0) {
    if (primary.status !== 'none') {
      lines.push({
        id: `expected-primary-${input.bookingId}`,
        direction: 'in',
        kind: 'commission_expected',
        label: expectedCommissionPanelLabel('primary'),
        party: nameOf(input.operational?.commission?.payer_id),
        form: moneyBackFormForKind('commission_expected'),
        amountBasis: FIXED_AMOUNT_BASIS,
        expectedCents: primary.status === 'yes' ? primary.amount : null,
        receivedCents: 0,
        expectedOn: moneyBackIsoDate(input.operational?.commission?.due_on),
        note: moneyBackNote(input.operational?.commission?.notes),
        status: closedMoneyBackStatus(input.operational, 'expected_primary', 'primary', 'expected'),
        source: { kind: 'expected_primary', target_id: 'primary' },
      });
    }
    if (secondary.status !== 'none') {
      lines.push({
        id: `expected-secondary-${input.bookingId}`,
        direction: 'in',
        kind: 'commission_expected',
        label: expectedCommissionPanelLabel('secondary'),
        party: nameOf(input.operational?.secondary_commission?.payer_id),
        form: moneyBackFormForKind('commission_expected'),
        amountBasis: FIXED_AMOUNT_BASIS,
        expectedCents: secondary.status === 'yes' ? secondary.amount : null,
        receivedCents: 0,
        expectedOn: moneyBackIsoDate(input.operational?.secondary_commission?.due_on),
        note: moneyBackNote(input.operational?.secondary_commission?.notes),
        status: closedMoneyBackStatus(
          input.operational,
          'expected_secondary',
          'secondary',
          'expected',
        ),
        source: { kind: 'expected_secondary', target_id: 'secondary' },
      });
    }
  }

  for (const r of commissions) {
    const grossRaw = r.gross == null || r.gross === '' ? null : Number(r.gross);
    const retainedRaw = Number(r.retained ?? 0);
    const gross = grossRaw != null && Number.isFinite(grossRaw) ? grossRaw : null;
    const retained = Number.isFinite(retainedRaw) ? retainedRaw : 0;
    const originalNet = (gross ?? 0) - retained;
    const received = Number(r.received ?? 0);
    const deducted = moneyBackDeductedCents(input.operational, 'commission', String(r.id));
    const expectedNet = originalNet - deducted;
    const showSplit = retained > 0 && gross != null;
    const deductRows = listMoneyBackDeductions(input.operational).filter(
      (d) => d.target_kind === 'commission' && String(d.target_id) === String(r.id),
    );
    const latestDeductOn = deductRows
      .map((d) => moneyBackIsoDate(d.deducted_at))
      .filter(Boolean)
      .sort()
      .at(-1);
    const cashOn = moneyBackIsoDate(r.received_on);
    const howReceived = moneyBackHowReceived(r.received_method, deducted > 0);
    lines.push({
      id: String(r.id),
      direction: 'in',
      kind: 'commission_receivable',
      label: receivableCommissionLabel(r, input.operational, commissions),
      party: String(r.collector ?? r.payer ?? nameOf(r.payer_id) ?? 'Unknown'),
      form: moneyBackFormForKind('commission_receivable', howReceived),
      amountBasis: FIXED_AMOUNT_BASIS,
      expectedCents: expectedNet,
      receivedCents: received,
      deductedCents: deducted > 0 ? deducted : undefined,
      ...(showSplit ? { grossCents: gross, retainedCents: retained } : {}),
      expectedOn: moneyBackIsoDate(r.due_on),
      confirmedOn: moneyBackIsoDate(r.posted_at),
      receivedOn: cashOn || (deducted > 0 ? latestDeductOn ?? null : null),
      howReceived,
      note: moneyBackNote(
        r.notes ??
          (deductRows.length ? deductRows.map((d) => d.reason).filter(Boolean).at(-1) : null),
      ),
      status: closedMoneyBackStatus(
        input.operational,
        'commission',
        String(r.id),
        mapReceivableStatus(received + deducted, originalNet),
      ),
      source: { kind: 'commission', row: r, target_id: String(r.id) },
    });
  }

  for (const r of referrals) {
    const payouts = referralPayments
      .filter((p) => String(p.referral_id) === String(r.id))
      .slice()
      .sort((a, b) => String(a.paid_on || '').localeCompare(String(b.paid_on || '')));
    const latest = payouts.at(-1);
    const status = closedMoneyBackStatus(
      input.operational,
      'referral',
      String(r.id),
      mapReferralStatus(r),
    );
    const howReceived = moneyBackHowReceived(latest?.method, false);
    lines.push({
      id: String(r.id),
      direction: 'out',
      kind: 'referral_payable',
      label: 'Referring-org share (payable)',
      party: String(r.referrer ?? 'Referrer'),
      form: moneyBackFormForKind('referral_payable', howReceived),
      amountBasis: moneyBackAmountBasisFromRate(r),
      expectedCents: Number(r.expected_due ?? r.outstanding ?? 0),
      receivedCents: Number(r.paid ?? 0),
      expectedOn: moneyBackIsoDate(r.due_on),
      confirmedOn:
        status === 'confirmed' || status === 'received'
          ? moneyBackIsoDate(r.accrued_on || r.posted_at || r.updated_at)
          : null,
      receivedOn: moneyBackIsoDate(latest?.paid_on),
      howReceived,
      note: moneyBackNote(r.reason ?? r.notes ?? r.hold_reason),
      status,
      source: { kind: 'referral', row: r, target_id: String(r.id) },
    });
  }

  for (const deal of input.operational?.standing_deals ?? []) {
    const dealId = String(deal.deal_id || deal.label || 'standing');
    lines.push({
      id: `standing-${input.bookingId}-${dealId}`,
      direction: 'in',
      kind: 'standing_deal',
      label: String(deal.label || 'Standing deal'),
      party: nameOf(deal.payer_party_id) || 'Standing deal',
      form: moneyBackFormForKind('standing_deal'),
      amountBasis: moneyBackAmountBasisFromRate({
        rate_bps: deal.rate_bps,
        basis: deal.basis,
      }),
      expectedCents: deal.amount_cents == null ? null : Number(deal.amount_cents),
      receivedCents: 0,
      note: moneyBackNote(deal.notes),
      status: closedMoneyBackStatus(input.operational, 'standing_deal', dealId, 'expected'),
      source: { kind: 'standing_deal', row: deal, target_id: dealId },
    });
  }

  for (const [index, event] of priceMatches.entries()) {
    const amount = priceMatchAmountCents(event);
    const receivedOnly = priceMatchAmountCents(
      event.received_amount != null ? { received_amount: event.received_amount } : null,
    );
    const targetId = String(event.request_id ?? event.id ?? `pm-${input.bookingId}-${index}`);
    const mapped = /void/i.test(String(event.status ?? ''))
      ? ('voided' as const)
      : mapPriceMatchStatus(event.status);
    const isReceived = /received|posted|credited|complete/i.test(String(event.status ?? ''));
    const isConfirmed = mapped === 'confirmed' || isReceived;
    const profileLabel = profileOf(event.profile_id);
    const howReceived = isReceived ? 'credit issued' : null;
    const credit = moneyBackCreditDetails({
      ...event,
      profile:
        event.profile ??
        event.account ??
        event.holder ??
        (profileLabel ? profileLabel : null),
    });
    lines.push({
      id: targetId,
      direction: 'in',
      kind: 'price_match',
      label: 'Price match credit',
      party: credit.profile || 'Cap1 / issuer',
      form: moneyBackFormForKind('price_match', howReceived),
      amountBasis: FIXED_AMOUNT_BASIS,
      expectedCents: amount,
      receivedCents: isReceived ? (receivedOnly ?? amount ?? 0) : 0,
      expectedOn: moneyBackIsoDate(event.date),
      confirmedOn: isConfirmed ? moneyBackIsoDate(event.date) : null,
      receivedOn: isReceived ? moneyBackIsoDate(event.received_on || event.date) : null,
      howReceived,
      creditProfile: credit.profile,
      creditExpiresOn: credit.expiresOn,
      note: moneyBackNote(event.notes ?? event.note ?? event.reason),
      status: closedMoneyBackStatus(input.operational, 'price_match', targetId, mapped),
      source: { kind: 'price_match', row: event, target_id: targetId },
    });
  }

  return lines;
}

export function moneyBackStatusLabel(status: MoneyBackStatus): string {
  switch (status) {
    case 'expected':
      return 'Expected';
    case 'confirmed':
      return 'Confirmed';
    case 'received':
      return 'Received';
    case 'denied':
      return 'Denied';
    case 'voided':
      return 'Voided';
    default:
      return status;
  }
}
