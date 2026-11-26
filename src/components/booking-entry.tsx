'use client';
import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type FormEvent,
} from 'react';
import { Upload } from 'lucide-react';
import SearchableSelect from './searchable-select';
import AirportInput from './airport-input';
import BookingTicketing from './booking-ticketing';
import PnrInput from './pnr-input';
import BookingTravelerDetails from './booking-traveler-details';
import {
  travelerNames,
  travelerPasteNeedsReview,
  flightEndpoints,
  flightEndpointChange,
  inventoryOption,
  entryBookedCostCents,
} from '@/lib/booking-ux';
import CommandForm from './command-form';
import BookingPartySelect from './booking-party-select';
import {
  clearBookingRecovery,
  snoozeBookingRecoveryAutoOpen,
  writeBookingRecovery,
  type BookingRecovery,
} from '@/lib/booking-recovery';
import { similarTravelerName } from '@/lib/traveler-candidates';
import { fixedMenuStyleFromRect } from '@/lib/fixed-menu-style';
import { assetUnit } from '@/lib/asset-units';
import {
  derivedTravel,
  travelDateLabels,
  travelDateOrderIssue,
  bookingTravelEndMissingMessage,
  directCardOwner,
} from '@/lib/booking-derived';
import {
  decimalUnits,
  parseList,
  PAYMENT_METHOD_OTHER,
  HOW_BOOKED_PRESETS,
  mergePaymentMethodOptions,
  resolvePaymentMethod,
  type HowBookedPreset,
} from '@/lib/entry-options';
import { howBookedHint, howBookedVisibility } from '@/lib/how-booked';
import {
  HOTEL_PAID_BY_OPTIONS,
  hotelPaidByDefaultPaymentType,
  hotelPaidByHint,
  hotelPaidBySetsPadovaOwedZero,
  isHotelPaidBy,
  type HotelPaidBy,
} from '@/lib/hotel-paid-by';
import {
  GDS_COMMISSIONABLE_OPTIONS,
  gdsCommissionableHint,
  gdsCommissionExpectedSeed,
  isGdsCommissionable,
  type GdsCommissionable,
} from '@/lib/gds-commissionable';
import {
  OUTSIDE_SELLER_BP_LABEL,
  OUTSIDE_SELLER_BP_SUMMARY,
  OUTSIDE_SELLER_COST_HINT,
  OUTSIDE_SELLER_REBATE_LABEL,
  outsideSellerAllowsRebateExpected,
} from '@/lib/outside-seller';
import { sellerUnpaidEntryHint } from '@/lib/seller-unpaid';
import {
  costEstimateEntryHint,
  normalizeOtherCurrencyNote,
} from '@/lib/cost-estimate';
import {
  eligibleParty,
  providerRole,
  accountSupports,
  type DirectoryRole,
} from '@/lib/directory-eligibility';
import {
  parseQuickPaste,
  bookingSourceMethodMatch,
  exactEligibleMatch,
  exactPointCost,
  parsePaymentStatus,
  parseBoughtValue,
  normalizePasteValue,
  quickPasteAIInstructions,
  quickPasteExample,
} from '@/lib/quick-paste';
import { formatIntakeProvenanceLine } from '@/lib/intake-channel-label';
import {
  buildIntakeMappingPreview,
  INTAKE_REQUIRED_ROWS,
  INTAKE_SAMPLE_PASTE,
  UNREAD_FILE_MESSAGE,
  intakePreviewMark,
  intakePreviewMarkLabel,
} from '@/lib/intake-preview';
import { intakeReservationBlockReason } from '@/lib/booking-message-detect';
import { customerCardFeeCents, DEFAULT_CUSTOMER_CARD_FEE_BPS } from '@/lib/card-fees';
import {
  SRULY_FEE_PRESETS,
  centsToUsdInput,
} from '@/lib/sruly-fees';
import {
  buildStandingDealExpectations,
  mergeStandingDealExpectations,
  normalizeEntryExtraIncomeDraft,
  partyStandingDeals,
  STANDING_DEAL_BASES,
} from '@/lib/standing-deals';
import {
  extractTextFromEml,
  looksLikeEml,
  parseEmlEnvelope,
} from '@/lib/booking-intake-split';
import {
  fixedMarginPrice,
  percentagePrice,
  percentageCommission,
  sourceConfirmationLabel,
} from '@/lib/v1-entry';
import {
  transitionBookingProduct,
  bookingProductDetails,
  sellerPaymentState,
  customerReceivedAmount,
  bookingEntryPrimaryNav,
  bookingEntryMoreShouldOpen,
  bookingEntryFhrMoreShouldOpen,
  bookingEntryHeldMoreShouldOpen,
  bookingEntryNotesMoreShouldOpen,
  bookingTravelMoreShouldOpen,
  bookingPercentPricingShouldOpen,
  bookingFixedMarginShouldOpen,
} from '@/lib/booking-entry-state';
import {
  BOOKING_DOCUMENT_KINDS,
  appendBookingDocument,
  bookingDocumentKindLabel,
  normalizeEntryDocumentDraft,
} from '@/lib/booking-documents';
import { useConfirmDialog } from '@/components/confirm-dialog';
type R = Record<string, any>;
type Props = {
  config: R;
  state: R;
  onClose: () => void;
  onSubmit: (data: R) => Promise<void>;
  onInlineCommand?: (kind: string, data: R, key: string) => Promise<R>;
  onCreateParty?: (data: R, key: string) => Promise<R>;
};
function pasteTextFromUpload(raw: string, filename: string): { text: string; note: string } {
  if (looksLikeEml(raw, filename) || /\.eml$/i.test(filename)) {
    const body = extractTextFromEml(raw).trim();
    const envelope = parseEmlEnvelope(raw);
    const meta = [
      envelope.mailbox ? `mailbox ${envelope.mailbox}` : '',
      envelope.from_address ? `from ${envelope.from_address}` : '',
      envelope.subject ? `“${envelope.subject}”` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      text: body || raw,
      note: `Loaded “${filename}” as email body${meta ? ` (${meta})` : ''}. Review, then Preview or Save as intake draft.`,
    };
  }
  return {
    text: raw,
    note: `Loaded “${filename}” into paste. Review, then Preview or Save as intake draft.`,
  };
}
const products = ['Flight', 'Hotel', 'Car', 'Other'];
const componentTypes = [
  'Padova payment',
  'Customer card',
  'Outside seller',
  'Owned value',
  'Other',
];
const suppliedTypes = [
  'Complete Booking / Ticket',
  'Points / Miles',
  'Voucher / Travel Credit',
  'Certificate / Award',
  'Hotel Booking / Stay',
  'Other / Custom',
];
const usd = (v: any) => (v === '' || v == null ? undefined : decimalUnits(String(v)));
const dollars = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v / 100);
const bpNet = (gross: unknown, percent: unknown) => {
  try {
    if (!gross || percent === '') return undefined;
    return percentagePrice(Number(gross), decimalUnits(String(percent ?? 35)));
  } catch {
    return undefined;
  }
};
function Field({
  label,
  children,
  full = false,
  required = false,
  error = '',
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div
      className={`form-field ${full ? 'full' : ''} ${label === 'Travelers' ? 'traveler-field' : ''} ${error ? 'has-error' : ''}`}
    >
      <label>
        {label}
        {required ? (
          <span className="req-star" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <small className="field-hint-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

function OptionalSummary({
  title,
  hint,
  filled = 0,
}: {
  title: string;
  hint?: string;
  filled?: number;
}) {
  return (
    <summary>
      <span>
        <strong>{title}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="optional-tag">{filled ? `${filled} filled` : 'Optional'}</span>
    </summary>
  );
}

export default function BookingEntry(props: Props) {
  const { state, onClose, onSubmit, onInlineCommand } = props;
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();
  const [v, setV] = useState<R>({
    product: 'Flight',
    trip_type: 'One Way',
    customer_id: '',
    traveler_ids: [],
    new_travelers: [],
    payment_status: 'Unpaid',
    booked_on: state.today,
    receipt_date: state.today,
    ...props.config.defaults,
  });
  const [components, setComponents] = useState<R[]>(() => {
    const seed = props.config.defaults.components;
    if (!Array.isArray(seed) || !seed.length) {
      return [
        {
          type: 'Outside seller',
          supplied: 'Complete Booking / Ticket',
          unit: 'money',
          payment_status: 'Unpaid',
          entry_placeholder: true,
        },
      ];
    }
    return seed.map((c: R) => ({
      ...c,
      cost_is_estimate: !!c.cost_is_estimate,
      other_currency_code: c.other_currency_code ?? c.other_currency?.code ?? '',
      other_currency_amount: c.other_currency_amount ?? c.other_currency?.amount ?? '',
      other_currency_rate: c.other_currency_rate ?? c.other_currency?.rate ?? '',
    }));
  });
  const initialPaste = String(
    props.config.defaults.recovery_paste ||
      props.config.defaults.intake_raw_text ||
      '',
  );
  const [paste, setPaste] = useState(initialPaste);
  const [pasteIssues, setPasteIssues] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  // Open when continuing a draft/recovery that already has paste text.
  const [quickPasteOpen, setQuickPasteOpen] = useState(() => Boolean(initialPaste.trim()));
  const [pasteDrag, setPasteDrag] = useState(false);
  const [pasteFileName, setPasteFileName] = useState('');
  /** Transient helper status: Reading PDF… / Filled N fields — never invents money. */
  const [pasteHelperStatus, setPasteHelperStatus] = useState('');
  const intakeAutoApplied = useRef(false);
  const pasteApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickPasteRef = useRef<HTMLDetailsElement>(null);
  const ignoreQuickPasteToggle = useRef(false);
  const userClosedQuickPaste = useRef(false);
  const hadPasteContent = useRef(Boolean(initialPaste.trim()));
  const livePastePreview = useMemo(
    () =>
      buildIntakeMappingPreview(paste, {
        parties: (state.parties ?? []) as { name?: string }[],
      }),
    [paste, state.parties],
  );
  const intakePartyKeys = useRef(new Map<string, string>());
  const setQuickPasteOpenSafe = (open: boolean) => {
    ignoreQuickPasteToggle.current = true;
    setQuickPasteOpen(open);
    if (quickPasteRef.current) quickPasteRef.current.open = open;
    queueMicrotask(() => {
      ignoreQuickPasteToggle.current = false;
    });
  };
  useEffect(() => {
    const has = Boolean(paste.trim());
    if (!has) {
      hadPasteContent.current = false;
      userClosedQuickPaste.current = false;
      return;
    }
    // First content (or returning from empty) → open and stay until user collapses.
    if (!hadPasteContent.current && !userClosedQuickPaste.current) {
      setQuickPasteOpenSafe(true);
    }
    hadPasteContent.current = true;
  }, [paste]);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied`);
      window.setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Clipboard unavailable');
      setPaste(value);
      window.setTimeout(() => setCopyStatus(''), 3000);
    }
  };
  const queueApplyPaste = (text: string) => {
    if (pasteApplyTimer.current) clearTimeout(pasteApplyTimer.current);
    pasteApplyTimer.current = setTimeout(() => {
      if (text.trim()) {
        if (!userClosedQuickPaste.current) setQuickPasteOpenSafe(true);
        void applyPaste(text);
      } else setPasteIssues([]);
    }, 350);
  };
  const [traveler, setTraveler] = useState(
    props.config.defaults.pending_traveler || props.config.defaults.traveler_batch || '',
  );
  const [, setTravelerBatch] = useState<string>('');
  const [batchReview, setBatchReview] = useState<R[]>([]);
  const ticketingCache = useRef(new Map());
  const ticketingDirty = useRef(new Set<string>());
  const hasUnsavedTicketing = () =>
    [...new Set([...ticketingDirty.current, ...ticketingCache.current.keys()])].some((id) =>
      v.traveler_ids.includes(id),
    );
  const closeBooking = async () => {
    if (busy) return;
    if (hasUnsavedTicketing()) {
      const ok = await askConfirm({
        title: 'Leave without saving?',
        message: 'Traveler profile edits are not saved. Leave anyway?',
        confirmLabel: 'Leave',
        cancelLabel: 'Cancel',
        tone: 'default',
      });
      if (!ok) return;
    }
    // Server drafts are reopened from Drafts — do not keep forcing them after Cancel.
    if (props.config.defaults.draft_id) {
      recoveryFinished.current = true;
      clearBookingRecovery(state.actor.id);
    } else {
      // Keep local crash recovery, but do not auto-pop again this browser tab after Cancel.
      snoozeBookingRecoveryAutoOpen(state.actor.id);
    }
    onClose();
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (ticketingCache.current.size || ticketingDirty.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const [travelerDetailsId, setTravelerDetailsId] = useState('');
  const batchLookup = useRef(0);
  const reviewTravelers = async (input = traveler) => {
    const request = ++batchLookup.current;
    setBusy(true);
    setError('');
    try {
      const names = travelerNames(input);
      if (names.length > 30) throw Error('Add up to 30 travelers at a time.');
      const review = await Promise.all(
        names.map(async (name) => {
          const r = await fetch(`/api/directory?traveler=true&q=${encodeURIComponent(name)}`);
          if (!r.ok) throw Error('Traveler lookup failed. Retry before creating people.');
          const results = (await r.json()).results.filter((p: R) => eligibleParty(p, 'traveler'));
          const exact = results.filter((p: R) => p.name.toLowerCase() === name.toLowerCase());
          return {
            name,
            results,
            selected: exact.length === 1 ? exact[0].id : results.length ? '' : 'new',
            key: crypto.randomUUID(),
          };
        }),
      );
      if (request === batchLookup.current) setBatchReview(review);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirmTravelers = async () => {
    if (batchReview.some((r) => !r.selected)) return;
    setBusy(true);
    setError('');
    try {
      const ids: string[] = [];
      for (const row of batchReview) {
        if (row.selected === 'new') {
          if (!props.onCreateParty) throw Error('Traveler creation is unavailable.');
          const p = await props.onCreateParty(
            { name: row.name, kind: 'person', roles: ['traveler'] },
            row.key,
          );
          ids.push(p.id);
          setExtra((old) => ({
            ...old,
            parties: [
              ...(old.parties ?? []),
              { name: row.name, kind: 'person', roles: ['traveler'], ...p },
            ],
          }));
        } else ids.push(row.selected);
      }
      setV((old) => ({
        ...old,
        traveler_ids: [...new Set([...old.traveler_ids, ...ids])],
        traveler_batch: '',
      }));
      setExtra((old) => ({
        ...old,
        parties: [
          ...(old.parties ?? []),
          ...batchReview.flatMap((row) => row.results.filter((p: R) => p.id === row.selected)),
        ],
      }));
      setBatchReview([]);
      setTravelerBatch('');
      setTraveler('');
      travelerInput.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const travelerInput = useRef<HTMLInputElement>(null);
  const [travelerResults, setTravelerResults] = useState<R[]>([]);
  const [travelerSearching, setTravelerSearching] = useState(false);
  const [travelerSearchFailed, setTravelerSearchFailed] = useState(false);
  const travelerCreation = useRef<{ name: string; key: string; pending?: boolean } | null>(null);
  useEffect(() => {
    if (travelerNames(traveler).length > 1) {
      const timer = setTimeout(() => void reviewTravelers(traveler), 180);
      return () => {
        clearTimeout(timer);
        batchLookup.current++;
      };
    }
    if (!traveler.trim() || travelerNames(traveler).length > 1) {
      setTravelerResults([]);
      setTravelerSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/directory?traveler=true&q=${encodeURIComponent(traveler)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r) => {
          setTravelerResults(r.results);
          setTravelerSearching(false);
          setTravelerSearchFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setTravelerSearching(false);
            setTravelerSearchFailed(true);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [traveler]);
  const [error, setError] = useState('');
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inline, setInline] = useState<R | null>(null);
  const [howBooked, setHowBooked] = useState<HowBookedPreset | ''>(() => {
    const raw = String(props.config.defaults?.how_booked || '').trim();
    return (HOW_BOOKED_PRESETS as readonly string[]).includes(raw)
      ? (raw as HowBookedPreset)
      : '';
  });
  const [moreOpen, setMoreOpen] = useState(() =>
    bookingEntryMoreShouldOpen(props.config.defaults ?? {}),
  );
  const howVis = howBookedVisibility(howBooked);
  const primaryNav = bookingEntryPrimaryNav();
  useEffect(() => {
    if (bookingEntryMoreShouldOpen(v)) setMoreOpen(true);
  }, [
    v.referring_organization_id,
    v.held_pnr,
    v.ticketing_deadline,
    v.program_rate_name,
    v.program_perks,
    v.program_benefit_gained,
    v.additional_charge,
    v.additional_charge_note,
    v.notes,
    v.price_breakdown_note,
    v.summary_override,
    v.document_label,
    v.document_url,
    v.document_note,
    v.extra_income_label,
    v.extra_income_percent,
    v.extra_income_note,
    v.tax_amount,
    v.tax_bearer,
  ]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      // Nested dialogs / open comboboxes handle Escape themselves (stopPropagation).
      if (inline || travelerDetailsId) return;
      event.preventDefault();
      closeBooking();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, inline, travelerDetailsId]);
  const [extra, setExtra] = useState<Record<string, R[]>>({});
  const [hotelDirectoryHits, setHotelDirectoryHits] = useState<R[]>([]);
  const [hotelDirectoryNote, setHotelDirectoryNote] = useState('');
  /** Optional corp/IATA override only — Property / Hotel is the real hotel field. */
  const [hotelDirectoryQuery, setHotelDirectoryQuery] = useState('');
  const [hotelTipsOpen, setHotelTipsOpen] = useState(false);
  const [travelerMenuStyle, setTravelerMenuStyle] = useState<CSSProperties | undefined>();
  const [recoveryAvailable, setRecoveryAvailable] = useState(true);
  const recovery = useRef<BookingRecovery | null>(null);
  const recoveryFinished = useRef(false);
  recovery.current = {
    version: 1,
    actorId: state.actor.id,
    commandKey: props.config.key,
    savedAt: new Date().toISOString(),
    values: v,
    components,
    traveler,
    paste,
  };
  useEffect(() => {
    if (!recoveryFinished.current && recovery.current?.commandKey)
      setRecoveryAvailable(writeBookingRecovery(recovery.current));
  }, [v, components, traveler, paste]);
  useEffect(() => {
    const persist = () => {
      if (!recoveryFinished.current && recovery.current?.commandKey)
        writeBookingRecovery(recovery.current);
    };
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
    };
  }, []);
  const [entitySearch, setEntitySearch] = useState<Record<string, string>>({});
  const can = (p: string) => state.actor.role === 'OWNER' || state.actor.permissions.includes(p);
  const change = (key: string, value: any) =>
    setV((old) => ({
      ...old,
      [key]: value,
      ...(key === 'sale' ? { sale_touched: true } : {}),
      ...(key === 'source_method_id' && value !== old.source_method_id
        ? { award_program_id: '', source_profile_id: '' }
        : {}),
      ...(key === 'trip_type' && value === 'One Way' ? { travel_end: '' } : {}),
      ...(key === 'payment_status'
        ? { received: '', received_manual: false, customer_status_unresolved: false }
        : {}),
      ...(key === 'received'
        ? {
            received_manual: true,
            payment_status: Number(value) > 0 ? 'Partial' : 'Unpaid',
            customer_status_unresolved: false,
          }
        : {}),
    }));
  const changeProduct = (product: string) =>
    setV((old) => transitionBookingProduct(old, product, rows('bookingSourceMethods')));
  const patch = (i: number, key: string, value: any) =>
    setComponents((old) =>
      old.map((c, j) =>
        i === j
          ? {
              ...c,
              [key]: value,
              ...(key === 'method' ? { account_id: '' } : {}),
              ...(['bp_gross_points', 'bp_rebate_percent'].includes(key) && c.use_bp_economics
                ? {
                    quantity:
                      bpNet(
                        key === 'bp_gross_points' ? value : c.bp_gross_points,
                        key === 'bp_rebate_percent' ? value : c.bp_rebate_percent,
                      )?.toString() ?? '',
                  }
                : {}),
              ...(key === 'supplied'
                ? {
                    supplied_unresolved: false,
                    ...(value !== 'Points / Miles' ? { use_bp_economics: false } : {}),
                    quantity: '',
                    quoted_rate: '',
                    rate_unit: value === 'Points / Miles' ? 'cents per point' : '',
                    instrument_id: '',
                    program_id: '',
                    face_value: '',
                  }
                : {}),
              ...(key === 'payment_status' ? { paid: '', seller_status_unresolved: false } : {}),
              ...(key === 'paid'
                ? {
                    payment_status: Number(value) > 0 ? 'Partial' : 'Unpaid',
                    seller_status_unresolved: false,
                  }
                : {}),
            }
          : c,
      ),
    );
  const rows = (source: string) =>
    [...(extra[source] ?? []), ...(state[source] ?? [])].filter(
      (r: R, i: number, a: R[]) => a.findIndex((x) => x.id === r.id) === i,
    );
  const text = (key: string, label: string, type = 'text', required = false, large = false) => (
    <Field key={key} label={label} full={large} required={required}>
      {large ? (
        <textarea
          aria-label={label}
          rows={2}
          value={v[key] ?? ''}
          onInput={(e) => {
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
          }}
          onChange={(e) => change(key, e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          step={type === 'number' ? '0.01' : undefined}
          min={type === 'number' ? 0 : undefined}
          value={v[key] ?? ''}
          onInput={(e) => {
            if (type === 'date' || type === 'datetime-local') change(key, e.currentTarget.value);
          }}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
    </Field>
  );
  const select = (
    key: string,
    label: string,
    values: string[],
    set = (value: string) => change(key, value),
    value = v[key] ?? '',
    required = false,
  ) => (
    <Field label={label} required={required}>
      <SearchableSelect
        id={`entry-${key}`}
        label={label}
        value={value}
        hideCount
        options={values.map((s) => ({
          value: s,
          label: key.startsWith('type-')
            ? (
                {
                  'Padova payment': 'Paid by Padova',
                  'Customer card': 'Customer paid provider',
                  'Outside seller': 'Purchased from seller',
                  'Owned value': 'Use Padova points / credit',
                  Other: 'Other / custom',
                } as Record<string, string>
              )[s] || s
            : s,
        }))}
        onChange={set}
      />
    </Field>
  );
  const entity = (
    key: string,
    label: string,
    source: string,
    kind: string,
    defaults: R = {},
    set = (value: string) => change(key, value),
    value = v[key] ?? '',
    filter = (r: R) => true,
  ) => (
    <Field label={label} required={Boolean(defaults.required)}>
      <>
        {source === 'parties' ? (
          <BookingPartySelect
            id={`entry-${key}`}
            label={label}
            role={
              (defaults.roles?.[0] ??
                (key === 'provider_id' ? providerRole(v.product) : 'customer')) as DirectoryRole
            }
            allowedIds={key.startsWith('owner-') ? [v.customer_id, ...v.traveler_ids] : undefined}
            value={value}
            initial={rows(source)
              .filter(filter)
              .filter((p) =>
                key.startsWith('owner-')
                  ? [v.customer_id, ...v.traveler_ids].includes(p.id)
                  : eligibleParty(
                      p,
                      (defaults.roles?.[0] ??
                        (key === 'provider_id'
                          ? providerRole(v.product)
                          : 'customer')) as DirectoryRole,
                    ),
              )}
            onChange={set}
            createDefaults={
              key === 'customer_id'
                ? {
                    phone: String(v.intake_customer_phone ?? ''),
                    email: String(v.intake_customer_email ?? ''),
                    notes: String(v.intake_customer_notes ?? ''),
                  }
                : undefined
            }
            onCreate={
              !key.startsWith('owner-') && onInlineCommand
                ? async (name, commandKey, partyKind, extras) => {
                    const role =
                      defaults.roles?.[0] ??
                      (key === 'provider_id' ? providerRole(v.product) : 'customer');
                    const details = {
                      ...(defaults.details ?? {}),
                      ...(extras?.notes
                        ? { relationship_notes: extras.notes.slice(0, 2000) }
                        : {}),
                    };
                    const data = {
                      ...defaults,
                      name,
                      kind:
                        partyKind ??
                        defaults.kind ??
                        (['airline', 'property', 'rental', 'commission_payer'].includes(role)
                          ? 'company'
                          : 'person'),
                      roles: [role],
                      phone: extras?.phone?.slice(0, 100) || '',
                      email: extras?.email || '',
                      details,
                    };
                    // Do not lock the whole booking form — party create is local + fast.
                      const result = await onInlineCommand('party', data, commandKey);
                      const row = { ...data, ...result };
                      setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), row] }));
                      return row;
                  }
                : undefined
            }
          />
        ) : (
          <SearchableSelect
            onSearch={(query) => setEntitySearch((old) => ({ ...old, [key]: query }))}
            id={`entry-${key}`}
            label={label}
            value={value}
            options={rows(source)
              .filter(filter)
              .map((r: R) => ({
                ...(source === 'assets'
                  ? inventoryOption(r, assetUnit(r))
                  : { value: r.id, label: r.name }),
              }))}
            onChange={set}
            hideCount
            onAdd={
              !key.startsWith('owner-') && onInlineCommand
                ? (name) =>
                    setInline({
                      kind,
                      source,
                      defaults: { ...defaults, ...(name ? { name } : {}) },
                      set,
                    })
                : undefined
            }
            addLabel={(name) => {
              const item =
                source === 'bookingSourceMethods'
                  ? 'booking method'
                  : source === 'bookingSourceProfiles'
                    ? 'profile'
                    : source === 'paymentAccounts'
                      ? 'card / account'
                      : source === 'assets'
                        ? 'Padova inventory'
                        : label.toLowerCase();
              return name ? `Add “${name}” as a new ${item}` : `Add new ${item}`;
            }}
            emptyLabel={
              source === 'bookingSourceProfiles'
                ? `No matching ${defaults.provider ?? ''} profiles. Add one below.`
                : undefined
            }
          />
        )}
      </>
      {source === 'bookingSourceProfiles' && onInlineCommand && !value ? (
      <div className="inline-actions">
          <button
            type="button"
            className="btn small"
            onClick={() =>
              setInline({
                kind,
                source,
                defaults: {
                  ...defaults,
                  ...(entitySearch[key]?.trim() ? { name: entitySearch[key].trim() } : {}),
                },
                set,
              })
            }
          >
            + New profile
          </button>
      </div>
      ) : null}
    </Field>
  );
  const addTraveler = async (editDetails = false) => {
    const name = traveler.trim();
    if (!name || travelerSearching || travelerSearchFailed || travelerCreation.current?.pending)
      return;
    setError('');
    try {
      const exact = [...travelerResults, ...rows('parties')]
        .filter(
          (p, i, all) => all.findIndex((r) => r.id === p.id) === i && eligibleParty(p, 'traveler'),
        )
        .filter(
          (p) =>
            p.name.normalize('NFKC').trim().toLowerCase() ===
            name.normalize('NFKC').trim().toLowerCase(),
        );
      if (exact.length === 1) {
        change('traveler_ids', [...new Set([...v.traveler_ids, exact[0].id])]);
        setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), exact[0]] }));
        setTraveler('');
        if (editDetails) setTravelerDetailsId(exact[0].id);
        return;
      }
      if (exact.length > 1) throw Error('Choose which existing traveler to use.');
      if (!onInlineCommand) throw new Error('Inline traveler creation unavailable');
      const existingTravelerCreate = travelerCreation.current;
      if (!existingTravelerCreate || existingTravelerCreate.name !== name)
        travelerCreation.current = { name, key: crypto.randomUUID(), pending: true };
      else existingTravelerCreate.pending = true;
      const data = { name, kind: 'person', roles: ['traveler'] };
      const result = await onInlineCommand('party', data, travelerCreation.current!.key);
      setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), { ...data, ...result }] }));
      change('traveler_ids', [...new Set([...v.traveler_ids, result.id])]);
      setTraveler('');
      travelerInput.current?.focus();
      travelerCreation.current = null;
      if (editDetails) setTravelerDetailsId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create traveler');
      if (travelerCreation.current) travelerCreation.current.pending = false;
    }
  };
  const method = rows('bookingSourceMethods').find((m) => m.id === v.source_method_id);
  const bpSource = /amex.*(?:travel|platinum)|business platinum/i.test(method?.name ?? '');
  const inheritedProgram = method?.award
    ? v.award_program_id
    : bpSource
      ? rows('programs').find((p) => /membership.*rewards|amex.*\bmr\b/i.test(p.name))?.id
      : '';
  const providerDirect = components.some((c) => c.type === 'Customer card');
  const bookedCostCents = entryBookedCostCents(components, usd);
  const customerDirectCents = entryBookedCostCents(
    components.filter((c) => c.type === 'Customer card'),
    usd,
  );
  const bookedCostLabel =
    bookedCostCents === undefined ? undefined : dollars(bookedCostCents);
  const activeProfile = rows('bookingSourceProfiles').find((p) => p.id === v.source_profile_id);
  const sourceContact = rows('parties').find((p) => p.id === activeProfile?.holder_id);
  useEffect(() => {
    if (bpSource)
      setComponents((old) =>
        old.map((c) =>
          c.type === 'Outside seller' &&
          c.entry_placeholder &&
          !c.bp_inferred &&
          !c.bp_custom_supply &&
          !c.different_program
            ? {
                ...c,
                supplied: 'Points / Miles',
                unit: 'points',
                program_id: c.program_id || inheritedProgram,
                bp_inferred: true,
                rate_unit: c.rate_unit || 'cents per point',
                bp_rebate_percent: c.bp_rebate_percent ?? '35',
              }
            : c,
        ),
      );
  }, [v.source_method_id, inheritedProgram]);
  // Soft-default sale until staff edits it:
  // - Customer paid provider → $0 (trip already paid to provider; fee goes in Extra charge)
  // - Padova paid → booked cost (typical customer price matches trip cost)
  // Incomplete percent pricing falls back to Manual so the summary always shows dollars.
  // Same as Cost / Fixed Margin keep their Plan method while cost updates.
  useEffect(() => {
    if (!can('edit_customer_charges')) return;
    if (bookedCostCents === undefined && !providerDirect) return;
    setV((old) => {
      if (old.sale_touched && old.pricing_method === 'Manual Customer Price') return old;
      // Pasted / staff-entered price must never be overwritten by cost (Plan QA finding).
      if (
        old.pricing_method === 'Manual Customer Price' &&
        old.sale !== '' &&
        old.sale != null &&
        !old.sale_seeded_from_cost
      )
        return old;
      const percentIncomplete =
        old.pricing_method === 'Percentage Off Comparable Online Price' &&
        !old.price_override &&
        (old.comparable_price === '' ||
          old.comparable_price == null ||
          old.discount_percent === '' ||
          old.discount_percent == null);
      if (
        old.pricing_method === 'Percentage Off Comparable Online Price' &&
        !old.price_override &&
        !percentIncomplete
      )
        return old;
      if (old.pricing_method === 'Fixed Margin') {
        if (bookedCostCents === undefined) return old;
        const margin = (() => {
          try {
            return usd(old.fixed_margin);
          } catch {
            return undefined;
          }
        })();
        if (margin === undefined) return old;
        const next = (fixedMarginPrice(bookedCostCents, margin) / 100).toFixed(2);
        if (String(old.sale ?? '') === next) return old;
        return { ...old, sale: next, sale_seeded_from_cost: false };
      }
      if (old.pricing_method === 'Same as Cost') {
        if (bookedCostCents === undefined) return old;
        const next = (bookedCostCents / 100).toFixed(2);
        if (String(old.sale ?? '') === next) return old;
        return { ...old, sale: next, sale_seeded_from_cost: true };
      }
      const next = providerDirect
        ? '0'
        : bookedCostCents === undefined
          ? undefined
          : (bookedCostCents / 100).toFixed(2);
      if (next === undefined) return old;
      if (String(old.sale ?? '') === next && !percentIncomplete) return old;
      return {
        ...old,
        pricing_method: 'Manual Customer Price',
        price_override: false,
        sale: next,
        sale_seeded_from_cost: !providerDirect,
      };
    });
  }, [bookedCostCents, providerDirect]);
  const selectedProvider = rows('parties').find((p) => p.id === v.provider_id);
  const derived = derivedTravel(v, selectedProvider?.name);
  const dateLabels = travelDateLabels(v.product, v.trip_type);
  const dateOrderIssue = travelDateOrderIssue(v);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const customerFieldRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!error) return;
    if (/select a customer/i.test(error)) {
      customerFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);
  // Real-time: drop the save banner as soon as the related field is fixed.
  useEffect(() => {
    if (!error) return;
    const msg = error.toLowerCase();
    if (msg.includes('select a customer') && v.customer_id) setError('');
    else if (msg.includes('typed name') && !traveler.trim()) setError('');
    else if (
      msg.includes('travel date') &&
      (v.trip_type === 'Multi-City' ? v.segments?.[0]?.date : v.travel_start)
    )
      setError('');
    else if (
      (msg.includes('return') || msg.includes('check-out') || msg.includes('drop-off')) &&
      v.travel_end
    )
      setError('');
    else if (msg.includes('what this booking is for') && v.description?.trim()) setError('');
    else if (msg.includes('partial customer payment') && v.received) setError('');
    else if (msg.includes('customer payment status') && !v.customer_status_unresolved)
      setError('');
    else if (!dateOrderIssue && /check-in|check-out|drop-off|return|start.+end|end.+start/i.test(msg))
      setError('');
  }, [
    error,
    v.customer_id,
    traveler,
    v.trip_type,
    v.segments,
    v.travel_start,
    v.travel_end,
    v.description,
    v.received,
    v.customer_status_unresolved,
    dateOrderIssue,
  ]);
  const customerMissing = attemptedSave && !v.customer_id;
  const travelStartMissing =
    attemptedSave &&
    !(v.trip_type === 'Multi-City' ? v.segments?.[0]?.date : v.travel_start);
  const travelEndMissing =
    attemptedSave && Boolean(bookingTravelEndMissingMessage(v));
  const otherDescriptionMissing =
    attemptedSave && v.product === 'Other' && !String(v.description || '').trim();
  const percentPricing = v.pricing_method === 'Percentage Off Comparable Online Price';
  const sameAsCostPricing = v.pricing_method === 'Same as Cost';
  const fixedMarginPricing = v.pricing_method === 'Fixed Margin';
  let calculatedSale: number | undefined;
  try {
    if (
      percentPricing &&
      v.comparable_price !== '' &&
      v.comparable_price != null &&
      v.discount_percent !== '' &&
      v.discount_percent != null
    )
      calculatedSale = percentagePrice(usd(v.comparable_price)!, decimalUnits(v.discount_percent));
    else if (sameAsCostPricing && bookedCostCents !== undefined)
      calculatedSale = bookedCostCents;
    else if (
      fixedMarginPricing &&
      bookedCostCents !== undefined &&
      v.fixed_margin !== '' &&
      v.fixed_margin != null
    ) {
      const margin = usd(v.fixed_margin);
      if (margin !== undefined) calculatedSale = fixedMarginPrice(bookedCostCents, margin);
    }
  } catch {
    /* Incomplete input remains unknown until validated on Save. */
  }
  const baseSale = can('edit_customer_charges')
      ? (percentPricing && !v.price_override) || sameAsCostPricing || fixedMarginPricing
        ? calculatedSale
        : usd(v.sale)
      : undefined,
    extraCharge = can('edit_customer_charges') ? (usd(v.additional_charge) ?? 0) : 0;
  const total = (baseSale ?? 0) + extraCharge;
  const received = can('edit_payments')
    ? customerReceivedAmount(v.payment_status, usd(v.received), total, !!v.received_manual)
    : 0;
  const matches = [
    ...travelerResults,
    ...rows('parties')
      .filter((p) => similarTravelerName(p.name, traveler))
      .slice(0, 5),
  ]
    .filter((p, i, all) => all.findIndex((r) => r.id === p.id) === i)
    .filter(
      (p) =>
        eligibleParty(p, 'traveler') &&
        !p.details?.traveler_review_only &&
        (p.name.toLowerCase().includes(traveler.trim().toLowerCase()) ||
          similarTravelerName(p.name, traveler)),
    )
    .slice(0, 20);
  const showTravelerMatches =
    Boolean(traveler.trim()) && travelerNames(traveler).length === 1 && matches.length > 0;
  useLayoutEffect(() => {
    if (!showTravelerMatches || !travelerInput.current) {
      setTravelerMenuStyle(undefined);
      return;
    }
    const place = () => {
      const rect = travelerInput.current?.getBoundingClientRect();
      if (!rect) return;
      setTravelerMenuStyle(fixedMenuStyleFromRect(rect));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showTravelerMatches, traveler, matches.length]);
  async function applyPaste(rawText?: string) {
    let sourceText = rawText ?? paste;
    if (looksLikeEml(sourceText)) {
      const body = extractTextFromEml(sourceText).trim();
      if (body) sourceText = body;
    }
    if (rawText != null && rawText !== paste) setPaste(sourceText);
    else if (sourceText !== paste && looksLikeEml(paste)) setPaste(sourceText);
    const reservationBlock = intakeReservationBlockReason(sourceText);
    if (reservationBlock) {
      setPasteIssues([reservationBlock]);
      setPasteHelperStatus('Verify this is a real booking confirmation before filling fields.');
      setError(reservationBlock);
      return;
    }
    const preview = parseQuickPaste(sourceText),
      p = preview.fields,
      // Quiet successes / unknown labels — mapping panel covers them. Keep only blocking notes.
      issues: string[] = [...preview.issues];
    const target = p.product
      ? products.find((x) => normalizePasteValue(x) === normalizePasteValue(p.product))
      : v.product;
    if (p.product && !target) issues.push('Choose a valid Product');
    let next: R = transitionBookingProduct(v, target ?? '', rows('bookingSourceMethods'));
    const amount = (key: string) => {
      if (p[key] === undefined) return undefined;
      try {
        usd(p[key]);
        return p[key];
      } catch {
        issues.push(`${key}: enter an exact dollar amount`);
        return '';
      }
    };
    for (const key of [
      'route',
      'flight_numbers',
      'ticket_numbers',
      'cabin',
      'room_type',
      'travel_start',
      'travel_end',
      'primary_reference',
      'pickup_location',
      'dropoff_location',
      'sale',
      'notes',
      'reservation_summary',
      'description',
      'booking_source_confirmation',
      'tax_amount',
      'tax_bearer',
    ])
      if (p[key] !== undefined)
        next[key] = ['sale', 'tax_amount'].includes(key) ? amount(key) : p[key];
    if (p.sale !== undefined) {
      next.sale_touched = true;
      next.sale_seeded_from_cost = false;
    }
    if (next.product === 'Hotel' && p.route && !next.location) next.location = p.route;
    if (p.customer)
      next.intake_customer_label =
        /^(unknown|n\/a|not applicable)$/i.test(p.customer) ? '' : p.customer;
    if (p.customer_phone) next.intake_customer_phone = String(p.customer_phone).trim();
    if (p.customer_email) next.intake_customer_email = String(p.customer_email).trim();
    if (p.customer_notes) next.intake_customer_notes = String(p.customer_notes).trim();
    if (p.traveler)
      next.intake_traveler_label =
        /^(unknown|n\/a|not applicable)$/i.test(p.traveler) ? '' : p.traveler;
    if (p.trip_type) {
      const trip = normalizePasteValue(p.trip_type);
      if (!/^(unknown|n\/a|not applicable|)$/i.test(trip)) {
      next.trip_type =
        trip === 'round trip'
          ? 'Round Trip'
          : trip === 'one way'
            ? 'One Way'
            : ['multi-city', 'multi city'].includes(trip)
              ? 'Multi-City'
              : '';
      if (!next.trip_type)
          issues.push('Trip Type unclear, pick One Way, Round Trip, or Multi-City');
      }
    }
    // Route last so ORIGIN-DEST-ORIGIN can set Round Trip even if Trip Type was Unknown/One Way.
    if (next.product === 'Flight' && p.route) {
      const endpoints = flightEndpoints({ route: p.route });
      next.origin = endpoints.origin;
      next.destination = endpoints.destination;
      if (endpoints.origin && endpoints.destination)
        next.route = `${endpoints.origin}-${endpoints.destination}`;
      if (
        'roundTripHint' in endpoints &&
        endpoints.roundTripHint &&
        (!next.trip_type || next.trip_type === 'One Way')
      ) {
        next.trip_type = 'Round Trip';
      }
    }
    if (p.reservation_summary) next.summary_override = true;
    if (p.sale !== undefined && !can('edit_customer_charges')) {
      delete next.sale;
      issues.push('Customer price was not applied: billing requires authorization');
    }
    if (!can('manage_funding') && next.tax_bearer === 'Padova') {
      delete next.tax_amount;
      delete next.tax_bearer;
      issues.push('Padova-paid taxes were not applied: funding permission required');
    }
    const ensureParty = async (label: string, role: DirectoryRole, createIfMissing = true) => {
      try {
        const local = rows('parties').filter((row: R) => eligibleParty(row, role));
        const localHit = exactEligibleMatch(local, label, role);
        if (localHit) {
          setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), localHit] }));
          return localHit.id as string;
        }
        const response = await fetch(
          `/api/directory?role=${encodeURIComponent(role)}&q=${encodeURIComponent(label)}`,
        );
        if (!response.ok) throw new Error(`Directory lookup failed for ${role}`);
      const data = await response.json();
        const results = (data.results ?? []).filter((row: R) => eligibleParty(row, role));
        const found = exactEligibleMatch(results, label, role);
        if (found) {
          setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), found] }));
          return found.id as string;
        }
        const exacts = results.filter(
          (row: R) =>
            row.name.normalize('NFKC').trim().toLowerCase() ===
            label.normalize('NFKC').trim().toLowerCase(),
        );
        if (exacts.length > 1) {
          issues.push(
            `Multiple ${role} records named “${label}”, choose the correct one before Save.`,
          );
          return '';
        }
        if (!createIfMissing) {
          issues.push(`Select ${role}: “${label}” has no unique exact eligible match`);
          return '';
        }
        if (!onInlineCommand) {
          issues.push(`Unable to create ${role} “${label}”, inline create unavailable`);
          return '';
        }
        const keyId = `${role}:${label.normalize('NFKC').trim().toLowerCase()}`;
        if (!intakePartyKeys.current.has(keyId))
          intakePartyKeys.current.set(keyId, crypto.randomUUID());
        const payload: R = {
          name: label.trim(),
          kind: ['airline', 'property', 'rental', 'commission_payer', 'seller'].includes(role)
            ? 'company'
            : 'person',
          roles: [role],
        };
        if (role === 'customer') {
          if (next.intake_customer_phone) payload.phone = String(next.intake_customer_phone);
          if (next.intake_customer_email) payload.email = String(next.intake_customer_email);
          if (next.intake_customer_notes)
            payload.details = {
              relationship_notes: String(next.intake_customer_notes).slice(0, 2000),
            };
        }
        const result = await onInlineCommand(
          'party',
          payload,
          intakePartyKeys.current.get(keyId)!,
        );
        if (!result?.id) throw new Error(`Create ${role} returned no id`);
        const row = { ...payload, ...result };
        setExtra((old) => ({ ...old, parties: [...(old.parties ?? []), row] }));
        return result.id as string;
      } catch (err) {
        issues.push(
          err instanceof Error
            ? err.message
            : `Unable to resolve ${role} “${label}” from intake`,
        );
        return '';
      }
    };
    // Publish progress as soon as customer (and other parties) resolve so the
    // Customer field paints immediately instead of waiting on later lookups.
    const publishProgress = () => {
      setV({
        ...next,
        traveler_ids: [...(next.traveler_ids ?? [])],
      });
    };

    const partyLookups: Array<Promise<void>> = [];
    if (p.customer && !/^(unknown|n\/a|not applicable)$/i.test(p.customer)) {
      partyLookups.push(
        (async () => {
          next.customer_id = await ensureParty(p.customer, 'customer');
          next.intake_customer_label = next.customer_id ? '' : p.customer;
          publishProgress();
        })(),
      );
    }
    if (p.traveler && !/^(unknown|n\/a|not applicable)$/i.test(p.traveler)) {
      partyLookups.push(
        (async () => {
          const names = travelerNames(p.traveler);
          const ids: string[] = [];
          for (const name of names) {
            const id = await ensureParty(name, 'traveler');
            if (id) ids.push(id);
          }
          if (ids.length) {
            next.traveler_ids = [...new Set(ids)];
            setTraveler('');
            next.intake_traveler_label = '';
          } else {
            setTraveler(p.traveler);
            next.intake_traveler_label = p.traveler;
          }
          publishProgress();
        })(),
      );
    }
    if (p.airline && next.product === 'Flight') {
      partyLookups.push(
        (async () => {
          next.provider_id = await ensureParty(p.airline, 'airline');
          publishProgress();
        })(),
      );
    } else if (p.property && next.product === 'Hotel') {
      partyLookups.push(
        (async () => {
          next.provider_id = await ensureParty(p.property, 'property');
          setHotelDirectoryQuery(String(p.property));
          publishProgress();
        })(),
      );
    } else if (p.airline || p.property) {
      issues.push('Provider label is incompatible with Product; select the appropriate provider');
    }
    await Promise.all(partyLookups);

    const method = p.method
      ? bookingSourceMethodMatch(
          rows('bookingSourceMethods').filter((m) => m.products.includes(next.product)),
          p.method,
        )
      : rows('bookingSourceMethods').find((m) => m.id === next.source_method_id);
    if (p.method) {
      next.source_method_id = method?.id ?? '';
      if (!method) issues.push(`Select booking method: ${p.method}`);
      next.source_profile_id = '';
      // Cap1 Travel paste → How-booked Capital One when unique channel match.
      if (method && /capital\s*one/i.test(String(method.name || ''))) {
        next.how_booked = 'Capital One';
        setHowBooked('Capital One');
      }
    }
    if (p.referring_organization) {
      if (!can('manage_commissions')) {
        issues.push(
          'Referring organization was not applied: commission permission required',
        );
      } else {
        const orgs = (state.referralOrganizations ?? []) as R[];
        const wanted = normalizePasteValue(String(p.referring_organization));
        const hits = orgs.filter(
          (o) => normalizePasteValue(String(o.name ?? '')) === wanted,
        );
        if (hits.length === 1) {
          next.referring_organization_id = hits[0].id;
        } else if (hits.length > 1) {
          next.referring_organization_id = '';
          issues.push(
            `Multiple referring organizations named “${p.referring_organization}”, choose the correct one before Save.`,
          );
        } else {
          next.referring_organization_id = '';
          issues.push(
            `Select referring organization: “${p.referring_organization}” has no exact match among accepted partnership deals (no new org created).`,
          );
        }
      }
    }
    if (p.source_profile) {
      const profile = exactEligibleMatch(
        rows('bookingSourceProfiles').filter(
          (r) => r.status === 'Active' && r.source_method_id === next.source_method_id,
        ),
        p.source_profile,
      );
      next.source_profile_id = profile?.id ?? '';
      if (!profile) issues.push(`Select source account/profile: ${p.source_profile}`);
    }
    const program = p.program
      ? exactEligibleMatch(
          rows('programs').filter((r) => ['Airline', 'Hotel', 'Bank'].includes(r.category)),
          p.program,
        )
      : undefined;
    if (p.program && !program) issues.push(`Select program: ${p.program}`);
    if (!method?.award) next.award_program_id = '';
    else if (p.program) next.award_program_id = program?.id ?? '';
    if (p.customer_paid !== undefined) {
      const status = parsePaymentStatus(p.customer_paid);
      next.payment_status = can('edit_payments') ? (status ?? '') : 'Unpaid';
      next.customer_status_unresolved = can('edit_payments') && !status;
      next.received_manual =
        status === 'Partial' || (status === 'Paid' && p.received !== undefined);
      next.received = ['Paid', 'Partial'].includes(status ?? '') ? (amount('received') ?? '') : '';
      if (!can('edit_payments'))
        issues.push('Customer payment claim was not applied: payment permission required');
    }
    if (
      ['seller', 'seller_cost', 'seller_paid', 'bought'].some((key) => p[key] !== undefined) &&
      can('manage_funding')
    ) {
      const bought = p.bought !== undefined ? parseBoughtValue(p.bought) : undefined;
      const status = p.seller_paid !== undefined ? parsePaymentStatus(p.seller_paid) : 'Unpaid';
      const c: R = {
        type: 'Outside seller',
        supplied: p.bought !== undefined ? (bought?.supplied ?? '') : 'Complete Booking / Ticket',
        supplied_unresolved: p.bought !== undefined && !bought,
        unit: bought?.unit ?? 'money',
        quantity: bought?.quantity,
        ...(p.points_quantity ? { quantity: p.points_quantity.replaceAll(',', '') } : {}),
        quoted_rate: p.quoted_rate,
        rate_unit: p.rate_unit || 'cents per point',
        account_email: p.account_email || undefined,
        notes: p.account_email
          ? `Account email used: ${p.account_email}`
          : undefined,
        program_id: bought?.supplied === 'Points / Miles' ? program?.id : undefined,
        seller_id: p.seller ? await ensureParty(p.seller, 'seller') : '',
        cost: amount('seller_cost') ?? '',
        payment_status: status ?? '',
        seller_status_unresolved: !status,
        paid: ['Paid', 'Partial'].includes(status ?? '') ? amount('seller_amount_paid') : undefined,
      };
      if (p.account) {
        const account = exactEligibleMatch(
          rows('paymentAccounts').filter((a) => accountSupports(a, 'Card')),
          p.account,
        );
        c.method = 'Card';
        c.account_id = account?.id ?? '';
        next.tax_method = 'Card';
        next.tax_account_id = c.account_id;
        if (!account) issues.push(`Select eligible Padova card: ${p.account}`);
      }
      setComponents([c]);
    } else if (
      ['seller', 'seller_cost', 'seller_paid', 'bought'].some((key) => p[key] !== undefined)
    )
      issues.push('Funding claims were not applied: funding permission required');
    if (
      next.product === 'Flight' &&
      next.trip_type === 'One Way' &&
      p.travel_end &&
      !issues.some((i) => i.startsWith('Contradiction:'))
    )
      issues.push(
        'One Way with a return date, return was not applied; check Trip Type.',
      );
    next = transitionBookingProduct(next, next.product, rows('bookingSourceMethods'));
    setV(next);
    setError('');
    setPasteIssues(issues);
  }
  async function loadBookingPasteFile(file: File) {
    setError('');
    setPasteIssues([]);
    setPasteHelperStatus('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File must be 10 MB or smaller');
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImage =
        file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
      setPasteFileName(file.name);
      userClosedQuickPaste.current = false;
      setQuickPasteOpenSafe(true);
      setBusy(true);
      if (isPdf || isImage) {
        setPasteHelperStatus(
          isPdf ? `Reading PDF “${file.name}”…` : `Reading screenshot “${file.name}”…`,
        );
        const data = new FormData();
        data.set('source', 'staff_upload');
        data.set('preview_only', '1');
        data.set('file', file, file.name);
        const response = await fetch('/api/booking-intake', {
          method: 'POST',
          body: data,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `Unable to read that ${isPdf ? 'PDF' : 'image'}`);
        if (result.unread || !String(result.text || '').trim()) {
          setPasteHelperStatus('');
          setError(
            result.unread_message ||
              `“${file.name}” has no readable text, paste the reservation text instead.`,
          );
          return;
        }
        const text = String(result.text).slice(0, 20000);
        setPaste(text);
        await applyPaste(text);
        const found = Number(result.mapping?.found ?? 0);
        const via =
          result.extract_method === 'ocr'
            ? 'screenshot OCR'
            : result.extract_method === 'pdf-ocr'
              ? 'PDF OCR'
              : isPdf
                ? 'PDF text'
                : 'file text';
        setPasteHelperStatus(
          found > 0
            ? `Filled ${found} field${found === 1 ? '' : 's'} from ${via}, review, then Save Booking. Missing stays Unknown.`
            : `Loaded text from ${via}, map fields on the right, then Re-apply if needed. Nothing posts money yet.`,
        );
        return;
      }
      setPasteHelperStatus(`Loading “${file.name}”…`);
      const text = await file.text();
      if (text.includes('\u0000'))
        throw new Error('File looks binary, use plain text, .eml, PDF, or a screenshot image');
      const loaded = pasteTextFromUpload(text, file.name);
      const nextText = loaded.text.slice(0, 20000);
      setPaste(nextText);
      await applyPaste(nextText);
      const preview = buildIntakeMappingPreview(nextText);
      const found = preview.found || 0;
      setPasteHelperStatus(
        found > 0
          ? `Filled ${found} field${found === 1 ? '' : 's'} from file, review, then Save Booking.`
          : `Loaded “${file.name}”, paste Field: Value lines if mapping is empty.`,
      );
    } catch (err) {
      setPasteHelperStatus('');
      setError(err instanceof Error ? err.message : 'Unable to read that file');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (intakeAutoApplied.current) return;
    const text = String(
      props.config.defaults.recovery_paste ||
        props.config.defaults.intake_raw_text ||
        paste ||
        '',
    );
    const shouldApply =
      props.config.defaults.intake_apply_on_open ||
      props.config.defaults.intake_raw_text ||
      props.config.defaults.recovery_paste;
    if (!shouldApply || !text.trim()) return;
    intakeAutoApplied.current = true;
    void (async () => {
      setBusy(true);
      try {
        await applyPaste(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Intake auto-fill failed');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot intake open apply
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAttemptedSave(true);
    setBusy(true);
    try {
      if (!v.customer_id) throw new Error('Select a customer, or use Save Draft.');
      if (
        [...new Set([...ticketingDirty.current, ...ticketingCache.current.keys()])].some((id) =>
          v.traveler_ids.includes(id),
        )
      )
        throw new Error('Save traveler profile edits before saving the booking.');
      if (traveler.trim())
        throw new Error('Finish the traveler name (select a match or create) before saving.');
      if (v.product === 'Flight' && v.trip_type === 'Multi-City') {
        const segments = v.segments ?? [];
        if (
          segments.length < 2 ||
          segments.some((s: R) => !s.origin?.trim() || !s.destination?.trim() || !s.date)
        )
          throw new Error(
            'Enter at least two Multi-City segments with origin, destination and date.',
          );
      }
      if (!(v.trip_type === 'Multi-City' ? v.segments?.[0]?.date : v.travel_start))
        throw new Error('Enter the travel date, or use Save Draft.');
      const endMissing = bookingTravelEndMissingMessage(v);
      if (endMissing) throw new Error(endMissing);
      const dateIssue = travelDateOrderIssue(v);
      if (dateIssue) throw new Error(dateIssue);
      if (v.product === 'Flight' && v.trip_type !== 'Multi-City') {
        const endpoints = flightEndpoints(v);
        if (!!endpoints.origin.trim() !== !!endpoints.destination.trim())
          throw Error('Enter both From and To, or leave both unknown.');
      }
      if (v.product === 'Other' && !v.description?.trim())
        throw new Error('Enter what this booking is for.');
      if (v.payment_status === 'Partial' && !usd(v.received))
        throw new Error('Enter the actual partial customer payment.');
      if (can('edit_payments') && v.customer_status_unresolved)
        throw new Error('Resolve Customer Payment Status before saving.');
      if (received > total && baseSale !== undefined)
        throw new Error(
          'Amount received exceeds this sale. Record shared/excess credit in Payments.',
        );
      const refs = [
        ...parseList(v.primary_reference ?? '').map((value) => ({
          type:
            v.product === 'Flight'
              ? 'airline_pnr'
              : v.product === 'Hotel'
                ? 'hotel_confirmation'
                : v.product === 'Car'
                  ? 'car_confirmation'
                  : 'other_reference',
          value,
        })),
        ...(v.product === 'Flight' ? parseList(v.ticket_numbers ?? '') : []).map((value) => ({
          type: 'ticket_number',
          value,
        })),
        ...(v.product === 'Flight' ? (v.provider_references ?? []) : [])
          .filter((r: R) => r.value?.trim())
          .map((r: R) => ({
            type: 'airline_pnr',
            value: r.value.trim(),
            provider_id: r.provider_id || undefined,
          })),
        ...parseList(v.booking_source_confirmation ?? '').map((value) => ({
          type: 'booking_source_confirmation',
          value,
        })),
      ];
      const componentInput = (can('manage_funding') ? components : [])
        .filter(
          (c) =>
            !c.entry_placeholder ||
            c.cost_is_estimate ||
            String(c.other_currency_code || '').trim() ||
            [c.cost, c.seller_id, c.asset_id, c.quantity, c.paid].some(
              (x) => x !== '' && x != null,
            ),
        )
        .map((original) => {
          const c = { ...original };
          if (
            bpSource &&
            c.type === 'Outside seller' &&
            c.use_bp_economics &&
            !Number(c.bp_gross_points)
          )
            throw new Error(
              'Enter the gross points, or turn off the suggested rebate calculation to enter the agreed net points.',
            );
          if (c.cost_is_estimate && usd(c.paid))
            throw new Error(
              'Cannot record payment against a cost estimate — enter the real USD amount first',
            );
          const bp =
            bpSource && c.type === 'Outside seller' && c.bp_gross_points && c.use_bp_economics;
          if (bp) {
            c.quantity = bpNet(c.bp_gross_points, c.bp_rebate_percent);
            if (c.quantity === undefined)
              throw new Error('Enter whole gross points and a valid rebate percentage.');
          }
          if (c.transfer && !c.asset_name?.trim())
            throw new Error('Enter a name for the value acquired into Padova inventory.');
          if (c.supplied === 'Points / Miles' && !c.rate_unit) c.rate_unit = 'cents per point';
          if (c.supplied === 'Points / Miles' && inheritedProgram && !c.different_program)
            c.program_id = inheritedProgram;
          if (c.seller_status_unresolved)
            throw new Error('Resolve Seller Payment Status before saving');
          if (c.supplied_unresolved)
            throw new Error('Choose what the seller supplied before saving');
          if (c.type === 'Customer card')
            for (const key of [
              'account_id',
              'method',
              'asset_id',
              'seller_id',
              'program_id',
              'instrument_id',
              'quantity',
              'quoted_rate',
              'rate_unit',
              'paid',
              'transfer',
            ])
              delete c[key];
          if (c.supplied !== 'Points / Miles') {
            delete c.quoted_rate;
            delete c.rate_unit;
          }
          if (c.quoted_rate && c.rate_unit && c.rate_unit !== 'Fixed supplier price')
            c.cost = (exactPointCost(Number(c.quantity), c.quoted_rate, c.rate_unit) / 100).toFixed(
              2,
            );
          if (c.payment_status === 'Partial' && !usd(c.paid))
            throw new Error('Enter the actual partial seller payment');
          const quantity = c.quantity
            ? c.unit === 'money'
              ? usd(c.quantity)
              : Number(c.quantity)
            : undefined;
          const cost = usd(c.cost);
          const settlement = sellerPaymentState(cost, usd(c.paid), c.payment_status);
          if (settlement.status === 'Needs Review')
            throw new Error('Seller amount paid exceeds its obligation');
          const paid = settlement.payment_known ? settlement.paid : undefined;
          return {
            type: c.type,
            supplied:
              c.supplied === 'Other / Custom'
                ? c.custom_supplied || 'Other / Custom'
                : (c.supplied ?? 'Complete Booking / Ticket'),
            seller_id: c.seller_id || null,
            owner_id:
              c.type === 'Customer card' ? directCardOwner(c, v.customer_id) : c.owner_id || null,
            asset_id: c.asset_id || null,
            program_id:
              c.program_id ||
              (c.supplied === 'Points / Miles' && !c.different_program ? inheritedProgram : null) ||
              null,
            instrument_id: c.instrument_id || null,
            original_quantity: c.face_value
              ? c.unit === 'money'
                ? usd(c.face_value)
                : Number(c.face_value)
              : undefined,
            expires_on: c.expiry || undefined,
            description: c.description || undefined,
            quantity,
            unit: c.unit ?? 'money',
            cost,
            cost_is_estimate: c.cost_is_estimate ? true : undefined,
            other_currency: normalizeOtherCurrencyNote({
              code: c.other_currency_code,
              amount: c.other_currency_amount,
              rate: c.other_currency_rate,
            }),
            paid: c.type === 'Customer card' ? undefined : paid,
            method: (() => {
              const resolved = resolvePaymentMethod(c.method, c.method_custom);
              if (
                (c.method === PAYMENT_METHOD_OTHER || c.method === 'Other') &&
                !resolved
              )
                throw new Error('Enter the new payment method name');
              return resolved || undefined;
            })(),
            account_id: c.account_id || null,
            date: c.date || v.booked_on,
            reference: c.reference ?? '',
            notes: (() => {
              const base = String(c.notes ?? '').trim();
              const email = String(c.account_email ?? '').trim();
              if (!email) return base;
              const tag = `Account email used: ${email}`;
              return base.includes(tag) ? base : [base, tag].filter(Boolean).join(' · ');
            })(),
            card_nickname: c.card_nickname || undefined,
            last_four: c.last_four || undefined,
            quoted_rate: c.quoted_rate || undefined,
            rate_unit: c.rate_unit || undefined,
            holder_id: c.holder_id || null,
            rebate_expected:
              outsideSellerAllowsRebateExpected(c.type) && c.rebate_expected
                ? Number(c.rebate_expected)
                : undefined,
            bp_gross_points: bp ? Number(c.bp_gross_points) : undefined,
            bp_rebate_bps: bp ? decimalUnits(String(c.bp_rebate_percent ?? 35)) : undefined,
            bp_net_override_reason: c.bp_net_override_reason || undefined,
            ...(c.transfer
              ? {
                  new_asset: {
                    name: c.asset_name,
                    kind:
                      c.supplied === 'Points / Miles'
                        ? 'Points'
                        : c.supplied === 'Certificate / Award'
                          ? 'Certificate'
                          : 'Voucher',
                    issuer: rows('programs').find((p) => p.id === c.program_id)?.name || c.issuer,
                    quantity: c.face_value
                      ? c.unit === 'money'
                        ? usd(c.face_value)
                        : Number(c.face_value)
                      : quantity,
                    cost,
                    expires_on: c.expiry || undefined,
                    reference: c.reference ?? '',
                  },
                }
              : {}),
          };
        });
      const provider = rows('parties').find((p) => p.id === v.provider_id);
      const method = rows('bookingSourceMethods').find((m) => m.id === v.source_method_id);
      const multi = v.product === 'Flight' && v.trip_type === 'Multi-City';
      const segments: R[] = multi ? (v.segments ?? []) : [];
      const { start, end, summary } = derivedTravel(v, provider?.name);
      const travel = {
        product: v.product,
        summary,
        provider_id: v.provider_id || null,
        channel: method?.name || 'Unknown',
        travel_start: start,
        travel_end:
          v.product === 'Flight' && v.trip_type === 'One Way'
            ? v.travel_start
            : end || start,
        details: {
          // Hotel / Car / Round Trip: only mark known when staff entered the end date.
          end_date_known:
            multi ||
            (v.product === 'Flight' && v.trip_type === 'One Way') ||
            !!v.travel_end,
          confirmations: refs
            .filter((r) => r.type !== 'ticket_number' && r.type !== 'booking_source_confirmation')
            .map((r) => r.value),
          provider_references: refs.filter((r: R) => r.provider_id),
          booking_source_confirmation: parseList(v.booking_source_confirmation ?? ''),
          reservation_summary: v.summary_override ? v.reservation_summary : summary,
          summary_generated: true,
          reservation_summary_generated: !v.summary_override,
          ...bookingProductDetails(v, provider?.name),
        },
      };
      if (v.held_pnr && !v.ticketing_deadline)
        throw new Error('Held PNR requires a ticketing deadline date');
      const entryDoc = normalizeEntryDocumentDraft({
        label: v.document_label,
        kind: v.document_kind,
        url: v.document_url,
        note: v.document_note,
        added_on: v.document_added_on || v.booked_on,
      });
      let operational: R = {
        trip_type: v.product === 'Flight' ? v.trip_type : undefined,
        segments: multi ? segments : undefined,
        how_booked: howBooked || undefined,
        ...(howBooked === 'Hotel at program rate (FHR)'
          ? {
              program_rate_name: String(v.program_rate_name || '').trim() || undefined,
              program_perks: String(v.program_perks || '').trim() || undefined,
              program_benefit_gained:
                String(v.program_benefit_gained || '').trim() || undefined,
            }
          : {}),
        ...(howBooked === 'Hotel with commission' && isHotelPaidBy(v.hotel_paid_by)
          ? { hotel_paid_by: v.hotel_paid_by as HotelPaidBy }
          : {}),
        ...(howBooked === 'Cash / GDS' && isGdsCommissionable(v.gds_commissionable)
          ? { gds_commissionable: v.gds_commissionable as GdsCommissionable }
          : {}),
        ticketing_deadline: v.held_pnr ? v.ticketing_deadline || null : undefined,
        source_profile_id: v.source_profile_id || null,
        pricing: can('edit_customer_charges')
          ? {
              method: v.pricing_method || 'Manual Customer Price',
              comparable_price:
                percentPricing || v.record_comparable ? usd(v.comparable_price) : undefined,
              discount_bps:
                percentPricing && v.discount_percent !== ''
                  ? decimalUnits(v.discount_percent)
                  : undefined,
              margin_cents: fixedMarginPricing ? usd(v.fixed_margin) : undefined,
              manual_override: percentPricing && !!v.price_override,
            }
          : undefined,
        other_description: v.product === 'Other' ? v.description : undefined,
        taxes:
          usd(v.tax_amount) !== undefined && (can('manage_funding') || v.tax_bearer !== 'Padova')
            ? {
                amount: usd(v.tax_amount),
                bearer: v.tax_bearer || 'Unknown',
                economic_bearer: v.tax_economic_bearer || 'Unknown',
                customer_recovery:
                  v.tax_economic_bearer === 'Customer' ? usd(v.tax_customer_recovery) : undefined,
                method:
                  v.tax_bearer === 'Padova' && !v.tax_included
                    ? (() => {
                        const resolved = resolvePaymentMethod(
                          v.tax_method,
                          v.tax_method_custom,
                        );
                        if (
                          (v.tax_method === PAYMENT_METHOD_OTHER ||
                            v.tax_method === 'Other') &&
                          !resolved
                        )
                          throw new Error('Enter the new tax payment method name');
                        return resolved || undefined;
                      })()
                    : undefined,
                account_id:
                  v.tax_bearer === 'Padova' && !v.tax_included ? v.tax_account_id || null : null,
                included_in_component: v.tax_bearer === 'Padova' && !!v.tax_included,
              }
            : undefined,
        version: 1,
        draft_id: v.draft_id,
        intake_source: (() => {
          const src = String(
            v.intake_provenance?.source ||
              props.config.defaults.intake_provenance?.source ||
              '',
          ).trim();
          if (
            src === 'whatsapp' ||
            src === 'email' ||
            src === 'staff_paste' ||
            src === 'staff_upload' ||
            src === 'instinct'
          )
            return src;
          return v.draft_id ? undefined : ('manual' as const);
        })(),
        source_method_id: v.source_method_id || null,
        award_program_id: method?.award ? v.award_program_id || null : null,
        new_travelers: v.new_travelers,
        references: refs,
        notes: v.notes ?? '',
        price_breakdown_note: String(v.price_breakdown_note || '').trim() || undefined,
        sale_known: baseSale !== undefined,
        additional_charge: extraCharge,
        additional_charge_note:
          extraCharge && String(v.additional_charge_note || '').trim()
            ? String(v.additional_charge_note).trim().slice(0, 500)
            : undefined,
        components: componentInput,
        // Soft-merge C: IATA / secondary receivables only via Add commission.
        // Referring org on booking still applies the accepted partnership payable once.
        // Hotel with commission: expected Money Back line (amount Unknown until posted).
        // Cash / GDS: commissionable Yes → 50/50 expected; No → none; Unknown → Unknown.
        commission:
          howBooked === 'Hotel with commission'
            ? { expected: 'Yes', notes: 'Default Sruly path ~90% Padova / 10% retained' }
            : howBooked === 'Cash / GDS'
              ? gdsCommissionExpectedSeed(
                  isGdsCommissionable(v.gds_commissionable)
                    ? (v.gds_commissionable as GdsCommissionable)
                    : undefined,
                )
              : undefined,
        secondary_commission: undefined,
        standing_deals: (() => {
          const parties = [...(state.parties ?? []), ...(extra.parties ?? [])];
          const customer = parties.find((p: R) => p.id === v.customer_id);
          const deals = partyStandingDeals(customer);
          const taxCents = usd(v.tax_amount);
          const seeded = deals.length
            ? buildStandingDealExpectations({
                deals,
                product: v.product,
                saleCents: baseSale ?? null,
                taxCents: taxCents ?? null,
              })
            : [];
          const entryExtra = normalizeEntryExtraIncomeDraft({
            label: v.extra_income_label,
            percent: v.extra_income_percent,
            basis: v.extra_income_basis,
            note: v.extra_income_note,
            saleCents: baseSale ?? null,
            taxCents: taxCents ?? null,
            dealId: 'entry-more',
          });
          return mergeStandingDealExpectations(seeded, entryExtra);
        })(),
        referring_organization_id: can('manage_commissions')
          ? v.referring_organization_id || null
          : undefined,
      };
      if (entryDoc) {
        operational = appendBookingDocument(operational, {
          id: crypto.randomUUID(),
          ...entryDoc,
        });
      }
      await onSubmit({
        customer_id: v.customer_id,
        product: v.product,
        channel: method?.name || 'Unknown',
        summary,
        booked_on: v.booked_on,
        travel_start: start,
        travel_end: travel.travel_end,
        traveler_ids: v.traveler_ids,
        confirmations: [...new Set(refs.map((r) => r.value))],
        sale: baseSale ?? 0,
        reservation_status: v.held_pnr ? 'Held' : 'Booked',
        travel_components_input: [travel],
        itinerary: {
          cost_status: 'Pending',
          sale_known: baseSale !== undefined,
          ...(v.held_pnr && v.ticketing_deadline
            ? { ticketing_deadline: v.ticketing_deadline }
            : {}),
        },
        operational,
        ...(received
          ? {
              customer_payment: {
                amount: received,
                date: v.receipt_date || v.booked_on,
                method: (() => {
                  const resolved = resolvePaymentMethod(
                    v.receipt_method,
                    v.receipt_method_custom,
                  );
                  if (
                    (v.receipt_method === PAYMENT_METHOD_OTHER ||
                      v.receipt_method === 'Other') &&
                    !resolved
                  )
                    throw new Error('Enter the new customer payment method name');
                  return resolved || v.receipt_method;
                })(),
                account_id: v.receipt_account_id || undefined,
                reference: v.receipt_reference ?? '',
                allocate_to_booking: baseSale !== undefined && can('edit_customer_charges'),
              },
            }
          : {}),
      });
      recoveryFinished.current = true;
      clearBookingRecovery(state.actor.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  }
  if (travelerDetailsId && onInlineCommand)
    return (
      <BookingTravelerDetails
        personId={travelerDetailsId}
        state={state}
        onClose={() => setTravelerDetailsId('')}
        onCommand={onInlineCommand}
        onPersonSaved={(person) =>
          setExtra((old) => ({
            ...old,
            parties: [...(old.parties ?? []).filter((p: R) => p.id !== person.id), person],
          }))
        }
      />
    );
  if (inline && onInlineCommand)
    return (
      <CommandForm
        config={{
          kind: inline.kind,
          defaults: inline.defaults,
          inline_role: inline.defaults.roles?.[0],
          inline_notice: true,
        }}
        state={state}
        onClose={() => setInline(null)}
        onCreateParty={props.onCreateParty}
        onInlineCommand={onInlineCommand}
        onSubmit={async (data) => {
          const r = await onInlineCommand(
            inline.kind,
            data,
            inline.key ?? (inline.key = crypto.randomUUID()),
          );
          setExtra((old) => ({
            ...old,
            [inline.source]: [...(old[inline.source] ?? []), { ...data, ...r }],
          }));
          inline.set(r.id);
          if (inline.source === 'assets')
            setComponents((previous) =>
              previous.map((c) =>
                c.asset_id === r.id ? { ...c, unit: assetUnit({ ...data, ...r }) } : c,
              ),
            );
          setInline(null);
        }}
      />
    );
  return (
    <div className="modal-backdrop">
      <form
        className="modal booking-entry"
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-entry-title"
      >
        <div className="modal-head booking-entry-head">
          <div className="booking-entry-head-copy">
            <div className="booking-entry-eyebrow">Padova Travel · Booking entry</div>
            <div className="booking-entry-title-row">
              <h2 id="booking-entry-title">
                {props.config.defaults.draft_id ? 'Continue Draft' : 'New Booking'}
              </h2>
            {state.developmentData && (
                <span className="booking-entry-env-chip" title="QA / synthetic practice data">
                  Practice only
                </span>
            )}
          </div>
          </div>
          <button
            type="button"
            className="booking-entry-close"
            onClick={closeBooking}
            disabled={busy}
            aria-label="Close dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="modal-body">
          {error && !/select a customer/i.test(error) ? (
            <div
              ref={errorBannerRef}
              className="booking-entry-alert"
              role="alert"
              tabIndex={-1}
            >
              <strong>Needs a fix</strong>
              <span>{error}</span>
            </div>
          ) : null}
          {props.config.defaults.intake_provenance?.source && (
            <div className="intake-provenance-banner" role="status">
              <strong>Intake draft. Review before Save Booking</strong>
              <span>
                {formatIntakeProvenanceLine(props.config.defaults.intake_provenance)}
              </span>
              <span>Nothing posts money until you approve and Save Booking.</span>
            </div>
          )}
          {livePastePreview.reservationBlock ? (
            <div className="form-alert form-alert-warn intake-reservation-gate" role="alert">
              <strong>Not a verified booking confirmation</strong>
              <span>{livePastePreview.reservationBlock}</span>
            </div>
          ) : null}
          <details
            ref={quickPasteRef}
            className="booking-quick-paste"
            open={quickPasteOpen}
            onToggle={(e) => {
              if (ignoreQuickPasteToggle.current) return;
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setQuickPasteOpen(open);
              if (paste.trim()) userClosedQuickPaste.current = !open;
              else userClosedQuickPaste.current = false;
            }}
          >
            <summary className="booking-quick-paste-summary">
              <span className="booking-quick-paste-summary-copy">
                <strong>Quick start</strong>
                <small>
                  Paste text, or drop a PDF / screenshot / .eml, we fill matching fields. You
                  review before Save Booking. Missing stays Unknown.
                </small>
              </span>
              <span
                className="paste-tools"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
            <button
              type="button"
                  className="btn small ghost"
              onClick={() => void copy(quickPasteAIInstructions, 'AI instructions')}
            >
              Copy AI Instructions
            </button>
            <button
              type="button"
                  className="btn small ghost"
              onClick={() => void copy(quickPasteExample, 'Example')}
            >
              Copy Example
            </button>
                {copyStatus ? <span role="status">{copyStatus}</span> : null}
              </span>
            </summary>
            <div className="booking-quick-paste-panel">
              <section className="intake-preview intake-preview-client booking-intake-preview">
                <div className="intake-preview-grid">
                  <div className="intake-preview-left">
                    <div
                      className={`intake-paste-box${pasteDrag ? ' is-dragging' : ''}`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!busy) setPasteDrag(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!busy) setPasteDrag(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPasteDrag(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPasteDrag(false);
                        if (busy) return;
                        const file = e.dataTransfer.files?.[0] ?? null;
                        if (file) void loadBookingPasteFile(file);
                      }}
                    >
                      <div className="intake-panel-head-row">
                        <h3>What you pasted</h3>
          </div>
                      {!paste.trim() && !busy ? (
                        <p className="booking-fill-drop-hint" aria-hidden>
                          Drop PDF, screenshot, .eml, or paste Field: Value text
                        </p>
                      ) : null}
            <textarea
                        className="intake-preview-raw intake-preview-editable"
                        rows={10}
              value={paste}
                        disabled={busy}
                        aria-label="What you pasted"
                        placeholder="Paste Field: Value lines, or drop a PDF / screenshot above…"
                        onChange={(e) => {
                          const text = e.target.value;
                          setPaste(text);
                          setPasteHelperStatus('');
                          queueApplyPaste(text);
                        }}
                      />
                      <div className="intake-paste-actions">
                        <label className="intake-file-link" htmlFor="booking-quick-paste-file">
                          <Upload size={14} aria-hidden />
                          PDF · screenshot · .eml · browse
                          <input
                            id="booking-quick-paste-file"
                            type="file"
                            className="intake-file-input"
                            disabled={busy}
                            accept=".txt,.csv,.md,.eml,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,text/plain,text/csv,message/rfc822,application/pdf,image/png,image/jpeg,image/webp,image/gif"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = '';
                              if (file) void loadBookingPasteFile(file);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="intake-sample-btn"
                          disabled={busy}
                          onClick={() => {
                            setPasteFileName('');
                            userClosedQuickPaste.current = false;
                            setQuickPasteOpenSafe(true);
                            setPaste(INTAKE_SAMPLE_PASTE);
                            void applyPaste(INTAKE_SAMPLE_PASTE);
                          }}
                        >
                          Use sample
            </button>
                        {pasteFileName ? (
                          <span className="intake-file-chip">
                            {pasteFileName}
                            <button
                              type="button"
                              className="btn small ghost"
                              disabled={busy}
                              onClick={() => setPasteFileName('')}
                            >
                              Remove
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="intake-preview-right">
                    <div className="intake-preview-right-head">
                      <h3>What we’ll fill in</h3>
                      {paste.trim() && !livePastePreview.unread ? (
                        <span className="intake-preview-count">
                          {livePastePreview.found} found
                          {livePastePreview.missing
                            ? ` · ${livePastePreview.missing} missing`
                            : ''}
                        </span>
                      ) : null}
                    </div>
                    <div className="intake-preview-scroll">
                      {livePastePreview.unread ? (
                        <p className="intake-preview-unread" role="alert">
                          {livePastePreview.unreadMessage || UNREAD_FILE_MESSAGE}
                        </p>
                      ) : !paste.trim() ? (
                        <div className="intake-preview-empty-state">
                          <p>Mapping shows here after you paste or drop a file.</p>
                        </div>
                      ) : (
                        <ul className="intake-preview-rows">
                          {livePastePreview.rows.map((row) => {
                            const required = INTAKE_REQUIRED_ROWS.has(row.id);
                            const needsAttention =
                              (row.status === 'missing' || row.status === 'confirm') &&
                              required;
                            return (
                              <li
                                key={row.id}
                                className={`${row.status}${needsAttention ? ' is-required-missing' : ''}`}
                              >
                                <div className="intake-preview-main">
                                  <div className="intake-preview-meta">
                                    <strong>
                                      {row.fieldLabel}
                                      {required ? (
                                        <span className="intake-required-tag">Required</span>
                                      ) : null}
                                    </strong>
                                    {(row.sourceLabel || row.sourceHint) &&
                                    (row.status === 'found' || row.status === 'confirm') ? (
                                      <small>
                                        {row.sourceLabel ? `from “${row.sourceLabel}”` : ''}
                                        {row.sourceLabel && row.sourceHint ? ' · ' : ''}
                                        {row.sourceHint || ''}
                                      </small>
                                    ) : null}
                                  </div>
                                  <div className="intake-preview-result">
                                    <span className="intake-preview-value">{row.value}</span>
                                    <span
                                      className="intake-preview-mark"
                                      aria-label={intakePreviewMarkLabel(row.status)}
                                    >
                                      {intakePreviewMark(row.status)}
                                    </span>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              {pasteHelperStatus ? (
                <p className="booking-fill-helper-status" role="status" aria-live="polite">
                  {pasteHelperStatus}
                </p>
              ) : null}
              <div className="btn-row quick-paste-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !paste.trim()}
                  onClick={() => {
                    setPasteHelperStatus('Re-applying mapped fields to the form…');
                    void applyPaste().then(() => {
                      const found = livePastePreview.found || 0;
                      setPasteHelperStatus(
                        found > 0
                          ? `Re-applied ${found} field${found === 1 ? '' : 's'}, review before Save.`
                          : 'Re-applied, check mapping; missing stays Unknown.',
                      );
                    });
                  }}
                >
                  Re-apply to form
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !paste.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setError('');
                      setPasteIssues([]);
                      try {
                        const eml = looksLikeEml(paste);
                        const envelope = eml ? parseEmlEnvelope(paste) : {};
                        const text = eml ? extractTextFromEml(paste) || paste : paste;
                        const response = await fetch('/api/booking-intake', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            source: eml && envelope.mailbox ? 'email' : 'staff_paste',
                            text,
                            command_id: crypto.randomUUID(),
                            from_address: envelope.from_address,
                            subject: envelope.subject,
                            mailbox: envelope.mailbox,
                            filename: eml ? 'quick-paste.eml' : undefined,
                          }),
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Intake draft failed');
                        setPasteIssues([
                          `Draft saved${result.title ? ` (${result.title})` : ''}, open from Drafts to finish.`,
                        ]);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Intake draft failed');
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Save as intake draft
                </button>
                    </div>
              {pasteIssues.length > 0 ? (
                <ul className="quick-paste-issues" aria-live="polite">
                  {pasteIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
          <nav className="booking-section-nav" aria-label="Booking sections">
            {primaryNav.map(({ id, label }) => (
              <a key={id} href={`#booking-${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="form-grid">
            <section className="booking-section full form-grid" id="booking-customer">
              <h3 className="form-section-title">
                <span>1</span> Customer & Travelers<small>Who is billed and who is traveling</small>
              </h3>
              <div
                ref={customerFieldRef}
                className={
                  customerMissing ? 'booking-field-wrap is-invalid full' : 'booking-field-wrap full'
                }
              >
                {entity('customer_id', 'Customer', 'parties', 'party', {
                  roles: ['customer'],
                  required: true,
                })}
                {customerMissing ? (
                  <small className="field-hint-error" role="alert">
                    Select a customer here, or use Save Draft if this booking is still incomplete.
                  </small>
                ) : null}
              </div>
              <Field label="Travelers" full>
                <div className="traveler-chips">
                  {v.traveler_ids.map((id: string) => {
                    const name = rows('parties').find((p) => p.id === id)?.name ?? 'Traveler';
                    return (
                      <span className="traveler-chip" key={id}>
                        <span>{name}</span>
                        {onInlineCommand && (
                          <button
                            type="button"
                            className="btn small"
                            aria-label={`Edit or add full traveler details for ${name}`}
                            onClick={() => setTravelerDetailsId(id)}
                          >
                            Details
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn small"
                          aria-label={`Remove traveler ${name} from this booking`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            change(
                              'traveler_ids',
                              v.traveler_ids.filter((x: string) => x !== id),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  {v.new_travelers.map((name: string, i: number) => (
                    <button
                      type="button"
                      className="btn small"
                      key={`new-${i}`}
                      onClick={() =>
                        change(
                          'new_travelers',
                          v.new_travelers.filter((_: string, j: number) => i !== j),
                        )
                      }
                    >
                      {name} · new ×
                    </button>
                  ))}
                </div>
                <div className="traveler-add-row">
                  <input
                  ref={travelerInput}
                    type="text"
                    aria-label="Traveler legal name"
                    placeholder="Legal name"
                  value={traveler}
                  onChange={(e) => {
                    setTraveler(e.target.value);
                    setBatchReview([]);
                    setTravelerResults([]);
                    setTravelerSearching(
                      !!e.target.value.trim() && travelerNames(e.target.value).length === 1,
                    );
                    batchLookup.current++;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (travelerNames(traveler).length > 1) void reviewTravelers();
                        else void addTraveler();
                    }
                  }}
                />
                  <button
                    type="button"
                    className="btn small"
                    disabled={
                      busy ||
                      !traveler.trim() ||
                      travelerSearching ||
                      travelerSearchFailed ||
                      travelerPasteNeedsReview(traveler) ||
                      travelerNames(traveler).length !== 1
                    }
                    onClick={() => void addTraveler()}
                  >
                    {travelerSearching ? '…' : 'Add'}
                  </button>
                </div>
                {traveler.trim() && travelerPasteNeedsReview(traveler) && (
                  <p className="field-hint" role="status">
                    This looks like more than one person. Split names with commas or new lines
                    (or use &amp; / ;), then review each match. Do not Add as a single traveler.
                  </p>
                )}
                {traveler.trim() && travelerNames(traveler).length === 1 && (
                  <>
                    {showTravelerMatches && matches.length > 0 && (
                      <div className="search-select-results" style={travelerMenuStyle}>
                      {matches.length > 1 ? (
                        <p className="field-hint" style={{ margin: '6px 8px' }}>
                          {matches.length} possible matches — pick the right person (no auto
                          select).
                        </p>
                      ) : null}
                      {matches.map((p) => (
                        <button
                          type="button"
                          className="btn small"
                          key={p.id}
                            onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                              setExtra((old) => ({
                                ...old,
                                parties: [...(old.parties ?? []), p],
                              }));
                            change('traveler_ids', [...new Set([...v.traveler_ids, p.id])]);
                            setTraveler('');
                            travelerInput.current?.focus();
                          }}
                        >
                          {p.name}
                          {matches.filter((m) => m.name === p.name).length > 1 ||
                          matches.length > 1
                            ? ` · ${p.id.slice(-6)}`
                            : ''}
                        </button>
                      ))}
                    </div>
                    )}
                    {travelerSearchFailed && (
                      <p role="alert">Lookup failed — try again before adding.</p>
                    )}
                  </>
                )}
              </Field>
              {!!batchReview.length && (
                <div className="traveler-batch full" aria-label="Review pasted travelers">
                  <p>
                    Exact matches are selected. Choose any ambiguous names, then add these
                    travelers.
                  </p>
                  {batchReview.map((r, i) => (
                    <Field key={r.key} label={r.name}>
                      {r.selected &&
                      (r.results.length === 0 ||
                        r.results.filter((p: R) => p.name.toLowerCase() === r.name.toLowerCase())
                          .length === 1) ? (
                        <span className="traveler-review-chip">
                          {r.selected === 'new'
                            ? 'New traveler · will create'
                            : 'Existing traveler · will reuse'}
                        </span>
                      ) : (
                        <select
                          aria-label={`Match traveler ${r.name}`}
                          value={r.selected}
                          onChange={(e) =>
                            setBatchReview((old) =>
                              old.map((x, j) => (j === i ? { ...x, selected: e.target.value } : x)),
                            )
                          }
                        >
                          <option value="">
                            {r.results.length > 1
                              ? `Choose among ${r.results.length} matches (required)`
                              : 'Choose existing traveler or create new'}
                          </option>
                          {r.results.map((p: R) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {r.results.filter((m: R) => m.name === p.name).length > 1
                                ? ` · ${p.id.slice(-6)}`
                                : ''}{' '}
                              · existing
                            </option>
                          ))}
                          <option value="new">Create {r.name} as a new traveler</option>
                        </select>
                      )}
                    </Field>
                  ))}
                  {!!batchReview.length && (
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy || batchReview.some((r) => !r.selected)}
                      onClick={() => void confirmTravelers()}
                    >
                      Add {batchReview.length} travelers
                    </button>
                  )}
                </div>
              )}
              {onInlineCommand && !!v.traveler_ids.length && (
                <details className="optional-block">
                  <OptionalSummary title="Travel docs" />
                <BookingTicketing
                  cache={ticketingCache.current}
                  people={v.traveler_ids
                    .map((id: string) => rows('parties').find((p: R) => p.id === id))
                    .filter(Boolean)}
                  date={
                    v.product === 'Flight' && v.trip_type === 'Multi-City'
                      ? (v.segments?.[0]?.date ?? '')
                      : (v.travel_start ?? '')
                  }
                  state={state}
                  command={onInlineCommand}
                  onFull={setTravelerDetailsId}
                  onDirty={(id, dirty) => {
                    if (dirty) ticketingDirty.current.add(id);
                    else ticketingDirty.current.delete(id);
                  }}
                />
                </details>
              )}
            </section>
            <section className="booking-section full form-grid" id="booking-travel">
              <h3 className="form-section-title">
                <span>2</span> Travel<small>What was booked and when</small>
              </h3>
              {v.product === 'Flight' ? (
                <div className="travel-basics full">
                  {select('product', 'Product', products, changeProduct, v.product ?? '', true)}
                  {entity(
                    'provider_id',
                    'Travel provider (airline)',
                    'parties',
                    'party',
                    { kind: 'company', roles: [providerRole(v.product)] },
                  )}
                  {select('trip_type', 'Trip Type', ['One Way', 'Round Trip', 'Multi-City'])}
                </div>
              ) : (
                <>
                  {select('product', 'Product', products, changeProduct, v.product ?? '', true)}
              {v.product !== 'Other' &&
                entity(
                  'provider_id',
                      v.product === 'Hotel'
                        ? 'Travel provider (property)'
                        : 'Travel provider (rental)',
                  'parties',
                  'party',
                  { kind: 'company', roles: [providerRole(v.product)] },
                    )}
                </>
                )}
              {v.product === 'Flight' && v.trip_type !== 'Multi-City' && (
                <div className="flight-route full">
                  <AirportInput
                    id="entry-origin"
                    label="From"
                    value={flightEndpoints(v).origin}
                    onChange={(value) => setV((old) => flightEndpointChange(old, 'origin', value))}
                  />
                  <button
                    type="button"
                    className="btn route-swap"
                    aria-label="Swap From and To"
                    onClick={() =>
                      setV((old) => {
                        const { origin, destination } = flightEndpoints(old);
                        return {
                          ...old,
                          origin: destination,
                          destination: origin,
                          route: destination || origin ? [destination, origin].join('-') : '',
                        };
                      })
                    }
                  >
                    ⇄
                  </button>
                  <AirportInput
                    id="entry-destination"
                    label="To"
                    value={flightEndpoints(v).destination}
                    onChange={(value) =>
                      setV((old) => flightEndpointChange(old, 'destination', value))
                    }
                  />
                </div>
              )}
              {v.product === 'Flight' &&
                v.trip_type !== 'Multi-City' &&
                flightEndpoints(v).origin &&
                flightEndpoints(v).origin.trim().toUpperCase() ===
                  flightEndpoints(v).destination.trim().toUpperCase() && (
                  <p className="note full" role="alert">
                    From and To are the same airport. For a round trip use Trip Type Round Trip and
                    set To to the destination city (example TLV–BCN), not TLV–TLV.
                  </p>
                )}
              {v.product === 'Flight' && v.trip_type === 'Multi-City' && (
                <div className="full segment-editor">
                  {(v.segments ?? [{}, {}]).map((s: R, i: number) => {
                    const patch = (key: string, value: string) =>
                              change(
                                'segments',
                                (v.segments ?? [{}, {}]).map((r: R, j: number) =>
                                  i === j ? { ...r, [key]: value } : r,
                        ),
                      );
                    return (
                      <div className="segment-card" key={i}>
                        <div className="segment-card-head">
                          <strong>Segment {i + 1}</strong>
                      <button
                        type="button"
                            className="btn small segment-remove"
                        disabled={(v.segments?.length ?? 2) <= 2}
                            aria-label={`Remove segment ${i + 1}`}
                        onClick={() =>
                          change(
                            'segments',
                            v.segments.filter((_: R, j: number) => i !== j),
                          )
                        }
                      >
                            ×
                      </button>
                    </div>
                        <div className="segment-row">
                          <AirportInput
                            id={`segment-${i}-origin`}
                            label="From"
                            value={s.origin ?? ''}
                            onChange={(value) => patch('origin', value)}
                          />
                          <AirportInput
                            id={`segment-${i}-destination`}
                            label="To"
                            value={s.destination ?? ''}
                            onChange={(value) => patch('destination', value)}
                          />
                          <div className="form-field">
                            <label htmlFor={`segment-${i}-date`}>Date</label>
                            <input
                              id={`segment-${i}-date`}
                              type="date"
                              aria-label={`Segment ${i + 1} date`}
                              value={s.date ?? ''}
                              onChange={(e) => patch('date', e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`segment-${i}-flight`}>Flight #</label>
                            <input
                              id={`segment-${i}-flight`}
                              type="text"
                              aria-label={`Segment ${i + 1} flight number`}
                              placeholder="Optional"
                              value={s.flight_number ?? ''}
                              onChange={(e) => patch('flight_number', e.target.value)}
                            />
                          </div>
                        </div>
                        {s.origin &&
                          s.origin.trim().toUpperCase() ===
                            s.destination?.trim().toUpperCase() && (
                            <small className="segment-warn" role="alert">
                              From and To are the same airport.
                            </small>
                          )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => change('segments', [...(v.segments ?? [{}, {}]), {}])}
                  >
                    + Add segment
                  </button>
                </div>
              )}
              {v.product === 'Hotel' && (
                <>
                  {text('location', 'City / Location')}
                  <details
                    className="hotel-directory-lookup full"
                    open={hotelTipsOpen}
                    onToggle={(e) =>
                      setHotelTipsOpen((e.currentTarget as HTMLDetailsElement).open)
                    }
                  >
                    <summary>
                      <span className="hotel-directory-lookup-title">
                        <strong>Corp / IATA tips</strong>
                        <small>Optional · uses Property and City above · never posts money</small>
                      </span>
                    </summary>
                    <div className="hotel-directory-lookup-body">
                      <div className="hotel-directory-lookup-row">
                        <label className="hotel-directory-lookup-field">
                          <span>Search override</span>
                          <input
                            type="text"
                            value={hotelDirectoryQuery}
                            onChange={(e) => setHotelDirectoryQuery(e.target.value)}
                            placeholder="Corp code, IATA, or other name (if different from Property)"
                            disabled={busy}
                            aria-label="Hotel directory search override"
                          />
                        </label>
                        <button
                          type="button"
                          className="btn primary small hotel-directory-lookup-go"
                          disabled={
                            busy ||
                            !(
                              String(v.location || '').trim() ||
                              hotelDirectoryQuery.trim() ||
                              String(selectedProvider?.name || '').trim() ||
                              String(v.intake_provider_label || '').trim()
                            )
                          }
                          onClick={() => {
                            void (async () => {
                              setHotelDirectoryNote('');
                              setHotelDirectoryHits([]);
                              setHotelTipsOpen(true);
                              try {
                                const location = String(v.location || '').trim();
                                const q =
                                  hotelDirectoryQuery.trim() ||
                                  String(selectedProvider?.name || '').trim() ||
                                  String(v.intake_provider_label || '').trim();
                                const params = new URLSearchParams();
                                if (location) params.set('location', location);
                                if (q) params.set('q', q);
                                if (location && q) params.set('match', 'any');
                                if (!location && !q) {
                                  setHotelDirectoryNote(
                                    'Pick Travel provider (property) or enter City first, then look up tips.',
                                  );
                                  return;
                                }
                                const response = await fetch(`/api/hotel-directory?${params}`);
                                const data = await response.json();
                                if (!response.ok)
                                  throw new Error(data.error || 'Hotel directory lookup failed');
                                if (!data.enabled) {
                                  setHotelDirectoryNote(
                                    data.note ||
                                      'Hotel directory is not installed in this database yet.',
                                  );
                                  return;
                                }
                                setHotelDirectoryHits(data.hotels ?? []);
                                if (!(data.hotels ?? []).length) {
                                  if (!data.total_active) {
                                    setHotelDirectoryNote(
                                      'Catalog empty, add hotels under Partnerships → Hotels.',
                                    );
                                  } else {
                                    setHotelDirectoryNote(
                                      location && q
                                        ? 'No match for that city or name. Try hotel name alone, or add under Partnerships → Hotels.'
                                        : location
                                          ? 'No hotels for that city in the directory.'
                                          : 'No match for that corp / IATA / name.',
                                    );
                                  }
                                }
                              } catch (err) {
                                setHotelDirectoryNote(
                                  err instanceof Error
                                    ? err.message
                                    : 'Hotel directory lookup failed',
                                );
                              }
                            })();
                          }}
                        >
                          Look up tips
                        </button>
                      </div>
                      {hotelDirectoryNote ? (
                        <p className="hotel-directory-lookup-status" role="status">
                          {hotelDirectoryNote}
                        </p>
                      ) : null}
                      {hotelDirectoryHits.length > 0 ? (
                        <div className="hotel-directory-hits">
                          {hotelDirectoryHits.slice(0, 8).map((h) => (
                            <button
                              type="button"
                              className="hotel-directory-hit"
                              key={h.id}
                              onClick={() => {
                                void (async () => {
                                  const tip = `Hotel directory: ${h.hotel_name}, best book: ${
                                    h.best_book_method || 'n/a'
                                  }${h.corporate_code ? `; corp ${h.corporate_code}` : ''}${
                                    h.iata_code ? `; IATA ${h.iata_code}` : ''
                                  }${
                                    h.hotel_commission
                                      ? `; hotel commission ${h.hotel_commission}`
                                      : ''
                                  }${h.discounts ? `; discounts ${h.discounts}` : ''}`;
                                  setV((old) => ({
                                    ...old,
                                    location: h.location || old.location,
                                    summary_override: true,
                                    reservation_summary:
                                      h.hotel_name || old.reservation_summary || '',
                                    intake_provider_label:
                                      h.hotel_name || old.intake_provider_label,
                                    ...(h.party_id ? { provider_id: h.party_id } : {}),
                                  }));
                                  if (h.party_id) {
                                    setExtra((old) => ({
                                      ...old,
                                      parties: [
                                        ...(old.parties ?? []).filter(
                                          (p: R) => p.id !== h.party_id,
                                        ),
                                        {
                                          id: h.party_id,
                                          name: h.party_name || h.hotel_name,
                                          roles: ['property'],
                                        },
                                      ],
                                    }));
                                  } else if (h.hotel_name) {
                                    try {
                                      const response = await fetch(
                                        `/api/directory?role=property&q=${encodeURIComponent(h.hotel_name)}`,
                                      );
                                      const data = await response.json().catch(() => ({}));
                                      const results = (data.results ?? []).filter((row: R) =>
                                        eligibleParty(row, 'property'),
                                      );
                                      const found = exactEligibleMatch(
                                        results,
                                        String(h.hotel_name),
                                        'property',
                                      );
                                      if (found) {
                                        setExtra((old) => ({
                                          ...old,
                                          parties: [
                                            ...(old.parties ?? []).filter(
                                              (p: R) => p.id !== found.id,
                                            ),
                                            found,
                                          ],
                                        }));
                                        change('provider_id', found.id);
                                      }
                                    } catch {
                                      /* tip still applied; staff can pick property */
                                    }
                                  }
                                  setPasteIssues((old) => [
                                    ...old.filter((x) => !x.startsWith('Hotel directory:')),
                                    tip,
                                  ]);
                                  setHotelDirectoryHits([]);
                                  setHotelDirectoryNote(
                                    `Tip applied for ${h.hotel_name}. Review property before Save.`,
                                  );
                                })();
                              }}
                            >
                              <strong>{h.hotel_name}</strong>
                              <span>
                                {[
                                  h.location,
                                  h.corporate_code ? `corp ${h.corporate_code}` : '',
                                  h.iata_code ? `IATA ${h.iata_code}` : '',
                                  h.best_book_method ? `book ${h.best_book_method}` : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </>
              )}
              {v.product === 'Car' && (
                <>
                  {text('pickup_location', 'Pickup location')}
                  {text('dropoff_location', 'Drop-off location')}
                </>
              )}
              {v.product === 'Other' && (
                <div
                  className={
                    otherDescriptionMissing
                      ? 'booking-field-wrap is-invalid full'
                      : 'booking-field-wrap full'
                  }
                >
                  {text('description', 'What is it?', 'text', true)}
                  {otherDescriptionMissing ? (
                    <small className="field-hint-error" role="alert">
                      Enter what this booking is for, or use Save Draft.
                    </small>
                  ) : null}
                </div>
              )}
              {!(v.product === 'Flight' && v.trip_type === 'Multi-City') && (
                <div
                  className={
                    travelStartMissing
                      ? 'booking-field-wrap is-invalid'
                      : 'booking-field-wrap'
                  }
                >
                  {text(
                  'travel_start',
                  v.product === 'Hotel' ? 'Check-in date' : dateLabels.start,
                  'date',
                    true,
                  )}
                  {travelStartMissing ? (
                    <small className="field-hint-error" role="alert">
                      Enter the travel date, or use Save Draft.
                    </small>
                  ) : null}
                </div>
              )}
              {(v.product !== 'Flight' || v.trip_type === 'Round Trip') && (
                <div
                  className={
                    travelEndMissing ? 'booking-field-wrap is-invalid' : 'booking-field-wrap'
                  }
                >
                  {text(
                  'travel_end',
                  v.product === 'Hotel'
                    ? 'Check-out date'
                    : v.product === 'Car'
                      ? 'Drop-off date'
                      : dateLabels.end!,
                  'date',
                    true,
                  )}
                  {travelEndMissing ? (
                    <small className="field-hint-error" role="alert">
                      {bookingTravelEndMissingMessage(v)}
                    </small>
                  ) : null}
                </div>
              )}
              {dateOrderIssue && (
                <p className="form-error full date-order-error" role="alert">
                  {dateOrderIssue}
                </p>
                )}
              {v.product === 'Flight' && v.trip_type === 'One Way' && (
                <Field label="Return date">
                  <input
                    disabled
                    placeholder="Not needed for one way"
                    aria-label="Return date not needed for one way"
                  />
                </Field>
              )}
              {v.product === 'Flight' ? (
                <PnrInput
                  value={v.primary_reference ?? ''}
                  onChange={(value) => change('primary_reference', value)}
                />
              ) : (
                text(
                  'primary_reference',
                  v.product === 'Hotel' || v.product === 'Car'
                    ? 'Confirmation #'
                    : 'Primary confirmation',
                )
              )}
              <details className="full" open={bookingTravelMoreShouldOpen(v)}>
                <OptionalSummary
                  title="More Travel Details"
                  hint={
                    v.product === 'Flight'
                      ? 'Cabin, flight numbers, tickets, other airlines’ PNRs and booking date'
                      : v.product === 'Hotel'
                        ? 'Room type and booking date'
                        : v.product === 'Car'
                          ? 'Pickup/drop-off times and booking date'
                          : 'Booking date'
                  }
                  filled={
                    [
                      v.cabin,
                      v.flight_numbers,
                      v.ticket_numbers,
                      v.additional_airlines,
                      v.room_type,
                      v.pickup_time,
                      v.dropoff_time,
                    ].filter(Boolean).length
                  }
                />
                <div className="form-grid">
                  {v.product === 'Flight' && (
                    <>
                      <Field label="Cabin (optional)">
                        <SearchableSelect
                          id="entry-cabin"
                          label="Cabin"
                          value={v.cabin ?? ''}
                          hideCount
                          placeholder="Select cabin…"
                          options={[
                            ...['Economy', 'Premium economy', 'Business', 'First'].map((s) => ({
                              value: s,
                              label: s,
                            })),
                            ...(v.cabin &&
                            !['Economy', 'Premium economy', 'Business', 'First'].includes(v.cabin)
                              ? [{ value: v.cabin, label: v.cabin }]
                              : []),
                          ]}
                          onChange={(value) => change('cabin', value)}
                          onAdd={(query) => {
                            const name = query.trim();
                            if (name) change('cabin', name);
                          }}
                          addLabel={(q) => (q ? `Add “${q}”` : 'Add cabin')}
                          emptyLabel="Type a cabin name to add"
                        />
                      </Field>
                      <details className="full">
                        <summary>PNRs for different airlines</summary>
                        {(v.provider_references ?? []).map((r: R, i: number) => (
                          <div className="form-grid" key={i}>
                            <Field label={`PNR ${i + 1}`}>
                              <input
                                aria-label={`Provider PNR ${i + 1}`}
                                value={r.value}
                                onChange={(e) =>
                                  change(
                                    'provider_references',
                                    v.provider_references.map((x: R, j: number) =>
                                      i === j ? { ...x, value: e.target.value } : x,
                                    ),
                                  )
                                }
                              />
                            </Field>
                            <Field label="Airline for this PNR (optional)">
                              <select
                                aria-label={`PNR airline ${i + 1}`}
                                value={r.provider_id ?? ''}
                                onChange={(e) =>
                                  change(
                                    'provider_references',
                                    v.provider_references.map((x: R, j: number) =>
                                      i === j ? { ...x, provider_id: e.target.value } : x,
                                    ),
                                  )
                                }
                              >
                                <option value="">Unspecified</option>
                                {rows('parties')
                                  .filter((p) => eligibleParty(p, 'airline'))
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            change('provider_references', [
                              ...(v.provider_references ?? []),
                              { value: '', provider_id: '' },
                            ])
                          }
                        >
                          Add another airline PNR
                        </button>
                      </details>
                      {v.trip_type !== 'Multi-City' && text('flight_numbers', 'Flight numbers')}
                      {text('ticket_numbers', 'Ticket numbers')}
                      {text('additional_airlines', 'Additional airlines')}
                      {select('ticketing_status', 'Ticketing status', [
                        'Not Ticketed / Unknown',
                        'Ticketed',
                        'Voided',
                        'Refunded',
                      ])}
                    </>
                  )}
                  {v.product === 'Hotel' && text('room_type', 'Room type')}
                  {v.product === 'Car' && (
                    <>
                      {text('pickup_time', 'Pickup time (optional)', 'time')}
                      {text('dropoff_time', 'Drop-off time (optional)', 'time')}
                    </>
                  )}
                  {text('booked_on', 'Booked date', 'date')}
                </div>
              </details>
            </section>
            <section className="booking-section full form-grid" id="booking-how">
              <h3 className="form-section-title">
                <span>3</span> How booked
                <small>Pick this first — it decides which cost fields matter</small>
              </h3>
              <div
                className="how-booked-presets full"
                role="group"
                aria-label="How this booking was made"
              >
                {HOW_BOOKED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={
                      howBooked === preset ? 'how-booked-chip is-selected' : 'how-booked-chip'
                    }
                    aria-pressed={howBooked === preset}
                    disabled={busy}
                    onClick={() => {
                      const vis = howBookedVisibility(preset);
                      setHowBooked(preset);
                      change('how_booked', preset);
                      if (preset !== 'Hotel with commission') change('hotel_paid_by', '');
                      if (preset !== 'Cash / GDS') change('gds_commissionable', '');
                      if (preset === 'Capital One') {
                        // Plan: Cap1 card amount + optional old credit (price match later).
                        setComponents([
                          {
                            type: 'Padova payment',
                            method: 'Card',
                            date: v.booked_on,
                            unit: 'money',
                            payment_status: 'Paid',
                            entry_placeholder: true,
                            cap1_role: 'card',
                          },
                          {
                            type: 'Owned value',
                            date: v.booked_on,
                            unit: 'money',
                            payment_status: 'Paid',
                            entry_placeholder: true,
                            cap1_role: 'old_credit',
                          },
                        ]);
                        const methods = (state.bookingSourceMethods ?? []) as R[];
                        const cap1 = methods.find((m) =>
                          /capital\s*one/i.test(String(m.name || '')),
                        );
                        if (cap1?.id) change('source_method_id', cap1.id);
                      } else {
                        setComponents((old) => {
                          if (!old.length)
                            return [
                              {
                                type: vis.defaultPaymentType,
                                date: v.booked_on,
                                unit: 'money',
                                payment_status: 'Unpaid',
                              },
                            ];
                          return old.map((row, idx) =>
                            idx === 0
                              ? {
                                  ...row,
                                  type: vis.defaultPaymentType,
                                  cap1_role: undefined,
                                  entry_placeholder:
                                    vis.defaultPaymentType === 'Owned value'
                                      ? row.entry_placeholder
                                      : undefined,
                                }
                              : row,
                          );
                        });
                      }
                      if (
                        preset === 'Hotel with commission' ||
                        preset === 'Hotel at program rate (FHR)'
                      ) {
                        if (v.product !== 'Hotel') change('product', 'Hotel');
                      }
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <p className="full field-hint">
                {howBooked ? (
                  <>
                    Selected: <strong>{howBooked}</strong> — {howBookedHint(howBooked)}
                  </>
                ) : (
                  howBookedHint('')
                )}
              </p>
              {howBooked === 'Cash / GDS' ? (
                <div className="full field-hint">
                  <p>Fare commissionable?</p>
                  <div
                    className="fee-note-chips"
                    role="group"
                    aria-label="GDS fare commissionable"
                  >
                    {GDS_COMMISSIONABLE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`btn small${v.gds_commissionable === opt ? ' primary' : ''}`}
                        aria-pressed={v.gds_commissionable === opt}
                        onClick={() => change('gds_commissionable', opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <p style={{ marginTop: 6 }}>{gdsCommissionableHint(v.gds_commissionable)}</p>
                </div>
              ) : null}
              {howVis.showSrulyFeeHints ? (
                <div className="full field-hint">
                  <p>
                    Optional Sruly fees: $50 per PNR when not commissionable; +$30 when a voucher is
                    used (add only when they apply — never invent).
                  </p>
                  <div className="fee-note-chips" role="group" aria-label="Optional Sruly fees">
                    {SRULY_FEE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`btn small${
                          Number(v.additional_charge) === preset.amount_cents / 100 &&
                          String(v.additional_charge_note || '') === preset.note
                            ? ' primary'
                            : ''
                        }`}
                        onClick={() => {
                          change('additional_charge', centsToUsdInput(preset.amount_cents));
                          change('additional_charge_note', preset.note);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {howVis.showHotelCommissionHints ? (
                <div className="full field-hint">
                  <p>
                    Default commission path: Sruly ~90% to Padova / 10% retained (changeable). Paid
                    after checkout; none if cancelled.
                  </p>
                  <p style={{ marginTop: 8 }}>How the hotel is paid</p>
                  <div
                    className="fee-note-chips"
                    role="group"
                    aria-label="How the hotel is paid"
                  >
                    {HOTEL_PAID_BY_OPTIONS.map((path) => (
                      <button
                        key={path}
                        type="button"
                        className={`btn small${v.hotel_paid_by === path ? ' primary' : ''}`}
                        aria-pressed={v.hotel_paid_by === path}
                        onClick={() => {
                          const payType = hotelPaidByDefaultPaymentType(path);
                          const zeroRoom = hotelPaidBySetsPadovaOwedZero(path);
                          setV((old) => {
                            const saleBlank =
                              old.sale == null || String(old.sale).trim() === '';
                            return {
                              ...old,
                              hotel_paid_by: path,
                              ...(zeroRoom && saleBlank
                                ? { sale: '0', sale_touched: true }
                                : {}),
                            };
                          });
                          if (payType) {
                            setComponents((old) => {
                              if (!old.length)
                                return [
                                  {
                                    type: payType,
                                    date: v.booked_on,
                                    unit: 'money',
                                    payment_status:
                                      path === 'Customer pays at checkout' ? 'Paid' : 'Unpaid',
                                  },
                                ];
                              return old.map((row, idx) =>
                                idx === 0 ? { ...row, type: payType } : row,
                              );
                            });
                          }
                        }}
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                  <p style={{ marginTop: 6 }}>{hotelPaidByHint(v.hotel_paid_by)}</p>
                </div>
              ) : null}
              {howVis.showFhrHints ? (
                <p className="full field-hint">
                  FHR / program rate: profit is customer price minus Padova cost. No commission line by
                  default.
                </p>
              ) : null}
              {howVis.showCap1Hints ? (
                <p className="full field-hint">
                  Cap1 account / profile below. Cost card: card amount (Cap1 Travel portal — Padova
                  saved card optional) plus old credit used when applicable. New price-match credits
                  are recorded after Save.
                </p>
              ) : null}
              {howVis.showBookedThrough ? (
                <div className="full form-grid" id="booking-source">
                  <h4 className="form-subsection-title">Booked through</h4>
                  {entity(
                    'source_method_id',
                    'Booked Through',
                    'bookingSourceMethods',
                    'booking_source_method',
                    { products: [v.product] },
                    undefined,
                    undefined,
                    (m) =>
                      m.products.includes(v.product) &&
                      (!/^(Other|Custom|Other \/ Custom)$/i.test(m.name) ||
                        m.id === v.source_method_id),
                  )}
                  {rows('bookingSourceMethods').find((m) => m.id === v.source_method_id)?.award &&
                    entity(
                      'award_program_id',
                      'Loyalty Program',
                      'programs',
                      'program',
                      {
                        category: 'Airline',
                      },
                      undefined,
                      undefined,
                      (r) =>
                        ['Airline', 'Hotel', 'Bank'].includes(r.category) &&
                        !/business platinum/i.test(r.name),
                    )}
                  {text('booking_source_confirmation', sourceConfirmationLabel(method?.name))}
                  {activeProfile && (
                    <p className="full">
                      {sourceContact ? (
                        <>
                          Contact / account owner: <strong>{sourceContact.name}</strong>
                          {sourceContact.phone && ` · ${sourceContact.phone}`}
                          {sourceContact.details?.whatsapp &&
                            ` · WhatsApp ${sourceContact.details.whatsapp}`}
                        </>
                      ) : (
                        activeProfile.name
                      )}
                      {activeProfile.notes && <small>{activeProfile.notes}</small>}
                    </p>
                  )}
                  {howVis.showSourceProfile &&
                    state.sourceProfilesEnabled &&
                    method &&
                    !/^(GDS|Direct Airline|Direct Hotel)$/i.test(method.name) &&
                    entity(
                      'source_profile_id',
                      howVis.showCap1Hints
                        ? 'Cap1 account / profile'
                        : howVis.showFhrHints
                          ? 'Booked-in account (someone else’s)'
                          : 'Account / Profile',
                      'bookingSourceProfiles',
                      'booking_source_profile',
                      {
                        source_method_id: method.id,
                        provider: method.name,
                        status: 'Active',
                        booking_contact_ids: [v.customer_id, ...v.traveler_ids],
                      },
                      undefined,
                      undefined,
                      (r) => r.source_method_id === method.id && r.status === 'Active',
                    )}
                </div>
              ) : null}
            </section>
            <section className="booking-section full form-grid" id="booking-money">
              <h3 className="form-section-title">
                <span>4</span> Price & cost
                <small>What the customer pays and what it costs Padova</small>
              </h3>
              <div className="full form-grid" id="booking-cost">
              <h4 className="form-subsection-title">Cost & payment</h4>
              {!howBooked ? (
                <p className="full field-hint">
                  Select <strong>How booked</strong> above so the cost card matches this trip.
                </p>
              ) : null}
              {howVis.showOutsideSeller ? (
                <p className="full field-hint">{OUTSIDE_SELLER_COST_HINT}</p>
              ) : null}
              {howVis.showPointsFunding ? (
                <p className="full field-hint">
                  Prefer funding with Padova points / miles from a named batch (exact cost). Cash taxes
                  stay separate.
                </p>
              ) : null}
              {howVis.showVoucherFunding ? (
                <p className="full field-hint">
                  Prefer voucher / Capital One credit / airline credit as the funding kind — face value
                  is cost when spent.
                </p>
              ) : null}
              {howVis.showCap1Hints ? (
                <p className="full field-hint">
                  Payment 1 = Cap1 card amount. Payment 2 = old Cap1 credit used (pick inventory or
                  remove if none). Leave card amount blank only when the whole fare was old credit.
                </p>
              ) : null}
              {can('manage_funding') ? (
                <div className="full">
                  {components.map((c, i) => {
                    const calculatedRate =
                      c.supplied === 'Points / Miles' &&
                      c.quoted_rate &&
                      c.rate_unit !== 'Fixed supplier price';
                    let amount = usd(c.cost);
                    if (calculatedRate) {
                      try {
                        amount = exactPointCost(
                          Number(c.quantity),
                          c.quoted_rate,
                          c.rate_unit || 'cents per point',
                        );
                      } catch {
                        amount = undefined;
                      }
                    }
                    const settlement = sellerPaymentState(amount, usd(c.paid), c.payment_status);
                    const paid = settlement.paid;
                    const sellerStatus = c.seller_status_unresolved
                      ? ''
                      : settlement.status === 'Unknown'
                        ? (c.payment_status ?? 'Unpaid')
                        : settlement.status;
                    const unpaidSellerHint = ['Outside seller', 'Other'].includes(c.type)
                      ? sellerUnpaidEntryHint(sellerStatus || c.payment_status)
                      : null;
                    return (
                      <section className="booking-payment-card" key={i}>
                        <div className="booking-payment-card-head">
                          <strong>{`Payment ${i + 1}`}</strong>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() =>
                              setComponents((old) => old.filter((_, j) => j !== i))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-grid">
                          <div className="full">
                          {select(
                            `type-${i}`,
                            howVis.showCap1Hints && c.cap1_role === 'card'
                              ? 'Cap1 card amount'
                              : howVis.showCap1Hints && c.cap1_role === 'old_credit'
                                ? 'Old Cap1 credit used'
                                : 'Payment type',
                            howVis.paymentTypes.length
                              ? howVis.paymentTypes
                              : componentTypes,
                            (x) =>
                              setComponents((old) =>
                                old.map((r, j) =>
                                  j === i
                                    ? {
                                        type: x,
                                        date: v.booked_on,
                                        unit: 'money',
                                        payment_status: 'Unpaid',
                                        ...(x === 'Padova payment' && howVis.showCap1Hints
                                          ? { method: 'Card', cap1_role: 'card' }
                                          : x === 'Owned value' && howVis.showCap1Hints
                                            ? { cap1_role: 'old_credit' }
                                            : { cap1_role: undefined }),
                                      }
                                    : r,
                                ),
                              ),
                            c.type,
                          )}
                          </div>
                          {['Outside seller', 'Other'].includes(c.type) && (
                            <>
                              {entity(
                                `seller-${i}`,
                                'Purchased From',
                                'parties',
                                'party',
                                { roles: ['seller'] },
                                (x) => patch(i, 'seller_id', x),
                                c.seller_id,
                              )}
                              <details
                                className="full optional-section"
                                hidden={
                                  bpSource && c.type === 'Outside seller' && !c.bp_custom_supply
                                }
                                open={
                                  c.supplied &&
                                  !['Complete Booking / Ticket', 'Hotel Booking / Stay'].includes(
                                    c.supplied,
                                  )
                                    ? true
                                    : undefined
                                }
                              >
                                <OptionalSummary
                                  title="Points, vouchers or other value"
                                  hint="Choose what the seller supplied"
                                />
                                <div className="form-grid">
                                {select(
                                  `supplied-${i}`,
                                  'What seller supplied',
                                  suppliedTypes,
                                  (x) => {
                                    patch(i, 'supplied', x);
                                    patch(
                                      i,
                                      'unit',
                                      x === 'Points / Miles'
                                        ? 'points'
                                        : x === 'Certificate / Award'
                                          ? 'count'
                                          : 'money',
                                    );
                                  },
                                  c.supplied ?? suppliedTypes[0],
                                )}
                                </div>
                              </details>
                            </>
                          )}
                          {c.type === 'Outside seller' && c.supplied === 'Points / Miles' && (
                              <div className="full form-grid">
                                <label className="full">
                                  <input
                                    type="checkbox"
                                    checked={!!c.use_bp_economics}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setComponents((old) =>
                                        old.map((x, j) =>
                                          j === i
                                            ? {
                                                ...x,
                                                use_bp_economics: checked,
                                                supplied: 'Points / Miles',
                                                unit: 'points',
                                                bp_rebate_percent: x.bp_rebate_percent ?? 35,
                                                ...(checked
                                                  ? {
                                                      quantity:
                                                        bpNet(
                                                          x.bp_gross_points,
                                                          x.bp_rebate_percent ?? 35,
                                                        )?.toString() ?? '',
                                                    }
                                                  : {}),
                                              }
                                            : x,
                                        ),
                                      );
                                    }}
                                  />{' '}
                                  {OUTSIDE_SELLER_BP_LABEL}
                                </label>
                                {c.use_bp_economics && (
                                  <>
                                    <Field label="Gross points bought (info)">
                                      <input
                                        aria-label={`BP gross points ${i + 1}`}
                                        type="number"
                                        step="1"
                                        value={c.bp_gross_points ?? ''}
                                        onChange={(e) => {
                                          patch(i, 'bp_gross_points', e.target.value);
                                          const net = bpNet(
                                            e.target.value,
                                            c.bp_rebate_percent ?? 35,
                                          );
                                          if (net != null) patch(i, 'quantity', String(net));
                                        }}
                                      />
                                    </Field>
                                    <Field label={OUTSIDE_SELLER_REBATE_LABEL}>
                                      <input
                                        aria-label={`BP seller rebate percent ${i + 1}`}
                                        type="number"
                                        value={c.bp_rebate_percent ?? 35}
                                        onChange={(e) => {
                                          patch(i, 'bp_rebate_percent', e.target.value);
                                          const net = bpNet(c.bp_gross_points, e.target.value);
                                          if (net != null) patch(i, 'quantity', String(net));
                                        }}
                                      />
                                    </Field>
                                    <output className="full" aria-live="polite">
                                      Bought{' '}
                                      {Number(c.bp_gross_points || 0).toLocaleString() || '—'} −{' '}
                                      {c.bp_rebate_percent ?? 35}% ={' '}
                                      <strong>
                                      {bpNet(
                                        c.bp_gross_points,
                                          c.bp_rebate_percent ?? 35,
                                        )?.toLocaleString() ?? 'Unknown'}
                                      </strong>{' '}
                                      net points (quantity below). {OUTSIDE_SELLER_BP_SUMMARY}
                                    </output>
                                  </>
                                )}
                              </div>
                            )}
                          {c.supplied === 'Other / Custom' && (
                            <Field label="What seller supplied, custom">
                              <input
                                aria-label={`Custom supplied value ${i + 1}`}
                                value={c.custom_supplied ?? ''}
                                onChange={(e) => patch(i, 'custom_supplied', e.target.value)}
                              />
                            </Field>
                          )}
                          {['Outside seller', 'Other'].includes(c.type) &&
                            [
                              'Points / Miles',
                              'Voucher / Travel Credit',
                              'Certificate / Award',
                            ].includes(c.supplied) && (
                              <>
                                {inheritedProgram &&
                                c.supplied === 'Points / Miles' &&
                                !c.different_program ? (
                                  <Field label="Program / Issuer">
                                    <span>
                                      {
                                        rows('programs').find((p) => p.id === inheritedProgram)
                                          ?.name
                                      }
                                    </span>
                                    <button
                                      type="button"
                                      className="btn small"
                                      onClick={() => patch(i, 'different_program', true)}
                                    >
                                      Different program
                                    </button>
                                  </Field>
                                ) : (
                                  entity(
                                    `primary-program-${i}`,
                                    'Program / Issuer',
                                    'programs',
                                    'program',
                                    {
                                      category:
                                        c.supplied === 'Points / Miles' ? 'Airline' : 'Other',
                                    },
                                    (x) => patch(i, 'program_id', x),
                                    c.program_id,
                                    (r) =>
                                      c.supplied !== 'Points / Miles' ||
                                      ['Airline', 'Hotel', 'Bank'].includes(r.category),
                                  )
                                )}
                                <Field
                                  label={
                                    c.supplied === 'Points / Miles'
                                      ? 'Quantity (Miles / Points)'
                                      : c.supplied === 'Certificate / Award'
                                        ? 'Number of certificates'
                                        : 'Amount used (USD)'
                                  }
                                >
                                  <input
                                    aria-label={`Value quantity ${i + 1}`}
                                    type="number"
                                    step={c.unit === 'money' ? '0.01' : '1'}
                                    value={c.quantity ?? ''}
                                    readOnly={!!c.use_bp_economics}
                                    onChange={(e) => patch(i, 'quantity', e.target.value)}
                                  />
                                </Field>
                                {c.supplied === 'Points / Miles' && (
                                  <div className="full form-grid points-rate-block">
                                    <Field label="Cost per point (optional)">
                                      <input
                                        aria-label={`Point rate ${i + 1}`}
                                        value={c.quoted_rate ?? ''}
                                        onChange={(e) => patch(i, 'quoted_rate', e.target.value)}
                                        placeholder="1.30"
                                      />
                                    </Field>
                                    {select(
                                      `point-rate-unit-${i}`,
                                      'Per-point unit',
                                      [
                                        'USD per point',
                                        'USD per 1,000 points',
                                        'cents per point',
                                        'Fixed supplier price',
                                      ],
                                      (x) => patch(i, 'rate_unit', x),
                                      c.rate_unit || 'cents per point',
                                    )}
                                    <output className="full">
                                      Padova cost from points:{' '}
                                      {(() => {
                                        if (c.rate_unit === 'Fixed supplier price')
                                          return amount === undefined
                                            ? 'Enter fixed Padova Cost below'
                                            : `Fixed cost ${dollars(amount)}`;
                                        try {
                                          return dollars(
                                            exactPointCost(
                                              Number(c.quantity),
                                              c.quoted_rate,
                                              c.rate_unit || 'cents per point',
                                            ),
                                          );
                                        } catch {
                                          return 'Enter quantity + rate, or use Fixed supplier price';
                                        }
                                      })()}
                                    </output>
                                    <Field label="Points purchase note" full>
                                      <input
                                        aria-label={`Points purchase note ${i + 1}`}
                                        value={c.notes ?? ''}
                                        onChange={(e) => patch(i, 'notes', e.target.value)}
                                        placeholder="Bought 100k − 35% = 65k"
                                      />
                                    </Field>
                                    <Field label="Account email used (points login)">
                                      <input
                                        aria-label={`Points account email ${i + 1}`}
                                        type="email"
                                        value={c.account_email ?? ''}
                                        onChange={(e) => patch(i, 'account_email', e.target.value)}
                                        placeholder="Account email"
                                      />
                                    </Field>
                                    <Field label="Taxes / fees on this booking (USD)">
                                      <input
                                        aria-label="Taxes amount from points payment"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={v.tax_amount ?? ''}
                                        onChange={(e) => change('tax_amount', e.target.value)}
                                      />
                                    </Field>
                                    {select(
                                      'tax_bearer',
                                      'Who paid the taxes?',
                                      [
                                        'Unknown',
                                        ...(can('manage_funding') ? ['Padova'] : []),
                                        'Customer',
                                        'Seller',
                                        'Included in Seller Price',
                                      ],
                                      undefined,
                                      v.tax_bearer || 'Unknown',
                                    )}
                                    {v.tax_bearer === 'Padova' &&
                                      can('manage_funding') &&
                                      entity(
                                        'tax_account_id',
                                        'Credit card used for taxes',
                                        'paymentAccounts',
                                        'payment_account',
                                        { kind: 'Card' },
                                        undefined,
                                        v.tax_account_id,
                                        (a) => accountSupports(a, 'Card') || a.kind === 'Card',
                                      )}
                                  </div>
                                )}
                              </>
                            )}
                          {['Outside seller', 'Other'].includes(c.type) && (
                            <output className="full booking-cost-summary" aria-live="polite">
                              <span>
                              Total Purchase Cost:{' '}
                                <strong>
                                  {amount === undefined ? 'Unknown' : dollars(amount)}
                                </strong>
                              </span>
                              <span>
                                Recorded paid: <strong>{dollars(paid)}</strong>
                              </span>
                              <span>
                                Balance owed:{' '}
                                <strong>
                              {amount === undefined ? 'Unknown' : dollars(amount - paid)}
                                </strong>
                              </span>
                            </output>
                          )}
                          {c.type === 'Customer card' && (
                            <>
                              <details className="full">
                                <summary>
                                  Card owner:{' '}
                                  {rows('parties').find(
                                    (p) => p.id === (c.owner_id || v.customer_id),
                                  )?.name || 'Customer'}{' '}
                                  · change owner
                                </summary>
                                {entity(
                                  `owner-${i}`,
                                  'Customer / card owner',
                                  'parties',
                                  'party',
                                  { roles: ['customer'] },
                                  (x) => patch(i, 'owner_id', x),
                                  c.owner_id || v.customer_id,
                                )}
                              </details>
                              <details className="full">
                                <summary>Card details (optional)</summary>
                                <Field label="Card nickname (optional)">
                                  <input
                                    aria-label={`Card nickname ${i + 1}`}
                                    value={c.card_nickname ?? ''}
                                    onChange={(e) => patch(i, 'card_nickname', e.target.value)}
                                  />
                                </Field>
                                <Field label="Last four (optional)">
                                  <input
                                    aria-label={`Last four ${i + 1}`}
                                    maxLength={4}
                                    pattern="[0-9]{4}"
                                    value={c.last_four ?? ''}
                                    onChange={(e) => patch(i, 'last_four', e.target.value)}
                                  />
                                </Field>
                                <p className="full">
                                  Customer pays the travel provider/platform directly. This creates
                                  no Padova spend.
                                </p>
                              </details>
                            </>
                          )}
                          {c.type === 'Owned value' ? (
                            <>
                              {entity(
                                `asset-${i}`,
                                'Padova inventory',
                                'assets',
                                'acquire_asset',
                                { ownership: 'Padova' },
                                (x) => {
                                  patch(i, 'asset_id', x);
                                  const a = rows('assets').find((r) => r.id === x);
                                  const link = (state.sourceProfileAssets ?? []).find(
                                    (r: R) => r.asset_id === x,
                                  );
                                  const profile = rows('bookingSourceProfiles').find(
                                    (p) => p.id === link?.profile_id,
                                  );
                                  if (profile) {
                                    change('source_method_id', profile.source_method_id);
                                    change('source_profile_id', profile.id);
                                  }
                                  patch(
                                    i,
                                    'unit',
                                    a?.unit ??
                                      (/point|mile/i.test(a?.kind)
                                        ? 'points'
                                        : /certificate/i.test(a?.kind)
                                          ? 'count'
                                          : 'money'),
                                  );
                                },
                                c.asset_id,
                                (a) =>
                                  a.ownership === 'Padova' &&
                                  Number(a.balance) > 0 &&
                                  !(
                                    v.source_profile_id &&
                                    (state.sourceProfileAssets ?? []).some(
                                      (link: R) =>
                                        link.asset_id === a.id &&
                                        link.profile_id !== v.source_profile_id,
                                    )
                                  ),
                              )}
                              <Field label="Quantity / amount used">
                                <input
                                  aria-label={`Quantity used ${i + 1}`}
                                  type="number"
                                  min="0"
                                  step={c.unit === 'money' ? '0.01' : '1'}
                                  value={c.quantity ?? ''}
                                  onChange={(e) => patch(i, 'quantity', e.target.value)}
                                />
                              </Field>
                            </>
                          ) : (
                            <div
                              className={`full booking-cost-paid-row${
                                c.type === 'Customer card' ? ' booking-cost-paid-row--single' : ''
                              }`}
                            >
                            <Field
                              label={
                                c.type === 'Customer card'
                                  ? 'Customer direct card amount (USD)'
                                  : howVis.showCap1Hints && c.type === 'Padova payment'
                                    ? 'Cap1 card amount (USD)'
                                    : 'Cost to Padova (USD)'
                              }
                            >
                              {calculatedRate && amount !== undefined ? (
                                <output>
                                  {dollars(amount)} · calculated from quantity × agreed rate
                                </output>
                              ) : (
                                <input
                                  aria-label={`${c.type === 'Customer card' ? 'Customer paid provider' : 'Cost to Padova'} (USD), payment ${i + 1}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    calculatedRate && amount !== undefined
                                      ? (amount / 100).toFixed(2)
                                      : (c.cost ?? '')
                                  }
                                  onChange={(e) => {
                                    patch(i, 'cost', e.target.value);
                                    if (c.quoted_rate)
                                      patch(i, 'rate_unit', 'Fixed supplier price');
                                  }}
                                />
                              )}
                            </Field>
                              {c.type === 'Padova payment' ? (
                                <>
                                  {select(
                                    `method-${i}`,
                                    'Payment Method',
                                    mergePaymentMethodOptions([
                                      ...(state.payments ?? []).map((p: R) => p.method),
                                    ]),
                                    (x) => patch(i, 'method', x),
                                    c.method,
                                  )}
                                  {c.method === PAYMENT_METHOD_OTHER || c.method === 'Other' ? (
                                    <Field label="New payment method" required>
                                      <input
                                        aria-label={`New payment method ${i + 1}`}
                                        value={c.method_custom ?? ''}
                                        onChange={(e) => patch(i, 'method_custom', e.target.value)}
                                        placeholder="e.g. Venmo"
                                      />
                                    </Field>
                                  ) : null}
                                  {c.method ? (
                                    <Field label="Payment confirmation #">
                                      <input
                                        aria-label={`Payment confirmation ${i + 1}`}
                                        value={c.reference ?? ''}
                                        onChange={(e) => patch(i, 'reference', e.target.value)}
                                        placeholder="Bank / card / transfer confirmation"
                                      />
                                    </Field>
                                  ) : null}
                                </>
                              ) : null}
                              {c.type !== 'Customer card' && c.type !== 'Padova payment' && (
                                <Field label="Amount Paid (USD)">
                                  <input
                                    aria-label={`Seller amount paid ${i + 1}`}
                                    type="number"
                                    step="0.01"
                                    value={
                                      c.paid != null && c.paid !== ''
                                        ? c.paid
                                        : c.payment_status === 'Paid' && amount !== undefined
                                          ? (amount / 100).toFixed(2)
                                          : ''
                                    }
                                    onChange={(e) => patch(i, 'paid', e.target.value)}
                                  />
                                  {amount !== undefined && amount > 0 && (
                                    <button
                                      type="button"
                                      className="btn small"
                                      onClick={() => patch(i, 'paid', (amount / 100).toFixed(2))}
                                    >
                                      Paid full amount
                                    </button>
                                  )}
                                </Field>
                              )}
                            </div>
                          )}
                          {c.type !== 'Customer card' &&
                            c.type !== 'Owned value' &&
                            c.type !== 'Padova payment' && (
                              <output className="full booking-cost-status" aria-live="polite">
                                {settlement.payment_known
                                  ? sellerStatus || 'Confirm actual amount paid'
                                  : 'Payment not recorded'}{' '}
                                · Recorded balance owed:{' '}
                                {amount === undefined ? 'Unknown' : dollars(amount - paid)}
                                {c.cost_is_estimate ? ' · Estimate (not posted)' : ''}
                                {unpaidSellerHint ? (
                                  <>
                                    <br />
                                    {unpaidSellerHint}
                                  </>
                                ) : null}
                              </output>
                            )}
                          {c.type !== 'Customer card' && c.type !== 'Owned value' && (
                            <>
                              {c.type === 'Padova payment' &&
                                c.method &&
                                c.method !== 'Cash' &&
                                (c.method === 'Card' ||
                                  rows('paymentAccounts').some((a) =>
                                    accountSupports(a, c.method),
                                  )) &&
                                (howVis.showCap1Hints && c.method === 'Card' ? (
                                  <details className="full optional-section">
                                    <summary>
                                      Padova saved card (optional — Cap1 Travel portal charge is
                                      fine without it)
                                    </summary>
                                    {entity(
                                      `account-${i}`,
                                      'Card / account used',
                                      'paymentAccounts',
                                      'payment_account',
                                      { kind: 'Card' },
                                      (x) => patch(i, 'account_id', x),
                                      c.account_id,
                                      (a) => accountSupports(a, c.method),
                                    )}
                                  </details>
                                ) : (
                                  entity(
                                    `account-${i}`,
                                    'Card / account used',
                                    'paymentAccounts',
                                    'payment_account',
                                    { kind: c.method === 'Card' ? 'Card' : 'Bank' },
                                    (x) => patch(i, 'account_id', x),
                                    c.account_id,
                                    (a) => accountSupports(a, c.method),
                                  )
                                ))}
                              {c.type !== 'Padova payment' &&
                                (c.payment_status !== 'Unpaid' || paid > 0) && (
                                <>
                                  {select(
                                    `method-${i}`,
                                    'Payment Method',
                                    mergePaymentMethodOptions([
                                      ...(state.payments ?? []).map((p: R) => p.method),
                                    ]),
                                    (x) => patch(i, 'method', x),
                                    c.method,
                                  )}
                                  {c.method === PAYMENT_METHOD_OTHER || c.method === 'Other' ? (
                                    <Field label="New payment method" required>
                                      <input
                                        aria-label={`New payment method ${i + 1}`}
                                        value={c.method_custom ?? ''}
                                        onChange={(e) => patch(i, 'method_custom', e.target.value)}
                                        placeholder="e.g. Venmo"
                                      />
                                    </Field>
                                  ) : null}
                                  {c.method &&
                                    c.method !== 'Cash' &&
                                    (c.method === 'Card' ||
                                      rows('paymentAccounts').some((a) =>
                                        accountSupports(a, c.method),
                                      )) &&
                                    entity(
                                      `account-${i}`,
                                      'Card / account used',
                                      'paymentAccounts',
                                      'payment_account',
                                      { kind: c.method === 'Card' ? 'Card' : 'Bank' },
                                      (x) => patch(i, 'account_id', x),
                                      c.account_id,
                                      (a) => accountSupports(a, c.method),
                                    )}
                                    {c.method ? (
                                      <Field label="Payment confirmation #">
                                        <input
                                          aria-label={`Payment confirmation ${i + 1}`}
                                          value={c.reference ?? ''}
                                          onChange={(e) => patch(i, 'reference', e.target.value)}
                                          placeholder="Seller / bank / card confirmation"
                                        />
                                      </Field>
                                    ) : null}
                                </>
                              )}
                            </>
                          )}
                          {c.type !== 'Customer card' && (
                            <details className="full optional-section">
                              <OptionalSummary
                                title="More Cost Details"
                                hint="Estimate, other currency, payment date, account holder"
                                filled={[
                                  c.notes,
                                  c.owner_id,
                                  c.holder_id,
                                  c.cost_is_estimate,
                                  c.other_currency_code,
                                ].filter(Boolean).length}
                              />
                              <div className="form-grid">
                                {c.type !== 'Owned value' && (
                                  <>
                                    <label className="full checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={!!c.cost_is_estimate}
                                        onChange={(e) =>
                                          patch(i, 'cost_is_estimate', e.target.checked)
                                        }
                                      />
                                      Cost is estimate (USD not final)
                                    </label>
                                    {c.cost_is_estimate ? (
                                      <small className="full">{costEstimateEntryHint()}</small>
                                    ) : null}
                                    <Field label="Other currency (info only)">
                                      <input
                                        aria-label={`Other currency code ${i + 1}`}
                                        placeholder="EUR"
                                        maxLength={12}
                                        value={c.other_currency_code ?? ''}
                                        onChange={(e) =>
                                          patch(i, 'other_currency_code', e.target.value)
                                        }
                                      />
                                    </Field>
                                    <Field label="Amount in that currency">
                                      <input
                                        aria-label={`Other currency amount ${i + 1}`}
                                        placeholder="e.g. 420.00"
                                        value={c.other_currency_amount ?? ''}
                                        onChange={(e) =>
                                          patch(i, 'other_currency_amount', e.target.value)
                                        }
                                      />
                                    </Field>
                                    <Field label="Rate note (optional)">
                                      <input
                                        aria-label={`Other currency rate ${i + 1}`}
                                        placeholder="Info only — never invents USD"
                                        value={c.other_currency_rate ?? ''}
                                        onChange={(e) =>
                                          patch(i, 'other_currency_rate', e.target.value)
                                        }
                                      />
                                    </Field>
                                  </>
                                )}
                                {bpSource && c.type === 'Outside seller' && (
                                  <button
                                    type="button"
                                    className="btn small"
                                    onClick={() => patch(i, 'bp_custom_supply', true)}
                                  >
                                    Change what seller supplied
                                  </button>
                                )}
                                {entity(
                                  `holder-${i}`,
                                  'Account holder',
                                  'parties',
                                  'party',
                                  {},
                                  (x) => patch(i, 'holder_id', x),
                                  c.holder_id,
                                )}
                                <Field label="Description">
                                  <textarea
                                    aria-label={`Component description ${i + 1}`}
                                    value={c.description ?? ''}
                                    onChange={(e) => patch(i, 'description', e.target.value)}
                                  />
                                </Field>
                                {!c.transfer && ['Outside seller', 'Other'].includes(c.type) && (
                                  <>
                                    <Field label="Original quantity / face value (optional)">
                                      <input
                                        aria-label={`Original face value ${i + 1}`}
                                        type="number"
                                        step={c.unit === 'money' ? '0.01' : '1'}
                                        value={c.face_value ?? ''}
                                        onChange={(e) => patch(i, 'face_value', e.target.value)}
                                      />
                                    </Field>
                                    <Field label="Expiry (optional)">
                                      <input
                                        aria-label={`Value expiry ${i + 1}`}
                                        type="date"
                                        value={c.expiry ?? ''}
                                        onInput={(e) => patch(i, 'expiry', e.currentTarget.value)}
                                        onChange={(e) => patch(i, 'expiry', e.target.value)}
                                      />
                                    </Field>
                                  </>
                                )}
                                {c.supplied === 'Certificate / Award' &&
                                  entity(
                                    `instrument-${i}`,
                                    'Certificate type',
                                    'instruments',
                                    'instrument',
                                    { program_id: c.program_id, unit: 'count', role: 'Core' },
                                    (x) => patch(i, 'instrument_id', x),
                                    c.instrument_id,
                                    (r) =>
                                      r.unit === 'count' &&
                                      (!c.program_id || r.program_id === c.program_id),
                                  )}
                                {![
                                  'Points / Miles',
                                  'Voucher / Travel Credit',
                                  'Certificate / Award',
                                ].includes(c.supplied) &&
                                  c.type !== 'Owned value' &&
                                  entity(
                                    `program-${i}`,
                                    'Program / Issuer',
                                    'programs',
                                    'program',
                                    { category: 'Other' },
                                    (x) => patch(i, 'program_id', x),
                                    c.program_id,
                                  )}
                                {c.type === 'Other' && c.supplied === 'Other / Custom' && (
                                  <Field label="Quantity / face amount">
                                    <input
                                      aria-label={`Quantity ${i + 1}`}
                                      type="number"
                                      step={c.unit === 'money' ? '0.01' : '1'}
                                      value={c.quantity ?? ''}
                                      onChange={(e) => patch(i, 'quantity', e.target.value)}
                                    />
                                  </Field>
                                )}
                                {c.type === 'Other' &&
                                  c.supplied === 'Other / Custom' &&
                                  select(
                                    `unit-${i}`,
                                    'Quantity unit',
                                    ['money', 'points', 'count'],
                                    (x) => patch(i, 'unit', x),
                                    c.unit,
                                  )}
                                {c.supplied !== 'Points / Miles' && !c.method ? (
                                  <Field label="Payment / value reference">
                                    <input
                                      aria-label={`reference ${i + 1}`}
                                      value={c.reference ?? ''}
                                      onChange={(e) => patch(i, 'reference', e.target.value)}
                                    />
                                  </Field>
                                ) : null}
                                {c.supplied !== 'Points / Miles' ? (
                                  <Field label="Component notes">
                                    <input
                                      aria-label={`notes ${i + 1}`}
                                      value={c.notes ?? ''}
                                      onChange={(e) => patch(i, 'notes', e.target.value)}
                                    />
                                  </Field>
                                ) : null}
                                <Field label="Payment / acquisition date">
                                  <input
                                    aria-label={`Component date ${i + 1}`}
                                    type="date"
                                    value={c.date ?? v.booked_on}
                                    onInput={(e) => patch(i, 'date', e.currentTarget.value)}
                                    onChange={(e) => patch(i, 'date', e.target.value)}
                                  />
                                </Field>
                                {['Outside seller', 'Other'].includes(c.type) && (
                                  <Field label="Transfer into Padova inventory first">
                                    <input
                                      aria-label={`Transfer to inventory ${i + 1}`}
                                      type="checkbox"
                                      checked={!!c.transfer}
                                      onChange={(e) => patch(i, 'transfer', e.target.checked)}
                                    />
                                    <small>
                                      Use only when Padova receives and retains this value.
                                      Acquisition and booking usage remain separate events.
                                    </small>
                                  </Field>
                                )}
                                {c.transfer && (
                                  <>
                                    {['asset_name', 'issuer', 'face_value', 'expiry']
                                      .filter(
                                        (key) =>
                                          key !== 'issuer' ||
                                          !(
                                            c.program_id ||
                                            (!c.different_program && inheritedProgram)
                                          ),
                                      )
                                      .map((key) => (
                                        <Field
                                          key={key}
                                          label={
                                            key === 'face_value'
                                              ? 'Original quantity / face value'
                                              : key === 'asset_name'
                                                ? 'New owned asset name *'
                                                : key === 'issuer'
                                                  ? 'Issuer (if no program selected)'
                                                  : 'Expiry'
                                          }
                                        >
                                          <input
                                            aria-label={`${key} ${i + 1}`}
                                            required={key === 'asset_name'}
                                            type={
                                              key === 'expiry'
                                                ? 'date'
                                                : key === 'face_value'
                                                  ? 'number'
                                                  : 'text'
                                            }
                                            value={c[key] ?? ''}
                                            onChange={(e) => patch(i, key, e.target.value)}
                                          />
                                        </Field>
                                      ))}
                                    <small className="full">
                                      Quantity above is the amount used on this booking; original
                                      face value may be larger.
                                    </small>
                                  </>
                                )}
                                {c.type === 'Owned value' && (
                                  <Field label="Expected Amex returned points (optional)">
                                    <input
                                      aria-label={`Expected rebate ${i + 1}`}
                                      type="number"
                                      step="1"
                                      value={c.rebate_expected ?? ''}
                                      onChange={(e) => patch(i, 'rebate_expected', e.target.value)}
                                    />
                                    <small>
                                      Pending until actual issuer posting; gross use stays in
                                      history.
                                    </small>
                                  </Field>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </section>
                    );
                  })}
                  <div className="full" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      setComponents((old) => [
                        ...old,
                        {
                          type: 'Padova payment',
                          unit: 'money',
                          date: v.booked_on,
                          payment_status: 'Unpaid',
                        },
                      ])
                    }
                  >
                    {components.length ? '+ Add another payment' : '+ Add payment / value'}
                  </button>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() =>
                        setComponents((old) => [
                          ...old,
                          {
                            type: 'Outside seller',
                            supplied: 'Points / Miles',
                            unit: 'points',
                            rate_unit: 'cents per point',
                            date: v.booked_on,
                            payment_status: 'Unpaid',
                            use_bp_economics: !!bpSource,
                            bp_rebate_percent: bpSource ? 35 : undefined,
                          },
                        ])
                      }
                    >
                      + Points / miles purchase
                    </button>
                  </div>
                </div>
              ) : (
                <p className="full">Cost details can be completed by an authorized colleague.</p>
              )}
              </div>
              <div className="full form-grid" id="booking-price">
              <h4 className="form-subsection-title">Customer price</h4>
              {can('edit_customer_charges') ? (
                <>
                  <p className="full customer-price-hint">
                    {providerDirect
                      ? `Customer already paid the provider${bookedCostLabel ? ` (${bookedCostLabel})` : ''}. Default amount owed to Padova is $0, add only a fee below, or use booked cost if Padova is also collecting the trip price.`
                      : `Typical: type the customer price${bookedCostLabel ? ` (booked cost ${bookedCostLabel})` : ''}. Same as cost, fixed margin, and percent off stay optional.`}
                  </p>
                  {bookedCostCents !== undefined && (
                    <div className="full customer-price-actions">
                      <button
                        type="button"
                        className={
                          sameAsCostPricing
                            ? 'btn primary'
                            : providerDirect
                              ? 'btn small'
                              : 'btn primary'
                        }
                        aria-label={`Same as cost ${bookedCostLabel}`}
                        aria-pressed={sameAsCostPricing}
                        onClick={() =>
                          setV((old) => ({
                            ...old,
                            pricing_method: 'Same as Cost',
                            price_override: false,
                            sale: (bookedCostCents / 100).toFixed(2),
                            sale_touched: true,
                            sale_seeded_from_cost: true,
                          }))
                        }
                      >
                        Same as cost ({bookedCostLabel})
                      </button>
                      {providerDirect && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() =>
                            setV((old) => ({
                              ...old,
                              pricing_method: 'Manual Customer Price',
                              sale: '0',
                              sale_touched: true,
                            }))
                          }
                        >
                          No amount owed to Padova ($0)
                        </button>
                      )}
                    </div>
                  )}
                  {((!percentPricing && !sameAsCostPricing && !fixedMarginPricing) ||
                    v.price_override) &&
                    text(
                      'sale',
                      providerDirect
                        ? 'Amount owed to Padova before extra fee (USD)'
                        : 'Customer Sale Price (USD)',
                      'number',
                    )}
                  {(sameAsCostPricing || fixedMarginPricing) && !v.price_override ? (
                    <output className="full booking-price-summary" aria-live="polite">
                      <span>
                        Customer Price:{' '}
                        <strong>
                          {calculatedSale === undefined ? 'Incomplete' : dollars(calculatedSale)}
                        </strong>
                        {sameAsCostPricing ? ' · same as cost' : null}
                        {fixedMarginPricing ? ' · cost + margin' : null}
                      </span>
                    </output>
                  ) : null}
                  <details
                    className="full optional-block"
                    open={bookingFixedMarginShouldOpen(v)}
                  >
                    <OptionalSummary
                      title="Fixed margin over cost"
                      hint="Rare — customer price = booked cost + margin (Unknown cost stays Incomplete)"
                      filled={fixedMarginPricing || v.fixed_margin ? 1 : 0}
                    />
                    <div className="form-grid">
                      {text('fixed_margin', 'Margin over cost (USD)', 'number')}
                      <button
                        type="button"
                        className="btn small"
                        disabled={bookedCostCents === undefined}
                        onClick={() =>
                          setV((old) => ({
                            ...old,
                            pricing_method: 'Fixed Margin',
                            price_override: false,
                            sale_touched: true,
                            sale_seeded_from_cost: false,
                          }))
                        }
                      >
                        Use fixed margin
                      </button>
                      {bookedCostCents === undefined ? (
                        <small className="full field-hint">
                          Enter cost first — margin cannot invent a missing cost.
                        </small>
                      ) : null}
                    </div>
                  </details>
                  {providerDirect && (
                    <p className="full">
                      Customer card paid the provider directly
                      {bookedCostLabel ? ` (${bookedCostLabel})` : ''}. That amount is recorded
                      separately below, it is not owed to Padova. Keep amount owed at $0 and put
                      any booking/service fee in Extra charge, or click Use booked cost only if
                      Padova is also collecting the trip price.
                    </p>
                  )}
                  {providerDirect && bookedCostCents === undefined && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() =>
                        setV((old) => ({
                          ...old,
                          pricing_method: 'Manual Customer Price',
                          sale: '0',
                          sale_touched: true,
                        }))
                      }
                    >
                      No amount owed to Padova ($0)
                    </button>
                  )}
                  <details
                    className="full optional-block"
                    open={bookingPercentPricingShouldOpen(v)}
                  >
                    <OptionalSummary
                      title="Percent off comparable online"
                      hint="Rare — leave collapsed for a typed customer price"
                      filled={
                        [
                          percentPricing ? 'percent' : '',
                          v.comparable_price,
                          v.discount_percent,
                          v.record_comparable ? 'keep' : '',
                        ].filter(Boolean).length
                      }
                    />
                    {select(
                      'pricing_method',
                      'Pricing Method',
                      [
                        'Manual Customer Price',
                        'Same as Cost',
                        'Fixed Margin',
                        'Percentage Off Comparable Online Price',
                      ],
                      (x) => change('pricing_method', x),
                      v.pricing_method || 'Manual Customer Price',
                    )}
                    {percentPricing ? (
                      <>
                        {text('comparable_price', 'Comparable Online Price (USD)', 'number')}
                        {text('discount_percent', 'Discount %', 'number')}
                        <output className="full booking-price-summary" aria-live="polite">
                          <span>
                            Customer Price:{' '}
                            <strong>
                              {calculatedSale === undefined
                                ? dollars(0)
                                : dollars(calculatedSale)}
                            </strong>
                          </span>
                          <span>
                            Savings:{' '}
                            <strong>
                              {calculatedSale === undefined ||
                              usd(v.comparable_price) === undefined
                                ? dollars(0)
                                : dollars(usd(v.comparable_price)! - calculatedSale)}
                            </strong>
                          </span>
                        </output>
                        <div className="form-field full inline-checkbox-field">
                          <label className="check-card">
                            <input
                              type="checkbox"
                              checked={!!v.price_override}
                              onChange={(e) => change('price_override', e.target.checked)}
                            />
                            <span className="check-card-body">
                              <span className="check-card-title">Override calculated price</span>
                              <small>
                                Enter a manual Customer Sale Price instead of the percent-off
                                amount.
                              </small>
                            </span>
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        {text('comparable_price', 'Comparable Online Price (USD)', 'number')}
                        <div className="form-field full inline-checkbox-field">
                          <label className="check-card">
                            <input
                              type="checkbox"
                              checked={!!v.record_comparable}
                              onChange={(e) => change('record_comparable', e.target.checked)}
                            />
                            <span className="check-card-body">
                              <span className="check-card-title">Keep this comparison</span>
                              <small>Store the online reference price with this booking.</small>
                            </span>
                          </label>
                        </div>
                      </>
                    )}
                  </details>
                  <p className="full field-hint">
                    Extra charge / card fee and optional taxes live in <strong>More</strong>{' '}
                    (Plan rare fields).
                  </p>
                  <dl className="customer-money-summary full" aria-label="Customer summary">
                    {(() => {
                      const feeNote =
                        String(v.additional_charge_note || '').trim() || 'Extra fee';
                      const saleOnly = baseSale ?? 0;
                      const feeOnly = extraCharge > 0 && saleOnly === 0;
                      if (feeOnly)
                        return (
                          <div>
                            <dt>Amount owed to Padova ({feeNote})</dt>
                            <dd>{dollars(extraCharge)}</dd>
                          </div>
                        );
                      return (
                        <>
                    <div>
                      <dt>Amount owed to Padova</dt>
                            <dd>{dollars(total)}</dd>
                    </div>
                          {extraCharge > 0 && (
                            <div>
                              <dt>Includes {feeNote}</dt>
                              <dd>{dollars(extraCharge)}</dd>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div>
                      <dt>Received by Padova</dt>
                      <dd>{v.customer_status_unresolved ? 'Unknown' : dollars(received)}</dd>
                    </div>
                    <div className="remaining">
                      <dt>Remaining balance</dt>
                      <dd>
                        {v.customer_status_unresolved
                          ? 'Unknown'
                          : dollars(total - received)}
                      </dd>
                    </div>
                    {providerDirect && (
                      <div>
                        <dt>Customer paid provider directly</dt>
                        <dd>{dollars(customerDirectCents ?? 0)}</dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                <p className="full">
                  Billing can be completed by an authorized colleague. Any receipt remains available
                  customer credit.
                </p>
              )}
              {can('edit_payments') && (
                <>
                  <Field label="Money received by Padova (USD)">
                    <input
                      aria-label="Amount received (USD)"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="No payment recorded"
                      value={
                        v.payment_status === 'Paid' && !v.received_manual
                          ? (total / 100).toFixed(2)
                          : (v.received ?? '')
                      }
                      onChange={(e) => change('received', e.target.value)}
                    />
                    {baseSale !== undefined && total > 0 && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => change('received', (total / 100).toFixed(2))}
                      >
                        Received full amount
                      </button>
                    )}
                  </Field>
                  {received > 0 && (
                    <>
                      {select(
                        'receipt_method',
                        'Customer payment method',
                        mergePaymentMethodOptions([
                          ...(state.payments ?? []).map((p: R) => p.method),
                        ]),
                      )}
                      {v.receipt_method === PAYMENT_METHOD_OTHER ||
                      v.receipt_method === 'Other' ? (
                        <Field label="New customer payment method" required>
                          <input
                            aria-label="New customer payment method"
                            value={v.receipt_method_custom ?? ''}
                            onChange={(e) => change('receipt_method_custom', e.target.value)}
                            placeholder="e.g. Venmo"
                          />
                        </Field>
                      ) : null}
                      {entity(
                        'receipt_account_id',
                        'Receipt account',
                        'paymentAccounts',
                        'payment_account',
                        {},
                        undefined,
                        undefined,
                        (a) => accountSupports(a, v.receipt_method),
                      )}
                      <details>
                        <summary>Receipt date / reference</summary>
                        {text('receipt_date', 'Receipt date', 'date')}
                        {text('receipt_reference', 'Receipt reference')}
                      </details>
                    </>
                  )}
                </>
              )}
              {can('manage_commissions') && (
                <p className="full note">
                  After Save, open <strong>Add commission</strong> on the booking to record who owes
                  Padova (IATA partner and any secondary payer). Affiliate payable comes from the
                  referring organization in More when set, do not post the same payout twice.
                </p>
              )}
              </div>
            </section>
            <section className="booking-section full form-grid" id="booking-more">
              <h3 className="form-section-title">
                <span>5</span> More
                <small>
                  Extra charge, taxes, referrer, extra income, Held PNR, FHR, document link,
                  notes — keep collapsed unless needed
                </small>
              </h3>
              <details
                className="optional-block full"
                open={moreOpen}
                onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>
                  Open More (extra charge, taxes, referrer, extra income, Held PNR, FHR,
                  document, notes, summary)
                </summary>
              <details
                className="optional-block full"
                open={!!v.additional_charge || !!v.additional_charge_note}
              >
                <OptionalSummary
                  title="Extra charge / fee"
                  hint="Booking fee or card fee owed to Padova — rare; leave blank when none"
                  filled={
                    [v.additional_charge, v.additional_charge_note].filter(Boolean).length
                  }
                />
                {can('edit_customer_charges') ? (
                  <>
                    {text(
                      'additional_charge',
                      'Optional Additional Charge / Fee (USD)',
                      'number',
                    )}
                    <Field label="What is this fee?" full>
                      <>
                        <div className="fee-note-chips" role="group" aria-label="Common fee types">
                          {['Booking fee', 'Card fee', 'Service fee', 'Agency fee', 'Other'].map(
                            (label) => (
                              <button
                                key={label}
                                type="button"
                                className={`btn small${
                                  String(v.additional_charge_note || '') === label
                                    ? ' primary'
                                    : ''
                                }`}
                                onClick={() => {
                                  change('additional_charge_note', label);
                                  if (
                                    label === 'Card fee' &&
                                    !(Number(v.additional_charge) > 0) &&
                                    Number(v.sale) > 0
                                  ) {
                                    const bps = Number(
                                      state.feeSettings?.customer_card_fee_bps ??
                                        DEFAULT_CUSTOMER_CARD_FEE_BPS,
                                    );
                                    const suggested = customerCardFeeCents(
                                      decimalUnits(String(v.sale)),
                                      bps,
                                    );
                                    if (suggested > 0)
                                      change('additional_charge', centsToUsdInput(suggested));
                                  }
                                }}
                              >
                                {label}
                              </button>
                            ),
                          )}
                        </div>
                        <input
                          aria-label="Extra fee note"
                          placeholder="e.g. Booking fee, service fee, or leave blank"
                          value={v.additional_charge_note ?? ''}
                          onChange={(e) => change('additional_charge_note', e.target.value)}
                        />
                      </>
                    </Field>
                  </>
                ) : (
                  <small className="note">Charge permission required to set an extra fee.</small>
                )}
              </details>
              <details
                className="optional-block full"
                open={
                  !!(
                    (typeof v.tax_amount === 'string' && v.tax_amount.trim()) ||
                    (typeof v.tax_amount === 'number' && Number.isFinite(v.tax_amount)) ||
                    (v.tax_bearer && v.tax_bearer !== 'Unknown')
                  )
                }
              >
                <OptionalSummary
                  title="Taxes & Fees"
                  hint="Optional part of customer price (e.g. sale excluding taxes) — blank stays Unknown"
                  filled={
                    [v.tax_amount, v.tax_bearer && v.tax_bearer !== 'Unknown' ? v.tax_bearer : '']
                      .filter(Boolean).length
                  }
                />
                <div className="form-grid">
                  {text('tax_amount', 'Taxes / Fees (USD)', 'number')}
                  {select(
                    'tax_bearer',
                    'Who paid the taxes?',
                    [
                      'Unknown',
                      ...(can('manage_funding') ? ['Padova'] : []),
                      'Customer',
                      'Seller',
                      'Included in Seller Price',
                    ],
                    undefined,
                    v.tax_bearer || 'Unknown',
                  )}
                  {usd(v.tax_amount) !== undefined && (
                    <details className="full">
                      <summary>Tax cost / customer recovery</summary>
                      <div className="form-grid">
                        {select(
                          'tax_economic_bearer',
                          'Who bears the tax cost?',
                          ['Unknown', 'Padova', 'Customer', 'Seller'],
                          undefined,
                          v.tax_economic_bearer || 'Unknown',
                        )}
                        {v.tax_economic_bearer === 'Customer' &&
                          text(
                            'tax_customer_recovery',
                            'Tax recovered within customer price (USD)',
                            'number',
                          )}
                        <small className="full">
                          Include any recovery in the customer price. This records the tax split; it
                          does not add another charge.
                        </small>
                      </div>
                    </details>
                  )}
                  {can('manage_funding') && v.tax_bearer === 'Padova' && (
                    <>
                      <Field label="Already included in a Padova payment above">
                        <input
                          type="checkbox"
                          checked={!!v.tax_included}
                          onChange={(e) => change('tax_included', e.target.checked)}
                        />
                      </Field>
                      {!v.tax_included && (
                        <>
                          {select(
                            'tax_method',
                            'Tax payment method',
                            mergePaymentMethodOptions([
                              ...(state.payments ?? []).map((p: R) => p.method),
                            ]),
                          )}
                          {v.tax_method === PAYMENT_METHOD_OTHER ||
                          v.tax_method === 'Other' ? (
                            <Field label="New tax payment method" required>
                              <input
                                aria-label="New tax payment method"
                                value={v.tax_method_custom ?? ''}
                                onChange={(e) => change('tax_method_custom', e.target.value)}
                                placeholder="e.g. Venmo"
                              />
                            </Field>
                          ) : null}
                          {entity(
                            'tax_account_id',
                            'Tax payment account',
                            'paymentAccounts',
                            'payment_account',
                            { kind: 'Card' },
                            undefined,
                            undefined,
                            (a) => accountSupports(a, v.tax_method),
                          )}
                        </>
                      )}
                    </>
                  )}
                  <small className="full">
                    Taxes paid directly by the customer or included in the seller price add no extra
                    Padova expense. Record a separate amount owed to a seller as another seller
                    component. Needed for sale-excluding-taxes extra income deals.
                  </small>
                </div>
              </details>
              <details
                className="optional-block full"
                open={!!v.referring_organization_id}
              >
                <OptionalSummary title="Referring organization (affiliate)" />
                {can('manage_commissions') ? (
                  <SearchableSelect
                    id="entry-referring_organization_id"
                    label="Referring organization (affiliate)"
                    value={v.referring_organization_id ?? ''}
                    placeholder="Select organization…"
                    options={[
                      {
                        value: '',
                        label: 'None',
                      },
                      ...(state.referralOrganizations ?? []).map((r: R) => ({
                        value: r.id,
                        label: `${r.name}${r.location ? ` · ${r.location}` : ''} · ${
                          r.terms?.calculation === 'fixed'
                            ? `fixed $${((Number(r.terms.fixed_amount) || 0) / 100).toFixed(2)}`
                            : `${((Number(r.terms?.rate_bps) || 0) / 100).toFixed(2)}% of ${r.terms?.percentage_basis ?? 'profit'}`
                        }`,
                      })),
                    ]}
                    onChange={(id) => change('referring_organization_id', id || '')}
                    emptyLabel="No matching organization"
                    hideCount
                  />
                ) : (
                  <small className="note">Commission permission required to set affiliate.</small>
                )}
              </details>
              <details
                className="optional-block full"
                open={
                  !!(
                    String(v.extra_income_label || '').trim() ||
                    String(v.extra_income_percent ?? '').trim() ||
                    String(v.extra_income_note || '').trim()
                  )
                }
              >
                <OptionalSummary
                  title="Extra income"
                  hint="Optional side deal (e.g. Marriott 10% cash) — blank stays Unknown"
                  filled={
                    [
                      v.extra_income_label,
                      v.extra_income_percent,
                      v.extra_income_note,
                    ].filter((x) => String(x ?? '').trim()).length
                  }
                />
                <Field label="Label" full>
                  <input
                    aria-label="Extra income label"
                    type="text"
                    placeholder="e.g. Marriott cash back"
                    value={v.extra_income_label ?? ''}
                    onChange={(e) => change('extra_income_label', e.target.value)}
                  />
                </Field>
                <Field label="Rate (%)">
                  <input
                    aria-label="Extra income percent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="10"
                    value={v.extra_income_percent ?? ''}
                    onChange={(e) => change('extra_income_percent', e.target.value)}
                  />
                </Field>
                <Field label="Of">
                  <select
                    aria-label="Extra income basis"
                    value={v.extra_income_basis || 'sale_ex_tax'}
                    onChange={(e) => change('extra_income_basis', e.target.value)}
                  >
                    {STANDING_DEAL_BASES.map((basis) => (
                      <option key={basis} value={basis}>
                        {basis === 'sale_ex_tax'
                          ? 'Stay price excluding taxes'
                          : 'Full customer sale'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Note (optional)" full>
                  <textarea
                    aria-label="Extra income note"
                    rows={2}
                    placeholder="Optional — never invent an amount"
                    value={v.extra_income_note ?? ''}
                    onChange={(e) => change('extra_income_note', e.target.value)}
                  />
                </Field>
                <p className="full field-hint">
                  Seeds an expected Money Back line on save. Amount stays Incomplete when sale or
                  taxes needed for the basis are unknown. Customer standing deals still seed
                  separately.
                </p>
              </details>
            {howVis.showFhrHints ? (
              <details
                className="optional-block full"
                id="booking-fhr-more"
                open={bookingEntryFhrMoreShouldOpen(v)}
              >
                <OptionalSummary
                  title="Program rate (FHR)"
                  hint="Optional — FHR / Amex / similar; blank stays Unknown"
                  filled={
                    [v.program_rate_name, v.program_perks, v.program_benefit_gained].filter(
                      (x) => typeof x === 'string' && !!String(x).trim(),
                    ).length
                  }
                />
                <div className="form-grid">
                  <Field label="Program name (optional)">
                    <input
                      aria-label="Program name"
                      type="text"
                      placeholder="FHR"
                      value={v.program_rate_name ?? ''}
                      onChange={(e) => change('program_rate_name', e.target.value)}
                    />
                  </Field>
                  <Field label="Perks included (optional)" full>
                    <textarea
                      aria-label="Program perks"
                      rows={2}
                      placeholder="Breakfast, property credit, upgrade"
                      value={v.program_perks ?? ''}
                      onChange={(e) => change('program_perks', e.target.value)}
                    />
                  </Field>
                  <Field label="Amex credit / points gained (optional)" full>
                    <input
                      aria-label="Amex credit or points gained"
                      type="text"
                      placeholder="None — leave blank (info only, not income)"
                      value={v.program_benefit_gained ?? ''}
                      onChange={(e) => change('program_benefit_gained', e.target.value)}
                    />
                  </Field>
                  <p className="full field-hint">
                    Account used for the booking is under Booked Through (always someone
                    else&apos;s). Amex credit / points gained default to none and are never counted
                    as Padova income.
                  </p>
                </div>
              </details>
            ) : null}
            <details
              className="optional-block full"
              id="booking-held"
              open={bookingEntryHeldMoreShouldOpen(v)}
            >
              <OptionalSummary
                title="Held PNR"
                hint="Optional unpaid hold with ticketing deadline"
                filled={v.held_pnr || v.ticketing_deadline ? 1 : 0}
              />
              <div className="form-field full inline-checkbox-field">
                <label className="check-card">
                  <input
                    type="checkbox"
                    checked={!!v.held_pnr}
                    onChange={(e) => change('held_pnr', e.target.checked)}
                  />
                  <span className="check-card-body">
                    <span className="check-card-title">Hold this PNR (customer not paid yet)</span>
                    <small>
                      Status Held until paid and ticketed. Reminder before the deadline — no
                      auto-cancel.
                    </small>
                  </span>
                </label>
              </div>
              {v.held_pnr ? text('ticketing_deadline', 'Ticketing deadline', 'date', true) : null}
            </details>
            <details
              className="optional-block full"
              id="booking-summary"
              open={bookingEntryNotesMoreShouldOpen(v)}
            >
              <OptionalSummary
                title="Summary & notes"
                hint="Automatic summary and useful notes — leave collapsed when blank"
                filled={
                  [
                    v.summary_override ? 'edit' : '',
                    v.notes,
                    v.price_breakdown_note,
                  ].filter((x) => typeof x === 'string' && !!String(x).trim()).length
                }
              />
              <div className="full reservation-summary">
                <div className="summary-heading">
                  <label>Reservation summary · {v.summary_override ? 'Edited' : 'Automatic'}</label>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      change('summary_override', !v.summary_override);
                      if (!v.summary_override)
                        change('reservation_summary', v.reservation_summary || derived.summary);
                    }}
                  >
                    {v.summary_override ? 'Reset to automatic' : 'Edit'}
                  </button>
                </div>
                {v.summary_override ? (
                  text('reservation_summary', 'Reservation summary', 'text', false, true)
                ) : (
                  <output>{derived.summary}</output>
                )}
              </div>
              <Field label="Booking notes (optional)" full>
                <textarea
                  aria-label="Booking notes"
                  rows={2}
                  placeholder="For example: Customer prefers aisle seats"
                  value={v.notes ?? ''}
                  onChange={(e) => change('notes', e.target.value)}
                />
              </Field>
              <Field label="Per-traveler / per-flight breakdown (optional)" full>
                <textarea
                  aria-label="Per-traveler or per-flight price breakdown"
                  rows={2}
                  placeholder="Optional note only — customer price stays one total"
                  value={v.price_breakdown_note ?? ''}
                  onChange={(e) => change('price_breakdown_note', e.target.value)}
                />
              </Field>
              <p className="full field-hint">
                One booking = one customer price. A per-traveler or per-flight split is a note
                only — never required, never invents dollars, and never shown on the list.
              </p>
            </details>
            <details
              className="optional-block full"
              open={
                !!(
                  String(v.document_label || '').trim() ||
                  String(v.document_url || '').trim() ||
                  String(v.document_note || '').trim()
                )
              }
            >
              <OptionalSummary
                title="Document link"
                hint="Optional itinerary / screenshot / PDF link — metadata only; blank stays Unknown"
                filled={
                  [
                    v.document_label,
                    v.document_url,
                    v.document_note,
                    v.document_kind && v.document_kind !== 'other' ? v.document_kind : '',
                  ].filter((x) => String(x || '').trim()).length
                }
              />
              <Field label="Label" full>
                <input
                  aria-label="Document label"
                  type="text"
                  placeholder="e.g. United eTicket, hotel confirmation screenshot"
                  value={v.document_label ?? ''}
                  onChange={(e) => change('document_label', e.target.value)}
                />
              </Field>
              <Field label="Kind">
                <select
                  aria-label="Document kind"
                  value={v.document_kind || 'other'}
                  onChange={(e) => change('document_kind', e.target.value)}
                >
                  {BOOKING_DOCUMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {bookingDocumentKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Link URL (optional)" full>
                <input
                  aria-label="Document URL"
                  type="url"
                  placeholder="https://…"
                  value={v.document_url ?? ''}
                  onChange={(e) => change('document_url', e.target.value)}
                />
              </Field>
              <Field label="Note (optional)" full>
                <textarea
                  aria-label="Document note"
                  rows={2}
                  placeholder="Where this came from — never invent a file"
                  value={v.document_note ?? ''}
                  onChange={(e) => change('document_note', e.target.value)}
                />
              </Field>
              <Field label="Date (optional)">
                <input
                  aria-label="Document date"
                  type="date"
                  value={v.document_added_on ?? ''}
                  onChange={(e) => change('document_added_on', e.target.value)}
                />
              </Field>
              <p className="full field-hint">
                Saves with the booking as a document link. Add more links later from the booking
                page. No binary upload in v1.
              </p>
            </details>
              </details>
            </section>
          </div>
          <p className={recoveryAvailable ? 'muted' : 'form-error'} role="status">
            {recoveryAvailable
              ? 'Draft saved on this browser'
              : 'Automatic browser recovery is unavailable. Keep this page open or save a draft before leaving.'}
          </p>
        </div>
        <div className="modal-footer">
          <div className="modal-footer-actions">
          <button
            type="button"
            className="btn discard-draft"
            disabled={busy}
              onClick={async () => {
                const ok = await askConfirm({
                  title: 'Discard draft?',
                  message: 'Clear this unfinished booking draft?',
                  confirmLabel: 'Discard',
                  cancelLabel: 'Cancel',
                  tone: 'danger',
                });
                if (!ok) return;
              recoveryFinished.current = true;
              clearBookingRecovery(state.actor.id);
              onClose();
            }}
          >
            Discard draft
          </button>
          <button type="button" className="btn" onClick={closeBooking} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (hasUnsavedTicketing())
                  throw new Error(
                    'Save the edited traveler details to their profiles before saving the draft.',
                  );
                if (!onInlineCommand) throw new Error('Draft save unavailable');
                await onInlineCommand(
                  'booking_draft',
                  {
                    title: v.route || v.reservation_summary || `${v.product} draft`,
                    entry: { ...v, components, pending_traveler: traveler },
                  },
                  crypto.randomUUID(),
                );
                  recoveryFinished.current = true;
                  clearBookingRecovery(state.actor.id);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Draft save failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save Draft
          </button>
            <button
              className="btn primary"
              disabled={busy || !!dateOrderIssue || !!livePastePreview.reservationBlock}
              title={
                livePastePreview.reservationBlock
                  ? 'Blocked until this looks like a real booking confirmation'
                  : undefined
              }
            >
            {busy ? 'Saving…' : 'Save Booking'}
          </button>
          </div>
        </div>
      </form>
      {confirmDialog}
    </div>
  );
}
