'use client';
import TravelCalendar from '@/components/travel-calendar';
import { bookingShortName, calendarBookingSharePath, tripTitle } from '@/lib/travel-presentation';
import QAReports from '@/components/qa-reports';
import Partnerships from '@/components/partnerships/workspace';
import TravelerSourceReview from '@/components/traveler-source-review';
import SourceAccount from '@/components/source-account';
import {
  bookingMatchesSearch,
  bookingSearchTerms,
  saleMatchesSearch,
} from '@/lib/booking-search';
import { draftKind, draftMatchesSearch } from '@/lib/draft-kind';
import { transactionList, transactionIndicators } from '@/lib/transaction-list';
import { dateLabel, dateTimeLabel } from '@/lib/display-date';
import { auditMatchesSearch } from '@/lib/audit-channel';
import { countLabel } from '@/lib/count-label';
import { travelDatesDisplay } from '@/lib/travel-dates-display';
import {
  paymentAllocationStatus,
  paymentMatchesAllocationFilter,
  paymentMatchesSearch,
  paymentUnallocatedCents,
  paymentUnallocatedColumnLabel,
} from '@/lib/expected-commissions';
import {
  buildApplyHeldCreditDefaults,
  heldCustomerCreditCents,
  pickBookingForHeldCreditApply,
} from '@/lib/customer-wallet';
import { buildPayReferralPaymentDefaults } from '@/lib/referrer-payout-defaults';
import { authorizedPayersEmptyHint } from '@/lib/booking-payers';
import {
  customerTaxesDisplay,
  standingDealNeedsTaxesHint,
  standingDealUnknownAmountHint,
} from '@/lib/booking-customer-taxes';
import {
  buildInvoicePreview,
  canApproveInvoice,
  canMarkInvoiceSent,
  canSendInvoiceEmail,
  canVoidInvoice,
  formatInvoicePaymentReceiptLines,
  formatInvoicePreviewPlainText,
  formatInvoiceWhatsAppOwnerCopy,
  invoiceStatusLabel,
  pickInvoicePaymentReceipt,
  type InvoicePreview,
} from '@/lib/invoice-preview';
import {
  buildCustomerStatementPreview,
  formatCustomerStatementPlainText,
  type CustomerStatementPreview,
} from '@/lib/customer-statement';
import { customerOwesListLabel, partyCustomerOwes } from '@/lib/customer-owes';
import {
  cardFeeCentsByPaymentId,
  customerPaymentsForParty,
} from '@/lib/customer-payments';
import {
  paymentLooksRepeated,
  paymentLooksRepeatedLabel,
  possibleDuplicatePaymentPeers,
} from '@/lib/payment-duplicate-flag';
import { assetSaleEconomics } from '@/lib/asset-sale-economics';
import {
  chargebackStatusLabel,
  customerRefundStatus,
  customerRefundStatusLabel,
  parseChargebackStatus,
} from '@/lib/customer-refund-status';
import {
  assetMatchesCap1ProfileFilter,
  cap1ProfileBalanceLabel,
  listCap1ProfileBalances,
  toggleCap1ProfileFilter,
} from '@/lib/credit-ledger';
import { buildAddReferrerDefaults } from '@/lib/add-referrer-defaults';
import { pointsBatchListLabel, pointsBatchSummary } from '@/lib/points-batch';
import { formatReferralRateLabel, partyReferralRateBps } from '@/lib/referrer-defaults';
import { formatStandingDealLabel, partyStandingDeals } from '@/lib/standing-deals';
import {
  buildProfitByMonth,
  buildYearEndExportPack,
  rowsToCsv,
  yearEndFileNames,
} from '@/lib/year-end-export';
import { bookingTicketingDeadline, heldDeadlineUrgency } from '@/lib/held-pnr';
import { reservationStatusLabel } from '@/lib/booking-status';
import {
  SUPPLIER_REFUND_DENIED_FORM,
  supplierRefundStatus,
  supplierRefundStatusLabel,
} from '@/lib/supplier-refund-status';
import {
  bookingDocumentKindLabel,
  hiddenBookingDocuments,
  visibleBookingDocuments,
} from '@/lib/booking-documents';
import {
  bookingProfitListLabels,
  bookingProfitPair,
  buildPlanTodoList,
  filterPlanTodoList,
  planTodoMatchesSearch,
  planTodoRecordUrl,
  PLAN_TODO_CATEGORY_LABELS,
  teamTaskMatchesSearch,
  type PlanTodoCategory,
  dashboardProfitTotals,
} from '@/lib/dashboard-todo';
import { incompleteProfitReason, supplierCostIncomplete } from '@/lib/financial-display';
import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CommandForm from '@/components/command-form';
import HistoricalDraftDetails from '@/components/historical-draft-details';
import HistoricalRecordEditor from '@/components/historical-record-editor';
import { historicalRecordPresentation } from '@/lib/historical-record-presentation';
import HistoricalSourceDetails from '@/components/historical-source-details';
import { csvCell } from '@/lib/csv';
import { travelsBetween, upcomingBookings, nextTravelDate } from '@/lib/travel-schedule';
import { assetUnit, formatQuantity, refundQuantityUnit } from '@/lib/asset-units';
import { cancelFormMoneyDefaults } from '@/lib/refund-card-fee';
import {
  compareRefundFollowUpDue,
  refundFollowUpDueOn,
  refundFollowUpUrgency,
  refundFollowUpUrgencyLabel,
  refundMatchesSearch,
} from '@/lib/refund-follow-up-due';
import { latestCreditRequests, sourceConfirmationLabel } from '@/lib/v1-entry';
import AuthScreen from '@/components/auth-screen';
import { FormAlert } from '@/components/form-feedback';
import CommissionsPage from '@/components/commissions-page';
import OperationalViews from '@/components/operational-views';
import { followupRowMatchesSearch } from '@/lib/operational-views';
import {
  bookingRecoveryContinueDefaults,
  clearBookingRecovery,
  clearBookingRecoverySnooze,
  localBookingRecoveryOffer,
  type LocalBookingRecoveryOffer,
  readBookingRecovery,
  shouldAutoOpenBookingRecovery,
} from '@/lib/booking-recovery';
import {
  extractTextFromEml,
  INTAKE_BATCH_SIZE,
  INTAKE_EMAIL_MAILBOXES,
  INTAKE_MAX_ENTRIES,
  looksLikeEml,
  parseEmlEnvelope,
  splitIntakeEntries,
} from '@/lib/booking-intake-split';
import {
  formatIntakeProvenanceLine,
  intakeChannelBadge,
  intakeChannelFilterKey,
  intakeSourceTableTag,
} from '@/lib/intake-channel-label';
import { formatIntakeMissingSummary } from '@/lib/intake-confidence';
import {
  applyIntakeFieldOverrides,
  buildIntakeMappingPreview,
  INTAKE_REQUIRED_ROWS,
  INTAKE_SAMPLE_PASTE,
  UNREAD_FILE_MESSAGE,
  intakePreviewMark,
  intakePreviewMarkLabel,
  type IntakeFieldOverrides,
  type IntakeMappingPreview,
} from '@/lib/intake-preview';
import {
  bookingCommissionsEmptyMessage,
  expectedCommissionDisplay,
  expectedCommissionPanelLabel,
  recordedCommissionTotals,
  hasExpectedCommissionOnBooking,
  receivableCommissionLabel,
} from '@/lib/commission-line-label';
import { commissionOutstandingCents } from '@/lib/expected-commissions';
import {
  buildMoneyBackLines,
  moneyBackAmountBasisLabel,
  moneyBackFormLabel,
  moneyBackIsAdmCorrection,
  moneyBackStatusLabel,
} from '@/lib/money-back';
import { buildConfirmCommissionDefaults } from '@/lib/confirm-commission';
import {
  isTravelerLockedVoucher,
  voucherLockDisplayLabel,
} from '@/lib/voucher-traveler-lock';
import { isVoucherAsset } from '@/lib/voucher-ledger';
import { fundingCostKindLabel, fundingVoucherNote } from '@/lib/funding-cost-label';
import {
  fundingCostLineSettlement,
  fundingSettlementBadgeTone,
  fundingSettlementSummary,
} from '@/lib/funding-settlement';
import {
  tripSharedChargeSummary,
  type TripSharedCharge,
} from '@/lib/trip-shared-charges';
import { fhrProgramBenefitLabel } from '@/lib/fhr-program-benefit';
import {
  priceBreakdownNote,
  priceBreakdownNoteVisible,
} from '@/lib/price-breakdown-note';
import { parseExpiryRuleFromRestrictions } from '@/lib/expiry-rules';
import {
  parsePointsBatchSourceFromRestrictions,
  pointsBatchSourceLabel,
} from '@/lib/points-batch-source';
import { pointsOwningAccountLabel } from '@/lib/points-owning-account';
import {
  assetMatchesSearch,
  expectedEventBookingSharePath,
  expectedEventMatchesSearch,
  filterCreditsAndPointsAssets,
} from '@/lib/credits-points';
import {
  listTradesToComplete,
  parseTradeStatus,
  parseTradeToComplete,
  tradeStatusLabel,
  tradeToCompleteMatchesSearch,
} from '@/lib/trade-desk';
import {
  buildExpireAssetDefaults,
  canExpireAsset,
  expireAssetLossLabel,
} from '@/lib/expire-asset';
import {
  bookingListBookedOn,
  bookingListColumnCount,
  bookingListExpandFacts,
  bookingListHowBooked,
  BOOKING_LIST_SORT_OPTIONS,
  bookingListActiveCount,
  bookingListCancelledCount,
  bookingListCompletedCount,
  bookingListHeldCount,
  bookingListHowBookedOptions,
  bookingListIsCancelled,
  bookingListIsOwed,
  bookingListOwedCount,
  bookingListOwedTotal,
  bookingListOwedTotalLabel,
  bookingListPnr,
  bookingListRefundPendingCount,
  bookingListYearOptions,
  bookingMatchesHowBookedFilter,
  bookingMatchesYearFilter,
  compareBookingsForList,
  toggleBookingActiveFilter,
  toggleBookingCancelledFilter,
  toggleBookingCompletedFilter,
  toggleBookingHeldFilter,
  toggleBookingOwedFilter,
  toggleBookingRefundPendingFilter,
  toggleExpandedBookingId,
  type BookingListSort,
} from '@/lib/booking-list';
import {
  listPageForRecordId,
  readWorkspaceInvoiceId,
  readWorkspaceLocation,
  readWorkspaceRecord,
  WORKSPACE_HOME_PAGE,
  workspaceInvoiceUrl,
  workspacePageForRecord,
  workspaceRecordUrl,
  workspaceUrl,
} from '@/lib/workspace-routes';
import ListPager, { pageSlice } from '@/components/list-pager';
import { useConfirmDialog } from '@/components/confirm-dialog';
import UserAdministration, {
  PasswordChange,
  PersonalRecoveryCodes,
} from '@/components/user-administration';
import { hasPermission, commandPermission, Permission } from '@/lib/permissions';
import { eligibleParty } from '@/lib/directory-eligibility';
import {
  LayoutDashboard,
  Plane,
  Users,
  Building2,
  Wallet,
  CreditCard,
  Ticket,
  CalendarDays,
  ClipboardList,
  ChartNoAxesCombined,
  History,
  Settings,
  Search,
  Bell,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Hotel,
  Car,
  MoreVertical,
  Menu,
  X,
  LogOut,
  Copy,
  FileText,
  Download,
  Upload,
  ShieldCheck,
  Landmark,
  Coins,
  Mail,
  MessageCircle,
  Trash2,
} from 'lucide-react';
type R = Record<string, any>;
function draftProductIcon(product: unknown) {
  const p = String(product || '').toLowerCase();
  if (p.includes('hotel')) return Hotel;
  if (p.includes('car')) return Car;
  if (p.includes('flight')) return Plane;
  if (p.includes('voucher')) return Ticket;
  return FileText;
}
function draftChannelIcon(draft: R) {
  if (draft.kind === 'voucher_sale') return Ticket;
  if (draft.kind === 'historical_booking') return History;
  const source = String(draft.intake_source || '').toLowerCase();
  if (source.includes('email') || source.includes('gmail')) return Mail;
  if (source.includes('whatsapp')) return MessageCircle;
  if (source.includes('file') || source.includes('upload') || source.includes('staff'))
    return Upload;
  return FileText;
}
const refundValue = (refund: R, value: any) =>
  formatQuantity(Number(value), refund.unit ?? 'money');
const money = (v: any) =>
  v === null
    ? 'Unknown'
    : v === undefined || !Number.isFinite(Number(v))
      ? 'Restricted'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }).format(Number(v ?? 0) / 100);
const pretty = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (s: string) =>
  s
    .split(' ')
    .slice(0, 2)
    .map((v) => v[0])
    .join('');
const isPoints = (a: R) => assetUnit(a) === 'points';
const assetQuantity = (a: R, value: any) => formatQuantity(value, assetUnit(a));
const Icon = ({ name, size = 16 }: { name?: string; size?: number }) =>
  name === 'Hotel' ? (
    <Hotel size={size} />
  ) : name === 'Car' || name === 'Limo' ? (
    <Car size={size} />
  ) : (
    <Plane size={size} />
  );
function Badge({
  children,
  tone = '',
  title,
}: {
  children: React.ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}
function Card({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      <div className="card-header">
        <div className="title">
          <h2>{title}</h2>
          {count !== undefined && <span className="count">{count}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({ children = 'No records to show.' }: { children?: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
function Metric({
  label,
  value,
  foot,
  icon: IconComponent,
}: {
  label: string;
  value: string;
  foot: string;
  icon: any;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span className="metric-icon">
          <IconComponent size={15} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">
        <span className="dot" />
        {foot}
      </div>
    </div>
  );
}
const nav = [
  ['Bookings', Plane],
  ['Dashboard', LayoutDashboard],
  ['People & Families', Users],
  ['Companies', Building2],
  ['Suppliers', Landmark],
  ['Sources & Brokers', Users],
  ['Partnerships', Building2],
  ['Payments', Wallet],
  ['Credits & points', Ticket],
  ['Trade desk', ArrowLeftRight],
  ['Travel Assets', Ticket],
  ['Expected commissions', Coins],
  ['Refunds', ArrowDownLeft],
  ['Calendar', CalendarDays],
  ['To-do', ClipboardList],
  ['Tasks', ClipboardList],
  ['Accounting', ChartNoAxesCombined],
  ['Activity', History],
  ['Settings', Settings],
] as const;

export default function Workspace({ synthetic = false }: { synthetic?: boolean }) {
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();
  const [authReset, setAuthReset] = useState(() =>
    typeof window === 'undefined' ? false : readWorkspaceLocation().reset,
  );
  const [s, setS] = useState<R | null>(null),
    [page, setPage] = useState(() =>
      typeof window === 'undefined'
        ? WORKSPACE_HOME_PAGE
        : (readWorkspaceLocation().page ?? WORKSPACE_HOME_PAGE),
    ),
    [selected, setSelected] = useState<R | null>(null),
    [detail, setDetail] = useState<R | null>(null),
    [modal, setModal] = useState<R | null>(null),
    [invoicePreview, setInvoicePreview] = useState<{
      customer_id: string;
      preview: InvoicePreview;
    } | null>(null),
    [statementPreview, setStatementPreview] = useState<CustomerStatementPreview | null>(null),
    [invoiceBusy, setInvoiceBusy] = useState(false),
    [query, setQuery] = useState(''),
    [historicalQuery, setHistoricalQuery] = useState(''),
    [directoryQuery, setDirectoryQuery] = useState(''),
    [directoryPage, setDirectoryPage] = useState(1),
    [directoryType, setDirectoryType] = useState('All'),
    [directorySort, setDirectorySort] = useState('name'),
    [bookingStatus, setBookingStatus] = useState('All'),
    [bookingOwedOnly, setBookingOwedOnly] = useState(false),
    [bookingHowBooked, setBookingHowBooked] = useState('All'),
    [bookingYear, setBookingYear] = useState('All'),
    [bookingQuery, setBookingQuery] = useState(''),
    [bookingSort, setBookingSort] = useState<BookingListSort>('booked_desc'),
    [expandedBookingId, setExpandedBookingId] = useState<string | null>(null),
    [focusPaymentId, setFocusPaymentId] = useState<string | null>(null),
    [focusRefundId, setFocusRefundId] = useState<string | null>(null),
    [focusInvoiceId, setFocusInvoiceId] = useState<string | null>(null),
    [historicalStatus, setHistoricalStatus] = useState('Prepared booking'),
    [filter, setFilter] = useState('All'),
    [cap1ProfileFilter, setCap1ProfileFilter] = useState('All'),
    [assetQuery, setAssetQuery] = useState(''),
    [paymentQuery, setPaymentQuery] = useState(''),
    [refundQuery, setRefundQuery] = useState(''),
    [activityQuery, setActivityQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [recoveryOffer, setRecoveryOffer] = useState<LocalBookingRecoveryOffer | null>(null),
    [mobile, setMobile] = useState(false),
    [unauth, setUnauth] = useState(false),
    [horizon, setHorizon] = useState(7),
    [dashboardTravelQuery, setDashboardTravelQuery] = useState(''),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [followupSelected, setFollowupSelected] = useState('Needs Attention'),
    [todoCategory, setTodoCategory] = useState<PlanTodoCategory | 'All'>('All'),
    [todoQuery, setTodoQuery] = useState(''),
    [taskQuery, setTaskQuery] = useState(''),
    [attentionQuery, setAttentionQuery] = useState(''),
    [tradeQuery, setTradeQuery] = useState(''),
    [bookingPage, setBookingPage] = useState(1),
    [tablePage, setTablePage] = useState(1),
    [activityPage, setActivityPage] = useState(1),
    [expectedPage, setExpectedPage] = useState(1),
    [expectedQuery, setExpectedQuery] = useState(''),
    [calendarMonth, setCalendarMonth] = useState(new Date().toISOString().slice(0, 7)),
    [day, setDay] = useState(''),
    [intakeOpen, setIntakeOpen] = useState(false),
    [intakeText, setIntakeText] = useState(''),
    [intakeFile, setIntakeFile] = useState<File | null>(null),
    [intakePreview, setIntakePreview] = useState<IntakeMappingPreview | null>(null),
    [intakeOverrides, setIntakeOverrides] = useState<IntakeFieldOverrides>({}),
    [intakeRemapRow, setIntakeRemapRow] = useState<string | null>(null),
    [intakeStatus, setIntakeStatus] = useState(''),
    [intakeBusy, setIntakeBusy] = useState(false),
    intakeAbortRef = useRef<AbortController | null>(null),
    [intakeDrag, setIntakeDrag] = useState(false),
    [intakeProgress, setIntakeProgress] = useState<{
      processed: number;
      total: number;
      remaining: number;
    } | null>(null),
    [intakeAsEmail, setIntakeAsEmail] = useState(false),
    [intakeAsWhatsApp, setIntakeAsWhatsApp] = useState(false),
    [intakeMailbox, setIntakeMailbox] = useState<(typeof INTAKE_EMAIL_MAILBOXES)[number]>(
      INTAKE_EMAIL_MAILBOXES[0],
    ),
    [intakeEmailSubject, setIntakeEmailSubject] = useState(''),
    [intakeEmailFrom, setIntakeEmailFrom] = useState(''),
    [intakeWaChat, setIntakeWaChat] = useState(''),
    [intakeWaFrom, setIntakeWaFrom] = useState(''),
    [intakeChannelStatus, setIntakeChannelStatus] = useState<{
      email?: string;
      whatsapp?: string;
    } | null>(null),
    [draftChannelFilter, setDraftChannelFilter] = useState('All'),
    [draftQuery, setDraftQuery] = useState(''),
    [draftPage, setDraftPage] = useState(1),
    [draftsOpen, setDraftsOpen] = useState(() => {
      if (typeof window === 'undefined') return true;
      try {
        return window.localStorage.getItem('padova.transactions.draftsOpen') !== '0';
      } catch {
        return true;
      }
    });
  const setDraftsOpenPersist = (open: boolean) => {
    setDraftsOpen(open);
    try {
      window.localStorage.setItem('padova.transactions.draftsOpen', open ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const resetIntakeChannels = (clearText = false) => {
    setIntakeFile(null);
    setIntakePreview(null);
    setIntakeOverrides({});
    setIntakeRemapRow(null);
    setIntakeDrag(false);
    setIntakeProgress(null);
    setIntakeStatus('');
    setIntakeAsEmail(false);
    setIntakeAsWhatsApp(false);
    setIntakeEmailSubject('');
    setIntakeEmailFrom('');
    setIntakeWaChat('');
    setIntakeWaFrom('');
    if (clearText) setIntakeText('');
  };
  const closeIntake = () => {
    // Plan v1: Escape/Cancel must always abort — never trap the user during file read.
    try {
      intakeAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
    intakeAbortRef.current = null;
    setIntakeBusy(false);
    setIntakeProgress(null);
    setIntakeOpen(false);
    // Keep pasted text on cancel; clear channel toggles / file so reopen is clean.
    resetIntakeChannels(false);
  };
  useEffect(() => {
    if (!intakeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeIntake();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [intakeOpen]);
  // Draft card ⋮ menus: close on outside click / Escape (do not leave open).
  useEffect(() => {
    const closeDraftMenus = () => {
      document.querySelectorAll('details.intake-draft-menu[open]').forEach((el) => {
        (el as HTMLDetailsElement).open = false;
      });
    };
    const onPointer = (e: PointerEvent) => {
      const open = document.querySelector('details.intake-draft-menu[open]');
      if (!open) return;
      const target = e.target as Node | null;
      if (target && open.contains(target)) return;
      closeDraftMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!document.querySelector('details.intake-draft-menu[open]')) return;
      e.preventDefault();
      closeDraftMenus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);
  // Keep unread preview from binary extract until staff pastes real text.
  useEffect(() => {
    if (!intakeOpen) return;
    if (intakeText.trim() && intakePreview?.unread) {
      setIntakePreview(
        buildIntakeMappingPreview(intakeText, {
          parties: s?.parties ?? [],
          overrides: intakeOverrides,
        }),
      );
    }
  }, [intakeOpen, intakeText, intakePreview?.unread, intakeOverrides, s?.parties]);
  const liveIntakePreview = useMemo(() => {
    if (!intakeOpen) return null;
    if (intakePreview?.unread && !intakeText.trim()) return intakePreview;
    return buildIntakeMappingPreview(intakeText, {
      parties: s?.parties ?? [],
      overrides: intakeOverrides,
    });
  }, [intakeOpen, intakeText, intakeOverrides, intakePreview, s?.parties]);
  const chooseIntakeFile = async (file: File | null) => {
    setIntakeFile(file);
    setIntakeOverrides({});
    setIntakeStatus('');
    if (!file) {
      setIntakePreview(null);
      return;
    }
    const binary =
      !/\.(txt|csv|md|eml|json)$/i.test(file.name) && !/^text\//i.test(file.type || '');
    if (binary) {
      // Clear prior paste so a failed read cannot show a stale mapped preview.
      setIntakeText('');
      setIntakePreview(null);
      setIntakeBusy(true);
      const abort = new AbortController();
      intakeAbortRef.current = abort;
      const previewOnce = async () => {
        const data = new FormData();
        data.append('preview_only', '1');
        data.append('source', 'staff_upload');
        data.append('file', file);
        data.append('filename', file.name);
        const response = await fetch('/api/booking-intake', {
          method: 'POST',
          body: data,
          signal: abort.signal,
        });
        const raw = await response.text();
        let result: Record<string, any> = {};
        try {
          result = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            response.ok
              ? UNREAD_FILE_MESSAGE
              : `Intake preview failed (${response.status}). Retry after the page finishes loading.`,
          );
        }
        if (!response.ok) throw new Error(result.error || UNREAD_FILE_MESSAGE);
        return result;
      };
      try {
        let result = await previewOnce();
        // Same file often works after refresh — auto-retry once while PDF libs warm up.
        if (result.unread && /\.pdf$/i.test(file.name)) {
          await new Promise((r) => setTimeout(r, 500));
          result = await previewOnce();
        }
        if (result.unread) {
          setIntakeText('');
          setIntakePreview(
            buildIntakeMappingPreview('', {
              unread: true,
              unreadMessage: result.unread_message || UNREAD_FILE_MESSAGE,
            }),
          );
        } else {
          const extracted = String(result.text || '');
          setIntakeText(extracted);
          setIntakePreview(
            result.mapping ||
              buildIntakeMappingPreview(extracted, { parties: s?.parties ?? [] }),
          );
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setIntakeStatus('Cancelled.');
        } else {
          // One more attempt after a compile/network blip (matches “works after refresh”).
          try {
            await new Promise((r) => setTimeout(r, 600));
            const result = await previewOnce();
            if (result.unread) throw new Error(result.unread_message || UNREAD_FILE_MESSAGE);
            const extracted = String(result.text || '');
            setIntakeText(extracted);
            setIntakePreview(
              result.mapping ||
                buildIntakeMappingPreview(extracted, { parties: s?.parties ?? [] }),
            );
          } catch (retryErr) {
            if ((retryErr as Error)?.name === 'AbortError') {
              setIntakeStatus('Cancelled.');
            } else {
              setIntakeText('');
              setIntakeStatus(
                retryErr instanceof Error ? retryErr.message : UNREAD_FILE_MESSAGE,
              );
              setIntakePreview(
                buildIntakeMappingPreview('', {
                  unread: true,
                  unreadMessage: UNREAD_FILE_MESSAGE,
                }),
              );
            }
          }
        }
      } finally {
        if (intakeAbortRef.current === abort) intakeAbortRef.current = null;
        setIntakeBusy(false);
      }
      return;
    }
    try {
      const raw = await file.text();
      if (/\.eml$/i.test(file.name) || file.type === 'message/rfc822') {
        const envelope = parseEmlEnvelope(raw);
        const body = extractTextFromEml(raw);
        setIntakeAsEmail(true);
        setIntakeAsWhatsApp(false);
        if (envelope.mailbox) setIntakeMailbox(envelope.mailbox);
        if (envelope.from_address) setIntakeEmailFrom(envelope.from_address);
        if (envelope.subject) setIntakeEmailSubject(envelope.subject);
        setIntakeText(body.trim() || raw);
      } else {
        setIntakeText(raw);
      }
    } catch {
      setIntakeStatus('Could not read that file. Paste the text instead.');
    }
  };
  const stateRevision = useRef('');
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const lastFullRefresh = useRef(0);
  const [historicalPreparation, setHistoricalPreparation] = useState<R | null>(null);
  const [historicalOffset, setHistoricalOffset] = useState(0);
  const loadState = useCallback(async () => {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 401) {
      setS(null);
      setSelected(null);
      setDetail(null);
      setModal(null);
      setQuery('');
      setPage(WORKSPACE_HOME_PAGE);
      setUnauth(true);
      // Keep booking/person deep link in the URL so it opens after login.
      return;
    }
    const data = await r.json().catch(() => {
      throw new Error('Padova could not load. Please retry shortly.');
    });
    if (!r.ok) throw new Error(data.error);
    stateRevision.current = data.revision;
    lastFullRefresh.current = Date.now();
    setS(data);
    setUnauth(false);
  }, []);
  const refresh = useCallback(async () => {
    // A command must get a read started AFTER its commit, even if a poll was running.
    const pending = (refreshInFlight.current ?? Promise.resolve()).catch(() => {}).then(loadState);
    refreshInFlight.current = pending;
    try {
      await pending;
    } finally {
      if (refreshInFlight.current === pending) refreshInFlight.current = null;
    }
  }, [loadState]);
  useEffect(() => {
    setHistoricalOffset(0);
  }, [historicalQuery, historicalStatus]);
  useEffect(() => {
    if (page !== 'Attention' || s?.actor?.role !== 'OWNER') {
      setHistoricalPreparation(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          historical: '1',
          search: historicalQuery,
          status: historicalStatus,
          offset: String(historicalOffset),
        });
        const response = await fetch(`/api/state?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unable to load historical preparations');
        setHistoricalPreparation(await response.json());
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, s?.actor?.id, s?.actor?.role, historicalQuery, historicalStatus, historicalOffset]);
  const initialBusinessMonth = useRef(false);
  const refreshRecoveryOffer = useCallback(() => {
    const actorId = s?.actor?.id;
    if (!actorId) {
      setRecoveryOffer(null);
      return;
    }
    const draft = readBookingRecovery(actorId);
    // Plan Do-now: never auto-popup unfinished booking. Server drafts → Drafts list only.
    if (draft?.values?.draft_id) {
      clearBookingRecovery(actorId);
      setRecoveryOffer(null);
      return;
    }
    // Keep dead-path guard so shouldAutoOpen cannot regress into a popup.
    if (shouldAutoOpenBookingRecovery(actorId, draft)) return;
    setRecoveryOffer(localBookingRecoveryOffer(actorId, draft));
  }, [s?.actor?.id]);
  useEffect(() => {
    refreshRecoveryOffer();
  }, [refreshRecoveryOffer]);
  useEffect(() => {
    if (s?.today && !initialBusinessMonth.current) {
      const businessMonth = s.today.slice(0, 7);
      setMonth(businessMonth);
      setCalendarMonth(businessMonth);
      initialBusinessMonth.current = true;
    }
  }, [s?.today]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    document.title =
      synthetic || s?.developmentData ? 'TEST / SYNTHETIC · Padova' : 'Padova · Travel Operations';
  }, [synthetic, s?.developmentData]);
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (document.visibilityState !== 'visible' || checking || refreshInFlight.current) return;
      checking = true;
      try {
        const response = await fetch('/api/state?revision=1', { cache: 'no-store' });
        if (response.status === 401) {
          await refresh();
          return;
        }
        if (!response.ok) return;
        const { revision } = await response.json();
        // Audited financial changes refresh immediately; periodic full reads also cover
        // administrative changes outside application commands. No balance cache.
        if (revision !== stateRevision.current || Date.now() - lastFullRefresh.current >= 1800000)
          await refresh();
      } catch {
        /* Existing visible data remains until the next check/manual refresh. */
      } finally {
        checking = false;
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 30000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const closeRecord = () => {
    setSelected(null);
    setDetail(null);
    setFocusPaymentId(null);
    setFocusRefundId(null);
    setFocusInvoiceId(null);
    if (typeof window !== 'undefined') {
      const loc = readWorkspaceLocation();
      const page = loc.page || WORKSPACE_HOME_PAGE;
      const next = workspaceUrl(page, window.location.hash);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== next) window.history.replaceState(null, '', next);
    }
  };
  const copyWorkspacePath = async (path: string) => {
    if (!path) return;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setToast('Link copied');
    if (typeof window !== 'undefined') {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== path) window.history.replaceState(null, '', path);
    }
  };
  const focusListRecord = (
    type: 'payment' | 'refund',
    id: string,
    opts?: { replaceUrl?: boolean },
  ) => {
    setSelected(null);
    setDetail(null);
    setQuery('');
    setError('');
    setMobile(false);
    setFilter('All');
    if (type === 'payment') {
      setFocusPaymentId(id);
      setFocusRefundId(null);
      setFocusInvoiceId(null);
      setPage('Payments');
    } else {
      setFocusRefundId(id);
      setFocusPaymentId(null);
      setFocusInvoiceId(null);
      setPage('Refunds');
    }
    if (typeof window !== 'undefined') {
      const next = workspaceRecordUrl(type, id);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== next) {
        if (opts?.replaceUrl) window.history.replaceState(null, '', next);
        else window.history.pushState(null, '', next);
      }
    }
  };
  const openRecord = async (type: string, id: string, opts?: { replaceUrl?: boolean }) => {
    // Plan: payment/refund deep-links focus the list row (no separate detail fetch).
    if (type === 'payment' || type === 'refund') {
      focusListRecord(type, id, opts);
      return;
    }
    setFocusPaymentId(null);
    setFocusRefundId(null);
    const hashPerson =
      typeof window !== 'undefined' ? readWorkspaceRecord() : null;
    const invoiceFocus =
      type === 'person' &&
      hashPerson?.type === 'person' &&
      hashPerson.id === id
        ? readWorkspaceInvoiceId()
        : null;
    setFocusInvoiceId(invoiceFocus);
    setSelected({ type, id });
    setDetail(null);
    setQuery('');
    setError('');
    if (
      typeof window !== 'undefined' &&
      (type === 'booking' || type === 'person' || type === 'asset' || type === 'draft')
    ) {
      const page = workspacePageForRecord(type);
      setPage(page);
      const next =
        type === 'person' && invoiceFocus
          ? workspaceInvoiceUrl(id, invoiceFocus)
          : workspaceRecordUrl(type as 'booking' | 'person' | 'asset' | 'draft', id);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== next) {
        if (opts?.replaceUrl) window.history.replaceState(null, '', next);
        else window.history.pushState(null, '', next);
      }
    }
    try {
      const r = await fetch(`/api/state?type=${type}&id=${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const openRecordFromHash = useCallback(async (opts?: { replaceUrl?: boolean }) => {
    const record = readWorkspaceRecord();
    if (!record) return false;
    if (record.type === 'payment' || record.type === 'refund') {
      focusListRecord(record.type, record.id, opts);
      return true;
    }
    setFocusPaymentId(null);
    setFocusRefundId(null);
    const invoiceFocus =
      record.type === 'person' ? readWorkspaceInvoiceId() : null;
    setFocusInvoiceId(invoiceFocus);
    setPage(workspacePageForRecord(record.type));
    setSelected({ type: record.type, id: record.id });
    setDetail(null);
    setQuery('');
    setError('');
    setMobile(false);
    if (opts?.replaceUrl && typeof window !== 'undefined') {
      const next =
        record.type === 'person' && invoiceFocus
          ? workspaceInvoiceUrl(record.id, invoiceFocus)
          : workspaceRecordUrl(record.type, record.id);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== next) window.history.replaceState(null, '', next);
    }
    try {
      const r = await fetch(`/api/state?type=${record.type}&id=${record.id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
    return true;
  }, []);
  useEffect(() => {
    const applyLocation = async (opts?: { replaceLegacy?: boolean; initial?: boolean }) => {
      const loc = readWorkspaceLocation();
      if (loc.reset) {
        setAuthReset(true);
        setS(null);
        setSelected(null);
        setDetail(null);
        setModal(null);
        setPage(WORKSPACE_HOME_PAGE);
        return;
      }
      const opened = await openRecordFromHash({ replaceUrl: true });
      if (opened) {
        if (opts?.replaceLegacy !== false && !loc.reset) {
          // Record URL already normalized inside openRecordFromHash.
        }
        return;
      }
      if (loc.page) {
        setPage(loc.page);
        if (!opts?.initial) {
          setSelected(null);
          setDetail(null);
          setMobile(false);
        }
      }
      // Migrate / and legacy #page= → /w/<slug>; never rewrite while #reset= is present.
      if (opts?.replaceLegacy !== false && loc.page && !loc.reset) {
        const next = workspaceUrl(loc.page, window.location.hash);
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current !== next) {
          window.history.replaceState(null, '', next);
        }
      }
    };
    void applyLocation({ replaceLegacy: true, initial: true });
    const onPop = () => {
      void applyLocation({ replaceLegacy: false });
    };
    const onHash = () => {
      const loc = readWorkspaceLocation();
      if (loc.reset) {
        void applyLocation({ replaceLegacy: false });
        return;
      }
      if (readWorkspaceRecord()) {
        void openRecordFromHash({ replaceUrl: true });
        return;
      }
      // Legacy bookmark #page=… while already on a path — migrate once.
      if (loc.fromLegacyHash && loc.page) {
        setPage(loc.page);
        setSelected(null);
        setDetail(null);
        setMobile(false);
        window.history.replaceState(null, '', workspaceUrl(loc.page, window.location.hash));
      }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
    };
  }, [openRecordFromHash]);
  useEffect(() => {
    if (!s?.actor?.id) return;
    // After login, open a bookmarked booking/person/asset/payment/refund deep link once.
    const record = readWorkspaceRecord();
    if (!record) return;
    if (record.type === 'payment') {
      if (focusPaymentId !== record.id) void openRecordFromHash({ replaceUrl: true });
      return;
    }
    if (record.type === 'refund') {
      if (focusRefundId !== record.id) void openRecordFromHash({ replaceUrl: true });
      return;
    }
    if (!selected) void openRecordFromHash({ replaceUrl: true });
  }, [s?.actor?.id, selected, focusPaymentId, focusRefundId, openRecordFromHash]);
  useEffect(() => {
    if (page !== 'Payments' || !focusPaymentId || !s?.payments) return;
    const ids = (s.payments as R[]).map((p) => String(p.id));
    setTablePage(listPageForRecordId(ids, focusPaymentId, 12));
  }, [page, focusPaymentId, s?.payments]);
  useEffect(() => {
    if (page !== 'Payments' || !focusPaymentId) return;
    const el = document.getElementById(`payment-row-${focusPaymentId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [page, focusPaymentId, tablePage]);
  useEffect(() => {
    if (page !== 'Refunds' || !focusRefundId || !s?.refunds) return;
    const ids = (s.refunds as R[]).map((r) => String(r.id));
    setTablePage(listPageForRecordId(ids, focusRefundId, 12));
  }, [page, focusRefundId, s?.refunds]);
  useEffect(() => {
    if (page !== 'Refunds' || !focusRefundId) return;
    const el = document.getElementById(`refund-row-${focusRefundId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [page, focusRefundId, tablePage]);
  useEffect(() => {
    if (!focusInvoiceId || !detail?.invoiceDrafts) return;
    const el = document.getElementById(`invoice-row-${focusInvoiceId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusInvoiceId, detail?.invoiceDrafts, selected?.id]);
  const go = (name: string) => {
    setDirectoryQuery('');
    setDirectoryPage(1);
    setDirectoryType('All');
    setPage(name);
    setSelected(null);
    setDetail(null);
    setFocusPaymentId(null);
    setFocusRefundId(null);
    setFocusInvoiceId(null);
    setFilter(name === 'Refunds' ? 'Outstanding' : 'All');
    setQuery('');
    setMobile(false);
    setError('');
    if (name === 'Bookings') {
      setDraftPage(1);
      setBookingPage(1);
    }
    setTablePage(1);
    if (typeof window !== 'undefined') {
      const next = workspaceUrl(name, window.location.hash);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      // Same section: keep history clean (no duplicate entries).
      if (current !== next) {
        const samePath = window.location.pathname === workspaceUrl(name).split('#')[0];
        if (samePath) window.history.replaceState(null, '', next);
        else window.history.pushState(null, '', next);
      }
    }
  };
  const action = (kind: string, defaults: R = {}) => {
    if (s && !hasPermission(s.actor, commandPermission(kind))) {
      setError('This action requires an Owner-granted permission.');
      return;
    }
    if (kind === 'revise' || kind === 'booking_change') {
      if (kind === 'revise') {
        const trips = (s?.travelComponents ?? []).filter(
          (t: R) => t.booking_id === defaults.booking_id && t.status !== 'Cancelled',
        );
        if (trips.length === 1)
          defaults = {
            ...defaults,
            provider_id: trips[0].provider_id,
            itinerary: {
              ...trips[0].details,
              ...defaults.itinerary,
              ...(trips[0].product === 'Flight' && trips[0].provider_id
                ? { airline_id: trips[0].provider_id }
                : {}),
            },
          };
      }
      const sources = [
        ...new Set(
          (s?.fundingComponents ?? [])
            .filter((f: R) => f.booking_id === defaults.booking_id && !f.reversed && f.seller_id)
            .map((f: R) => f.seller_id),
        ),
      ];
      defaults = {
        ...defaults,
        change_seller_id: sources.length === 1 ? sources[0] : defaults.supplier_id,
      };
    }
    if (['receive_refund', 'pay_refund'].includes(kind)) {
      const r = s?.refunds.find((r: R) => r.id === defaults.refund_id);
      if (r) {
        const f = s?.fundingComponents.find((f: R) => f.id === r.funding_component_id);
        const remainingSupplier = Number(r.supplier_expected) - Number(r.received);
        const amountCents =
          defaults.amount != null && defaults.amount !== ''
            ? Number(defaults.amount)
            : kind === 'pay_refund'
              ? Number(r.customer_due) - Number(r.paid) - Number(r.handed_over ?? 0)
              : remainingSupplier;
        defaults = {
          ...defaults,
          amount: (
            amountCents /
            (kind === 'receive_refund' && ['points', 'count'].includes(r.unit) ? 1 : 100)
          ).toFixed(2),
          ...(kind === 'receive_refund'
            ? {
                form:
                  defaults.form ||
                  (r.unit === 'points'
                    ? 'points'
                    : r.unit === 'count'
                      ? 'Certificate'
                      : f?.asset_id
                        ? 'Voucher'
                        : 'cash'),
                ...(defaults.form === SUPPLIER_REFUND_DENIED_FORM
                  ? {}
                  : {
                      asset_id: f?.asset_id,
                      account_id: f?.account_id,
                      ...(f?.account_id
                        ? {
                            method:
                              s?.paymentAccounts.find((a: R) => a.id === f.account_id)?.kind ===
                              'Card'
                                ? 'Card'
                                : 'ACH',
                          }
                        : {}),
                    }),
              }
            : {}),
        };
      }
    }
    if (kind === 'cancel' && defaults.booking_id) {
      const b = s?.bookings.find((b: R) => b.id === defaults.booking_id);
      const funding = (s?.fundingComponents ?? []).filter(
        (f: R) => f.booking_id === defaults.booking_id && !f.reversed,
      );
      if (b) {
        const f = funding.length === 1 ? funding[0] : null;
        const unit = f ? refundQuantityUnit(f) : 'money';
        const recoverable = f ? (f.asset_id ? f.face_amount : f.cost) : null;
        const supplierExpected =
          recoverable == null
            ? null
            : Number(recoverable);
        const money = cancelFormMoneyDefaults(b, {
          quantity_unit: unit,
          supplier_expected_cents: unit === 'money' ? supplierExpected : null,
          original_cost_cents: unit === 'money' ? supplierExpected : null,
        });
        defaults = {
          ...defaults,
          refund_card_fee: false,
          charge_reduction: money.charge_reduction,
          customer_due: money.customer_due,
          ...(f
            ? {
                funding_component_id: f.id,
                supplier_expected:
                  recoverable == null
                    ? ''
                    : unit === 'money'
                      ? (Number(recoverable) / 100).toFixed(2)
                      : String(Number(recoverable)),
              }
            : {}),
        };
      }
    }
    if (kind === 'booking' && s?.actor?.id) {
      clearBookingRecoverySnooze(s.actor.id);
      // Explicit New Booking starts blank — do not reuse prior paste/form recovery.
      // Continue Draft / intake apply still pass draft_id or intake fields in defaults.
      const continuing =
        Boolean(defaults.draft_id) ||
        Boolean(defaults.intake_apply_on_open) ||
        Boolean(defaults.intake_raw_text) ||
        Boolean(defaults.recovery_paste) ||
        defaults.resume_recovery === true;
      if (!continuing) {
        clearBookingRecovery(s.actor.id);
        setModal({ kind, defaults, key: crypto.randomUUID() });
        return;
      }
    }
    setModal({
      kind,
      defaults,
      key: crypto.randomUUID(),
      ...(kind === 'note' && defaults.call_note
        ? {
            title: 'Refund call note',
            description: 'Plan: chase notes stay on the refund follow-up until it is settled.',
          }
        : {}),
    });
  };
  const command = async (kind: string, data: R, key = crypto.randomUUID()) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, kind, data }),
    });
    const result = await r.json().catch(() => {
      throw new Error(
        'The save could not be confirmed. Your form has not been cleared. Retry to check the saved result.',
      );
    });
    if (r.status === 401) await refresh();
    if (!r.ok) throw new Error(result.error);
    return result.result;
  };
  const perform = async (kind: string, data: R) => {
    setBusy(true);
    try {
      await command(kind, data);
      await refresh();
      setToast('Saved with audit history.');
      if (selected) await openRecord(selected.type, selected.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (unauth || authReset)
    return (
      <AuthScreen
        synthetic={synthetic}
        onLogin={async () => {
          await refresh();
          setAuthReset(false);
        }}
      />
    );
  if (!s)
    return (
      <div className="loading">
        <p>{error || 'Opening your Padova workspace…'}</p>
        {error && (
          <>
            <p>Retrying does not clear a saved unfinished booking.</p>
            <button
              className="btn primary"
              onClick={() => {
                setError('');
                void refresh().catch((e) => setError(e.message));
              }}
            >
              Retry loading Padova
            </button>
          </>
        )}
      </div>
    );
  const can = (p: Permission) => hasPermission(s.actor, p);
  const finance = can('view_accounting'),
    canPay = can('edit_payments'),
    canSale = can('view_sale_price'),
    canCosts = can('view_supplier_cost'),
    canBookingProfit = can('view_booking_profit'),
    canTotalProfit = can('view_total_profit'),
    canAssetBasis = can('view_asset_basis'),
    canAssets = can('manage_assets') || canAssetBasis,
    canCommissions = can('view_commissions') || can('manage_commissions'),
    canRefunds = can('view_refunds') || can('issue_refunds');
  const canAction = (kind: string) => can(commandPermission(kind));
  // Defensive: incomplete AI/intake rows must never crash Transactions / sidebar.
  const bks: R[] = Array.isArray(s.bookings) ? s.bookings : [];
  const parties: R[] = Array.isArray(s.parties) ? s.parties : [];
  const journalRows: R[] = Array.isArray(s.journal) ? s.journal : [];
  const refundRowsAll: R[] = Array.isArray(s.refunds) ? s.refunds : [];
  const movementRows: R[] = Array.isArray(s.movements) ? s.movements : [];
  const assetRows: R[] = Array.isArray(s.assets) ? s.assets : [];
  const paymentRows: R[] = Array.isArray(s.payments) ? s.payments : [];
  const commissionRows: R[] = Array.isArray(s.commissions) ? s.commissions : [];
  const taskRows: R[] = Array.isArray(s.tasks) ? s.tasks : [];
  const planTodosAll = buildPlanTodoList({
    tasks: taskRows,
    attention: Array.isArray(s.attention) ? s.attention : [],
    followups: (s.operationalViews?.['Needs Attention'] as R[]) ?? [],
    operationalViews: (s.operationalViews ?? {}) as Record<string, R[]>,
    limit: 100,
  });
  const today = String(s.today || new Date().toISOString().slice(0, 10));
  const person = (id: string) => parties.find((p) => p.id === id)?.name ?? '—';
  const currentMonth = today.slice(0, 7);
  const owed = bks.reduce((a, b) => a + Math.max(0, Number(b.customer_balance)), 0);
  const owing =
    journalRows
      .filter((r: R) =>
        ['supplier_payable', 'asset_acquisition_payable', 'referral_payable'].includes(r.account),
      )
      .reduce((a: number, r: R) => a + Number(r.credit) - Number(r.debit), 0) +
    refundRowsAll.reduce(
      (a: number, r: R) => a + Math.max(0, Number(r.customer_due) - Number(r.paid)),
      0,
    );
  const monthProfit = movementRows
    .filter((m: R) => String(m.effective_on || '').slice(0, 7) === currentMonth)
    .reduce((a: number, m: R) => a + Number(m.amount), 0);
  const monthSale = bks
    .filter((b) => String(b.booked_on || '').slice(0, 7) === currentMonth)
    .reduce((a, b) => a + Number(b.sale), 0);
  const travelMatches = (b: R, start: string, end = start, product = 'All') =>
    travelsBetween(
      b as Parameters<typeof travelsBetween>[0],
      s.travelComponents ?? [],
      start,
      end,
      product,
    );
  const todayTravelAll = bks.filter(
    (b) => b.reservation_status !== 'Traveled' && travelMatches(b, today),
  );
  const upcomingAll = upcomingBookings(
    bks as (R & Parameters<typeof travelsBetween>[0])[],
    s.travelComponents ?? [],
    today,
    new Date(new Date(today).getTime() + horizon * 86400000).toISOString().slice(0, 10),
  );
  const todayTravel = todayTravelAll.filter((b) =>
    bookingMatchesSearch(b, s, dashboardTravelQuery),
  );
  const upcoming = upcomingAll.filter((b) => bookingMatchesSearch(b, s, dashboardTravelQuery));
  const matches = (r: R) =>
    Object.values(r)
      .filter((v) => typeof v === 'string')
      .concat(r.details?.search_aliases ?? r.details?.aliases ?? [])
      .concat(
        r.itinerary
          ? [
              r.itinerary.origin,
              r.itinerary.destination,
              r.itinerary.hotel_name,
              ...bookingSearchTerms(r, s),
              ...(r.itinerary.flight_numbers ?? []),
              ...(r.itinerary.ticket_numbers ?? []),
              person(r.itinerary.acquisition_source_id),
              person(r.itinerary.airline_id),
              ...(s.fundingComponents ?? [])
                .filter((f: R) => f.booking_id === r.id)
                .flatMap((f: R) => [f.reference ?? '', person(f.seller_id)]),
              ...(s.travelComponents ?? [])
                .filter((t: R) => t.booking_id === r.id)
                .flatMap((t: R) => [
                  t.summary,
                  t.channel,
                  person(t.provider_id),
                  person(t.acquisition_source_id),
                  t.details?.route,
                  t.details?.origin,
                  t.details?.destination,
                  t.details?.hotel,
                  t.details?.hotel_name,
                  ...(t.details?.confirmations ?? []),
                  ...(t.details?.ticket_numbers ?? []),
                ]),
            ].filter(Boolean)
          : [],
      )
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase());
  const openDraftFromSearch = async (draft: R) => {
    setQuery('');
    setError('');
    try {
      if (draft.kind === 'voucher_sale' || draft.kind === 'historical_booking') {
        await openRecord('draft', draft.id);
        return;
      }
      const response = await fetch(
        `/api/state?type=draft&id=${encodeURIComponent(draft.id)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to open this draft');
      const loaded = await response.json();
      if (
        draftKind({
          summary: loaded.entry?.summary,
          historical_status: loaded.entry?.itinerary?.historical_reconciliation_status,
        }) !== 'booking'
      ) {
        setSelected({ type: 'draft', id: loaded.id });
        setDetail(loaded);
      } else
        action('booking', {
          ...loaded.entry,
          draft_id: loaded.id,
          intake_apply_on_open: true,
        });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const draftMatches = (d: R) =>
    [
      d.display_title,
      d.title,
      d.summary,
      d.intake_source,
      d.intake_from,
      d.intake_subject,
      d.intake_mailbox,
      d.intake_customer,
      d.intake_product,
      d.intake_route,
      d.intake_pnr,
      d.kind,
    ]
      .filter((v) => typeof v === 'string' && v)
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase());
  const tripView = (b: R) => {
    const travels = (s.travelComponents ?? []).filter((t: R) => t.booking_id === b.id);
    return travels.length === 1
      ? { ...b, details: travels[0].details, provider: person(travels[0].provider_id) }
      : b;
  };
  const searchHits = query.trim()
    ? [
        ...(s.bookingDrafts ?? []).filter(draftMatches).map((d: R) => ({
          id: d.id,
          label: `Draft · ${d.display_title || d.title || d.summary || 'Untitled'}`,
          sub: [
            d.kind === 'voucher_sale'
              ? 'Voucher sale'
              : d.kind === 'historical_booking'
                ? 'Historical'
                : intakeChannelBadge(d.intake_source),
            d.intake_from || d.intake_mailbox || d.intake_customer || '',
          ]
            .filter(Boolean)
            .join(' · '),
          open: () => {
            void openDraftFromSearch(d);
          },
        })),
        ...bks.filter(matches).map((b) => ({
          type: 'booking',
          id: b.id,
          label: `${b.code} · ${bookingShortName(tripView(b))}`,
          sub: `${b.customer} · ${b.confirmations}`,
        })),
        ...parties.filter(matches).map((p) => ({
          type: 'person',
          id: p.id,
          label: p.name,
          sub: `${pretty(p.kind)} · ${p.email ?? p.phone ?? ''}`,
        })),
        ...assetRows.filter(matches).map((a: R) => ({
          page: 'Travel Assets',
          label: a.name,
          sub: `${a.kind} · ${a.reference}`,
        })),
        ...paymentRows.filter(matches).map((p: R) => ({
          page: 'Payments',
          label: `${p.party} · ${money(p.current_amount)}`,
          sub: p.reference,
        })),
        ...commissionRows.filter(matches).map((c: R) => ({
          type: 'booking',
          id: c.booking_id,
          label: `Commission · ${c.code}`,
          sub: c.collector ?? c.payer,
        })),
      ].slice(0, 14)
    : [];
  const transactions = transactionList(
    bks as (R & { id: string })[],
    (s.sales ?? []) as (R & { id: string })[],
  );
  const transactionTable = (items: typeof transactions) =>
    items.length ? (
      <div className="table-wrap booking-table transaction-table">
        <table>
          <thead>
            <tr>
              <th>Booked / sold</th>
              <th>Transaction</th>
              <th>Customer / traveler</th>
              <th>Source</th>
              <th>Status</th>
              <th>Payment / follow-up</th>
              {canSale && <th className="money">Price</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(({ kind, record: r, date }) => (
              <tr
                key={kind + ':' + r.id}
                className={`clickable${
                  kind === 'booking' &&
                  bookingListIsCancelled(r as { reservation_status?: string | null })
                    ? ' is-cancelled'
                    : ''
                }`}
                onClick={() =>
                  openRecord(
                    kind === 'booking' ? 'booking' : 'asset',
                    kind === 'booking' ? r.id : r.asset_id,
                  )
                }
              >
                <td className="transaction-date-cell">
                  {date ? dateLabel(date) : 'Unknown date'}
                </td>
                <td>
                  <span
                    className="transaction-description"
                    title={kind === 'booking' ? tripTitle(tripView(r)) : r.asset}
                  >
                    <strong>{kind === 'booking' ? tripTitle(tripView(r)) : r.asset}</strong>
                    <small className="transaction-meta">
                      {kind === 'booking'
                        ? [r.product, r.code, r.confirmations].filter(Boolean).join(' · ')
                        : 'Voucher / asset sale'}
                    </small>
                  </span>
                </td>
                <td>
                  <span
                    className="transaction-person"
                    title={[kind === 'booking' ? r.customer : r.buyer, r.travelers]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    <strong>{kind === 'booking' ? r.customer : r.buyer}</strong>
                    {kind === 'booking' && r.travelers ? (
                      <small className="transaction-meta">{r.travelers}</small>
                    ) : null}
                  </span>
                </td>
                <td>
                  <span className="transaction-indicators">
                    {(() => {
                      const src =
                        kind === 'booking'
                          ? r.intake_source ||
                            r.itinerary?.intake_source ||
                            r.itinerary?.operational_entry?.intake_source ||
                            null
                          : 'manual';
                      const tag = intakeSourceTableTag(src);
                      const aiMade =
                        kind === 'booking' &&
                        (r.ai_created ||
                          r.itinerary?.ai_created ||
                          r.itinerary?.created_by === 'ai');
                      return (
                        <>
                          <Badge tone={tag.tone} title="How this booking entered Padova">
                            {tag.label}
                          </Badge>
                          {aiMade ? (
                            <Badge
                              tone="amber"
                              title="AI-assisted intake. Verify money and parties before treating as staff-entered books."
                            >
                              AI
                            </Badge>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                </td>
                <td>
                  <Badge>
                    {kind === 'booking' ? reservationStatusLabel(r.reservation_status) : 'Sale'}
                  </Badge>
                </td>
                <td className="transaction-followup-cell">
                  <span className="transaction-indicators">
                    {(() => {
                      const flags = transactionIndicators(kind, r, s.operationalViews ?? {}, {
                        sale: canSale,
                        cost: canCosts,
                      });
                      const shown = flags.slice(0, 3);
                      const extra = flags.length - shown.length;
                      return (
                        <>
                          {shown.map((flag) => (
                            <Badge key={flag.label} tone={flag.tone}>
                              {flag.label}
                            </Badge>
                          ))}
                          {extra > 0 ? (
                            <Badge
                              tone="gray"
                              title={flags
                                .slice(3)
                                .map((f) => f.label)
                                .join(', ')}
                            >
                              +{extra}
                            </Badge>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                </td>
                {canSale && (
                  <td className="money">{money(kind === 'booking' ? r.sale : r.proceeds)}</td>
                )}
                <td className="transaction-open-cell">
                  <button
                    type="button"
                    className="transaction-open-icon"
                    aria-label={'Open ' + (kind === 'booking' ? r.code : r.asset)}
                    title="Open"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRecord(
                        kind === 'booking' ? 'booking' : 'asset',
                        kind === 'booking' ? r.id : r.asset_id,
                      );
                    }}
                  >
                    <MoreVertical size={16} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty>No transactions match these filters.</Empty>
    );
  const bookingTable = (items: R[]) =>
    items.length ? (
      <div className="table-wrap booking-table">
        <table>
          <thead>
            <tr>
              <th>Date booked</th>
              <th>Trip / booking</th>
              <th>Customer / traveler</th>
              <th>Travel date</th>
              <th>PNR</th>
              <th>How booked</th>
              <th>Status</th>
              {canSale && (
                <>
                  <th className="money">Price / balance</th>
                </>
              )}
              {canCosts && <th className="money">Cost</th>}
              {canBookingProfit && <th className="money">Confirmed / expected</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((b) => {
              const expanded = expandedBookingId === b.id;
              const colCount = bookingListColumnCount({
                canSale,
                canCosts,
                canBookingProfit,
              });
              return (
                <Fragment key={b.id}>
                  <tr
                    className={`clickable${bookingListIsCancelled(b) ? ' is-cancelled' : ''}${expanded ? ' is-expanded' : ''}`}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedBookingId((cur) => toggleExpandedBookingId(cur, b.id))
                    }
                  >
                    <td className="booking-booked-on">
                      <small className="mobile-cell-label">Date booked</small>
                      {bookingListBookedOn(b) ? (
                        dateLabel(bookingListBookedOn(b))
                      ) : (
                        <span className="muted">Unknown</span>
                      )}
                    </td>
                    <td>
                      <strong className="booking-trip">
                        <Icon name={b.product} />{' '}
                        <span title={b.summary}>{tripTitle(tripView(b))}</span>
                      </strong>
                      <small className="booking-code">
                        {tripView(b).provider && tripView(b).provider !== '—'
                          ? `${tripView(b).provider} · `
                          : b.supplier
                            ? `${b.supplier} · `
                            : ''}
                        {b.code || '—'}
                      </small>
                    </td>
                    <td>
                      <strong>{b.customer}</strong>
                      <small>{b.travelers || <Badge tone="amber">Traveler missing</Badge>}</small>
                    </td>
                    <td>
                      {(() => {
                        const primary = (s?.travelComponents ?? []).find(
                          (t: R) => t.booking_id === b.id && t.status !== 'Cancelled',
                        );
                        const span = travelDatesDisplay(b, primary);
                        return (
                          <>
                            {span.label}
                            {span.missing ? (
                              <>
                                {' '}
                                <Badge tone="amber">{span.missing}</Badge>
                              </>
                            ) : null}
                            <small>{b.itinerary?.trip_type || b.product}</small>
                          </>
                        );
                      })()}
                    </td>
                    <td className="booking-pnr">
                      <small className="mobile-cell-label">PNR</small>
                      {(() => {
                        const pnr = bookingListPnr(b);
                        return pnr ? (
                          <span className="booking-pnr-value">{pnr}</span>
                        ) : (
                          <span className="muted">Unknown</span>
                        );
                      })()}
                    </td>
                    <td>
                      <small className="mobile-cell-label">How booked</small>
                      {bookingListHowBooked(b) || (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          b.reservation_status === 'Refund Pending'
                            ? 'amber'
                            : b.reservation_status === 'Cancelled'
                              ? 'red'
                              : ''
                        }
                      >
                        {reservationStatusLabel(b.reservation_status)}
                      </Badge>
                    </td>
                    {canSale && (
                      <>
                        {' '}
                        <td className="money">
                          <strong>{money(b.sale)}</strong>
                          <small>
                            Balance:{' '}
                            {b.customer_balance == null ? (
                              money(b.customer_balance)
                            ) : Number(b.customer_balance) > 0 ? (
                              <span style={{ color: '#ae8553' }}>{money(b.customer_balance)}</span>
                            ) : (
                              <span className="text-green">{money(b.customer_balance)}</span>
                            )}
                          </small>
                        </td>
                      </>
                    )}
                    {canCosts && (
                      <td className="money">
                        <small className="mobile-cell-label">Cost</small>
                        {supplierCostIncomplete(b) ? (
                          <span className="text-amber">Incomplete</span>
                        ) : (
                          money(b.funding_cost)
                        )}
                      </td>
                    )}
                    {canBookingProfit &&
                      (() => {
                        const pair = bookingProfitPair({
                          profit: b.profit == null ? null : Number(b.profit),
                          current_profit:
                            b.current_profit == null ? null : Number(b.current_profit),
                          expected_commission:
                            b.expected_commission == null ? null : Number(b.expected_commission),
                          received_commission:
                            b.received_commission == null ? null : Number(b.received_commission),
                          cost_incomplete: b.cost_incomplete,
                          itinerary: b.itinerary,
                        });
                        const labels = bookingProfitListLabels(
                          pair,
                          incompleteProfitReason(b) ?? 'Incomplete',
                          money,
                        );
                        return (
                          <td className={`money ${pair.incomplete ? 'text-amber' : 'text-green'}`}>
                            <small className="mobile-cell-label">Confirmed / expected</small>
                            <strong>{labels.confirmed}</strong>
                            <small>Exp {labels.expected}</small>
                          </td>
                        );
                      })()}
                    <td>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  </tr>
                  {expanded ? (
                    <tr className="booking-expand-row">
                      <td colSpan={colCount}>
                        <div className="booking-expand-panel">
                          {(() => {
                            const primary = (s?.travelComponents ?? []).find(
                              (t: R) => t.booking_id === b.id && t.status !== 'Cancelled',
                            );
                            const travel = travelDatesDisplay(b, primary);
                            const booked = bookingListBookedOn(b);
                            const facts = bookingListExpandFacts({
                              code: b.code || 'Booking',
                              customer: b.customer || null,
                              travelers: b.travelers || null,
                              travelLabel: travel.label || null,
                              bookedOnLabel: booked ? dateLabel(booked) : null,
                              howBooked: bookingListHowBooked(b),
                              pnr: bookingListPnr(b),
                              statusLabel: reservationStatusLabel(b.reservation_status),
                              priceLabel: canSale ? money(b.sale) : null,
                              balanceLabel: canSale ? money(b.customer_balance) : null,
                              costLabel: canCosts
                                ? supplierCostIncomplete(b)
                                  ? 'Incomplete'
                                  : money(b.funding_cost)
                                : null,
                            });
                            return (
                              <dl className="booking-expand-facts">
                                {facts.map((f) => (
                                  <div key={f.label} className="booking-expand-fact">
                                    <dt>{f.label}</dt>
                                    <dd>{f.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            );
                          })()}
                          <div className="booking-expand-actions">
                            <button
                              type="button"
                              className="btn primary small"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRecord('booking', b.id);
                              }}
                            >
                              Open booking
                            </button>
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const path = workspaceRecordUrl('booking', b.id);
                                await navigator.clipboard.writeText(
                                  `${window.location.origin}${path}`,
                                );
                                setToast('Booking link copied');
                                if (typeof window !== 'undefined') {
                                  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                                  if (current !== path)
                                    window.history.replaceState(null, '', path);
                                }
                              }}
                            >
                              Copy link
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty>No bookings match this view.</Empty>
    );
  const attentionRows = (items: R[], limit = 100) =>
    items.slice(0, limit).map((a) => {
      const sharePath = planTodoRecordUrl({
        booking_id: a.booking_id,
        record_type: a.record_type,
        record_id: a.record_id,
      });
      return (
        <div className="attention-row" key={a.key}>
          <span className="alert-icon">
            <AlertCircle size={15} />
          </span>
          <div className="attention-text">
            <button
              style={{ textAlign: 'left', padding: 0 }}
              onClick={() =>
                a.booking_id
                  ? openRecord('booking', a.booking_id)
                  : a.record_type && a.record_id
                    ? openRecord(a.record_type, a.record_id)
                    : go(
                        a.kind === 'Payment allocation'
                          ? 'Payments'
                          : 'Credits & points',
                      )
              }
            >
              <strong>{a.title}</strong>
              <small>{a.detail}</small>
            </button>
          </div>
          {a.amount !== undefined && <span className="row-amount">{money(a.amount)}</span>}
          {sharePath ? (
            <button
              type="button"
              className="btn small ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
                setToast('Link copied');
                if (typeof window !== 'undefined') {
                  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                  if (current !== sharePath)
                    window.history.replaceState(null, '', sharePath);
                }
              }}
            >
              Copy link
            </button>
          ) : null}
          <button
            className="icon-button"
            title="Acknowledge with a note; outstanding balances remain open"
            onClick={() => action('resolve_attention', { key: a.key, fingerprint: a.fingerprint })}
          >
            <Check size={14} />
          </button>
        </div>
      );
    });
  const heading = (title: string, sub: string, button?: React.ReactNode) => (
    <div className="page-heading">
      <div>
        <div className="eyebrow">PADOVA WORKSPACE</div>
        <h1>{title}</h1>
        <p className="subtitle">{sub}</p>
      </div>
      <div className="heading-actions">{button}</div>
    </div>
  );
  const newButton = (label: string, kind: string, defaults: R = {}) =>
    canAction(kind) ? (
      <button className="btn primary" onClick={() => action(kind, defaults)}>
        <Plus size={15} />
        {label}
      </button>
    ) : null;
  let view: React.ReactNode;
  if (selected) {
    if (!detail)
      view = (
        <>
          <button
            className="back"
            onClick={() => {
              setSelected(null);
              setError('');
            }}
          >
            <ChevronLeft size={14} />
            Back to {page}
          </button>
          <Empty>{error || 'Loading record…'}</Empty>
        </>
      );
    else if (selected.type === 'draft') {
      const held = historicalRecordPresentation(detail.entry ?? {}, detail.review);
      const heldSale =
        draftKind({
          summary: detail.entry?.summary,
          historical_status: detail.entry?.itinerary?.historical_reconciliation_status,
        }) === 'voucher_sale';
      view = (
        <>
          <button className="back" onClick={closeRecord}>
            <ChevronLeft size={14} />
            Back to Bookings
          </button>
          {heading(
            heldSale ? 'Voucher sale' : held.route ? `Flight · ${held.route}` : 'Booking details',
            [person(detail.entry?.customer_id), (detail.entry?.confirmations ?? []).join(' · ')]
              .filter(Boolean)
              .join(' · '),
            <Badge tone="amber">Needs review</Badge>,
          )}
          <div className="detail-actions">
            <button
              className="btn"
              onClick={async () => {
                const path = workspaceRecordUrl('draft', detail.id);
                await navigator.clipboard.writeText(`${window.location.origin}${path}`);
                setToast('Draft link copied');
              }}
            >
              <Copy size={13} />
              Copy link
            </button>
          </div>
          <Card title={heldSale ? 'Sale details' : 'Trip details'}>
            <dl className="historical-facts section-body">
              <div>
                <dt>Billed to</dt>
                <dd>{person(detail.entry?.customer_id)}</dd>
              </div>
              {!heldSale && (
                <>
                  <div>
                    <dt>Travelers</dt>
                    <dd>
                      {held.travelers ||
                        (detail.entry?.traveler_ids ?? []).map(person).join(', ') ||
                        'Not yet identified'}
                    </dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>{held.route || 'Not yet identified'}</dd>
                  </div>
                  <div>
                    <dt>Flights</dt>
                    <dd>{held.flights || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Recorded travel dates</dt>
                    <dd>{held.travelDates || 'Not confirmed'}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{heldSale ? 'Voucher reference' : 'Confirmations / PNRs'}</dt>
                <dd>{(detail.entry?.confirmations ?? []).join(' · ') || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>{heldSale ? 'Sold on' : 'Booked on'}</dt>
                <dd>
                  {held.bookedOn
                    ? `${dateLabel(held.bookedOn)}${held.dateCertainty === 'Approximate' ? ' · Approximate' : ''}`
                    : 'Not confirmed'}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Price & payment">
            <dl className="historical-facts section-body">
              <div>
                <dt>Recorded customer price</dt>
                <dd>{held.sale == null ? held.recordedSale || 'Unknown' : money(held.sale)}</dd>
              </div>
              <div>
                <dt>{held.cost == null ? 'Recorded cost · unverified' : 'Confirmed cost'}</dt>
                <dd>{held.cost == null ? held.recordedCost || 'Unknown' : money(held.cost)}</dd>
              </div>
              <div>
                <dt>Customer payment</dt>
                <dd>
                  <Badge tone="amber">{held.paymentStatus}</Badge>
                </dd>
              </div>
              <div>
                <dt>Seller payment</dt>
                <dd>
                  <Badge tone="amber">{held.paymentStatus}</Badge>
                </dd>
              </div>
            </dl>
            <p className="section-body muted">
              Historical amounts are awaiting reconciliation and are not included in posted
              balances.
            </p>
          </Card>
          {s.actor.role === 'OWNER' && detail.review && (
            <HistoricalRecordEditor
              key={detail.id + detail.review.fingerprint}
              record={detail}
              save={async (data, key) => {
                await command('review_resolution', data, key);
                await openRecord('draft', detail.id);
                setToast('Record updated.');
              }}
            />
          )}
          {s.actor.role === 'OWNER' && (
            <details className="card section-body">
              <summary>Original records</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{detail.entry?.itinerary?.notes}</p>
              <HistoricalDraftDetails sources={detail.entry?.itinerary?.historical_sources ?? []} />
              <HistoricalSourceDetails
                sources={detail.entry?.itinerary?.historical_sources ?? []}
              />
            </details>
          )}
        </>
      );
    } else if (selected.type === 'historical') {
      const m = detail.mapping;
      view = (
        <>
          <button className="back" onClick={closeRecord}>
            <ChevronLeft size={14} />
            Back to {page}
          </button>
          {heading(
            'Historical booking preparation',
            `${m.source.workbook_title} · ${m.source.tab} · row ${m.source.row}`,
            <Badge tone="amber">{m.status}</Badge>,
          )}
          <Card title={m.facts.customer?.name ?? 'Identity needs review'}>
            <div className="section-body">
              <p>
                {m.facts.route_or_property ?? 'Route / property not confirmed'} ·{' '}
                {(m.facts.confirmations ?? []).join(' · ')}
              </p>
              <p>{m.rationale}</p>
              <p>
                Travel date: {m.facts.travel_on ?? 'Unknown, original text preserved'} · Cost:{' '}
                {m.facts.source_cost_cents === null
                  ? 'Unknown'
                  : `${money(m.facts.source_cost_cents)} (unverified source claim)`}
              </p>
              <p>
                Customer sale:{' '}
                {m.facts.customer_sale_cents === null
                  ? 'Unknown'
                  : `${money(m.facts.customer_sale_cents)} (staged)`}
              </p>
              <p>
                Prepared operational record. No live charge, payment, balance, inventory or profit
                has been posted.
              </p>
            </div>
          </Card>
          <HistoricalSourceDetails sources={detail.sources} />
        </>
      );
    } else if (selected.type === 'booking') {
      if (!detail?.booking) {
        view = (
          <>
            <button className="back" onClick={closeRecord}>
              <ChevronLeft size={14} />
              Back
            </button>
            <Empty>Booking details unavailable. Reload, or go back to Bookings.</Empty>
          </>
        );
      } else {
      const primaryTravel = detail.travelComponents?.[0];
      const b = detail.booking,
        c = bks.find((x) => x.id === b.id) ?? b;
      const recordedHistoricalCost = historicalRecordPresentation(b).recordedCost;
      const overview = [
        ['Product', b.product],
        ...(b.referring_organization_name || b.referring_organization_id
          ? [
              [
                'Referring organization',
                b.referring_organization_name || b.referring_organization_id,
              ],
            ]
          : []),
        ...(b.itinerary?.operational_entry
          ? [
              ['Booked Through', b.channel],
              ...(b.itinerary.operational_entry.how_booked
                ? [['How booked', b.itinerary.operational_entry.how_booked]]
                : []),
              ...(b.itinerary.operational_entry.how_booked === 'Hotel with commission' &&
              b.itinerary.operational_entry.hotel_paid_by
                ? [['Hotel paid by', b.itinerary.operational_entry.hotel_paid_by]]
                : []),
              ...(b.itinerary.operational_entry.how_booked === 'Cash / GDS' &&
              b.itinerary.operational_entry.gds_commissionable
                ? [
                    [
                      'GDS commissionable',
                      b.itinerary.operational_entry.gds_commissionable,
                    ],
                  ]
                : []),
              ...(b.itinerary.operational_entry.how_booked === 'Outside seller'
                ? [
                    [
                      'Outside seller',
                      'Agreed cost only · seller rebate/points info only (not Padova income)',
                    ],
                  ]
                : []),
              ...(b.itinerary.operational_entry.how_booked === 'Hotel at program rate (FHR)'
                ? [
                    [
                      'Program rate',
                      String(b.itinerary.operational_entry.program_rate_name || '').trim() ||
                        'Not specified',
                    ],
                    [
                      'Program perks',
                      String(b.itinerary.operational_entry.program_perks || '').trim() ||
                        'Not specified',
                    ],
                    [
                      'Amex / points gained',
                      `${fhrProgramBenefitLabel(
                        b.itinerary.operational_entry.program_benefit_gained,
                      )} · info only (not income)`,
                    ],
                  ]
                : []),
              ...(priceBreakdownNoteVisible(b.itinerary.operational_entry.price_breakdown_note)
                ? [
                    [
                      'Price breakdown note',
                      `${priceBreakdownNote(b.itinerary.operational_entry.price_breakdown_note)} · optional (one total sale)`,
                    ],
                  ]
                : []),
              ...(s.bookingSourceMethods?.find(
                (m: R) => m.id === b.itinerary.operational_entry.source_method_id,
              )?.award
                ? [
                    [
                      'Loyalty Program',
                      s.programs.find(
                        (p: R) => p.id === b.itinerary.operational_entry.award_program_id,
                      )?.name || 'Unknown',
                    ],
                  ]
                : []),
              [
                b.product === 'Flight'
                  ? 'Airline'
                  : b.product === 'Hotel'
                    ? 'Property / Hotel'
                    : b.product === 'Car'
                      ? 'Rental company'
                      : 'Travel provider',
                person(primaryTravel?.provider_id),
              ],
              [
                b.product === 'Flight'
                  ? 'Airline PNR'
                  : b.product === 'Hotel'
                    ? 'Hotel/property confirmation'
                    : 'Primary confirmation',
                primaryTravel?.details?.confirmations?.join(' · ') || 'Unknown',
              ],
              [
                sourceConfirmationLabel(b.channel),
                primaryTravel?.details?.booking_source_confirmation?.join(' · ') || 'Unknown',
              ],
              [
                'Account / Profile',
                s.bookingSourceProfiles?.find(
                  (p: R) => p.id === b.itinerary.operational_entry.source_profile_id,
                )?.name || 'Not specified',
              ],
              ...(b.product === 'Flight'
                ? [
                    ['Route', primaryTravel?.details?.route || 'Unknown'],
                    [
                      'Flight numbers',
                      primaryTravel?.details?.flight_numbers?.join(' · ') || 'Not specified',
                    ],
                    [
                      'Ticket numbers',
                      primaryTravel?.details?.ticket_numbers?.join(' · ') || 'Not specified',
                    ],
                    [
                      'Ticketing status',
                      primaryTravel?.details?.ticketing_status || 'Not Ticketed / Unknown',
                    ],
                  ]
                : []),
            ]
          : [
              ['Booking channel', b.channel],
              ['Supplier', person(b.supplier_id)],
              [
                'Operating airline',
                b.itinerary?.airline_id ? person(b.itinerary.airline_id) : 'Not specified',
              ],
              [
                'Acquisition source',
                b.itinerary?.acquisition_source_status === 'Unknown'
                  ? 'Unknown outside source'
                  : b.itinerary?.acquisition_source_id
                    ? person(b.itinerary.acquisition_source_id)
                    : 'Not applicable / not specified',
              ],
              [
                'Route',
                [b.itinerary?.origin, b.itinerary?.destination].filter(Boolean).join(' → ') ||
                  'See summary',
              ],
              ['Flight numbers', b.itinerary?.flight_numbers?.join(', ') || 'Not specified'],
              [
                'Ticket numbers',
                b.itinerary?.ticket_numbers?.join(', ') || 'Not issued / not specified',
              ],
              [
                'Property',
                [b.itinerary?.hotel_name, b.itinerary?.hotel_address, b.itinerary?.room_type]
                  .filter(Boolean)
                  .join(' · ') || 'Not applicable / not specified',
              ],
            ]),
        [
          'Travel dates',
          (() => {
            const primary =
              (detail?.travelComponents ?? s?.travelComponents ?? []).find(
                (t: R) => t.booking_id === b.id && t.status !== 'Cancelled',
              ) || null;
            const span = travelDatesDisplay(b, primary);
            return span.missing ? `${span.label} · ${span.missing}` : span.label;
          })(),
        ],
        ['Booked on', dateLabel(b.booked_on)],
        [
          'Reservation',
          (() => {
            if (b.reservation_status !== 'Held')
              return reservationStatusLabel(b.reservation_status);
            const dl = bookingTicketingDeadline(b);
            const urg = heldDeadlineUrgency(dl, today);
            if (!dl) return 'Held · ticketing deadline missing';
            if (urg === 'overdue') return `Held · past deadline ${dl}`;
            if (urg === 'due_today') return `Held · deadline today ${dl}`;
            if (urg === 'due_soon') return `Held · ticket by ${dl}`;
            return `Held · ticket by ${dl}`;
          })(),
        ],
        ...(b.itinerary?.operational_entry
          ? []
          : [['Confirmation / ticketing', b.confirmation_status]]),
        ['Itinerary / documents', b.document_status],
        [
          'Travelers',
          (Array.isArray(detail.travelers) ? detail.travelers : [])
            .map((p: R) => `${p.name}${p.status === 'Cancelled' ? ' (cancelled)' : ''}`)
            .join(', ') || 'Not linked',
        ],
      ];
      const overviewGroup = (label: string) =>
        /ticket|document|confirmation|PNR|Flight numbers/i.test(label)
          ? 'Tickets & documents'
          : /Product|Airline|Property|Hotel|Rental|Travel|Route|Trip|Operating airline|Provider/i.test(
                label,
              ) && !/Booked Through|Booking/.test(label)
            ? 'Trip'
            : 'Booking';
      view = (
        <>
          <button className="back" onClick={closeRecord}>
            <ChevronLeft size={14} />
            Back to {page}
          </button>
          {heading(
            b.summary,
            `${b.code} · ${c.confirmations || 'No confirmation'} · ${person(b.customer_id)}`,
            <Badge>{reservationStatusLabel(b.reservation_status)}</Badge>,
          )}
          <div className="metrics">
            {canSale && (
              <>
                <Metric
                  label="Customer charged"
                  value={money(b.sale)}
                  foot="Current charges after adjustments"
                  icon={Wallet}
                />
                <Metric
                  label="Customer receipts recorded"
                  value={money(b.paid)}
                  foot="Allocated payments"
                  icon={CheckCircle2}
                />
                <Metric
                  label="Customer balance"
                  value={money(b.customer_balance)}
                  foot="Negative balance is a refund liability"
                  icon={ArrowDownLeft}
                />
              </>
            )}
            {canBookingProfit &&
              (() => {
                const pair = bookingProfitPair({
                  profit: b.profit == null ? null : Number(b.profit),
                  current_profit:
                    b.current_profit == null ? null : Number(b.current_profit),
                  expected_commission:
                    b.expected_commission == null ? null : Number(b.expected_commission),
                  received_commission:
                    b.received_commission == null ? null : Number(b.received_commission),
                  cost_incomplete: b.cost_incomplete,
                  itinerary: b.itinerary,
                });
                const incompleteLabel = incompleteProfitReason(b) ?? 'Incomplete';
                return (
                  <>
                    <Metric
                      label="Confirmed profit"
                      value={
                        pair.incomplete || pair.confirmed_cents == null
                          ? incompleteLabel
                          : money(pair.confirmed_cents)
                      }
                      foot="Certain money and credits"
                      icon={ChartNoAxesCombined}
                    />
                    <Metric
                      label="Expected profit"
                      value={
                        pair.incomplete || pair.expected_cents == null
                          ? incompleteLabel
                          : money(pair.expected_cents)
                      }
                      foot="Adds commissions not yet received"
                      icon={Landmark}
                    />
                  </>
                );
              })()}
          </div>
          <div className="detail-actions">
            {b.itinerary?.sale_known === false && can('edit_customer_charges') && (
              <button className="btn" onClick={() => action('confirm_sale', { booking_id: b.id })}>
                Set Customer Sale Price
              </button>
            )}
            {canPay && (
              <button
                className="btn primary"
                onClick={() => action('payment', { party_id: b.customer_id, booking_id: b.id })}
              >
                <Plus size={14} />
                Add payment
              </button>
            )}
            {canPay &&
              canAction('allocate') &&
              (() => {
                const apply = buildApplyHeldCreditDefaults({
                  payments: s.payments,
                  partyId: b.customer_id,
                  bookingId: b.id,
                  bookingBalanceCents: b.customer_balance,
                });
                if (!apply) return null;
                return (
                  <button
                    className="btn"
                    title="Apply oldest held customer credit to this booking’s balance"
                    onClick={() =>
                      action('allocate', {
                        payment_id: apply.payment_id,
                        booking_id: apply.booking_id,
                        amount: apply.amount,
                      })
                    }
                  >
                    Apply held credit
                  </button>
                );
              })()}
            <button
              className="btn"
              onClick={async () => {
                const path = workspaceRecordUrl('booking', b.id);
                await navigator.clipboard.writeText(`${window.location.origin}${path}`);
                setToast('Booking link copied');
              }}
            >
              <Copy size={13} />
              Copy link
            </button>
            <button
              className="btn"
              disabled={
                (b.reservation_status === 'Traveled' || b.travel_end < today) &&
                !can('edit_completed_bookings')
              }
              title="Completed bookings require a separate permission"
              onClick={() => action('revise', { ...b, booking_id: b.id })}
            >
              Edit booking
            </button>
            {canAction('fund') && b.reservation_status !== 'Cancelled' && (
              <button className="btn" onClick={() => action('fund', { booking_id: b.id })}>
                Record cost
              </button>
            )}
            {canAction('booking_extra') && b.reservation_status !== 'Cancelled' && (
              <button
                className="btn"
                onClick={() =>
                  action('booking_extra', {
                    booking_id: b.id,
                    category: 'Seat',
                    payee_id: b.supplier_id,
                  })
                }
              >
                Add extra
              </button>
            )}
            {canAction('booking_change') && b.reservation_status !== 'Cancelled' && (
              <button
                className="btn"
                onClick={() =>
                  action('booking_change', {
                    booking_id: b.id,
                    summary: b.summary,
                    travel_start: b.travel_start,
                    travel_end: b.travel_end,
                    supplier_id: b.supplier_id,
                  })
                }
              >
                Record change
              </button>
            )}
            <details className="action-menu booking-action-menu">
              <summary className="btn">More actions</summary>
              <div className="action-menu-panel">
                {['Customer money', 'Cost & source', 'Commissions', 'Booking'].map((group) => (
                  <div className="action-menu-group" key={group}>
                    <strong>{group}</strong>
                    {[
                      ['fund', 'Record cost / payment'],
                      ...(['Cancelled', 'Refund Pending'].includes(b.reservation_status)
                        ? [['cancellation_cost', 'Add cancellation cost']]
                        : []),
                      ['charge', 'Adjust charge'],
                      ['booking_extra', 'Add extra (seat / bag)'],
                      ['booking_change', 'Record change (fees / dates)'],
                      ['authorize_payer', 'Authorize payer'],
                      ['voucherize', 'Voucherize'],
                      ['benefit', 'Price match credit'],
                      ['price_match_event', 'Price match case'],
                      ['booking_source_profile_link', 'Set source account/profile'],
                      ['commission', 'Add commission'],
                      ['referral', 'Add Commission Payable'],
                    ]
                      .filter(([kind]) => {
                        const actionGroup = [
                          'charge',
                          'authorize_payer',
                          'booking_extra',
                          'booking_change',
                        ].includes(kind)
                          ? 'Customer money'
                          : ['commission', 'referral'].includes(kind)
                            ? 'Commissions'
                            : [
                                  'fund',
                                  'cancellation_cost',
                                  'voucherize',
                                  'benefit',
                                  'price_match_event',
                                  'booking_source_profile_link',
                                ].includes(kind)
                              ? 'Cost & source'
                              : 'Booking';
                        return (
                          actionGroup === group &&
                          canAction(kind) &&
                          !(kind === 'fund' && b.reservation_status === 'Cancelled')
                        );
                      })
                      .map(([kind, label]) => (
                        <button
                          key={kind}
                          className="btn"
                          onClick={() =>
                            action(kind, {
                              booking_id: b.id,
                              ...(['benefit', 'price_match_event'].includes(kind) &&
                              b.itinerary?.operational_entry?.source_profile_id
                                ? {
                                    profile_id:
                                      b.itinerary.operational_entry.source_profile_id,
                                  }
                                : {}),
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    {group === 'Booking' && (
                      <>
                        <button
                          className="btn"
                          onClick={() =>
                            action('note', { record_type: 'booking', record_id: b.id })
                          }
                        >
                          Add note
                        </button>
                        {canAction('booking_document') && (
                          <button
                            className="btn"
                            onClick={() =>
                              action('booking_document', {
                                booking_id: b.id,
                                kind: 'pdf',
                              })
                            }
                          >
                            Add document
                          </button>
                        )}
                        {canAction('link_booking') && (
                          <button
                            className="btn"
                            onClick={() =>
                              action('link_booking', {
                                from_booking_id: b.id,
                                booking_id: b.id,
                              })
                            }
                          >
                            Link related booking
                          </button>
                        )}
                        {canAction('cancel') && (
                          <button
                            className="btn danger"
                            onClick={() => action('cancel', { booking_id: b.id })}
                          >
                            Cancel / partial cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
          <div className="detail-section">
            <Card
              title="Booking overview"
              action={
                can('operations') && (
                  <button
                    className="btn small"
                    disabled={
                      (b.reservation_status === 'Traveled' || b.travel_end < today) &&
                      !can('edit_completed_bookings')
                    }
                    onClick={() => action('revise', { ...b, booking_id: b.id })}
                  >
                    Edit details
                  </button>
                )
              }
            >
              <div className="section-body overview-groups">
                {['Trip', 'Booking', 'Tickets & documents'].map((group) => (
                  <section className="overview-group" key={group}>
                    <h3>{group}</h3>
                    {overview
                      .filter(([label]) => overviewGroup(String(label)) === group)
                      .map(([k, v]) => (
                        <div className="overview-fact" key={String(k)}>
                          <span className="detail-label">{k}</span>
                          <strong className="detail-value">{v}</strong>
                        </div>
                      ))}
                  </section>
                ))}
              </div>
            </Card>
          </div>
          {detail.bookingRelationsEnabled !== false && (
            <div className="detail-section">
              <Card
                title="Related bookings"
                action={
                  <div className="heading-actions">
                    {canAction('booking_extra') && b.reservation_status !== 'Cancelled' && (
                      <button
                        className="btn small"
                        onClick={() =>
                          action('booking_extra', {
                            booking_id: b.id,
                            category: 'Other',
                            trip_shared: true,
                            date: s.today,
                          })
                        }
                      >
                        Add shared charge
                      </button>
                    )}
                    {canAction('link_booking') && (
                      <button
                        className="btn small"
                        onClick={() =>
                          action('link_booking', {
                            from_booking_id: b.id,
                            booking_id: b.id,
                          })
                        }
                      >
                        Link booking
                      </button>
                    )}
                  </div>
                }
              >
                <div className="section-body">
                  {(detail.bookingRelations ?? []).length ? (
                    <>
                      <ul className="plain-list">
                        {(detail.bookingRelations as R[]).map((edge) => {
                          const peerId =
                            edge.from_booking_id === b.id
                              ? edge.to_booking_id
                              : edge.from_booking_id;
                          const peer = (detail.bookingFamily?.nodes ?? []).find(
                            (n: R) => n.id === peerId,
                          );
                          const peerShort = peer ? bookingShortName(peer) : null;
                          const peerShare = calendarBookingSharePath(peerId);
                          return (
                            <li key={edge.id}>
                              <strong>{edge.kind}</strong>
                              {' · '}
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => openRecord('booking', peerId)}
                              >
                                {peer?.code || String(peerId).slice(0, 8)}
                              </button>
                              {peer?.reservation_status ? (
                                <small> · {reservationStatusLabel(peer.reservation_status)}</small>
                              ) : null}
                              {peerShort ? (
                                <small title={peer?.summary || undefined}> · {peerShort}</small>
                              ) : null}
                              {can('view_sale_price') && (
                                <span className="money">
                                  {' '}
                                  ·{' '}
                                  {peer?.sale_cents == null
                                    ? 'Sale unknown'
                                    : money(peer.sale_cents)}
                                </span>
                              )}
                              {canCosts && (
                                <span className="money">
                                  {' '}
                                  · Cost{' '}
                                  {peer?.funding_cost_cents == null
                                    ? 'unknown'
                                    : money(peer.funding_cost_cents)}
                                </span>
                              )}
                              {edge.note ? <small> · {edge.note}</small> : null}
                              <div className="heading-actions" style={{ marginTop: 6 }}>
                                {peerShare ? (
                                  <button
                                    type="button"
                                    className="btn small ghost"
                                    aria-label="Copy shareable link"
                                    onClick={() => void copyWorkspacePath(peerShare)}
                                  >
                                    Copy link
                                  </button>
                                ) : null}
                                {canAction('unlink_booking') ? (
                                  <button
                                    type="button"
                                    className="btn small ghost"
                                    onClick={() =>
                                      action('unlink_booking', { relation_id: edge.id })
                                    }
                                  >
                                    Remove link
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {detail.bookingFamily?.nodes?.length > 1 && (
                        <p className="note" style={{ marginTop: 10 }}>
                          Family of {detail.bookingFamily.nodes.length}{' '}
                          {detail.bookingFamily.nodes.length === 1 ? 'booking' : 'bookings'}
                          {can('view_sale_price')
                            ? detail.bookingFamily.combined_incomplete
                              ? ' · Combined sale incomplete (unknown on at least one)'
                              : detail.bookingFamily.combined_sale_cents != null
                                ? ` · Combined sale ${money(detail.bookingFamily.combined_sale_cents)}`
                                : ''
                            : ''}
                          {canCosts
                            ? detail.bookingFamily.combined_cost_incomplete
                              ? ' · Combined cost incomplete (unknown on at least one)'
                              : detail.bookingFamily.combined_cost_cents != null
                                ? ` · Combined cost ${money(detail.bookingFamily.combined_cost_cents)}`
                                : ''
                            : ''}
                          . Money stays on each booking.
                        </p>
                      )}
                    </>
                  ) : (
                    <Empty>
                      No related bookings yet. Link a change, extension, voucher, or same-trip
                      booking. Money stays per booking.
                    </Empty>
                  )}
                  {(detail.bookingFamily?.trip_shared_charges ?? []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="detail-label">Trip shared charges</div>
                      <ul className="plain-list">
                        {(detail.bookingFamily.trip_shared_charges as TripSharedCharge[]).map(
                          (c) => (
                          <li key={c.id}>
                            {tripSharedChargeSummary(c)}
                            {c.effective_on ? (
                              <small> · {dateLabel(c.effective_on)}</small>
                            ) : null}
                            {c.note ? <small> · {c.note}</small> : null}
                          </li>
                          ),
                        )}
                      </ul>
                      <small className="muted">
                        Entered once at trip level; money stays on the posting booking.
                      </small>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
          <div className="grid-2">
            <Card
              title="Customer charges & payments"
              action={
                <div className="heading-actions">
                  {canPay &&
                    newButton('Add payment', 'payment', {
                      party_id: b.customer_id,
                      booking_id: b.id,
                    })}
                  {canAction('authorize_payer') &&
                    newButton('Authorize payer', 'authorize_payer', { booking_id: b.id })}
                </div>
              }
            >
              <div className="section-body">
                <div className="detail-label">Authorized payers</div>
                {(Array.isArray(detail.authorizedPayers) ? detail.authorizedPayers : []).length ===
                0 ? (
                  <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
                    {authorizedPayersEmptyHint()}
                  </p>
                ) : (
                  <ul className="plain-list" style={{ marginBottom: 12 }}>
                    {(detail.authorizedPayers as R[]).map((p: R) => (
                      <li key={p.party_id}>
                        <button
                          type="button"
                          className="booking-code"
                          onClick={() => openRecord('person', p.party_id)}
                        >
                          {p.name}
                        </button>
                        {p.reason ? <small> · {p.reason}</small> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {can('view_sale_price') &&
                  (() => {
                    const tax = customerTaxesDisplay({
                      taxes: b.itinerary?.operational_entry?.taxes,
                      saleCents: b.sale,
                    });
                    const taxHint = standingDealNeedsTaxesHint(
                      b.itinerary?.operational_entry?.standing_deals,
                      b.itinerary?.operational_entry?.taxes,
                    );
                    const canEditTaxes = canAction('booking_taxes');
                    if (!tax && !taxHint && !canEditTaxes) return null;
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div
                          className="detail-label"
                          style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                        >
                          <span>Taxes (part of customer price)</span>
                          {canEditTaxes ? (
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() =>
                                action('booking_taxes', {
                                  booking_id: b.id,
                                  tax_amount:
                                    tax?.amount_cents != null
                                      ? (tax.amount_cents / 100).toFixed(2)
                                      : '',
                                })
                              }
                            >
                              Edit taxes
                            </button>
                          ) : null}
                        </div>
                        {tax ? (
                          <p style={{ margin: '0 0 4px' }}>
                            <strong>{money(tax.amount_cents)}</strong>
                            <small>
                              {' '}
                              · Included in price
                              {tax.sale_ex_tax_cents != null
                                ? ` · Sale excluding taxes ${money(tax.sale_ex_tax_cents)}`
                                : ''}
                            </small>
                          </p>
                        ) : (
                          <p className="muted" style={{ fontSize: 11, margin: '0 0 4px' }}>
                            Not entered
                          </p>
                        )}
                        {taxHint ? (
                          <p className="note" style={{ fontSize: 11, margin: 0 }}>
                            {taxHint}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                <ul className="plain-list">
                  {(Array.isArray(detail.charges) ? detail.charges : []).map((r: R) => (
                    <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        {pretty(r.kind)} <small>· {dateLabel(r.effective_on)}</small>
                      </span>
                      <strong>{money(r.amount)}</strong>
                    </li>
                  ))}
                </ul>
                {can('view_sale_price') &&
                  detail.cardFeeSpread?.has_any &&
                  (() => {
                    const fee = detail.cardFeeSpread as {
                      customer_charged_cents: number | null;
                      padova_cost_cents: number | null;
                      spread_cents: number | null;
                      incomplete: boolean;
                    };
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div className="detail-label">Card fee (separate line)</div>
                        <p style={{ margin: '0 0 4px', fontSize: 12 }}>
                          Customer charged{' '}
                          {fee.customer_charged_cents == null
                            ? 'Unknown'
                            : money(fee.customer_charged_cents)}
                          {' · '}
                          Padova cost{' '}
                          {fee.padova_cost_cents == null
                            ? 'Unknown'
                            : money(fee.padova_cost_cents)}
                          {' · '}
                          Spread{' '}
                          {fee.incomplete || fee.spread_cents == null
                            ? 'Incomplete'
                            : money(fee.spread_cents)}
                        </p>
                        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                          Difference is Padova profit on the card fee. Unknown stays Incomplete — never
                          $0 invented.
                        </p>
                      </div>
                    );
                  })()}
                {can('view_sale_price') &&
                  detail.retainedCardFee?.visible &&
                  (() => {
                    const fee = detail.retainedCardFee as {
                      retained_cents: number | null;
                      refunded: boolean;
                      incomplete: boolean;
                    };
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div className="detail-label">Retained card fee (after cancel)</div>
                        {fee.refunded ? (
                          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                            Card fee was refunded to the customer — nothing retained as profit.
                          </p>
                        ) : (
                          <p style={{ margin: 0, fontSize: 12 }}>
                            Padova keeps{' '}
                            <strong>
                              {fee.incomplete || fee.retained_cents == null
                                ? 'Incomplete'
                                : money(fee.retained_cents)}
                            </strong>
                            <small> · Booking profit (not refunded)</small>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                {(Array.isArray(detail.allocations) ? detail.allocations : [])
                  .filter((r: R) => r.direction === 'customer')
                  .map((r: R) => (
                    <div className="note" key={r.id}>
                      Payment · {r.method} · {money(r.amount)}
                      <small> · {r.reference}</small>
                    </div>
                  ))}
              </div>
            </Card>
            <Card
              title={b.itinerary?.operational_entry ? 'Seller & cost' : 'Supplier & cost'}
              className="seller-cost-card"
              action={
                canAction('fund') &&
                b.reservation_status !== 'Cancelled' &&
                newButton('Record cost', 'fund', { booking_id: b.id })
              }
            >
              {canCosts || can('manage_funding') || can('issue_refunds') ? (
                <div className="section-body seller-cost-body">
                  <div className="details-grid seller-cost-grid">
                    {b.itinerary?.operational_entry?.source_profile_id && (
                      <div>
                        <div className="detail-label">Booking source account / profile</div>
                        <strong>
                          {
                            s.bookingSourceProfiles?.find(
                              (p: R) => p.id === b.itinerary.operational_entry.source_profile_id,
                            )?.name
                          }
                        </strong>
                      </div>
                    )}
                    <div>
                      <div className="detail-label">Acquisition cost</div>
                      <strong>
                        {supplierCostIncomplete(b) ? 'Unknown / incomplete' : money(b.funding_cost)}
                      </strong>
                    </div>
                    {supplierCostIncomplete(b) && recordedHistoricalCost && (
                      <div>
                        <div className="detail-label">Recorded historical cost</div>
                        <strong>{recordedHistoricalCost}</strong>
                        <small>From the accounting sheet; reconciliation pending</small>
                      </div>
                    )}
                    {canCosts && (
                      <div>
                        <div className="detail-label">Generated credit / recovered value</div>
                        <strong>{money(b.generated_value)}</strong>
                      </div>
                    )}
                    {canCosts && (
                      <div>
                        <div className="detail-label">Actual Net Cost</div>
                        <strong>
                          {supplierCostIncomplete(b)
                            ? 'Cost incomplete'
                            : money(b.net_economic_cost)}
                        </strong>
                      </div>
                    )}
                    {canCosts &&
                      latestCreditRequests(b.itinerary?.price_match_history).some((r) =>
                        ['Pending', 'Approved'].includes(r.status),
                      ) && (
                        <div>
                          <div className="detail-label">Expected Net Cost (unreceived credits)</div>
                          <strong>
                            {supplierCostIncomplete(b)
                              ? 'Cost incomplete'
                              : money(
                                  Number(b.net_economic_cost) -
                                    latestCreditRequests(b.itinerary?.price_match_history)
                                      .filter((r) => ['Pending', 'Approved'].includes(r.status))
                                      .reduce(
                                        (sum, r) =>
                                          sum +
                                          Number(
                                            r.expected_credit ??
                                              r.approved_amount ??
                                              r.requested_amount ??
                                              0,
                                          ),
                                        0,
                                      ),
                                )}
                          </strong>
                        </div>
                      )}
                    <div>
                      <div className="detail-label">
                        {b.itinerary?.operational_entry
                          ? 'Recorded seller balance'
                          : 'Supplier payable'}
                      </div>
                      <strong>{money(b.supplier_balance)}</strong>
                    </div>
                    {canCosts &&
                      (b.itinerary?.operational_entry?.components ?? []).some(
                        (c: R) =>
                          c.cost_is_estimate ||
                          (c.other_currency?.code && (c.cost == null || c.cost === '')),
                      ) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="detail-label">Cost estimate</div>
                          <p style={{ margin: 0 }}>
                            {(b.itinerary.operational_entry.components as R[])
                              .filter(
                                (c: R) =>
                                  c.cost_is_estimate ||
                                  (c.other_currency?.code &&
                                    (c.cost == null || c.cost === '')),
                              )
                              .map((c: R, i: number) => {
                                const fx = c.other_currency
                                  ? [
                                      c.other_currency.code,
                                      c.other_currency.amount,
                                      c.other_currency.rate
                                        ? `rate ${c.other_currency.rate}`
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')
                                  : '';
                                return (
                                  <span key={i}>
                                    {i > 0 ? ' · ' : ''}
                                    Estimate
                                    {c.cost != null && c.cost !== ''
                                      ? ` ${money(Number(c.cost))} (provisional)`
                                      : ' · USD Unknown'}
                                    {fx ? ` · ${fx}` : ''}
                                  </span>
                                );
                              })}
                          </p>
                        </div>
                      )}
                    {canCosts &&
                      b.itinerary?.operational_entry?.taxes &&
                      (b.itinerary.operational_entry.taxes.bearer ||
                        b.itinerary.operational_entry.taxes.economic_bearer) && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="detail-label">Tax funding (cost side)</div>
                        <p style={{ margin: 0 }}>
                          Paid by {b.itinerary.operational_entry.taxes.bearer || 'Not specified'} ·
                          Cost borne by{' '}
                          {b.itinerary.operational_entry.taxes.economic_bearer ?? 'Not specified'}
                          {b.itinerary.operational_entry.taxes.customer_recovery !== undefined && (
                            <>
                              {' '}
                              · Customer recovery:{' '}
                              {money(b.itinerary.operational_entry.taxes.customer_recovery)}
                            </>
                          )}
                        </p>
                        <small className="muted">
                          Customer tax amount is on Customer charges & payments.
                        </small>
                      </div>
                    )}
                    {b.current_profit !== undefined && can('view_booking_profit') && (
                      <div>
                        <div className="detail-label">
                          Current profit · received commission only
                        </div>
                        <strong>{money(b.current_profit)}</strong>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const primary = expectedCommissionDisplay(
                      b.itinerary?.operational_entry?.commission,
                    );
                    const secondary = expectedCommissionDisplay(
                      b.itinerary?.operational_entry?.secondary_commission,
                    );
                    const recorded = recordedCommissionTotals(
                      s.commissions.filter((r: R) => r.booking_id === b.id),
                      b.itinerary?.operational_entry,
                    );
                    const referral = (s.referrals ?? []).find((r: R) => r.booking_id === b.id);
                    const primaryValue =
                      recorded.primaryCents != null
                        ? money(recorded.primaryCents)
                        : primary.status === 'unknown'
                          ? 'Unknown'
                          : primary.status === 'none' && b.expected_commission == null
                            ? '—'
                            : money(
                                primary.amount != null
                                  ? primary.amount
                                  : b.expected_commission,
                              );
                    const secondaryValue =
                      recorded.secondaryCents != null
                        ? money(recorded.secondaryCents)
                        : secondary.status === 'unknown'
                          ? 'Unknown'
                          : secondary.status === 'none'
                            ? '—'
                            : secondary.amount != null
                              ? money(secondary.amount)
                              : 'Expected (amount TBD)';
                    return (
                      <div className="seller-commission-row">
                        <div className="seller-metric">
                          <div className="detail-label">
                            {recorded.primaryCents != null
                              ? 'Primary IATA / partner · recorded'
                              : expectedCommissionPanelLabel('primary')}
                          </div>
                          <strong>{primaryValue}</strong>
                          <small className="seller-metric-hint">
                            {recorded.primaryCents != null
                              ? 'Recorded receivable. Not cash until a receipt is allocated.'
                              : 'Expected only. Not received until Add commission posts a receivable.'}
                          </small>
                        </div>
                        <div className="seller-metric">
                          <div className="detail-label">
                            {recorded.secondaryCents != null
                              ? 'Secondary commission · recorded'
                              : expectedCommissionPanelLabel('secondary')}
                          </div>
                          <strong>{secondaryValue}</strong>
                          <small className="seller-metric-hint">
                            {recorded.secondaryCents != null
                              ? 'Recorded receivable (separate from primary). Cash after receipt.'
                              : 'Expected only (separate from primary). Use Add commission to post.'}
                          </small>
                        </div>
                        <div className="seller-metric">
                          <div className="detail-label">Referring-org commission payable</div>
                          <strong>
                            {referral
                              ? money(referral.expected_due)
                              : b.referring_organization_name
                                ? 'Linked (see payables)'
                                : '—'}
                          </strong>
                          <small className="seller-metric-hint">
                            Padova pays out, not the same as who owes Padova.
                          </small>
                        </div>
                      </div>
                    );
                  })()}
                  <ul className="plain-list">
                    {(Array.isArray(detail.funding) ? detail.funding : []).map((f: R) => {
                      const linkedAsset = s.assets.find((a: R) => a.id === f.asset_id);
                      const costKind = fundingCostKindLabel({
                        kind: f.kind,
                        asset_kind: linkedAsset?.kind ?? f.asset_kind,
                        notes: f.notes,
                      });
                      const voucherNote = fundingVoucherNote({
                        kind: f.kind,
                        asset_kind: linkedAsset?.kind ?? f.asset_kind,
                        asset_id: f.asset_id,
                        notes: f.notes,
                      });
                      const sellerLabel =
                        f.seller_name ||
                        (f.seller_id ? person(f.seller_id) : null);
                      const inventoryUse = Boolean(
                        f.asset_id &&
                          (linkedAsset?.ownership || f.asset_ownership) === 'Padova' &&
                          f.obligation_amount == null &&
                          f.obligation_remaining == null,
                      );
                      const settlement = fundingCostLineSettlement({
                        cost_cents: f.cost,
                        reversed: f.reversed,
                        asset_id: f.asset_id,
                        inventory_use: inventoryUse,
                        seller_name: sellerLabel,
                        effective_on: f.effective_on,
                        obligation_amount_cents: f.obligation_amount,
                        obligation_remaining_cents: f.obligation_remaining,
                        paid_on: f.paid_on,
                      });
                      return (
                      <li key={f.id}>
                        {costKind} {f.asset && `· ${f.asset}`}
                        {voucherNote && (
                          <Badge tone="amber">{voucherNote}</Badge>
                        )}
                        <Badge tone={fundingSettlementBadgeTone(settlement.status)}>
                          {fundingSettlementSummary(settlement)}
                        </Badge>
                        {f.seller_id && (
                          <small>Purchased from / payable to {person(f.seller_id)}</small>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <small>
                            {formatQuantity(
                              f.face_amount,
                              f.unit ??
                                assetUnit(linkedAsset ?? f),
                            )}{' '}
                            · {f.reversed ? 'Original reversed cost' : 'Cost basis'}:{' '}
                            {money(f.cost)}
                            {f.reversed && (
                              <Badge tone="gray">Reversed · excluded from current cost</Badge>
                            )}
                          </small>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                  {canCosts &&
                    (b.itinerary?.price_match_history ?? []).map((event: R) => (
                      <div className="note" key={event.id}>
                        <strong>Price match · {event.status}</strong> · {dateLabel(event.date)}
                        {event.request_id && (
                          <>
                            <p>
                              Request ·{' '}
                              {s.bookingSourceProfiles?.find((p: R) => p.id === event.profile_id)
                                ?.name || 'Profile unknown'}{' '}
                              · Expected{' '}
                              {money(event.expected_credit ?? event.requested_amount ?? 0)} ·
                              Received {money(event.received_amount ?? 0)}
                            </p>
                            {latestCreditRequests(b.itinerary.price_match_history).some(
                              (r) =>
                                r.id === event.id &&
                                !['Received', 'Denied', 'Cancelled'].includes(r.status),
                            ) &&
                              can('manage_funding') && (
                                <button
                                  className="btn small"
                                  onClick={() =>
                                    action('price_match_event', {
                                      ...event,
                                      ...Object.fromEntries(
                                        [
                                          'requested_amount',
                                          'expected_credit',
                                          'approved_amount',
                                          'original_rate',
                                          'final_rate',
                                        ]
                                          .filter((key) => event[key] !== undefined)
                                          .map((key) => [key, (event[key] / 100).toFixed(2)]),
                                      ),
                                      booking_id: b.id,
                                      request_id: event.request_id,
                                      date: s.today,
                                      reason: '',
                                    })
                                  }
                                >
                                  Update this request
                                </button>
                              )}
                          </>
                        )}
                        {event.original_rate !== undefined && (
                          <p>
                            Original rate {money(event.original_rate)} · New rate{' '}
                            {money(event.final_rate)}
                          </p>
                        )}
                        {event.amount !== undefined && (
                          <p>Verified generated value {money(event.amount)}</p>
                        )}
                        <p>
                          {event.reference} {event.reason}
                        </p>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty>Financial details require permission.</Empty>
              )}
            </Card>
          </div>
          {s.fulfillmentEnabled && (
            <div className="detail-section">
              <Card
                title="Travel & payment details"
                action={
                  <div className="heading-actions">
                    {newButton('Add flight / stay', 'travel_component', {
                      booking_id: b.id,
                      travel_start: b.travel_start,
                      travel_end: b.travel_end,
                    })}
                    {can('manage_funding') &&
                      newButton('Add cost / payment', 'fulfill', {
                        booking_id: b.id,
                        unit: 'money',
                      })}
                  </div>
                }
              >
                <div className="section-body">
                  {!detail.travelComponents?.length && (
                    <p>
                      Add separate flights, hotel stays or other travel to link their individual
                      fulfillment. Existing booking funding remains intact.
                    </p>
                  )}
                  {(detail.travelComponents ?? []).map((t: R) => (
                    <article className="travel-detail-card" key={t.id}>
                      <header className="travel-detail-head">
                        <div className="travel-detail-title-block">
                          <div className="travel-detail-kicker">
                            <span className="travel-detail-product">{t.product}</span>
                            <Badge
                              tone={
                                t.status === 'Cancelled'
                                  ? 'red'
                                  : t.status === 'Refund Pending'
                                    ? 'amber'
                                    : 'green'
                              }
                            >
                              {reservationStatusLabel(t.status ?? 'Booked')}
                            </Badge>
                          </div>
                          <h3 className="travel-detail-title">{t.summary}</h3>
                          <p className="travel-detail-subtitle">
                            {[
                              person(t.provider_id),
                              t.channel || 'Channel unknown',
                              t.travel_start && t.travel_end
                                ? `${dateLabel(t.travel_start)} – ${dateLabel(t.travel_end)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        {can('operations') && (
                          <button
                            className="btn small ghost travel-detail-edit"
                            onClick={() =>
                              action('revise_travel', {
                                ...t.details,
                                ...t,
                                travel_component_id: t.id,
                                description:
                                  t.product === 'Other'
                                    ? t.details?.description ||
                                      b.itinerary?.operational_entry?.other_description ||
                                      t.summary
                                    : undefined,
                                booking_id: b.id,
                                confirmations: (t.details?.confirmations ?? []).join('\n'),
                                flight_numbers: (t.details?.flight_numbers ?? []).join('\n'),
                                ticket_numbers: (t.details?.ticket_numbers ?? []).join('\n'),
                                booking_source_confirmation: (
                                  t.details?.booking_source_confirmation ?? []
                                ).join('\n'),
                                traveler_ids:
                                  t.details?.traveler_ids ??
                                  (Array.isArray(detail.travelers) ? detail.travelers : [])
                                    .filter((p: R) => p.status !== 'Cancelled')
                                    .map((p: R) => p.id),
                              })
                            }
                          >
                            Edit this travel
                          </button>
                        )}
                      </header>

                      <dl className="travel-detail-facts">
                        {t.details?.confirmations?.length > 0 && (
                          <div>
                            <dt>Confirmation</dt>
                            <dd>{t.details.confirmations.join(' · ')}</dd>
                          </div>
                        )}
                        {t.details?.booking_source_confirmation?.length > 0 && (
                          <div>
                            <dt>Booked Through confirmation</dt>
                            <dd>{t.details.booking_source_confirmation.join(' · ')}</dd>
                          </div>
                        )}
                        {t.details?.traveler_ids?.length > 0 && (
                          <div>
                            <dt>Travelers</dt>
                            <dd>{t.details.traveler_ids.map(person).join(' · ')}</dd>
                          </div>
                        )}
                        {(t.details?.route ||
                          t.details?.hotel ||
                          t.details?.hotel_name ||
                          t.details?.origin ||
                          t.details?.destination) && (
                          <div>
                            <dt>
                              {t.product === 'Flight'
                                ? 'Route'
                                : t.product === 'Hotel'
                                  ? 'Property'
                                  : 'Details'}
                            </dt>
                            <dd>
                              {t.details.route ||
                                t.details.hotel ||
                                t.details.hotel_name ||
                                [t.details.origin, t.details.destination]
                                  .filter(Boolean)
                                  .join(' → ')}
                            </dd>
                          </div>
                        )}
                        {t.details?.room_type && (
                          <div>
                            <dt>Room</dt>
                            <dd>{t.details.room_type}</dd>
                          </div>
                        )}
                        {t.details?.flight_numbers?.length > 0 && (
                          <div>
                            <dt>Flights</dt>
                            <dd>
                              {t.details.flight_numbers.join(' · ')}
                              {t.details.cabin ? ` · ${t.details.cabin}` : ''}
                            </dd>
                          </div>
                        )}
                        {t.details?.ticket_numbers?.length > 0 && (
                          <div>
                            <dt>Tickets</dt>
                            <dd>{t.details.ticket_numbers.join(' · ')}</dd>
                          </div>
                        )}
                        {t.acquisition_source_id && (
                          <div>
                            <dt>Purchased From</dt>
                            <dd>{person(t.acquisition_source_id)}</dd>
                          </div>
                        )}
                        {(t.details?.pickup_location || t.details?.dropoff_location) && (
                          <div>
                            <dt>Pickup / drop-off</dt>
                            <dd>
                              {t.details.pickup_location || 'Unknown'} →{' '}
                              {t.details.dropoff_location || 'Unknown'}
                            </dd>
                          </div>
                        )}
                        {(t.details?.departure_local || t.details?.arrival_local) && (
                          <div>
                            <dt>Local times</dt>
                            <dd>
                              {t.details.departure_local ?? 'Unknown'} →{' '}
                              {t.details.arrival_local ?? 'Unknown'}
                            </dd>
                          </div>
                        )}
                        {t.details?.benefits && (
                          <div>
                            <dt>Benefits</dt>
                            <dd>{t.details.benefits}</dd>
                          </div>
                        )}
                        {t.details?.restrictions && (
                          <div>
                            <dt>Restrictions</dt>
                            <dd>{t.details.restrictions}</dd>
                          </div>
                        )}
                      </dl>

                      {t.details?.segments?.length > 0 && (
                        <ul className="travel-detail-segments">
                          {t.details.segments.map((segment: R, i: number) => (
                            <li key={i}>
                              <strong>
                                {segment.origin} → {segment.destination}
                              </strong>
                              <span>
                                {dateLabel(segment.date)}
                                {segment.flight_number ? ` · ${segment.flight_number}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {t.details?.provider_references?.map((r: R) => (
                        <p className="travel-detail-note" key={`${r.provider_id}:${r.value}`}>
                          {person(r.provider_id)} · PNR {r.value}
                        </p>
                      ))}
                      {t.details?.reservation_summary &&
                        t.details.reservation_summary !== t.summary && (
                          <p className="travel-detail-note" style={{ whiteSpace: 'pre-wrap' }}>
                            {t.details.reservation_summary}
                          </p>
                        )}

                      {(detail.fulfillments ?? []).filter((f: R) => f.travel_component_id === t.id)
                        .length > 0 && (
                        <div className="travel-detail-costs">
                          <h4>Linked costs / payments</h4>
                          {(detail.fulfillments ?? [])
                            .filter((f: R) => f.travel_component_id === t.id)
                            .map((f: R) => (
                              <div className="travel-cost-row" key={f.id}>
                                <div className="travel-cost-main">
                                  <strong>
                                    {f.role === 'Ancillary' ? 'Extra benefit' : 'Main trip'} ·{' '}
                                    {f.asset_ownership === 'Customer'
                                      ? 'Customer-owned value'
                                      : f.mode}
                                  </strong>
                                  <span>
                                    {f.instrument ??
                                      (f.mode === 'Outside source'
                                        ? (f.terms?.supplied ?? 'Agreed seller price')
                                        : f.mode === 'Owned inventory'
                                          ? 'Owned value'
                                          : f.terms?.operational_kind === 'Customer card'
                                            ? 'Customer direct card'
                                            : 'Cash/Card')}
                                    {f.quantity != null && (
                                      <> · {formatQuantity(f.quantity, f.unit)}</>
                                    )}
                                    {canCosts && <> · Cost {money(f.cost)}</>}
                                  </span>
                                  {f.terms?.mechanism && (
                                    <span>
                                      {f.terms.mechanism} ·{' '}
                                      {f.terms.booked_through ?? 'Booking channel not supplied'}
                                    </span>
                                  )}
                                  {f.terms?.account_holder_id && (
                                    <span>Account holder: {person(f.terms.account_holder_id)}</span>
                                  )}
                                  {canCosts && f.terms?.quoted_rate && (
                                    <span>
                                      Quoted rate: {f.terms.quoted_rate}{' '}
                                      {f.terms.rate_unit ?? '(unit not supplied)'} · Quote only
                                    </span>
                                  )}
                                  {f.terms?.notes && <span>{f.terms.notes}</span>}
                                  {canCosts && f.terms?.portal_price !== undefined && (
                                    <span>
                                      Portal cash price: {money(f.terms.portal_price)}
                                      {f.terms?.reference_price !== undefined
                                        ? ` · Reference: ${money(f.terms.reference_price)}`
                                        : ''}{' '}
                                      · Comparison evidence only
                                    </span>
                                  )}
                                  {canCosts &&
                                    f.terms?.rate_cents_numerator !== undefined &&
                                    f.terms?.rate_points_denominator && (
                                      <span>
                                        Actual redemption quote:{' '}
                                        {money(f.terms.rate_cents_numerator)} for{' '}
                                        {Number(f.terms.rate_points_denominator).toLocaleString()}{' '}
                                        points · No additional revenue
                                      </span>
                                    )}
                                  {f.status !== 'Active' && f.status && (
                                    <Badge tone="gray">{f.status} · original history</Badge>
                                  )}
                                </div>
                                {can('manage_funding') && (!f.status || f.status === 'Active') && (
                                  <details className="travel-corrections">
                                    <summary>Cost actions</summary>
                                    <div className="traveler-record-actions">
                                      <button
                                        className="btn small"
                                        onClick={() =>
                                          action('revise_fulfillment', {
                                            ...f,
                                            ...f.terms,
                                            fulfillment_id: f.id,
                                            booking_id: b.id,
                                            quantity:
                                              f.quantity == null
                                                ? undefined
                                                : f.unit === 'money'
                                                  ? Number(f.quantity) / 100
                                                  : Number(f.quantity),
                                            cost: Number(f.cost) / 100,
                                            portal_price:
                                              f.terms?.portal_price !== undefined
                                                ? Number(f.terms.portal_price) / 100
                                                : undefined,
                                            reference_price:
                                              f.terms?.reference_price !== undefined
                                                ? Number(f.terms.reference_price) / 100
                                                : undefined,
                                            rate_cents_numerator:
                                              f.terms?.rate_cents_numerator !== undefined
                                                ? Number(f.terms.rate_cents_numerator) / 100
                                                : undefined,
                                            confirm_cost: f.terms?.cost_complete ?? true,
                                            settled: false,
                                            cash_method:
                                              (Array.isArray(detail.funding) ? detail.funding : []).find(
                                                (x: R) => x.id === f.funding_component_id,
                                              )?.kind === 'Bank'
                                                ? 'Bank'
                                                : (Array.isArray(detail.funding)
                                                      ? detail.funding
                                                      : []
                                                  ).find((x: R) => x.id === f.funding_component_id)
                                                      ?.kind === 'Cash'
                                                  ? 'Cash'
                                                  : 'Card',
                                          })
                                        }
                                      >
                                        Edit cost / payment
                                      </button>
                                      <button
                                        className="btn small"
                                        onClick={() =>
                                          action('reverse_fulfillment', {
                                            booking_id: b.id,
                                            fulfillment_id: f.id,
                                            edit_version: f.edit_version,
                                          })
                                        }
                                      >
                                        Reverse this cost
                                      </button>
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                        </div>
                      )}

                      <footer className="travel-detail-actions">
                        {can('manage_funding') && (
                          <button
                            className="btn small primary"
                            disabled={t.status === 'Cancelled' || t.status === 'Refund Pending'}
                            title="Canceled travel keeps its history. Use a new component for replacement travel."
                            onClick={() =>
                              action('fulfill', {
                                booking_id: b.id,
                                travel_component_id: t.id,
                                source_id: t.acquisition_source_id,
                                unit: 'money',
                              })
                            }
                          >
                            Record cost / payment
                          </button>
                        )}
                        <details className="travel-corrections travel-more-actions">
                          <summary>More travel actions</summary>
                          <div className="traveler-record-actions">
                            {can('manage_funding') && (
                              <button
                                className="btn small"
                                onClick={() =>
                                  action('link_fulfillment', {
                                    booking_id: b.id,
                                    travel_component_id: t.id,
                                  })
                                }
                              >
                                Link existing cost
                              </button>
                            )}
                            {can('manage_funding') && (
                              <button
                                className="btn small"
                                onClick={() =>
                                  action('confirm_travel_no_cost', {
                                    booking_id: b.id,
                                    travel_component_id: t.id,
                                  })
                                }
                              >
                                Confirm no supplier cost
                              </button>
                            )}
                            {can('issue_refunds') && (
                              <button
                                className="btn small danger"
                                onClick={() => {
                                  const linked = (detail.fulfillments ?? []).filter(
                                    (f: R) =>
                                      f.travel_component_id === t.id &&
                                      (!f.status || f.status === 'Active'),
                                  );
                                  action('cancel', {
                                    booking_id: b.id,
                                    travel_component_id: t.id,
                                    ...(linked.length === 1
                                      ? { funding_component_id: linked[0].funding_component_id }
                                      : {}),
                                  });
                                }}
                              >
                                {t.status === 'Cancelled'
                                  ? 'Add linked refund case'
                                  : 'Cancel this travel'}
                              </button>
                            )}
                            {can('manage_funding') &&
                              ['Cancelled', 'Refund Pending'].includes(t.status) && (
                                <button
                                  className="btn small"
                                  onClick={() =>
                                    action('cancellation_cost', {
                                      booking_id: b.id,
                                      travel_component_id: t.id,
                                    })
                                  }
                                >
                                  Add actual cancellation cost
                                </button>
                              )}
                          </div>
                        </details>
                      </footer>
                    </article>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {!!detail.assetAcquisitions?.length && (
            <div className="detail-section">
              <Card title="Linked inventory purchases">
                <div className="section-body">
                  <p>
                    Acquisition payments remain separate from the cost basis used by this booking.
                  </p>
                  {(Array.isArray(detail.assetAcquisitions) ? detail.assetAcquisitions : []).map(
                    (a: R) => (
                      <div className="note" key={a.id}>
                        <button className="btn small" onClick={() => openRecord('asset', a.id)}>
                          {a.name}
                        </button>
                        <p>
                          {a.seller} · Original acquisition {money(a.cost)} · Payments recorded{' '}
                          {money(a.paid)} · Balance owed {money(a.due)}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </Card>
            </div>
          )}
          {canCosts && (detail.sourceBalances?.length ?? 0) > 0 && (
            <div className="detail-section">
              <Card title="Source payments & balances">
                <div className="section-body">
                  <p>
                    Actual allocated payments and current balance for each source on this booking.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Source / actual payee</th>
                          <th>Payments recorded</th>
                          <th>Current balance</th>
                          <th>Settlement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(detail.sourceBalances) ? detail.sourceBalances : []).map(
                          (source: R) => (
                            <tr key={source.party_id}>
                              <td>{source.name}</td>
                              <td>{money(source.paid)}</td>
                              <td>{money(source.due)}</td>
                              <td>
                                {source.due < 0
                                  ? 'Credit / reconciliation'
                                  : source.due === 0
                                    ? 'Settled'
                                    : source.paid > 0
                                      ? 'Partially paid'
                                      : 'No payment recorded'}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {(s.expectedEvents ?? []).some((e: R) => e.booking_id === b.id) && (
            <div className="detail-section">
              <Card title="Points rewards & transfers">
                <div className="section-body expected-events-panel">
                  <p className="expected-events-intro">
                    Expected points are tracked separately. Inventory and profit change only on an
                    actual issuer posting.
                  </p>
                  <div className="expected-events-list">
                    {(s.expectedEvents ?? [])
                      .filter((e: R) => e.booking_id === b.id)
                      .map((e: R) => {
                        const status = String(e.status || 'Pending');
                        const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                        const expectedQty =
                          e.quantity_expected !== null && e.quantity_expected !== undefined
                            ? Number(e.quantity_expected).toLocaleString()
                            : null;
                        const actualQty =
                          e.quantity_actual !== null && e.quantity_actual !== undefined
                            ? Number(e.quantity_actual).toLocaleString()
                            : null;
                        return (
                          <article className="expected-event-card" key={e.id}>
                            <div className="expected-event-card-main">
                              <div className="expected-event-identity">
                                <div className="expected-event-title-row">
                                  <strong>{e.kind}</strong>
                                  <span
                                    className={`expected-event-status is-${statusClass}`}
                                  >
                                    {status}
                                  </span>
                                </div>
                                {e.reference ? (
                                  <span className="expected-event-ref">{e.reference}</span>
                                ) : null}
                              </div>
                              <div className="expected-event-metrics">
                                <div className="expected-event-metric">
                                  <span className="detail-label">Expected</span>
                                  <strong>
                                    {expectedQty ?? 'Unknown'}
                                    <small>points</small>
                                  </strong>
                                </div>
                                <div className="expected-event-metric">
                                  <span className="detail-label">Received</span>
                                  <strong className={actualQty ? '' : 'is-empty'}>
                                    {actualQty ?? '—'}
                                    {actualQty ? <small>points</small> : null}
                                  </strong>
                                </div>
                              </div>
                            </div>
                            {(() => {
                              const share = expectedEventBookingSharePath(e);
                              const canRecord =
                                can('manage_assets') &&
                                !['Denied', 'Reversed'].includes(status);
                              if (!share && !canRecord) return null;
                              return (
                                <div className="expected-event-card-actions">
                                  {share ? (
                                    <button
                                      type="button"
                                      className="btn small ghost"
                                      aria-label="Copy link for booking"
                                      onClick={() => void copyWorkspacePath(share)}
                                    >
                                      Copy link
                                    </button>
                                  ) : null}
                                  {canRecord ? (
                                    <button
                                      className="btn small"
                                      onClick={() =>
                                        action('update_expected_event', { event_id: e.id })
                                      }
                                    >
                                      Record issuer result
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </article>
                        );
                      })}
                  </div>
                </div>
              </Card>
            </div>
          )}
          {(canCommissions || canRefunds) && (
            <div className="detail-section">
              <Card
                title="Money Back"
                action={
                  <>
                    {canAction('commission') &&
                      newButton('Add commission', 'commission', { booking_id: b.id })}
                    {canAction('referral') &&
                      newButton(
                        'Add referrer',
                        'referral',
                        buildAddReferrerDefaults(b.id),
                      )}
                    {canAction('price_match_event') &&
                      newButton('Add price match', 'price_match_event', {
                        booking_id: b.id,
                        status: 'Pending',
                        ...(b.itinerary?.operational_entry?.source_profile_id
                          ? {
                              profile_id: b.itinerary.operational_entry.source_profile_id,
                            }
                          : {}),
                      })}
                  </>
                }
              >
                <div className="section-body">
                  <p className="money-back-intro">
                    Commissions, price matches, and referrer shares in one list. Add referrer here
                    (or create a new payee in the form). Owed when commission is confirmed. Unknown
                    stays Unknown.
                  </p>
                  {(() => {
                    const partyName = (id: string | null | undefined) => {
                      if (!id) return 'Unknown';
                      const p = (s.parties ?? []).find((x: R) => x.id === id);
                      return p?.name ? String(p.name) : 'Unknown';
                    };
                    const profileName = (id: string | null | undefined) => {
                      if (!id) return '';
                      const p = (s.bookingSourceProfiles ?? []).find((x: R) => x.id === id);
                      return p?.name ? String(p.name) : '';
                    };
                    const lines = buildMoneyBackLines({
                      bookingId: b.id,
                      operational: b.itinerary?.operational_entry,
                      commissions: s.commissions,
                      referrals: s.referrals,
                      referralPayments: s.referralPayments,
                      priceMatchHistory: b.itinerary?.price_match_history,
                      partyName,
                      profileName,
                    });
                    if (!lines.length) {
                      const empty = bookingCommissionsEmptyMessage({
                        hasRecordedReceivable: false,
                        hasReferral: false,
                        hasRefund: s.refunds.some((r: R) => r.booking_id === b.id),
                        hasExpectedOnBooking: hasExpectedCommissionOnBooking(
                          b.itinerary?.operational_entry,
                        ),
                      });
                      return empty ? <Empty>{empty}</Empty> : <Empty>No Money Back lines yet.</Empty>;
                    }
                    return (
                      <div className="money-back-list">
                        {lines.map((line) => {
                          const src = line.source as R;
                          const row = src.row as R | undefined;
                          return (
                            <article
                              key={line.id}
                              className={`money-back-card is-${line.direction} is-${line.status}`}
                            >
                              <div className="money-back-card-main">
                                <div className="money-back-identity">
                                  <div className="money-back-title-row">
                                    <strong>{line.label}</strong>
                                    <span className={`money-back-status is-${line.status}`}>
                                      {moneyBackStatusLabel(line.status)}
                                    </span>
                                    <span className="money-back-dir">
                                      {line.direction === 'in' ? 'In to Padova' : 'Out from Padova'}
                                    </span>
                                    <span
                                      className={`money-back-form is-${line.form}`}
                                      title="Plan: cash remittance or credit to a ledger"
                                    >
                                      {moneyBackFormLabel(line.form)}
                                    </span>
                                    {moneyBackIsAdmCorrection(line.note) ? (
                                      <span
                                        className="money-back-form is-adm"
                                        title="Airline debit memo — earlier remittance was too high"
                                      >
                                        ADM
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="money-back-party">{line.party}</span>
                                </div>
                                <div className="money-back-metrics">
                                  {line.retainedCents != null &&
                                  line.retainedCents > 0 &&
                                  line.grossCents != null ? (
                                    <>
                                      <div className="money-back-metric">
                                        <span className="detail-label">Gross</span>
                                        <strong>{money(line.grossCents)}</strong>
                                      </div>
                                      <div className="money-back-metric">
                                        <span className="detail-label">Padova net</span>
                                        <strong>
                                          {money(line.grossCents - line.retainedCents)}
                                        </strong>
                                      </div>
                                    </>
                                  ) : null}
                                  {(() => {
                                    const basisLabel = moneyBackAmountBasisLabel(line.amountBasis);
                                    return basisLabel ? (
                                      <div className="money-back-metric">
                                        <span className="detail-label">Amount basis</span>
                                        <strong>{basisLabel}</strong>
                                      </div>
                                    ) : null;
                                  })()}
                                  <div className="money-back-metric">
                                    <span className="detail-label">Expected</span>
                                    <strong>
                                      {line.expectedCents == null
                                        ? 'Unknown'
                                        : money(line.expectedCents)}
                                    </strong>
                                  </div>
                                  {line.kind === 'standing_deal' &&
                                  line.expectedCents == null &&
                                  (() => {
                                    const hint = standingDealUnknownAmountHint(
                                      (line.source as R)?.row ?? line.source,
                                    );
                                    return hint ? (
                                      <p
                                        className="muted"
                                        style={{
                                          fontSize: 11,
                                          margin: '4px 0 0',
                                          gridColumn: '1 / -1',
                                        }}
                                      >
                                        {hint}
                                      </p>
                                    ) : null;
                                  })()}
                                  <div className="money-back-metric">
                                    <span className="detail-label">
                                      {line.direction === 'out' ? 'Paid' : 'Received'}
                                    </span>
                                    <strong
                                      className={
                                        line.receivedCents && line.receivedCents > 0
                                          ? ''
                                          : 'is-empty'
                                      }
                                    >
                                      {line.receivedCents == null
                                        ? '—'
                                        : money(line.receivedCents)}
                                    </strong>
                                  </div>
                                  {line.deductedCents != null && line.deductedCents > 0 ? (
                                    <div className="money-back-metric">
                                      <span className="detail-label">Deducted</span>
                                      <strong>{money(line.deductedCents)}</strong>
                                    </div>
                                  ) : null}
                                </div>
                                {line.retainedCents != null && line.retainedCents > 0 ? (
                                  <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                                    Collector keeps {money(line.retainedCents)}
                                    {line.grossCents != null
                                      ? ` of ${money(line.grossCents)} gross`
                                      : ''}
                                    .
                                  </p>
                                ) : null}
                                {(line.expectedOn ||
                                  line.confirmedOn ||
                                  line.receivedOn ||
                                  line.howReceived) && (
                                  <p
                                    className="muted money-back-dates"
                                    style={{ fontSize: 11, marginTop: 6 }}
                                  >
                                    {[
                                      line.expectedOn ? `Expected ${line.expectedOn}` : null,
                                      line.confirmedOn ? `Confirmed ${line.confirmedOn}` : null,
                                      line.receivedOn
                                        ? `${line.direction === 'out' ? 'Paid' : 'Received'} ${line.receivedOn}`
                                        : null,
                                      line.howReceived ? `How ${line.howReceived}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                                {line.form === 'credit' &&
                                  (line.creditProfile || line.creditExpiresOn) && (
                                    <p
                                      className="muted money-back-credit-details"
                                      style={{ fontSize: 11, marginTop: 4 }}
                                    >
                                      Credit details:{' '}
                                      {[
                                        line.creditProfile
                                          ? `Profile ${line.creditProfile}`
                                          : null,
                                        line.creditExpiresOn
                                          ? `Expires ${line.creditExpiresOn}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  )}
                                {line.note ? (
                                  <p
                                    className="muted money-back-note"
                                    style={{ fontSize: 11, marginTop: 4, whiteSpace: 'pre-wrap' }}
                                  >
                                    Note: {line.note}
                                  </p>
                                ) : null}
                              </div>
                              <div className="money-back-card-actions">
                                {line.status !== 'voided' &&
                                line.status !== 'denied' &&
                                line.kind === 'commission_receivable' &&
                                row?.id ? (
                                  <>
                                    <button
                                      className="btn small"
                                      disabled={!can('edit_payments') || line.status === 'received'}
                                      onClick={() => {
                                        const due = commissionOutstandingCents({
                                          ...row,
                                          deducted: line.deductedCents ?? 0,
                                        });
                                        if (!(due > 0)) {
                                          action('commission_receipt', {
                                            commission_id: row.id,
                                          });
                                          return;
                                        }
                                        action('payment', {
                                          direction: 'commission',
                                          party_id: row.collector_id ?? row.payer_id,
                                          amount: (due / 100).toFixed(2),
                                          commission_allocations: [
                                            {
                                              commission_id: row.id,
                                              amount: (due / 100).toFixed(2),
                                            },
                                          ],
                                        });
                                      }}
                                    >
                                      Record receipt
                                    </button>
                                    <button
                                      className="btn small"
                                      disabled={line.status === 'received'}
                                      onClick={() =>
                                        action('commission_receipt', { commission_id: row.id })
                                      }
                                    >
                                      Allocate existing
                                    </button>
                                    {canAction('deduct_money_back') &&
                                      line.status !== 'received' && (
                                        <button
                                          className="btn small ghost"
                                          onClick={() => {
                                            const due = commissionOutstandingCents({
                                              ...row,
                                              deducted: line.deductedCents ?? 0,
                                            });
                                            action('deduct_money_back', {
                                              booking_id: b.id,
                                              target_kind: 'commission',
                                              target_id: row.id,
                                              ...(due > 0
                                                ? { amount: (due / 100).toFixed(2) }
                                                : {}),
                                            });
                                          }}
                                        >
                                          Deduct
                                        </button>
                                      )}
                                  </>
                                ) : null}
                                {line.status !== 'voided' && line.kind === 'commission_expected' ? (
                                  <button
                                    className="btn small"
                                    disabled={!canAction('commission')}
                                    onClick={() => {
                                      const which =
                                        src.kind === 'expected_secondary'
                                          ? 'secondary'
                                          : 'primary';
                                      const op = b.itinerary?.operational_entry;
                                      action(
                                        'commission',
                                        buildConfirmCommissionDefaults({
                                          bookingId: b.id,
                                          which,
                                          commission: op?.commission,
                                          secondary_commission: op?.secondary_commission,
                                        }),
                                      );
                                    }}
                                  >
                                    Confirm
                                  </button>
                                ) : null}
                                {line.status !== 'voided' &&
                                line.kind === 'referral_payable' &&
                                row?.id ? (
                                  <>
                                    <button
                                      className="btn small"
                                      disabled={
                                        !can('manage_commissions') || !(row.payable_now > 0)
                                      }
                                      onClick={() => {
                                        const seeded = buildPayReferralPaymentDefaults({
                                          referral_id: row.id,
                                          payable_now: row.payable_now,
                                          outstanding: row.outstanding,
                                          today,
                                        });
                                        action(
                                          'pay_referral',
                                          seeded
                                            ? {
                                                referral_id: seeded.referral_id,
                                                amount: seeded.amount,
                                                date: seeded.date,
                                              }
                                            : { referral_id: row.id },
                                        );
                                      }}
                                    >
                                      Mark paid
                                    </button>
                                    {can('manage_commissions') &&
                                      s.payableTermsEnabled &&
                                      row.active !== false && (
                                        <button
                                          className="btn small ghost"
                                          onClick={() =>
                                            action('revise_referral', {
                                              ...row,
                                              referral_id: row.id,
                                              basis:
                                                row.calculation === 'fixed'
                                                  ? 'fixed'
                                                  : 'percentage',
                                            })
                                          }
                                        >
                                          Correct terms
                                        </button>
                                      )}
                                  </>
                                ) : null}
                                {line.status !== 'voided' &&
                                line.status !== 'denied' &&
                                line.status !== 'received' &&
                                line.kind === 'price_match' ? (
                                  <>
                                    <button
                                      className="btn small"
                                      onClick={() =>
                                        action('price_match_event', {
                                          booking_id: b.id,
                                          ...(row?.request_id
                                            ? { request_id: row.request_id }
                                            : {}),
                                        })
                                      }
                                    >
                                      Update price match
                                    </button>
                                    <button
                                      className="btn small ghost"
                                      onClick={() =>
                                        action('price_match_event', {
                                          booking_id: b.id,
                                          status: 'Denied',
                                          reason: 'Issuer denied price match',
                                          ...(row?.request_id
                                            ? { request_id: row.request_id }
                                            : {}),
                                        })
                                      }
                                    >
                                      Mark denied
                                    </button>
                                  </>
                                ) : null}
                                {line.status !== 'voided' &&
                                  line.status !== 'received' &&
                                  line.status !== 'denied' &&
                                  src.target_id &&
                                  (() => {
                                    const target_kind =
                                      src.kind === 'expected_primary'
                                        ? 'expected_primary'
                                        : src.kind === 'expected_secondary'
                                          ? 'expected_secondary'
                                          : src.kind === 'standing_deal'
                                            ? 'standing_deal'
                                            : src.kind === 'commission'
                                              ? 'commission'
                                              : src.kind === 'referral'
                                                ? 'referral'
                                                : 'price_match';
                                    return (
                                      <>
                                        {line.kind !== 'price_match' &&
                                          canAction('deny_money_back') && (
                                            <button
                                              className="btn small ghost"
                                              onClick={() =>
                                                action('deny_money_back', {
                                                  booking_id: b.id,
                                                  target_kind,
                                                  target_id: src.target_id,
                                                })
                                              }
                                            >
                                              Mark denied
                                            </button>
                                          )}
                                        {canAction('void_money_back') && (
                                          <button
                                            className="btn small ghost"
                                            onClick={() =>
                                              action('void_money_back', {
                                                booking_id: b.id,
                                                target_kind,
                                                target_id: src.target_id,
                                              })
                                            }
                                          >
                                            Void
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {can('view_sale_price') &&
                    detail.retainedCardFee?.visible &&
                    (() => {
                      const fee = detail.retainedCardFee as {
                        retained_cents: number | null;
                        refunded: boolean;
                        incomplete: boolean;
                      };
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <h4 className="money-back-subhead">Retained card fee</h4>
                          {fee.refunded ? (
                            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                              Card fee was refunded to the customer — nothing retained as profit.
                            </p>
                          ) : (
                            <p style={{ margin: 0, fontSize: 12 }}>
                              Padova keeps{' '}
                              <strong>
                                {fee.incomplete || fee.retained_cents == null
                                  ? 'Incomplete'
                                  : money(fee.retained_cents)}
                              </strong>
                              <small> · Booking profit (card fee not refunded)</small>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  {canRefunds &&
                    s.refunds.some((r: R) => r.booking_id === b.id) && (
                      <>
                        <h4 className="money-back-subhead">Refunds (separate from Money Back)</h4>
                        <ul className="plain-list">
                          {s.refunds
                            .filter((r: R) => r.booking_id === b.id)
                            .map((r: R) => (
                              <li key={r.id}>
                                {(() => {
                                  const supplierStatus = supplierRefundStatus({
                                    supplier_expected: r.supplier_expected,
                                    received: r.received,
                                    received_forms: r.received_forms,
                                  });
                                  const supplierOpen =
                                    Number(r.received) < Number(r.supplier_expected);
                                  const customerStatus = customerRefundStatus(r);
                                  const chargeback = chargebackStatusLabel(
                                    parseChargebackStatus(r.reason) ||
                                      parseChargebackStatus(r.call_notes_latest),
                                  );
                                  return (
                                    <>
                                      Refund · Customer{' '}
                                      {customerRefundStatusLabel(customerStatus)}
                                      {' · '}
                                      Supplier {supplierRefundStatusLabel(supplierStatus)} ·
                                      Expected {refundValue(r, r.supplier_expected)} · Received{' '}
                                      {refundValue(r, r.received)} · Customer due{' '}
                                      {money(r.customer_due)}{' '}
                                      {chargeback ? <small>{chargeback}</small> : null}
                                      <small>
                                        Supplier return form:{' '}
                                        {r.received_forms || 'Not received'}
                                      </small>
                                      {(() => {
                                        const due = refundFollowUpDueOn(r.due_on);
                                        const urg = refundFollowUpUrgency(due, today);
                                        const label = refundFollowUpUrgencyLabel(urg);
                                        if (!due) return null;
                                        return (
                                          <small>
                                            Follow-up {dateLabel(due)}
                                            {label ? ` · ${label}` : ''}
                                          </small>
                                        );
                                      })()}
                                      {r.call_notes_latest ? (
                                        <small>Call note: {r.call_notes_latest}</small>
                                      ) : null}
                                      <button
                                        className="btn small"
                                        disabled={!canAction('receive_refund') || !supplierOpen}
                                        hidden={!supplierOpen}
                                        onClick={() =>
                                          action('receive_refund', { refund_id: r.id })
                                        }
                                      >
                                        Receive
                                      </button>{' '}
                                      <button
                                        className="btn small"
                                        disabled={!canAction('receive_refund') || !supplierOpen}
                                        hidden={!supplierOpen}
                                        onClick={() =>
                                          action('receive_refund', {
                                            refund_id: r.id,
                                            form: SUPPLIER_REFUND_DENIED_FORM,
                                            amount: Math.max(
                                              0,
                                              Number(r.supplier_expected) - Number(r.received),
                                            ),
                                          })
                                        }
                                      >
                                        Deny supplier
                                      </button>{' '}
                                      <button
                                        className="btn small"
                                        disabled={
                                          !canAction('pay_refund') ||
                                          Number(r.paid) + Number(r.handed_over ?? 0) >=
                                            Number(r.customer_due)
                                        }
                                        hidden={
                                          Number(r.paid) + Number(r.handed_over ?? 0) >=
                                          Number(r.customer_due)
                                        }
                                        onClick={() =>
                                          action('pay_refund', { refund_id: r.id })
                                        }
                                      >
                                        Pay customer
                                      </button>{' '}
                                      <button
                                        className="btn small"
                                        disabled={!canAction('note')}
                                        onClick={() =>
                                          action('note', {
                                            call_note: true,
                                            record_type: 'refund',
                                            record_id: r.id,
                                          })
                                        }
                                      >
                                        Call note
                                      </button>
                                    </>
                                  );
                                })()}
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                </div>
              </Card>
            </div>
          )}
          <div className="grid-2">
            {s.actor.role === 'OWNER' && (
              <HistoricalSourceDetails sources={b.itinerary?.historical_sources ?? []} />
            )}
            <Card title="Itinerary versions">
              <div className="section-body">
                {(Array.isArray(detail.revisions) ? detail.revisions : []).map((r: R) => (
                  <details
                    className="optional-section"
                    key={r.id}
                    style={{ margin: '12px 0', fontSize: 12 }}
                  >
                    <summary>
                      Itinerary version {r.revision} · {dateLabel(r.created_at)}
                    </summary>
                    <p style={{ marginTop: 10 }}>
                      {r.snapshot.summary} · {r.snapshot.travel_start} – {r.snapshot.travel_end}
                    </p>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(r.snapshot.itinerary, null, 2)}
                    </pre>
                  </details>
                ))}
                <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
                  Itinerary versions retain the previously saved travel details and confirmations.
                </p>
              </div>
            </Card>
            {(() => {
              const docs = visibleBookingDocuments(b.itinerary?.operational_entry);
              const hiddenDocs = hiddenBookingDocuments(b.itinerary?.operational_entry);
              return (
                <Card
                  title="Documents"
                  count={docs.length}
                  action={
                    canAction('booking_document') ? (
                      <button
                        className="btn small"
                        onClick={() =>
                          action('booking_document', { booking_id: b.id, kind: 'pdf' })
                        }
                      >
                        Add
                      </button>
                    ) : null
                  }
                >
                  <div className="section-body">
                    {!docs.length ? (
                      <p className="muted">
                        Itineraries, screenshots, and PDF links for this booking. Add a link —
                        file upload comes later.
                      </p>
                    ) : (
                      <ul className="plain-list">
                        {docs.map((doc) => (
                          <li key={doc.id}>
                            <strong>{doc.label}</strong>
                            <small>
                              {' '}
                              · {bookingDocumentKindLabel(doc.kind)} · {dateLabel(doc.added_on)}
                            </small>
                            {doc.url ? (
                              <div>
                                <a href={doc.url} target="_blank" rel="noreferrer">
                                  Open link
                                </a>
                              </div>
                            ) : null}
                            {doc.note ? <small>{doc.note}</small> : null}
                            {canAction('booking_document_hide') ? (
                              <button
                                type="button"
                                className="btn small ghost"
                                style={{ marginTop: 6 }}
                                disabled={busy}
                                onClick={() =>
                                  action('booking_document_hide', {
                                    booking_id: b.id,
                                    document_id: doc.id,
                                  })
                                }
                              >
                                Hide
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {hiddenDocs.length > 0 ? (
                      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                        {hiddenDocs.length} hidden document
                        {hiddenDocs.length === 1 ? '' : 's'} (history kept).
                      </p>
                    ) : null}
                  </div>
                </Card>
              );
            })()}
            <Card title="Notes & Activity">
              {[
                ...(Array.isArray(detail.activity) ? detail.activity : []).filter(
                  (a: R) => a.kind !== 'note',
                ),
                ...(Array.isArray(detail.notes) ? detail.notes : []).map((n: R) => ({
                  ...n,
                  note_id: n.id,
                  id: `note:${n.id}`,
                  kind: 'Shared note',
                  shared_note: n.body,
                })),
              ]
                .sort(
                  (a: R, b: R) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
                    a.id.localeCompare(b.id),
                )
                .map((a: R) => (
                  <div className="activity" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      {a.summary || pretty(a.kind)}
                      <p>
                        {dateTimeLabel(a.created_at)} · {a.actor_name ?? a.actor}
                        {a.source_label && !a.shared_note ? (
                          <>
                            {' · '}
                            <Badge
                              tone={
                                a.source_channel === 'whatsapp' || a.source_channel === 'email'
                                  ? 'blue'
                                  : a.source_channel === 'import'
                                    ? 'amber'
                                    : 'gray'
                              }
                            >
                              {a.source_label}
                            </Badge>
                          </>
                        ) : null}
                      </p>
                      {a.shared_note && <p style={{ whiteSpace: 'pre-wrap' }}>{a.shared_note}</p>}
                      {a.reason && <p>{a.reason}</p>}
                      {a.note_id && (
                        <button
                          type="button"
                          className="btn small ghost"
                          style={{ marginTop: 6 }}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await command('note_hide', { note_id: a.note_id });
                              await refresh();
                              setToast('Note hidden. Restore from Recently hidden.');
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Hide
                        </button>
                      )}
                      {s.actor.role === 'OWNER' && !a.shared_note && (
                        <details style={{ marginTop: 8 }}>
                          <summary>View saved event</summary>
                          <pre style={{ maxWidth: 350, overflow: 'auto', fontSize: 10 }}>
                            {JSON.stringify(
                              { before: a.before_value, after: a.after_value },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              {(detail.notesHidden ?? []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 className="money-back-subhead">Recently hidden</h4>
                  <p className="muted" style={{ fontSize: 11 }}>
                    Soft-removed only — restore brings the note back. History stays.
                  </p>
                  <ul className="plain-list">
                    {(detail.notesHidden as R[]).map((n) => (
                      <li key={n.id} className="intake-draft-removed-row">
                        <span>{String(n.body || 'Note').slice(0, 80)}</span>
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await command('note_restore', { note_id: n.id });
                              await refresh();
                              setToast('Note restored.');
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </>
      );
      }
    } else if (selected.type === 'asset') {
      const a = detail.asset;
      const cap1Credit = a.kind === 'Capital One credit';
      const creditVoided = a.credit_status === 'voided' || a.credit_voided;
      const voucherAsset = isVoucherAsset(a.kind);
      const voucherStatus = a.voucher_status as string | null | undefined;
      const voucherTerminal =
        voucherStatus === 'expired' || voucherStatus === 'sold' || voucherStatus === 'used';
      const tradeStatus = parseTradeStatus(a.restrictions);
      const tradeMissing = parseTradeToComplete(a.restrictions);
      view = (
        <>
          <button className="back" onClick={closeRecord}>
            <ChevronLeft size={14} />
            Back to {page}
          </button>
          {heading(
            a.name,
            `${a.kind} · ${a.issuer} · ${a.ownership}`,
            <>
              {tradeStatus ? (
                <Badge tone="green">{tradeStatusLabel(tradeStatus)}</Badge>
              ) : null}
              {tradeMissing.length ? (
                <Badge tone="amber">To complete</Badge>
              ) : null}
              {cap1Credit && a.credit_status ? (
                <Badge tone={creditVoided ? 'amber' : 'green'}>{a.credit_status}</Badge>
              ) : null}
              {voucherAsset && voucherStatus ? (
                <Badge tone={voucherTerminal ? 'amber' : 'green'}>{voucherStatus}</Badge>
              ) : null}
              <Badge>{a.ownership}</Badge>
            </>,
          )}
          <div className="metrics">
            <Metric
              label="Available quantity / face"
              value={assetQuantity(a, a.balance)}
              foot={
                assetUnit(a) === 'count'
                  ? 'Whole certificates / benefits'
                  : isPoints(a)
                    ? 'Whole points'
                    : 'Monetary travel value'
              }
              icon={Ticket}
            />
            {isPoints(a) &&
              (() => {
                const batch = pointsBatchSummary({
                  remaining: a.balance == null ? null : Number(a.balance),
                  remaining_basis_cents:
                    a.remaining_basis == null ? null : Number(a.remaining_basis),
                  opening:
                    a.opening_quantity == null ? null : Number(a.opening_quantity),
                });
                return (
                  <Metric
                    label="Batch used / rate"
                    value={pointsBatchListLabel(batch, (n) => n.toLocaleString('en-US'))}
                    foot="Plan: cost stays on this batch. Unknown opening or basis stays Incomplete."
                    icon={Coins}
                  />
                );
              })()}
            <Metric
              label="Remaining cost basis"
              value={money(a.remaining_basis)}
              foot="Exact acquisition-lot basis"
              icon={Landmark}
            />
            {cap1Credit && detail.credit_profile ? (
              <Metric
                label="Cap1 profile balance"
                value={
                  detail.credit_profile_balance?.incomplete
                    ? 'Incomplete'
                    : money(detail.credit_profile_balance?.balance_cents)
                }
                foot={`${detail.credit_profile.name}${
                  detail.credit_profile_balance?.credit_count != null
                    ? ` · ${countLabel(detail.credit_profile_balance.credit_count, 'credit')}`
                    : ''
                }`}
                icon={CreditCard}
              />
            ) : null}
          </div>
          {cap1Credit ? (
            <Card title="Cap1 credit">
              <div className="section-body">
                <p>
                  Status: <strong>{a.credit_status || 'Unknown'}</strong>
                  {a.source_booking_id ? (
                    <>
                      {' '}
                      · Source booking linked
                      <button
                        type="button"
                        className="btn small ghost"
                        style={{ marginLeft: 8 }}
                        onClick={() => openRecord('booking', a.source_booking_id)}
                      >
                        Open booking
                      </button>
                    </>
                  ) : (
                    <> · Source booking missing</>
                  )}
                </p>
                <p>
                  Account profile:{' '}
                  <strong>{detail.credit_profile?.name || 'Not linked'}</strong>
                  {detail.credit_profile?.provider
                    ? ` · ${detail.credit_profile.provider}`
                    : null}
                </p>
              </div>
            </Card>
          ) : null}
          {voucherAsset ? (
            <Card title="Voucher status">
              <div className="section-body">
                <p>
                  Status: <strong>{voucherStatus || 'Unknown'}</strong>
                  <span className="muted">
                    {' '}
                    · Plan: held → partly used → used | sold | expired
                  </span>
                </p>
              </div>
            </Card>
          ) : null}
          <div className="detail-actions">
            <button
              className="btn"
              onClick={async () => {
                const path = workspaceRecordUrl('asset', a.id);
                await navigator.clipboard.writeText(`${window.location.origin}${path}`);
                setToast('Asset link copied');
              }}
            >
              <Copy size={13} />
              Copy link
            </button>
            {!creditVoided && (
              <button className="btn primary" onClick={() => action('fund', { asset_id: a.id })}>
                Use for booking
              </button>
            )}
            {can('manage_assets') && (
              <button
                className="btn"
                onClick={() =>
                  action('revise_asset', {
                    ...a,
                    asset_id: a.id,
                    expiry_rule: parseExpiryRuleFromRestrictions(a.restrictions) || '',
                  })
                }
              >
                Edit asset details
              </button>
            )}
            {!creditVoided && (
              <button className="btn" onClick={() => action('sell_asset', { asset_id: a.id })}>
                Sell asset
              </button>
            )}
            {!creditVoided && (
              <button
                className="btn"
                onClick={() => action('transfer_asset', { sending_asset_id: a.id })}
              >
                Transfer value
              </button>
            )}
            {!creditVoided && (
              <button className="btn" onClick={() => action('convert_asset', { asset_id: a.id })}>
                Convert into new asset
              </button>
            )}
            {can('manage_assets') && canExpireAsset(a) && (
              <button
                className="btn"
                title={expireAssetLossLabel(
                  a.remaining_basis == null ? null : Number(a.remaining_basis),
                  money,
                )}
                onClick={() => action('expire_asset', buildExpireAssetDefaults(a))}
              >
                Expire unused (loss)
              </button>
            )}
            {cap1Credit && can('manage_assets') && !creditVoided && Number(a.balance) > 0 && (
              <button
                className="btn"
                onClick={() => action('void_credit', { asset_id: a.id })}
              >
                Void unused credit
              </button>
            )}
            <button
              className="btn"
              onClick={() => action('pay_asset_purchase', { asset_id: a.id })}
            >
              Pay acquisition cost
            </button>
            <button
              className="btn"
              onClick={() => action('note', { record_type: 'asset', record_id: a.id })}
            >
              Add note
            </button>
          </div>
          {detail.chain?.steps?.length ? (
            <div className="detail-section">
              <Card title="Voucher / credit chain">
                <div className="section-body">
                  {detail.chain.incomplete ? (
                    <p className="note">Some chain amounts are unknown — result is incomplete.</p>
                  ) : null}
                  <ul className="plain-list asset-chain-list">
                    {detail.chain.steps.map((step: R, i: number) => (
                      <li key={`${step.kind}-${i}`}>
                        <strong>{step.label}</strong>
                        {step.date ? <small> · {dateLabel(step.date)}</small> : null}
                        {step.note ? <small> · {step.note}</small> : null}
                        {step.amount_cents != null ? (
                          <span className="money"> · {money(step.amount_cents)}</span>
                        ) : step.kind === 'net' || step.kind === 'price_match' ? (
                          <span className="money"> · Unknown</span>
                        ) : null}
                        <div className="heading-actions" style={{ marginTop: 6 }}>
                          {step.booking_id ? (
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() => openRecord('booking', step.booking_id)}
                            >
                              Open booking
                            </button>
                          ) : null}
                          {step.asset_id && step.asset_id !== a.id ? (
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() => openRecord('asset', step.asset_id)}
                            >
                              Open asset
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>
          ) : null}
          <div className="detail-section">
            <Card title="Asset ledger">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Movement</th>
                      <th>Booking</th>
                      <th className="money">
                        {assetUnit(a) === 'count'
                          ? 'Certificate count'
                          : isPoints(a)
                            ? 'Points'
                            : 'Face amount (USD)'}
                      </th>
                      <th className="money">Cost basis movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.movements.map((m: R) => (
                      <tr key={m.id}>
                        <td>{dateLabel(m.effective_on)}</td>
                        <td>
                          {pretty(m.kind)}
                          <small>Lot {m.lot_id.slice(0, 8)}</small>
                        </td>
                        <td>
                          {m.booking_id ? (
                            <button
                              className="booking-code"
                              onClick={() => openRecord('booking', m.booking_id)}
                            >
                              {m.code}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="money">{assetQuantity(a, m.quantity)}</td>
                        <td className="money">{money(m.basis)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <div className="grid-2">
            <Card title="Acquisition lots & sales">
              <div className="section-body">
                <ul className="plain-list">
                  {detail.lots.map((l: R) => (
                    <li key={l.id}>
                      {dateLabel(l.acquired_on)} · {assetQuantity(a, l.quantity)} · Cost{' '}
                      {money(l.cost)}
                      <small style={{ display: 'block', marginTop: 8 }} title={l.id}>
                        Lot {l.id.slice(0, 8)}
                      </small>
                    </li>
                  ))}
                  {detail.sales.map((sale: R) => {
                    const econ = assetSaleEconomics({
                      quantity: sale.quantity,
                      proceeds: sale.proceeds,
                      basis: sale.basis,
                      face_cents: a.kind === 'Voucher' || /voucher/i.test(String(a.kind || ''))
                        ? a.opening ?? a.balance
                        : null,
                    });
                    return (
                      <li key={sale.id}>
                        Sold to {sale.buyer}
                        {econ.quantity != null ? (
                          <>
                            {' · '}
                            {assetQuantity(a, econ.quantity)}
                          </>
                        ) : null}
                        {' · '}
                        Proceeds{' '}
                        {econ.proceeds_cents == null ? 'Unknown' : money(econ.proceeds_cents)}
                        {' · '}
                        Cost{' '}
                        {econ.cost_cents == null ? 'Unknown' : money(econ.cost_cents)}
                        {' · '}
                        {econ.incomplete || econ.gain_loss_cents == null ? (
                          <strong>Incomplete</strong>
                        ) : (
                          <>
                            <strong>
                              {econ.result_label} {money(Math.abs(econ.gain_loss_cents))}
                            </strong>
                            {econ.sold_below_face ? (
                              <small> · sold below face value</small>
                            ) : null}
                          </>
                        )}
                        <small style={{ display: 'block', marginTop: 4 }}>
                          Received {money(sale.received)}
                        </small>
                        {Number(sale.received) < Number(sale.proceeds) && (
                          <button
                            className="btn small"
                            style={{ marginTop: 9 }}
                            onClick={() => action('receive_asset_sale', { sale_id: sale.id })}
                          >
                            Record sale receipt
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
            <Card title="Source & restrictions">
              <div className="section-body">
                <p>
                  {isTravelerLockedVoucher(a)
                    ? voucherLockDisplayLabel(person(a.holder_id))
                    : `Holder: ${person(a.holder_id)}`}
                </p>
                <p className="subtitle">Seller: {person(a.seller_id)}</p>
                {pointsOwningAccountLabel(detail.owning_account) ? (
                  <p className="subtitle">
                    Owning account: {pointsOwningAccountLabel(detail.owning_account)}
                  </p>
                ) : /point|mile/i.test(String(a.kind || '')) ? (
                  <p className="subtitle">Owning account: Not linked</p>
                ) : null}
                <p className="subtitle">
                  {a.expires_on ? `Expires ${dateLabel(a.expires_on)}` : 'No expiration recorded'}
                </p>
                {parseExpiryRuleFromRestrictions(a.restrictions) ? (
                  <p className="subtitle">
                    Expiry rule: {parseExpiryRuleFromRestrictions(a.restrictions)}
                  </p>
                ) : null}
                {pointsBatchSourceLabel(
                  parsePointsBatchSourceFromRestrictions(a.restrictions),
                ) ? (
                  <p className="subtitle">
                    Points source:{' '}
                    {pointsBatchSourceLabel(
                      parsePointsBatchSourceFromRestrictions(a.restrictions),
                    )}
                  </p>
                ) : null}
                <p className="subtitle">{a.restrictions || 'No restrictions recorded'}</p>
                {tradeStatus && (
                  <p className="subtitle">
                    Trade status: <strong>{tradeStatusLabel(tradeStatus)}</strong>
                    <span className="muted"> · Plan: offered · agreed · paid · delivered</span>
                  </p>
                )}
                {tradeMissing.length ? (
                  <p className="subtitle">
                    To complete: <strong>{tradeMissing.join(' · ')}</strong>
                    <span className="muted"> · not a warning — layer-1 already saved</span>
                  </p>
                ) : null}
                {a.source_booking_id && (
                  <button
                    className="btn ghost"
                    style={{ marginTop: 15 }}
                    onClick={() => openRecord('booking', a.source_booking_id)}
                  >
                    Source booking <ArrowRight size={12} />
                  </button>
                )}
                {detail.notes.map((n: R) => (
                  <div className="note" key={n.id}>
                    {n.body}
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ marginLeft: 8 }}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await command('note_hide', { note_id: n.id });
                          await refresh();
                          setToast('Note hidden. Restore from Recently hidden.');
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Hide
                    </button>
                  </div>
                ))}
                {(detail.notesHidden ?? []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 className="money-back-subhead">Recently hidden</h4>
                    {(detail.notesHidden as R[]).map((n) => (
                      <div className="note" key={n.id}>
                        <span>{String(n.body || 'Note').slice(0, 80)}</span>
                        <button
                          type="button"
                          className="btn small"
                          style={{ marginLeft: 8 }}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await command('note_restore', { note_id: n.id });
                              await refresh();
                              setToast('Note restored.');
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      );
    } else {
      const p = detail.person,
        related = bks.filter(
          (b) =>
            b.customer_id === p.id ||
            (detail.sourceBookingIds ?? []).includes(b.id) ||
            s.travelerLinks.some((t: R) => t.booking_id === b.id && t.person_id === p.id),
        );
      const pp = s.payments.filter((r: R) => r.party_id === p.id && r.direction === 'customer');
      const heldCredit = heldCustomerCreditCents(pp, p.id);
      const isSource =
        p.roles.some((role: string) =>
          ['seller', 'supplier', 'source', 'partner'].includes(role),
        ) || p.kind === 'supplier';
      /** Seller payment / Purchased From — not referral partners alone. */
      const canPayAsSeller = eligibleParty(p, 'seller');
      const sourceRows = detail.sourceStatement ?? [];
      const members = s.relationships.filter((r: R) => r.group_id === p.id || r.person_id === p.id);
      const entries: R[] = (detail.statement ?? []).map((r: R) => ({
        ...r,
        debit: Number(r.debit),
        credit: Number(r.credit),
      }));
      let running = 0;
      view = (
        <>
          <button className="back" onClick={closeRecord}>
            <ChevronLeft size={14} />
            Back to {page}
          </button>
          {heading(
            p.name,
            `${pretty(p.kind)} · ${p.email || p.phone || 'No contact information'}`,
            <Badge>{(p.roles ?? []).join(' · ') || p.kind}</Badge>,
          )}
          {Array.isArray(p.details?.merge_history) && p.details.merge_history.length > 0 && (
            <p className="note">
              Merged into this record:{' '}
              {(p.details.merge_history as Array<{ merged_name?: string; date?: string }>)
                .map((m) =>
                  m.merged_name
                    ? `${m.merged_name}${m.date ? ` (${m.date})` : ''}`
                    : null,
                )
                .filter(Boolean)
                .join('; ') || 'prior duplicates'}
              .
            </p>
          )}
          {p.roles.includes('referrer') && (
            <p className="note">
              Referrer default share:{' '}
              {formatReferralRateLabel(partyReferralRateBps(p))} of profit (edit profile to
              change; blank stays Unknown).
            </p>
          )}
          {partyStandingDeals(p).length > 0 && (
            <p className="note">
              Standing deals (seed onto matching new bookings):{' '}
              {partyStandingDeals(p)
                .filter((d) => d.active)
                .map((d) => formatStandingDealLabel(d))
                .join('; ') || 'none active'}
              . Cadence ☐ Owner-open — expected Money Back only.
            </p>
          )}
          {p.details?.test_reference_only && (
            <div className="note">
              SOURCE REFERENCE ONLY · No historical balance or transactions loaded. Directory
              names/relationships are not approved live identities.
            </div>
          )}
          <div className="detail-actions">
            <button
              className="btn"
              onClick={() =>
                action('edit_party', {
                  ...p,
                  party_id: p.id,
                  roles: p.roles.join(', '),
                  travel_rules: p.details?.travel_rules ?? '',
                })
              }
            >
              Edit profile / rules
            </button>
            {p.kind === 'person' && canAction('merge_party') && (
              <button
                className="btn"
                onClick={() =>
                  action('merge_party', {
                    keep_id: p.id,
                  })
                }
              >
                Merge duplicate into this person
              </button>
            )}
            <button
              className="btn"
              onClick={() =>
                action(
                  'booking',
                  p.roles.includes('customer')
                    ? { customer_id: p.id }
                    : p.roles.includes('traveler')
                      ? { traveler_ids: [p.id] }
                      : p.roles.includes('seller')
                        ? {
                            components: [
                              {
                                type: 'Outside seller',
                                seller_id: p.id,
                                supplied: 'Complete Booking / Ticket',
                                payment_status: 'Unpaid',
                                unit: 'money',
                              },
                            ],
                          }
                        : {},
                )
              }
            >
              <Plus size={14} />
              New booking
            </button>
            {canPay && (p.roles.includes('customer') || !canPayAsSeller) && (
              <button className="btn" onClick={() => action('payment', { party_id: p.id })}>
                Add payment
              </button>
            )}
            {canPay && p.roles.includes('customer') && (
              <button
                className="btn"
                onClick={() =>
                  action('payment', {
                    party_id: p.id,
                    direction: 'customer',
                    method: 'Zelle',
                    reference: 'Customer deposit',
                  })
                }
                title="Record money held before a booking (leave unallocated)"
              >
                Record deposit
              </button>
            )}
            {canPay && p.roles.includes('customer') && heldCredit > 0 && canAction('allocate') && (
              <button
                className="btn"
                title="Apply oldest held credit to the oldest booking that still owes"
                onClick={() => {
                  const target = pickBookingForHeldCreditApply(related);
                  if (!target) {
                    setToast('No open booking balance to apply held credit to.');
                    return;
                  }
                  const apply = buildApplyHeldCreditDefaults({
                    payments: s.payments,
                    partyId: p.id,
                    bookingId: target.id,
                    bookingBalanceCents: target.balance_cents,
                  });
                  if (!apply) {
                    setToast('No held credit available to allocate.');
                    return;
                  }
                  action('allocate', {
                    payment_id: apply.payment_id,
                    booking_id: apply.booking_id,
                    amount: apply.amount,
                  });
                }}
              >
                Apply held credit
              </button>
            )}
            {canPay && p.roles.includes('customer') && heldCredit > 0 && (
              <button
                className="btn"
                onClick={() =>
                  action('return_customer_credit', {
                    party_id: p.id,
                    amount: heldCredit / 100,
                    method: 'Zelle',
                  })
                }
              >
                Return held credit
              </button>
            )}
            {can('view_sale_price') && p.roles.includes('customer') && (
              <button
                className="btn"
                onClick={() => {
                  const bookings = (detail.invoiceBookings ?? []) as R[];
                  if (!bookings.length) {
                    setToast('No bookings to invoice for this customer yet.');
                    return;
                  }
                  setInvoicePreview({
                    customer_id: p.id,
                    preview: buildInvoicePreview({
                      customer_name: p.name,
                      bookings: bookings.map((b) => ({
                        id: b.id,
                        code: b.code,
                        summary: b.summary,
                        product: b.product,
                        sale: b.sale == null ? null : Number(b.sale),
                        taxes: b.taxes == null ? null : Number(b.taxes),
                        charges: Array.isArray(b.charges) ? b.charges : [],
                      })),
                      payment: pickInvoicePaymentReceipt({
                        payments: (s.payments ?? []).filter((pay: R) => pay.party_id === p.id),
                        payment_accounts: s.paymentAccounts ?? [],
                      }),
                    }),
                  });
                }}
              >
                Preview invoice
              </button>
            )}
            {can('view_sale_price') &&
              (p.roles.includes('customer') || entries.length > 0) && (
                <button
                  className="btn"
                  onClick={() => {
                    setStatementPreview(
                      buildCustomerStatementPreview({
                        customer_name: p.name,
                        as_of: today,
                        entries: entries.map((r) => ({
                          date: r.date,
                          label: r.label,
                          debit: r.debit,
                          credit: r.credit,
                        })),
                      }),
                    );
                  }}
                >
                  Preview statement
                </button>
              )}
            {canPayAsSeller && can('manage_funding') && (
              <button
                className="btn"
                onClick={() => action('payment', { party_id: p.id, direction: 'supplier' })}
              >
                Pay seller / supplier
              </button>
            )}
            <button
              className="btn"
              onClick={() =>
                action(
                  'relationship',
                  p.kind === 'person' ? { person_id: p.id } : { group_id: p.id },
                )
              }
            >
              Link family / company
            </button>
            <button
              className="btn"
              onClick={() => action('note', { record_type: 'party', record_id: p.id })}
            >
              Add note
            </button>
            {p.kind === 'person' && can('view_traveler_sensitive') && (
              <button
                className="btn"
                onClick={() => action('traveler', { ...detail.privateData, person_id: p.id })}
              >
                Edit traveler details
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                const path = workspaceRecordUrl('person', p.id);
                await navigator.clipboard.writeText(`${window.location.origin}${path}`);
                setToast('Person link copied');
              }}
            >
              <Copy size={13} />
              Copy link
            </button>
            <button
              className="btn"
              onClick={async () => {
                const names =
                  p.kind === 'family'
                    ? members
                        .filter((r: R) => r.group_id === p.id)
                        .map((r: R) => person(r.person_id))
                        .join('\n')
                    : p.name;
                await navigator.clipboard.writeText(names);
                setToast('Names copied. Sensitive details omitted.');
              }}
            >
              <Copy size={13} />
              Copy {p.kind === 'family' ? 'family' : 'name'}
            </button>
            {detail.privateData && (
              <button
                className="btn"
                onClick={async () => {
                  const v = detail.privateData;
                  await navigator.clipboard.writeText(
                    `${v.last_name}, ${v.legal_first} ${v.middle_name ?? ''}\n${v.dob ? 'DOB: ' + v.dob + '\n' : ''}${v.ktn ? 'KTN: ' + v.ktn + '\n' : ''}${v.memberships.map((m: R) => `${m.program}: ${m.number}`).join('\n')}`,
                  );
                  setToast('Saved traveler details copied.');
                }}
              >
                <Copy size={13} />
                Copy booking details (sensitive)
              </button>
            )}
          </div>
          <div className="grid-2">
            <Card title="Relationships & preferences">
              <div className="section-body">
                {members.length ? (
                  members.map((r: R) => (
                    <button
                      key={r.id}
                      className="note"
                      style={{ display: 'block', width: '100%', textAlign: 'left' }}
                      onClick={() =>
                        openRecord('person', r.person_id === p.id ? r.group_id : r.person_id)
                      }
                    >
                      {person(r.person_id === p.id ? r.group_id : r.person_id)} · {r.relationship}
                      {r.relationship === 'employee' &&
                        (() => {
                          const employee = parties.find((person) => person.id === r.person_id);
                          const company = parties.find((person) => person.id === r.group_id);
                          const assigned = employee?.details?.company_policies?.[r.group_id] ?? {};
                          const defaults = company?.details?.corporate_policy ?? {};
                          return (
                            <small>
                              Purchasing Tier {assigned.tier ?? defaults.tier ?? 'not assigned'} ·
                              Comfort Level{' '}
                              {assigned.comfort_level ?? defaults.comfort_level ?? 'not assigned'}
                            </small>
                          );
                        })()}
                      <ChevronRight size={12} />
                    </button>
                  ))
                ) : (
                  <p className="muted">No family or company linked.</p>
                )}
                {Object.entries(p.details ?? {})
                  .filter(
                    ([k]) =>
                      ![
                        'source_provenance',
                        'test_reference_only',
                        'identity_status',
                        'corporate_policy',
                        'company_policies',
                        'merge_history',
                        'merged_into',
                        'merged_at',
                        'merged_by',
                        'merge_reason',
                        'merge_command_id',
                        'standing_deals',
                      ].includes(k),
                  )
                  .map(([k, v]) => (
                    <p style={{ fontSize: 12, marginTop: 12 }} key={k}>
                      {pretty(k)}:{' '}
                      {Array.isArray(v)
                        ? v.join(', ')
                        : typeof v === 'object'
                          ? JSON.stringify(v)
                          : String(v)}
                    </p>
                  ))}
                {p.details?.corporate_policy && (
                  <p className="note">
                    Company defaults: Purchasing Tier{' '}
                    {p.details.corporate_policy.tier ?? 'not assigned'} · Comfort Level{' '}
                    {p.details.corporate_policy.comfort_level ?? 'not assigned'}. Employee
                    assignments may override each independently.
                  </p>
                )}
                {p.details?.source_provenance?.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary>Source references ({p.details.source_provenance.length})</summary>
                    <p className="muted">
                      Original workbook/tab/row or preserved evidence identifiers are retained with
                      this reference profile. This is not a verified historical account.
                    </p>
                  </details>
                )}
                {detail.privateData && (
                  <div className="note">
                    Traveler details protected by sensitive-data permission.
                    <p style={{ marginTop: 10 }}>
                      DOB: {detail.privateData.dob ?? 'Not recorded'} · KTN:{' '}
                      {detail.privateData.ktn ? 'Recorded' : 'Not recorded'}
                    </p>
                    <p style={{ marginTop: 7 }}>
                      Preferences:{' '}
                      {Object.entries(detail.privateData.preferences)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ') || 'None'}
                    </p>
                  </div>
                )}
              </div>
            </Card>
            <Card title="Account overview">
              <div className="section-body">
                <div className="detail-label">
                  {isSource && !p.roles.includes('customer')
                    ? 'Recorded source balance'
                    : 'Customer account balance'}
                </div>
                <div className="metric-value">
                  {money(
                    isSource && !p.roles.includes('customer')
                      ? canCosts || canAssetBasis
                        ? sourceRows.reduce(
                            (a: number, r: R) => a + Number(r.credit) - Number(r.debit),
                            0,
                          )
                        : undefined
                      : canSale
                        ? entries.reduce((a, r) => a + r.debit - r.credit, 0)
                        : undefined,
                  )}
                </div>
                {p.roles.includes('customer') &&
                  canSale &&
                  (() => {
                    const o = partyCustomerOwes(bks, p.id);
                    return (
                      <>
                        <div className="detail-label" style={{ marginTop: 12 }}>
                          Still owes (open bookings)
                        </div>
                        <div
                          className="metric-value"
                          style={{
                            color:
                              o.owed_cents != null && o.owed_cents > 0 ? '#ae8553' : undefined,
                          }}
                        >
                          {customerOwesListLabel(o, money)}
                        </div>
                        <p className="muted" style={{ fontSize: 11 }}>
                          Positive unpaid balances on this customer’s bookings. Incomplete when any
                          booking AR is Unknown — never shown as $0.
                        </p>
                      </>
                    );
                  })()}
                {p.roles.includes('customer') && canPay && (
                  <>
                    <div className="detail-label" style={{ marginTop: 12 }}>
                      Held credit (wallet)
                    </div>
                    <div className="metric-value" style={{ color: heldCredit > 0 ? '#2f6b4f' : undefined }}>
                      {money(heldCredit)}
                    </div>
                    <p className="muted" style={{ fontSize: 11 }}>
                      Deposits and unallocated receipts Padova holds. Use Apply held credit on a
                      booking (or here), or Return held credit as a payment out.
                    </p>
                  </>
                )}
                <p className="muted" style={{ fontSize: 11 }}>
                  {isSource && !p.roles.includes('customer')
                    ? 'Authorized booking payables and inventory purchases, less recorded payments and corrections. Negative amounts represent a seller advance or credit.'
                    : 'Charges less all receipts. Negative amounts represent credit or refund liability. Traveler-only bookings remain billed to their responsible customer.'}
                </p>
                {detail.notes.map((n: R) => (
                  <div className="note" key={n.id}>
                    {n.body}
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ marginLeft: 8 }}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await command('note_hide', { note_id: n.id });
                          await refresh();
                          setToast('Note hidden. Restore from Recently hidden.');
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Hide
                    </button>
                  </div>
                ))}
                {(detail.notesHidden ?? []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 className="money-back-subhead">Recently hidden</h4>
                    {(detail.notesHidden as R[]).map((n) => (
                      <div className="note" key={n.id}>
                        <span>{String(n.body || 'Note').slice(0, 80)}</span>
                        <button
                          type="button"
                          className="btn small"
                          style={{ marginLeft: 8 }}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await command('note_restore', { note_id: n.id });
                              await refresh();
                              setToast('Note restored.');
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
          {isSource && (canCosts || canAssetBasis) && (
            <Card title="Seller / supplier statement">
              <SourceAccount
                rows={sourceRows}
                payments={s.payments.filter(
                  (r: R) =>
                    r.party_id === p.id && ['supplier', 'asset_purchase'].includes(r.direction),
                )}
                assets={
                  canAssetBasis
                    ? s.assets.filter((a: R) => a.seller_id === p.id && a.ownership === 'Padova')
                    : []
                }
                open={openRecord}
              />
            </Card>
          )}
          <div className="detail-section">
            <Card title="Related bookings" count={related.length}>
              {bookingTable(related)}
            </Card>
          </div>
          {(canPay || canSale) &&
            p.roles.includes('customer') &&
            (() => {
              const paySummary = customerPaymentsForParty(
                paymentRows,
                p.id,
                Array.isArray(s.customerPaymentAllocations) ? s.customerPaymentAllocations : [],
                cardFeeCentsByPaymentId(
                  Array.isArray(s.customerPaymentCardFees) ? s.customerPaymentCardFees : [],
                ),
              );
              const personDupPeers = possibleDuplicatePaymentPeers(
                paymentRows.filter(
                  (r: R) => r.party_id === p.id && r.direction === 'customer',
                ),
              );
              return (
                <Card title="Payments & allocations" count={paySummary.rows.length}>
                  {paySummary.rows.length === 0 ? (
                    <p className="note">
                      No customer receipts yet for this person. Record a payment, then Allocate
                      across bookings when money is left.
                    </p>
                  ) : (
                    <>
                      <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                        Received{' '}
                        {paySummary.received_cents == null
                          ? 'Incomplete'
                          : money(paySummary.received_cents)}
                        {' · '}
                        Allocated{' '}
                        {paySummary.allocated_cents == null
                          ? 'Incomplete'
                          : money(paySummary.allocated_cents)}
                        {' · '}
                        Left{' '}
                        {paySummary.unallocated_cents == null
                          ? 'Incomplete'
                          : paySummary.unallocated_cents === 0
                            ? 'Fully allocated'
                            : money(paySummary.unallocated_cents)}
                        {paySummary.incomplete ? ' · Some amounts Unknown' : ''}
                      </p>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Method / reference</th>
                              <th className="money">Amount</th>
                              <th className="money">Unallocated</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {paySummary.rows.map((row) => (
                              <Fragment key={row.id}>
                                <tr>
                                  <td>{row.paid_on ? dateLabel(row.paid_on) : '—'}</td>
                                  <td>
                                    {row.method}
                                    <small>{row.reference}</small>
                                    {paymentLooksRepeated(row.id, personDupPeers) ? (
                                      <small>
                                        <Badge tone="amber">
                                          {paymentLooksRepeatedLabel(
                                            personDupPeers.get(row.id)?.length ?? 0,
                                          )}
                                        </Badge>
                                      </small>
                                    ) : null}
                                  </td>
                                  <td className="money">
                                    {row.amount_cents == null
                                      ? 'Unknown'
                                      : money(row.amount_cents)}
                                  </td>
                                  <td className="money">
                                    {paymentUnallocatedColumnLabel(
                                      {
                                        direction: 'customer',
                                        current_amount: row.amount_cents,
                                        allocated: row.allocated_cents,
                                        commission_allocated: 0,
                                      },
                                      money,
                                    )}
                                  </td>
                                  <td>
                                    {canPay && row.status === 'open' ? (
                                      <button
                                        type="button"
                                        className="btn small"
                                        onClick={() =>
                                          action('allocate', { payment_id: row.id })
                                        }
                                      >
                                        Allocate
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                                {row.lines.length > 0 ||
                                (row.card_fee_cents != null && row.card_fee_cents > 0) ||
                                (row.unallocated_cents != null &&
                                  row.unallocated_cents > 0 &&
                                  row.amount_cents != null &&
                                  row.unallocated_cents === row.amount_cents) ? (
                                  <tr className="sub">
                                    <td></td>
                                    <td colSpan={4}>
                                      {row.lines.length > 0 ||
                                      (row.card_fee_cents != null && row.card_fee_cents > 0) ? (
                                        <ul
                                          className="muted"
                                          style={{
                                            margin: '0 0 6px',
                                            paddingLeft: 16,
                                            fontSize: 11,
                                            listStyle: 'disc',
                                          }}
                                        >
                                          {row.card_fee_cents != null &&
                                          row.card_fee_cents > 0 ? (
                                            <li>
                                              Card fee (separate) · {money(row.card_fee_cents)}
                                            </li>
                                          ) : null}
                                          {row.lines.map((line) => (
                                            <li key={line.id}>
                                              <button
                                                type="button"
                                                className="linkish"
                                                style={{
                                                  background: 'none',
                                                  border: 0,
                                                  padding: 0,
                                                  cursor: 'pointer',
                                                  font: 'inherit',
                                                  color: 'inherit',
                                                  textDecoration: 'underline',
                                                }}
                                                onClick={() =>
                                                  openRecord('booking', line.booking_id)
                                                }
                                              >
                                                {line.booking_label}
                                              </button>
                                              {' · '}
                                              {line.amount_cents == null
                                                ? 'Unknown'
                                                : money(line.amount_cents)}
                                            </li>
                                          ))}
                                          {row.unallocated_cents != null &&
                                          row.unallocated_cents > 0 ? (
                                            <li>
                                              Remainder left · {money(row.unallocated_cents)}
                                            </li>
                                          ) : null}
                                        </ul>
                                      ) : (
                                        <span className="muted" style={{ fontSize: 11 }}>
                                          No booking lines yet · full amount left to allocate
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>
              );
            })()}
          {can('view_sale_price') && p.roles.includes('customer') && (
            <Card
              title="Invoices"
              count={(detail.invoiceDrafts ?? []).length}
            >
              {!detail.invoiceDraftsEnabled ? (
                <p className="note">
                  Invoice drafts table is not installed in this workspace yet. Preview still works;
                  Save draft needs the extension.
                </p>
              ) : (detail.invoiceDrafts ?? []).length === 0 ? (
                <p className="note">
                  No saved drafts yet. Use Preview invoice → Save draft. Owner marks previewed, then
                  emails the customer (or marks sent without email). Nothing is sent automatically.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Status</th>
                        <th className="money">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.invoiceDrafts as R[]).map((inv) => (
                        <tr
                          key={inv.id}
                          id={`invoice-row-${inv.id}`}
                          className={focusInvoiceId === inv.id ? 'is-focused' : undefined}
                        >
                          <td>{dateLabel(String(inv.created_at).slice(0, 10))}</td>
                          <td>
                            {invoiceStatusLabel(inv.status)}
                            {inv.incomplete ? ' · incomplete' : ''}
                          </td>
                          <td className="money">
                            {inv.total_cents == null ? 'Unknown' : money(Number(inv.total_cents))}
                          </td>
                          <td className="row-actions">
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={async () => {
                                const path = workspaceInvoiceUrl(p.id, inv.id);
                                await navigator.clipboard.writeText(
                                  `${window.location.origin}${path}`,
                                );
                                setFocusInvoiceId(inv.id);
                                setToast('Invoice link copied');
                                if (typeof window !== 'undefined') {
                                  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                                  if (current !== path)
                                    window.history.replaceState(null, '', path);
                                }
                              }}
                            >
                              Copy link
                            </button>
                            {s.actor.role === 'OWNER' && canApproveInvoice(inv.status) && (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || invoiceBusy}
                                onClick={() =>
                                  perform('invoice_approve', { invoice_id: inv.id })
                                }
                              >
                                Mark previewed
                              </button>
                            )}
                            {s.actor.role === 'OWNER' && canSendInvoiceEmail(inv.status) && (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || invoiceBusy}
                                onClick={async () => {
                                  setInvoiceBusy(true);
                                  try {
                                    const r = await fetch('/api/invoices/send', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        invoice_id: inv.id,
                                        prepare_whatsapp_copy: true,
                                      }),
                                    });
                                    const json = await r.json().catch(() => ({}));
                                    if (!r.ok) throw new Error(json.error || 'Invoice send failed');
                                    const wa = json.result?.whatsapp_copy;
                                    if (wa) {
                                      try {
                                        await navigator.clipboard.writeText(wa);
                                        setToast(
                                          `Emailed ${json.result.sent_to}. Owner WhatsApp copy on clipboard.`,
                                        );
                                      } catch {
                                        setToast(`Emailed ${json.result.sent_to}.`);
                                      }
                                    } else {
                                      setToast(`Emailed ${json.result?.sent_to || 'customer'}.`);
                                    }
                                    await refresh();
                                    if (selected) await openRecord(selected.type, selected.id);
                                  } catch (e) {
                                    setError((e as Error).message);
                                  } finally {
                                    setInvoiceBusy(false);
                                  }
                                }}
                              >
                                Email customer
                              </button>
                            )}
                            {s.actor.role === 'OWNER' && canMarkInvoiceSent(inv.status) && (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || invoiceBusy}
                                onClick={() =>
                                  perform('invoice_mark_sent', {
                                    invoice_id: inv.id,
                                    note: 'Marked sent without system email',
                                  })
                                }
                              >
                                Mark sent (no email)
                              </button>
                            )}
                            {s.actor.role === 'OWNER' && canSendInvoiceEmail(inv.status) && (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || invoiceBusy}
                                title="Clipboard only — WhatsApp helper never sends"
                                onClick={async () => {
                                  try {
                                    const preview = {
                                      customer_name: inv.customer_name || p.name,
                                      lines: Array.isArray(inv.lines) ? inv.lines : [],
                                      subtotal_cents:
                                        inv.total_cents == null ? null : Number(inv.total_cents),
                                      total_cents:
                                        inv.total_cents == null ? null : Number(inv.total_cents),
                                      incomplete: Boolean(inv.incomplete),
                                      payment: null,
                                    } as InvoicePreview;
                                    await navigator.clipboard.writeText(
                                      formatInvoiceWhatsAppOwnerCopy(preview),
                                    );
                                    setToast('Owner WhatsApp copy on clipboard (not auto-sent).');
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              >
                                Copy WhatsApp
                              </button>
                            )}
                            {s.actor.role === 'OWNER' && canVoidInvoice(inv.status) && (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy || invoiceBusy}
                                onClick={() => {
                                  const reason = window.prompt('Void reason (required)');
                                  if (!reason?.trim()) return;
                                  void perform('invoice_void', {
                                    invoice_id: inv.id,
                                    reason: reason.trim(),
                                  });
                                }}
                              >
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          {(p.roles.includes('customer') || !isSource || entries.length > 0) && (
            <Card
              title="Running customer statement"
              action={
                <div className="heading-actions">
                  {can('view_sale_price') && (
                    <button
                      className="btn ghost"
                      onClick={() =>
                        setStatementPreview(
                          buildCustomerStatementPreview({
                            customer_name: p.name,
                            as_of: today,
                            entries: entries.map((r) => ({
                              date: r.date,
                              label: r.label,
                              debit: r.debit,
                              credit: r.credit,
                            })),
                          }),
                        )
                      }
                    >
                      Preview
                    </button>
                  )}
                  <button
                    className="btn ghost"
                    onClick={() => downloadCSV(`${p.name}-statement.csv`, entries)}
                  >
                    <Download size={13} />
                    Export CSV
                  </button>
                </div>
              }
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="money">Charge</th>
                      <th className="money">Payment</th>
                      <th className="money">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((r, i) => {
                      running += r.debit - r.credit;
                      return (
                        <tr key={i}>
                          <td>{dateLabel(r.date)}</td>
                          <td>{r.label}</td>
                          <td className="money">{money(r.debit)}</td>
                          <td className="money">{money(r.credit)}</td>
                          <td className="money">{money(running)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="statement-balance">
                <span>Closing balance</span>
                <span>{money(canSale ? running : undefined)}</span>
              </div>
            </Card>
          )}
        </>
      );
    }
  } else if (page === 'Partnerships') {
    view = <Partnerships />;
  } else if (page === 'Dashboard') {
    const todoItems = planTodosAll.slice(0, 12);
    const profitTotals = canTotalProfit
      ? dashboardProfitTotals(
          bks.map((b) => ({
            profit: b.profit == null ? null : Number(b.profit),
            expected_commission:
              b.expected_commission == null ? null : Number(b.expected_commission),
            received_commission:
              b.received_commission == null ? null : Number(b.received_commission),
            cost_incomplete: b.profit == null,
            reservation_status: b.reservation_status,
          })),
        )
      : null;
    view = (
      <div className="dashboard-page">
        {heading(
          'Your business, at a glance.',
          `A clear view of your travel operations. ${dateLabel(today, { weekday: 'long', month: 'long', day: 'numeric' })}.`,
          <>
            <button className="btn date-btn" onClick={() => go('Calendar')}>
              <CalendarDays size={14} />
              {dateLabel(today, { month: 'long', year: 'numeric' })}
            </button>
            {newButton('New booking', 'booking')}
          </>,
        )}
        <div
          className={`metrics${
            canTotalProfit ? (canAssetBasis ? ' metrics-6' : ' metrics-5') : canAssetBasis ? ' metrics-5' : ' metrics-4'
          }`}
        >
          <Metric
            label="Active bookings"
            value={String(bks.filter((b) => b.reservation_status === 'Booked').length)}
            foot="Operational reservations"
            icon={Plane}
          />
          <Metric
            label="Traveling today"
            value={String(todayTravelAll.length)}
            foot="Live travel records"
            icon={Plane}
          />
          <Metric
            label="Upcoming travel"
            value={String(upcomingAll.length)}
            foot="Next 7 days"
            icon={CalendarDays}
          />
          <Metric
            label="Open tasks"
            value={String(taskRows.filter((t: R) => t.status === 'Open').length)}
            foot="Team follow-ups"
            icon={ClipboardList}
          />
          {canTotalProfit && profitTotals && (
            <>
              <Metric
                label="Confirmed profit"
                value={
                  profitTotals.confirmed_cents == null
                    ? 'Incomplete'
                    : money(profitTotals.confirmed_cents)
                }
                foot={
                  profitTotals.incomplete
                    ? 'Some bookings incomplete — not a $0 total'
                    : 'Certain money and credits'
                }
                icon={Coins}
              />
              <Metric
                label="Expected profit"
                value={
                  profitTotals.expected_cents == null
                    ? 'Incomplete'
                    : money(profitTotals.expected_cents)
                }
                foot="Adds commissions not yet received"
                icon={Landmark}
              />
            </>
          )}
          {canAssetBasis && !canTotalProfit && (
            <Metric
              label="Travel asset cost basis"
              value={
                s.assets.some(
                  (r: R) =>
                    r.ownership === 'Padova' && Number(r.balance) > 0 && r.remaining_basis == null,
                )
                  ? 'Unknown'
                  : money(s.assets.reduce((a: number, r: R) => a + Number(r.remaining_basis), 0))
              }
              foot={
                s.assets.some(
                  (r: R) =>
                    r.ownership === 'Padova' && Number(r.balance) > 0 && r.remaining_basis == null,
                )
                  ? 'Basis incomplete'
                  : 'Recorded inventory valuation'
              }
              icon={Ticket}
            />
          )}
        </div>
        <div className="list-block">
          <Card
            title="To-do"
            count={todoItems.length}
            action={
              <div className="heading-actions">
                {canAction('task') ? (
                  <button className="btn small" onClick={() => action('task')}>
                    New task
                  </button>
                ) : null}
                <button className="btn ghost" onClick={() => go('To-do')}>
                  Full To-do <ArrowRight size={12} />
                </button>
              </div>
            }
          >
            {!todoItems.length ? (
              <Empty>Nothing on the to-do list right now.</Empty>
            ) : (
              <ul className="plain-list dashboard-todo-list">
                {todoItems.map((item) => (
                  <li key={item.id} className="dashboard-todo-item">
                    <button
                      type="button"
                      className="dashboard-todo-main"
                      onClick={() => {
                        if (item.booking_id) void openRecord('booking', item.booking_id);
                        else if (item.record_type && item.record_id)
                          void openRecord(item.record_type, item.record_id);
                        else if (item.kind === 'task') go('To-do');
                        else {
                          setFollowupSelected('Needs Attention');
                          go('To-do');
                        }
                      }}
                    >
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                      {item.due_on ? <small>Due {dateLabel(item.due_on)}</small> : null}
                    </button>
                    {planTodoRecordUrl(item) ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const path = planTodoRecordUrl(item);
                          if (!path) return;
                          await navigator.clipboard.writeText(
                            `${window.location.origin}${path}`,
                          );
                          setToast('Link copied');
                          if (typeof window !== 'undefined') {
                            const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                            if (current !== path)
                              window.history.replaceState(null, '', path);
                          }
                        }}
                      >
                        Copy link
                      </button>
                    ) : null}
                    {item.kind === 'task' && item.task_id ? (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => action('complete_task', { task_id: item.task_id })}
                      >
                        Done
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="list-block">
          <Card title="Recent transactions">
            {transactionTable(transactions.slice(0, 10))}
          </Card>
          <button className="btn ghost list-block-link" onClick={() => go('Bookings')}>
            View all transactions
          </button>
        </div>
        <div className="dashboard-layout">
          <div className="dashboard-attention">
            <OperationalViews
              compact
              viewAll={(selected) => {
                setFollowupSelected(selected);
                go('Follow-up');
              }}
              views={s.operationalViews ?? {}}
              open={(r: R) =>
                void openRecord(
                  r.booking_id ? 'booking' : (r.record_type ?? 'asset'),
                  r.booking_id ?? r.record_id,
                )
              }
              copyLink={copyWorkspacePath}
            />
          </div>
          <div className="dashboard-today">
            <Card
              title="Traveling today"
              count={todayTravel.length}
              action={
                <button className="btn ghost" onClick={() => go('Calendar')}>
                  Calendar <ArrowRight size={13} />
                </button>
              }
            >
              {todayTravel.length ? (
                (dashboardTravelQuery.trim() ? todayTravel : todayTravel.slice(0, 4)).map((b) => (
                  <div className="travel-item" key={b.id}>
                    <button
                      type="button"
                      className="travel-item-main"
                      onClick={() => openRecord('booking', b.id)}
                    >
                      <span className="travel-icon">
                        <Icon name={b.product} />
                      </span>
                      <div>
                        <strong title={b.summary}>{bookingShortName(tripView(b))}</strong>
                        <p>{b.travelers || 'Traveler missing'}</p>
                        <p>
                          {b.confirmations} · {b.code}
                        </p>
                      </div>
                      <Badge>Today</Badge>
                    </button>
                    {calendarBookingSharePath(b.id) ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-label="Copy shareable link"
                        onClick={() => {
                          const path = calendarBookingSharePath(b.id);
                          if (path) void copyWorkspacePath(path);
                        }}
                      >
                        Copy link
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <Empty>
                  {dashboardTravelQuery.trim()
                    ? 'No travelers today match this search.'
                    : 'No travelers traveling today.'}
                </Empty>
              )}
              <div
                className="section-body"
                style={{
                  paddingTop: 16,
                  paddingBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                }}
              >
                <span className="muted">Next {horizon} days</span>
                <button className="btn ghost" onClick={() => go('Calendar')}>
                  {upcoming.length} upcoming bookings <ChevronRight size={12} />
                </button>
              </div>
            </Card>
          </div>
          <div className="dashboard-upcoming">
            <Card
              title="Upcoming bookings"
              count={upcoming.length}
              action={
                <button className="btn ghost" onClick={() => go('Bookings')}>
                  All transactions <ArrowRight size={13} />
                </button>
              }
            >
              <label className="directory-search" htmlFor="dashboard-travel-search">
                {' '}
                <input
                  id="dashboard-travel-search"
                  type="search"
                  aria-label="Search traveling today and upcoming"
                  placeholder="Search booking #, traveler or trip…"
                  value={dashboardTravelQuery}
                  onChange={(e) => setDashboardTravelQuery(e.target.value)}
                />
              </label>
              <div className="tabs">
                {[7, 14, 30].map((n) => (
                  <button
                    key={n}
                    className={horizon === n ? 'active' : ''}
                    onClick={() => setHorizon(n)}
                  >
                    Next {n} days
                  </button>
                ))}
              </div>
              {upcoming.length ? (
                <div className="dashboard-trips">
                  {upcoming.map((b) => (
                    <div className="dashboard-trip-row" key={b.id}>
                      <button
                        type="button"
                        className="dashboard-trip"
                        onClick={() => openRecord('booking', b.id)}
                      >
                        <Icon name={b.product} />
                        <span>
                          <strong title={b.summary}>{bookingShortName(tripView(b))}</strong>
                          <small>
                            {b.code} · {b.travelers || 'Traveler missing'}
                          </small>
                        </span>
                        <span>
                          {dateLabel(
                            nextTravelDate(b, s.travelComponents ?? [], today, '9999-12-31') ??
                              b.travel_start,
                          )}
                          {canSale && <small>{money(b.sale)}</small>}
                        </span>
                      </button>
                      {calendarBookingSharePath(b.id) ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          aria-label="Copy shareable link"
                          onClick={() => {
                            const path = calendarBookingSharePath(b.id);
                            if (path) void copyWorkspacePath(path);
                          }}
                        >
                          Copy link
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>
                  {dashboardTravelQuery.trim()
                    ? 'No upcoming travel matches this search.'
                    : 'No upcoming travel.'}
                </Empty>
              )}
            </Card>
          </div>
          <div className="dashboard-side">
            <Card title="Quick actions">
              <div className="quick-actions">
                {[
                  ['New booking', 'booking', Plane],
                  ['Add payment', 'payment', Wallet],
                  ['Add customer', 'party', Users],
                  ...(true
                    ? [
                        ['Trade desk', 'trade', Ticket],
                        ['Buy travel asset', 'acquire_asset', Ticket],
                        ['Sell voucher', 'sell_asset', ArrowUpRight],
                        ['Supplier payment', 'payment', CreditCard],
                        ['Add commission', 'commission', Coins],
                      ]
                    : []),
                  ['New task', 'task', ClipboardList],
                ]
                  .filter(
                    ([label, kind]: any) =>
                      canAction(kind) && (label !== 'Supplier payment' || can('manage_funding')),
                  )
                  .map(([label, kind, I]: any) => (
                    <button
                      className="quick-action"
                      key={label}
                      onClick={() =>
                        action(
                          kind,
                          label === 'Supplier payment'
                            ? { direction: 'supplier' }
                            : label === 'Add customer'
                              ? { kind: 'person' }
                              : label === 'Trade desk'
                                ? { side: 'Buy', stock_mode: 'for_booking' }
                                : {},
                        )
                      }
                    >
                      <I size={14} />
                      {label}
                    </button>
                  ))}
              </div>
            </Card>
            <Card
              title="Recent activity"
              action={
                <button className="btn ghost" onClick={() => go('Activity')}>
                  View all <ArrowRight size={12} />
                </button>
              }
            >
              {s.audit.slice(0, 4).map((a: R) => (
                <div className="activity" key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    {a.summary || `${pretty(a.kind)} recorded`}
                    <p>
                      {dateLabel(a.created_at)} ·{' '}
                      {a.actor_name ??
                        (a.actor === 'local-owner' ? 'Legacy synthetic import' : a.actor)}
                      {a.source_label ? (
                        <>
                          {' · '}
                          <Badge
                            tone={
                              a.source_channel === 'whatsapp' || a.source_channel === 'email'
                                ? 'blue'
                                : a.source_channel === 'import'
                                  ? 'amber'
                                  : 'gray'
                            }
                          >
                            {a.source_label}
                          </Badge>
                        </>
                      ) : null}
                    </p>
                    {bks.some((b) => b.id === a.record_id) ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-label="Copy shareable link"
                        onClick={() => {
                          const path = calendarBookingSharePath(a.record_id);
                          if (path) void copyWorkspacePath(path);
                        }}
                      >
                        Copy link
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    );
  } else if (page === 'Bookings') {
    const items = transactions.filter(
      ({ kind, record: r }) =>
        (filter === 'All' ||
          (kind === 'sale' ? filter === 'Voucher / asset sales' : r.product === filter)) &&
        (!day || (kind === 'booking' && r.travel_start <= day && r.travel_end >= day)) &&
        (bookingStatus === 'All' || (kind === 'booking' && r.reservation_status === bookingStatus)) &&
        (bookingHowBooked === 'All' ||
          (kind === 'booking' &&
            bookingMatchesHowBookedFilter(
              r as {
                itinerary?: {
                  operational_entry?: { how_booked?: string | null } | null;
                } | null;
              },
              bookingHowBooked,
            ))) &&
        (bookingYear === 'All' ||
          (kind === 'booking' &&
            bookingMatchesYearFilter(
              r as { booked_on?: string | null },
              bookingYear,
            ))) &&
        (!bookingOwedOnly ||
          (kind === 'booking' &&
            bookingListIsOwed(
              r as {
                customer_balance?: number | null;
                reservation_status?: string | null;
              },
            ))) &&
        (kind === 'booking'
          ? bookingMatchesSearch(r, s, bookingQuery)
          : saleMatchesSearch(r, bookingQuery)),
    );
    const filteredDrafts = (s.bookingDrafts ?? []).filter((draft: R) => {
      if (!draftMatchesSearch(draft, draftQuery)) return false;
      if (draftChannelFilter === 'All') return true;
      if (draftChannelFilter === 'historical') return draft.kind === 'historical_booking';
      if (draftChannelFilter === 'voucher') return draft.kind === 'voucher_sale';
      if (draft.kind === 'historical_booking' || draft.kind === 'voucher_sale') return false;
      return intakeChannelFilterKey(draft.intake_source) === draftChannelFilter;
    });
    const showVoucherSales = filter === 'Voucher / asset sales';
    const bookingRows = items
      .filter((row): row is Extract<typeof row, { kind: 'booking' }> => row.kind === 'booking')
      .map((row) => row.record)
      .slice()
      .sort((a, b) =>
        compareBookingsForList(
          a as { booked_on?: string | null; travel_start?: string | null },
          b as { booked_on?: string | null; travel_start?: string | null },
          bookingSort,
        ),
      );
    const voucherSaleRows = items.filter(
      (row): row is Extract<typeof row, { kind: 'sale' }> => row.kind === 'sale',
    );
    const heldCount = bookingListHeldCount(bks);
    const activeCount = bookingListActiveCount(bks);
    const completedCount = bookingListCompletedCount(bks);
    const cancelledCount = bookingListCancelledCount(bks);
    const refundPendingCount = bookingListRefundPendingCount(bks);
    const owedCount = bookingListOwedCount(bks);
    const owedTotal = bookingListOwedTotal(bks);
    view = (
      <div className="transactions-page">
        {heading(
          'Bookings',
          'Newest first. Date booked, customer, travelers, trip, travel date, how booked, price, cost, paid/balance, confirmed/expected. Cancelled rows are red. Status and How booked filters.',
          <>
            {canAction('booking_draft') && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setIntakeOpen(true);
                  setIntakeMailbox(INTAKE_EMAIL_MAILBOXES[0]);
                  resetIntakeChannels(true);
                  setIntakeChannelStatus(null);
                  void (async () => {
                    try {
                      const [emailRes, waRes] = await Promise.all([
                        fetch('/api/booking-intake/email'),
                        fetch('/api/booking-intake/whatsapp'),
                      ]);
                      const email = emailRes.ok ? await emailRes.json() : null;
                      const wa = waRes.ok ? await waRes.json() : null;
                      setIntakeChannelStatus({
                        email: email
                          ? email.polling_configured
                            ? 'Email poll env present (not auto-running until Owner connect).'
                            : 'Email: staff forward only (Shmuel@ / mindy@). Auto-poll waiting on mailbox access.'
                          : 'Email status unavailable.',
                        whatsapp: wa
                          ? wa.mode === 'pc_bridge_token_present'
                            ? 'WhatsApp PC bridge token set on server (read-only; never sends).'
                            : 'WhatsApp: paste chat or PC bridge, token not set on this server yet.'
                          : 'WhatsApp status unavailable.',
                      });
                    } catch {
                      setIntakeChannelStatus({
                        email: 'Email status unavailable.',
                        whatsapp: 'WhatsApp status unavailable.',
                      });
                    }
                  })();
                }}
              >
                Intake draft
              </button>
            )}
            {newButton('New booking', 'booking')}
          </>,
        )}
        {!!(s.bookingDrafts?.length || s.bookingDraftsRemoved?.length) && (
          <div className="list-block intake-drafts-block">
            <details
            className="card section-body intake-drafts"
            open={draftsOpen}
            onToggle={(e) => {
              const next = (e.currentTarget as HTMLDetailsElement).open;
              if (next !== draftsOpen) setDraftsOpenPersist(next);
            }}
          >
            <summary>
              <span className="intake-drafts-summary-title">Drafts</span>
              <span className="intake-drafts-summary-count">
                {draftChannelFilter === 'All'
                  ? filteredDrafts.length
                  : `${filteredDrafts.length} of ${s.bookingDrafts.length}`}
              </span>
              <span className="intake-drafts-summary-note">Not live until staff continue</span>
            </summary>
            <div className="intake-draft-filters" role="group" aria-label="Filter drafts">
              {(
                [
                  ['All', 'All'],
                  ['email', 'Email'],
                  ['whatsapp', 'WhatsApp'],
                  ['staff', 'Staff file/paste'],
                  ['manual', 'Manual'],
                  ['historical', 'Historical'],
                  ['voucher', 'Voucher'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn small${draftChannelFilter === key ? ' active' : ''}`}
                  aria-pressed={draftChannelFilter === key}
                  onClick={() => {
                    setDraftChannelFilter(key);
                    setDraftPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="toolbar directory-toolbar" style={{ marginBottom: 8 }}>
              <label className="directory-search" htmlFor="drafts-search">
                {' '}
                <input
                  id="drafts-search"
                  type="search"
                  aria-label="Search drafts"
                  placeholder="Search title, customer or source…"
                  value={draftQuery}
                  onChange={(e) => {
                    setDraftQuery(e.target.value);
                    setDraftPage(1);
                  }}
                />
              </label>
            </div>
            <div className="intake-draft-grid">
              {(() => {
                if (!filteredDrafts.length) {
                  return (
                    <p className="intake-draft-empty">
                      {draftQuery.trim()
                        ? 'No drafts match this search.'
                        : 'No drafts in this filter. Try All, or create one from Intake.'}
                    </p>
                  );
                }
                const draftPager = pageSlice<R>(filteredDrafts, draftPage, 8);
                return (
                  <>
                    {draftPager.items.map((draft: R) => {
                      const title =
                        draft.display_title ??
                        (draft.kind === 'voucher_sale' ? draft.summary : draft.title) ??
                        'Untitled draft';
                      const metaValue = (value: unknown, empty = '—') => {
                        const text = String(value ?? '').trim();
                        return text || empty;
                      };
                      const ProductIcon = draftProductIcon(draft.intake_product);
                      const ChannelIcon = draftChannelIcon(draft);
                      const channelLabel =
                        draft.kind === 'voucher_sale'
                          ? 'Voucher sale'
                          : draft.kind === 'historical_booking'
                            ? 'Historical'
                            : intakeChannelBadge(draft.intake_source);
                      return (
                      <article key={draft.id} className="intake-draft-card">
                        <div className="intake-draft-card-top">
                          <span className="intake-draft-badge">
                            <ChannelIcon size={11} aria-hidden />
                            {channelLabel}
                          </span>
                          {draft.intake_confidence === 'low' && (
                            <span className="intake-draft-badge intake-draft-badge-warn">
                              Needs review
                            </span>
                          )}
                          {draft.intake_ai_generated && (
                            <span className="intake-draft-badge intake-draft-badge-ai">
                              AI
                            </span>
                          )}
                          {draft.intake_pattern && (
                            <span className="intake-draft-badge intake-draft-badge-pattern">
                              Pattern
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn small ghost intake-draft-copy-link"
                            aria-label={`Copy link for ${title}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const path = workspaceRecordUrl('draft', draft.id);
                              if (path) void copyWorkspacePath(path);
                            }}
                          >
                            Copy link
                          </button>
                          {canAction('booking_draft') && (
                            <details
                              className="intake-draft-menu"
                              onClick={(e) => e.stopPropagation()}
                              onToggle={(e) => {
                                const open = (e.currentTarget as HTMLDetailsElement).open;
                                if (!open) return;
                                document
                                  .querySelectorAll('details.intake-draft-menu[open]')
                                  .forEach((el) => {
                                    if (el !== e.currentTarget)
                                      (el as HTMLDetailsElement).open = false;
                                  });
                              }}
                            >
                              <summary
                                className="intake-draft-menu-trigger"
                                aria-label="Draft actions"
                              >
                                <MoreVertical size={16} aria-hidden />
                              </summary>
                              <div className="intake-draft-menu-panel" role="menu">
                                <button
                                  type="button"
                                  className="intake-draft-menu-item danger"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const root = (e.currentTarget as HTMLElement).closest(
                                      'details',
                                    );
                                    if (root) (root as HTMLDetailsElement).open = false;
                                    const label = title || 'this draft';
                                    const ok = await askConfirm({
                                      title: 'Delete draft?',
                                      message: `Delete “${String(label).slice(0, 80)}”?`,
                                      confirmLabel: 'Delete',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                    });
                                    if (!ok) return;
                                    setBusy(true);
                                    try {
                                      await command('booking_draft_delete', {
                                        draft_id: draft.id,
                                      });
                                      setSelected(null);
                                      setDetail(null);
                                      await refresh();
                                      setToast('Draft deleted. Restore from Recently deleted.');
                                    } catch (err) {
                                      setError((err as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} aria-hidden />
                                  Delete draft
                                </button>
                              </div>
                            </details>
                          )}
                        </div>
                        <button
                          type="button"
                          className="intake-draft-card-open"
                          onClick={async () => {
                            document
                              .querySelectorAll('details.intake-draft-menu[open]')
                              .forEach((el) => {
                                (el as HTMLDetailsElement).open = false;
                              });
                            try {
                              if (
                                draft.kind === 'voucher_sale' ||
                                draft.kind === 'historical_booking'
                              ) {
                                await openRecord('draft', draft.id);
                                return;
                              }
                              const response = await fetch(
                                `/api/state?type=draft&id=${encodeURIComponent(draft.id)}`,
                                { cache: 'no-store' },
                              );
                              if (!response.ok) throw new Error('Unable to open this draft');
                              const loaded = await response.json();
                              if (
                                draftKind({
                                  summary: loaded.entry?.summary,
                                  historical_status:
                                    loaded.entry?.itinerary?.historical_reconciliation_status,
                                }) !== 'booking'
                              ) {
                                setSelected({ type: 'draft', id: loaded.id });
                                setDetail(loaded);
                              } else
                                action('booking', {
                                  ...loaded.entry,
                                  draft_id: loaded.id,
                                  intake_apply_on_open: true,
                                  intake_provenance: loaded.entry?.intake_provenance,
                                  recovery_paste:
                                    loaded.entry?.intake_raw_text ||
                                    loaded.entry?.recovery_paste ||
                                    undefined,
                                });
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <div className="intake-draft-card-heading">
                            <span className="intake-draft-product-icon" aria-hidden>
                              <ProductIcon size={16} />
                            </span>
                            <strong className="intake-draft-card-title">{title}</strong>
                          </div>
                          {(draft.intake_from ||
                            draft.intake_subject ||
                            draft.intake_mailbox ||
                            draft.intake_filename) && (
                            <p className="intake-draft-provenance">
                              {formatIntakeProvenanceLine({
                                source: draft.intake_source,
                                from_address: draft.intake_from,
                                subject: draft.intake_subject,
                                mailbox: draft.intake_mailbox,
                                filename: draft.intake_filename,
                              })}
                            </p>
                          )}
                          {(() => {
                            const missingLine = formatIntakeMissingSummary(draft.intake_missing);
                            return missingLine ? (
                              <p className="intake-draft-missing">{missingLine}</p>
                            ) : null;
                          })()}
                          <dl className="intake-draft-meta">
                            <div>
                              <dt>Customer</dt>
                              <dd>
                                {metaValue(
                                  draft.intake_customer,
                                  draft.intake_source ? '—' : 'Not linked yet',
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Product</dt>
                              <dd>{metaValue(draft.intake_product)}</dd>
                            </div>
                            <div>
                              <dt>Route</dt>
                              <dd>{metaValue(draft.intake_route)}</dd>
                            </div>
                            <div>
                              <dt>Travel</dt>
                              <dd>{metaValue(draft.intake_travel_start)}</dd>
                            </div>
                            <div>
                              <dt>PNR</dt>
                              <dd>{metaValue(draft.intake_pnr)}</dd>
                            </div>
                            <div className="intake-draft-meta-sale">
                              <dt>Sale</dt>
                              <dd>
                                {draft.intake_sale != null && draft.intake_sale !== ''
                                  ? `$${draft.intake_sale}`
                                  : '—'}
                              </dd>
                            </div>
                          </dl>
                          <span className="intake-draft-action">
                            {draft.kind === 'voucher_sale'
                              ? 'Review voucher'
                              : draft.kind === 'historical_booking'
                                ? 'View details'
                                : draft.intake_source
                                  ? 'Continue intake'
                                  : 'Continue draft'}
                            <ArrowRight size={13} aria-hidden />
                          </span>
                        </button>
                      </article>
                      );
                    })}
                  </>
                );
              })()}
            </div>
            {filteredDrafts.length > 0 &&
              (() => {
                const draftPager = pageSlice<R>(filteredDrafts, draftPage, 8);
                return (
                  <div className="intake-draft-pager">
                    <ListPager
                      page={draftPager.page}
                      totalPages={draftPager.totalPages}
                      total={draftPager.total}
                      from={draftPager.from}
                      to={draftPager.to}
                      onPage={(p) => {
                        setDraftPage(p);
                        document
                          .querySelector('.intake-drafts-block')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      label="drafts"
                    />
                  </div>
                );
              })()}
            {(s.bookingDraftsRemoved ?? []).length > 0 && (
              <div className="intake-draft-removed">
                <h4 className="money-back-subhead">Recently deleted</h4>
                <p className="intake-draft-empty">
                  Soft-removed only — restore brings the draft back. History stays.
                </p>
                <ul className="plain-list">
                  {(s.bookingDraftsRemoved as R[]).map((draft) => (
                    <li key={draft.id} className="intake-draft-removed-row">
                      <span>
                        {String(draft.title || draft.summary || 'Draft').slice(0, 80)}
                      </span>
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await command('booking_draft_restore', { draft_id: draft.id });
                            await refresh();
                            setToast('Draft restored.');
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
          </div>
        )}
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="bookings-search">
            {' '}
            <input
              id="bookings-search"
              type="search"
              aria-label="Search bookings"
              placeholder="Search booking #, PNR, customer or ticket…"
              value={bookingQuery}
              onChange={(e) => {
                setBookingQuery(e.target.value);
                setBookingPage(1);
              }}
            />
          </label>
        </div>
        <div className="toolbar transactions-toolbar">
          <div className="transactions-filter-group" role="group" aria-label="Product filter">
            {['All', 'Flight', 'Hotel', 'Car', 'Other', 'Voucher / asset sales'].map((v) => (
              <button
                className={`btn ${filter === v ? 'primary' : ''}`}
                key={v}
                onClick={() => setFilter(v)}
              >
                {v === 'Voucher / asset sales' ? 'Vouchers' : v}
              </button>
            ))}
          </div>
          <label className="transactions-status-filter">
            Status
            <select
              aria-label="Booking status"
              value={bookingStatus}
              onChange={(e) => {
                setBookingStatus(e.target.value);
                setBookingPage(1);
              }}
            >
              {['All', ...new Set<string>(bks.map((b) => b.reservation_status))].map((v) => (
                <option key={v} value={v}>
                  {v === 'All' ? 'All' : reservationStatusLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="transactions-status-filter">
            How booked
            <select
              aria-label="How booked"
              value={bookingHowBooked}
              onChange={(e) => {
                setBookingHowBooked(e.target.value);
                setBookingPage(1);
              }}
            >
              {['All', ...bookingListHowBookedOptions(bks)].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="transactions-status-filter">
            Year
            <select
              aria-label="Booked year"
              value={bookingYear}
              onChange={(e) => {
                setBookingYear(e.target.value);
                setBookingPage(1);
              }}
            >
              {[
                'All',
                ...bookingListYearOptions(bks),
                ...(bks.some((b) =>
                  bookingMatchesYearFilter(b as { booked_on?: string | null }, 'Unknown'),
                )
                  ? ['Unknown']
                  : []),
              ].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="transactions-status-filter">
            Sort
            <select
              aria-label="Sort bookings"
              value={bookingSort}
              onChange={(e) => {
                setBookingSort(e.target.value as BookingListSort);
                setBookingPage(1);
              }}
            >
              {BOOKING_LIST_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`btn ${bookingOwedOnly ? 'primary' : ''}`}
            aria-pressed={bookingOwedOnly}
            aria-label="Filter bookings owed to Padova"
            title="Owed to me — known positive customer balance (Unknown ≠ invent)"
            disabled={owedCount === 0 && !bookingOwedOnly}
            onClick={() => {
              setBookingOwedOnly(toggleBookingOwedFilter(bookingOwedOnly));
              setBookingPage(1);
            }}
          >
            Owed{owedCount ? ` (${owedCount})` : ''}
          </button>
          {canSale ? (
            <span
              className="muted"
              style={{ marginLeft: 'auto', fontSize: 12 }}
              title="Sum of known positive customer balances. Unknown AR stays Incomplete ≠ $0."
            >
              Total owed{' '}
              <strong style={{ color: owedTotal.owed_cents > 0 ? '#ae8553' : undefined }}>
                {bookingListOwedTotalLabel(owedTotal, money)}
              </strong>
            </span>
          ) : null}
          <button
            type="button"
            className={`btn ${bookingStatus === 'Held' ? 'primary' : ''}`}
            aria-pressed={bookingStatus === 'Held'}
            aria-label="Filter Held PNRs"
            title="Held PNRs waiting for payment / ticketing"
            disabled={heldCount === 0 && bookingStatus !== 'Held'}
            onClick={() => {
              setBookingStatus(toggleBookingHeldFilter(bookingStatus));
              setBookingPage(1);
            }}
          >
            Held{heldCount ? ` (${heldCount})` : ''}
          </button>
          <button
            type="button"
            className={`btn ${bookingStatus === 'Booked' ? 'primary' : ''}`}
            aria-pressed={bookingStatus === 'Booked'}
            aria-label="Filter active bookings"
            title="Active bookings (Plan Active)"
            disabled={activeCount === 0 && bookingStatus !== 'Booked'}
            onClick={() => {
              setBookingStatus(toggleBookingActiveFilter(bookingStatus));
              setBookingPage(1);
            }}
          >
            Active{activeCount ? ` (${activeCount})` : ''}
          </button>
          <button
            type="button"
            className={`btn ${bookingStatus === 'Traveled' ? 'primary' : ''}`}
            aria-pressed={bookingStatus === 'Traveled'}
            aria-label="Filter completed bookings"
            title="Completed travel (Plan Completed)"
            disabled={completedCount === 0 && bookingStatus !== 'Traveled'}
            onClick={() => {
              setBookingStatus(toggleBookingCompletedFilter(bookingStatus));
              setBookingPage(1);
            }}
          >
            Completed{completedCount ? ` (${completedCount})` : ''}
          </button>
          <button
            type="button"
            className={`btn ${bookingStatus === 'Cancelled' ? 'primary' : ''}`}
            aria-pressed={bookingStatus === 'Cancelled'}
            aria-label="Filter cancelled bookings"
            title="Cancelled bookings (red rows)"
            disabled={cancelledCount === 0 && bookingStatus !== 'Cancelled'}
            onClick={() => {
              setBookingStatus(toggleBookingCancelledFilter(bookingStatus));
              setBookingPage(1);
            }}
          >
            Cancelled{cancelledCount ? ` (${cancelledCount})` : ''}
          </button>
          <button
            type="button"
            className={`btn ${bookingStatus === 'Refund Pending' ? 'primary' : ''}`}
            aria-pressed={bookingStatus === 'Refund Pending'}
            aria-label="Filter refund pending bookings"
            title="Bookings with refund still open"
            disabled={refundPendingCount === 0 && bookingStatus !== 'Refund Pending'}
            onClick={() => {
              setBookingStatus(toggleBookingRefundPendingFilter(bookingStatus));
              setBookingPage(1);
            }}
          >
            Refund pending{refundPendingCount ? ` (${refundPendingCount})` : ''}
          </button>
          {day && (
            <button className="btn" onClick={() => setDay('')}>
              {day}
              <X size={12} />
            </button>
          )}
        </div>
        {showVoucherSales ? (
          (() => {
            const salePager = pageSlice(voucherSaleRows, bookingPage, 20);
            return (
              <div className="list-block">
                <Card title="Voucher / asset sales" count={voucherSaleRows.length}>
                  {transactionTable(salePager.items)}
                </Card>
                <ListPager
                  page={salePager.page}
                  totalPages={salePager.totalPages}
                  total={salePager.total}
                  from={salePager.from}
                  to={salePager.to}
                  onPage={setBookingPage}
                  label="sales"
                />
              </div>
            );
          })()
        ) : (
          (() => {
            const bookingPager = pageSlice(bookingRows, bookingPage, 20);
            return (
              <div className="list-block">
                <Card title="Bookings" count={bookingRows.length}>
                  {bookingTable(bookingPager.items)}
                </Card>
                <ListPager
                  page={bookingPager.page}
                  totalPages={bookingPager.totalPages}
                  total={bookingPager.total}
                  from={bookingPager.from}
                  to={bookingPager.to}
                  onPage={setBookingPage}
                  label="bookings"
                />
              </div>
            );
          })()
        )}
      </div>
    );
  } else if (['People & Families', 'Companies', 'Suppliers', 'Sources & Brokers'].includes(page)) {
    const list = parties
      .filter((p) =>
        page === 'Companies'
          ? p.kind === 'company'
          : page === 'Suppliers'
            ? p.kind === 'supplier' ||
              p.roles.some((r: string) => ['supplier', 'airline', 'property', 'rental'].includes(r))
            : page === 'Sources & Brokers'
              ? p.kind === 'partner' ||
                p.roles.some((r: string) => ['seller', 'broker', 'source', 'partner'].includes(r))
              : ['person', 'company', 'family', 'partner'].includes(p.kind),
      )
      .filter(
        (p) =>
          filter === 'All' ||
          p.kind === filter ||
          (filter === 'Customers' && p.roles.includes('customer')) ||
          (filter === 'Travelers' && p.roles.includes('traveler')) ||
          (filter === 'Sellers' && p.roles.includes('seller')) ||
          p.roles.includes(filter),
      )
      .filter((p) => directoryType === 'All' || p.kind === directoryType)
      .filter((p) =>
        [p.name, p.email, p.phone, ...(p.details?.search_aliases ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(directoryQuery.trim().toLowerCase()),
      )
      .sort((a, b) => {
        if (directorySort === 'owed-desc' || directorySort === 'owed-asc') {
          const ao = partyCustomerOwes(bks, a.id);
          const bo = partyCustomerOwes(bks, b.id);
          const av = ao.owed_cents == null ? -1 : ao.owed_cents;
          const bv = bo.owed_cents == null ? -1 : bo.owed_cents;
          return directorySort === 'owed-desc' ? bv - av : av - bv;
        }
        return directorySort === 'name-desc'
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name);
      });
    view = (
      <>
        {heading(
          page === 'Companies'
            ? 'Companies'
            : page === 'Suppliers'
              ? 'Suppliers'
              : page === 'Sources & Brokers'
                ? 'Sources & brokers'
                : 'Customers',
          page === 'Companies'
            ? 'Corporate travelers, billing relationships, and travel rules.'
            : page === 'Suppliers'
              ? 'Actual travel providers, separate from booking channels and acquisition sellers.'
              : page === 'Sources & Brokers'
                ? 'People and companies supplying awards, points, certificates or other travel value. Open a profile for transactions and history.'
                : 'Each customer’s bookings, what they owe, payments with allocations, and invoice or statement on demand.',
          newButton(
            page === 'Companies'
              ? 'Add company'
              : page === 'Suppliers'
                ? 'Add supplier'
                : page === 'Sources & Brokers'
                  ? 'Add source / broker'
                  : filter === 'Travelers'
                    ? 'Add traveler'
                    : filter === 'Customers' || filter === 'All'
                      ? 'Add person'
                      : filter !== 'All'
                        ? `Add ${filter}`
                        : 'Add person',
            'party',
            {
              entry_context: page,
              kind:
                page === 'Companies'
                  ? 'company'
                  : page === 'Suppliers'
                    ? 'company'
                    : page === 'Sources & Brokers'
                      ? 'person'
                      : ['family', 'partner'].includes(filter)
                        ? filter
                        : 'person',
              roles:
                page === 'Suppliers'
                  ? ['supplier']
                  : page === 'Sources & Brokers'
                    ? ['seller']
                    : filter === 'Travelers'
                      ? ['traveler']
                      : ['customer'],
            },
          ),
        )}
        <div className="toolbar">
          {(page === 'Suppliers'
            ? ['All', 'airline', 'property', 'rental', 'supplier']
            : page === 'Sources & Brokers'
              ? ['All', 'seller', 'broker', 'source', 'partner']
              : ['All', 'Customers', 'Travelers', 'Sellers']
          ).map((v) => (
            <button
              key={v}
              className={`btn ${filter === v ? 'primary' : ''}`}
              onClick={() => {
                setFilter(v);
                setDirectoryPage(1);
              }}
            >
              {(
                {
                  airline: 'Airlines',
                  property: 'Hotels',
                  rental: 'Car rentals',
                  supplier: 'Supplier role',
                } as R
              )[v] || pretty(v)}
            </button>
          ))}
        </div>
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="directory-search">
            {' '}
            <input
              id="directory-search"
              aria-label="Find name, phone or email"
              placeholder="Search by name, phone or email"
              value={directoryQuery}
              onChange={(e) => {
                setDirectoryQuery(e.target.value);
                setDirectoryPage(1);
              }}
            />
          </label>
          <label>
            Type{' '}
            <select
              aria-label="Directory type"
              value={directoryType}
              onChange={(e) => {
                setDirectoryType(e.target.value);
                setDirectoryPage(1);
              }}
            >
              {[
                ['All', 'All types'],
                ['person', 'Person'],
                ['company', 'Organization'],
                ['family', 'Family'],
                ['partner', 'Legacy partner'],
                ['supplier', 'Legacy supplier'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort{' '}
            <select
              aria-label="Sort directory"
              value={directorySort}
              onChange={(e) => {
                setDirectorySort(e.target.value);
                setDirectoryPage(1);
              }}
            >
              <option value="name">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              {page === 'People & Families' && canSale ? (
                <>
                  <option value="owed-desc">Owes most</option>
                  <option value="owed-asc">Owes least</option>
                </>
              ) : null}
            </select>
          </label>
        </div>
        {(() => {
          // 12/page so Companies/Suppliers with 20+ rows get clear Previous/Next (Owner QA).
          const directoryPager = pageSlice(list, directoryPage, 12);
          return (
            <div className="list-block">
        <div
          className="directory-list"
          role="list"
          aria-label={
            page === 'People & Families' ? 'Customers' : page
          }
        >
          {directoryPager.items.map((p) => {
            const ids = new Set(
              (s.travelerLinks ?? [])
                .filter((t: R) => t.person_id === p.id)
                .map((t: R) => t.booking_id),
            );
            (s.fundingComponents ?? [])
              .filter((f: R) => f.seller_id === p.id && !f.reversed)
              .forEach((f: R) => ids.add(f.booking_id));
            (s.travelComponents ?? [])
              .filter((t: R) => t.provider_id === p.id || t.acquisition_source_id === p.id)
              .forEach((t: R) => ids.add(t.booking_id));
            const linked = s.bookings.filter(
              (b: R) => ids.has(b.id) || b.customer_id === p.id || b.supplier_id === p.id,
            );
            const upcoming = linked
              .filter((b: R) => b.travel_start && b.travel_start >= today)
              .sort((a: R, b: R) => a.travel_start.localeCompare(b.travel_start))[0];
            const past = linked
              .filter((b: R) => b.travel_start && b.travel_start < today)
              .sort((a: R, b: R) => b.travel_start.localeCompare(a.travel_start))[0];
            const owes =
              page === 'People & Families' &&
              canSale &&
              (p.roles ?? []).includes('customer')
                ? partyCustomerOwes(bks, p.id)
                : null;
            return (
              <div role="listitem" className="directory-row" key={p.id}>
                <button className="directory-identity" onClick={() => openRecord('person', p.id)}>
                  <span className="avatar">{initials(p.name)}</span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{pretty(p.kind === 'company' ? 'organization' : p.kind)}</small>
                  </span>
                </button>
                <div className="directory-roles">
                  {p.roles.map((role: string) => (
                    <Badge key={role} tone="gray">
                      {({ property: 'Hotel', rental: 'Car rental' } as R)[role] || pretty(role)}
                    </Badge>
                  ))}
                  {page === 'Sources & Brokers' &&
                    Array.isArray(p.details?.source_offerings) &&
                    p.details.source_offerings.length > 0 && (
                      <div className="directory-offerings">
                        {p.details.source_offerings.join(' · ')}
                      </div>
                    )}
                </div>
                <div className="directory-contact">
                  {p.email || p.phone ? (
                    <>
                      <span>{p.email || p.phone}</span>
                      {p.email && p.phone && <small>{p.phone}</small>}
                    </>
                  ) : canAction('edit_party') ? (
                    <button
                      className="text-action"
                      onClick={() => action('edit_party', { ...p, party_id: p.id })}
                    >
                      + Add contact
                    </button>
                  ) : (
                    <span className="muted">Contact not recorded</span>
                  )}
                </div>
                <div className="directory-history">
                  <strong>
                    {linked.length} {linked.length === 1 ? 'booking' : 'bookings'}
                  </strong>
                  <small>
                    {upcoming
                      ? `Next: ${dateLabel(upcoming.travel_start)}`
                      : past
                        ? `Last: ${dateLabel(past.travel_start)}`
                        : 'No dated travel in view'}
                  </small>
                  {owes ? (
                    <small
                      style={{
                        display: 'block',
                        marginTop: 2,
                        color:
                          owes.owed_cents != null && owes.owed_cents > 0 ? '#ae8553' : undefined,
                      }}
                    >
                      Owes {customerOwesListLabel(owes, money)}
                    </small>
                  ) : null}
                </div>
                <div className="directory-actions">
                  <button
                    type="button"
                    className="btn small ghost"
                    aria-label={`Copy link for ${p.name}`}
                    onClick={() => {
                      const path = workspaceRecordUrl('person', p.id);
                      if (path) void copyWorkspacePath(path);
                    }}
                  >
                    Copy link
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Open ${p.name}`}
                    onClick={() => openRecord('person', p.id)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <ListPager
          page={directoryPager.page}
          totalPages={directoryPager.totalPages}
          total={directoryPager.total}
          from={directoryPager.from}
          to={directoryPager.to}
          onPage={setDirectoryPage}
          label="records"
        />
            </div>
          );
        })()}
      </>
    );
  } else if (page === 'Payments') {
    const directionFilters = [
      'All',
      'customer',
      ...new Set<string>(
        s.payments.filter((p: R) => p.direction !== 'customer').map((p: R) => p.direction),
      ),
    ];
    const allocationFilter =
      filter === 'Unallocated' || filter === 'Fully allocated' ? filter : 'All';
    const directionFilter =
      filter === 'Unallocated' || filter === 'Fully allocated' ? 'All' : filter;
    const list = s.payments.filter(
      (p: R) =>
        (directionFilter === 'All' || p.direction === directionFilter) &&
        paymentMatchesAllocationFilter(p, allocationFilter) &&
        paymentMatchesSearch(p, paymentQuery),
    );
    const paymentDupPeers = possibleDuplicatePaymentPeers(s.payments);
    const activity = s.financialActivity ?? [];
    view = (
      <>
        {heading(
          'Payments',
          'Enter once. Allocate across the right bookings. Fully allocated receipts are not Pending. Looks-repeated flags same party·amount·method within a few days.',
          canPay && newButton('Add payment', 'payment'),
        )}
        <div className="toolbar">
          {[...directionFilters, 'Unallocated', 'Fully allocated'].map((v) => (
            <button
              className={`btn ${filter === v ? 'primary' : ''}`}
              key={v}
              onClick={() => {
                setFilter(v);
                setTablePage(1);
                setActivityPage(1);
              }}
            >
              {pretty(v)}
            </button>
          ))}
        </div>
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="payments-search">
            {' '}
            <input
              id="payments-search"
              type="search"
              aria-label="Search payments"
              placeholder="Search party, reference or method…"
              value={paymentQuery}
              onChange={(e) => {
                setPaymentQuery(e.target.value);
                setTablePage(1);
              }}
            />
          </label>
        </div>
        <div className="payments-stack">
          {(() => {
            const activityPager = pageSlice<R>(activity, activityPage, 12);
            return (
              <div className="payments-block">
                <Card title="Cash, card and bank activity" count={activity.length}>
                  <p className="section-body payments-card-intro">
                    Actual money movements from the accounting ledger, including direct Padova
                    payments and refunds. Each movement appears once.
                  </p>
                  <div className="table-wrap payments-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Date / booking</th>
                          <th>Activity</th>
                          <th>Account / reference</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityPager.items.map((a: R) => (
                          <tr key={a.id}>
                            <td>
                              {dateLabel(a.date)}
                              {a.booking_id && (
                                <button
                                  className="booking-code"
                                  onClick={() => openRecord('booking', a.booking_id)}
                                >
                                  {a.code}
                                </button>
                              )}
                            </td>
                            <td>
                              {a.event}
                              <small>{a.actor}</small>
                            </td>
                            <td>
                              {a.account}
                              <small>{a.reference}</small>
                            </td>
                            <td className="money">{money(a.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <ListPager
                  page={activityPager.page}
                  totalPages={activityPager.totalPages}
                  total={activityPager.total}
                  from={activityPager.from}
                  to={activityPager.to}
                  onPage={setActivityPage}
                  label="activity rows"
                />
              </div>
            );
          })()}
          {(() => {
            const paymentPager = pageSlice<R>(list, tablePage, 12);
            return (
              <div className="payments-block">
                <Card title="Receipts, payments and allocations" count={list.length}>
                  <div className="table-wrap payments-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Payer / payee</th>
                          <th>Direction</th>
                          <th>Date / reference</th>
                          <th>Method</th>
                          <th className="money">Amount</th>
                          <th className="money">Unallocated</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentPager.items.map((p: R) => (
                          <tr
                            key={p.id}
                            id={`payment-row-${p.id}`}
                            className={focusPaymentId === p.id ? 'is-focused' : undefined}
                          >
                            <td>
                              <strong>{p.party}</strong>
                              <small>{p.id.slice(0, 8)}</small>
                              {paymentLooksRepeated(p.id, paymentDupPeers) ? (
                                <small>
                                  <Badge tone="amber">
                                    {paymentLooksRepeatedLabel(
                                      paymentDupPeers.get(p.id)?.length ?? 0,
                                    )}
                                  </Badge>
                                </small>
                              ) : null}
                            </td>
                            <td>
                              <Badge
                                tone={
                                  ['customer', 'commission'].includes(p.direction) ? '' : 'gray'
                                }
                              >
                                {pretty(p.direction)}
                              </Badge>
                            </td>
                            <td>
                              {dateLabel(p.paid_on)}
                              <small>{p.reference || 'No reference'}</small>
                            </td>
                            <td>
                              {p.method}
                              <small>{p.verification}</small>
                            </td>
                            <td className="money">{money(p.current_amount)}</td>
                            <td className="money">
                              {paymentUnallocatedColumnLabel(p, money)}
                              {paymentAllocationStatus(p) === 'cleared' ? (
                                <small>Cleared</small>
                              ) : null}
                            </td>
                            <td className="payments-actions">
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={async () => {
                                  const path = workspaceRecordUrl('payment', p.id);
                                  await navigator.clipboard.writeText(
                                    `${window.location.origin}${path}`,
                                  );
                                  setFocusPaymentId(p.id);
                                  setToast('Payment link copied');
                                  if (typeof window !== 'undefined') {
                                    const next = path;
                                    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                                    if (current !== next)
                                      window.history.replaceState(null, '', next);
                                  }
                                }}
                              >
                                Copy link
                              </button>
                              {canPay &&
                                ['customer', 'supplier'].includes(p.direction) &&
                                paymentAllocationStatus(p) === 'open' && (
                                  <button
                                    className="btn small"
                                    onClick={() => action('allocate', { payment_id: p.id })}
                                  >
                                    Allocate
                                  </button>
                                )}
                              {canPay &&
                                (p.direction === 'customer' ||
                                  (p.direction === 'supplier' && can('manage_funding'))) && (
                                  <button
                                    className="btn small"
                                    onClick={() =>
                                      action('correct_payment', {
                                        payment_id: p.id,
                                        amount: Number(p.current_amount) / 100,
                                      })
                                    }
                                  >
                                    Correct
                                  </button>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!list.length && <Empty />}
                </Card>
                <ListPager
                  page={paymentPager.page}
                  totalPages={paymentPager.totalPages}
                  total={paymentPager.total}
                  from={paymentPager.from}
                  to={paymentPager.to}
                  onPage={setTablePage}
                  label="payments"
                />
              </div>
            );
          })()}
        </div>
      </>
    );
  } else if (page === 'Trade desk') {
    const incompleteTrades = canAssets
      ? listTradesToComplete((s.assets as R[]) ?? []).filter((row) =>
          tradeToCompleteMatchesSearch(row, tradeQuery),
        )
      : [];
    view = (
      <>
        {heading(
          'Trade desk',
          'Buy or sell in about 10 seconds — Buy/Sell, What, Amount, Total price. Missing facts stay on To complete, never a popup.',
          can('manage_assets') && (
            <>
              {newButton('New trade', 'trade', { side: 'Buy', stock_mode: 'for_booking' })}
              <button type="button" className="btn ghost" onClick={() => go('Credits & points')}>
                Credits & points
              </button>
            </>
          ),
        )}
        {!canAssets ? (
          <Empty>Trade desk access requires permission.</Empty>
        ) : (
          <>
            <div className="toolbar directory-toolbar">
              <label className="directory-search" htmlFor="trade-search">
                {' '}
                <input
                  id="trade-search"
                  type="search"
                  aria-label="Search trades to complete"
                  placeholder="Search trade name or missing fact…"
                  value={tradeQuery}
                  onChange={(e) => setTradeQuery(e.target.value)}
                />
              </label>
            </div>
            <Card title="Trades to complete" count={incompleteTrades.length}>
              {incompleteTrades.length ? (
                <ul className="trade-to-complete-list">
                  {incompleteTrades.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => openRecord('asset', row.id)}
                      >
                        {row.name}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-label={`Copy link for ${row.name}`}
                        onClick={() => {
                          const path = workspaceRecordUrl('asset', row.id);
                          if (path) void copyWorkspacePath(path);
                        }}
                      >
                        Copy link
                      </button>
                      <small>To complete: {row.missing.join(' · ')}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>
                  {tradeQuery.trim()
                    ? 'No trades match this search.'
                    : 'Nothing waiting. Layer-1 trades can leave counterparty blank — extras sit in More.'}
                </Empty>
              )}
            </Card>
          </>
        )}
      </>
    );
  } else if (page === 'Credits & points' || page === 'Travel Assets') {
    const creditsPointsPage = page === 'Credits & points';
    const scopedAssets = creditsPointsPage
      ? filterCreditsAndPointsAssets(s.assets as R[])
      : (s.assets as R[]);
    const profileLinks = (s.sourceProfileAssets ?? []) as Array<{
      profile_id?: string | null;
      asset_id?: string | null;
    }>;
    const list = scopedAssets.filter(
      (a: R) =>
        (filter === 'All' || a.kind === filter) &&
        assetMatchesCap1ProfileFilter(a.id, cap1ProfileFilter, profileLinks) &&
        assetMatchesSearch(a, assetQuery),
    );
    const assetPager = pageSlice<R>(list, tablePage, 12);
    const expectedEvents = (s.expectedEvents ?? []).filter((e: R) =>
      expectedEventMatchesSearch(e, expectedQuery),
    );
    const expectedPager = pageSlice<R>(expectedEvents, expectedPage, 8);
    view = (
      <>
        {heading(
          creditsPointsPage ? 'Credits & points' : 'Travel assets',
          creditsPointsPage
            ? 'Balance per account and per batch — used, remaining, expiry, and history.'
            : 'Reusable value, with provenance and exact cost basis.',
          can('manage_assets') && (
            <>
              <button type="button" className="btn" onClick={() => go('Trade desk')}>
                Trade desk
              </button>
              {newButton('New trade', 'trade', { side: 'Buy', stock_mode: 'for_booking' })}
              {newButton(
                creditsPointsPage ? 'Acquire points / credit' : 'Buy travel asset',
                'acquire_asset',
              )}
              {creditsPointsPage ? (
                <button type="button" className="btn ghost" onClick={() => go('Travel Assets')}>
                  All travel assets
                </button>
              ) : (
                <button type="button" className="btn ghost" onClick={() => go('Credits & points')}>
                  Credits & points
                </button>
              )}
            </>
          ),
        )}
        <div className="toolbar">
          {['All', ...new Set(scopedAssets.map((a: R) => a.kind))].map((v: any) => (
            <button
              key={v}
              className={`btn ${filter === v ? 'primary' : ''}`}
              onClick={() => {
                setFilter(v);
                setTablePage(1);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="assets-search">
            {' '}
            <input
              id="assets-search"
              type="search"
              aria-label="Search credits and assets"
              placeholder="Search name, issuer or kind…"
              value={assetQuery}
              onChange={(e) => {
                setAssetQuery(e.target.value);
                setTablePage(1);
              }}
            />
          </label>
        </div>
        {canAssets &&
          (() => {
            const incompleteTrades = listTradesToComplete(scopedAssets as R[]);
            if (!incompleteTrades.length) return null;
            return (
              <Card title="Trades to complete" count={incompleteTrades.length}>
                <ul className="trade-to-complete-list">
                  {incompleteTrades.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => openRecord('asset', row.id)}
                      >
                        {row.name}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-label={`Copy link for ${row.name}`}
                        onClick={() => {
                          const path = workspaceRecordUrl('asset', row.id);
                          if (path) void copyWorkspacePath(path);
                        }}
                      >
                        Copy link
                      </button>
                      <small>To complete: {row.missing.join(' · ')}</small>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })()}
        {canAssets &&
          (() => {
            const profileRows = listCap1ProfileBalances(
              s.bookingSourceProfiles ?? [],
              s.sourceProfileAssets ?? [],
              assetRows.map((a: R) => ({
                id: a.id,
                kind: a.kind,
                balance: a.balance == null ? null : Number(a.balance),
                voided: a.credit_status === 'voided' || a.voided === true,
              })),
            );
            if (!profileRows.length) return null;
            const selectedProfile = profileRows.find(
              (r) => r.profile_id === cap1ProfileFilter,
            );
            return (
              <Card title="Cap1 credit balances by profile" count={profileRows.length}>
                <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                  Plan: remaining face per Cap1 account profile. Click a profile to filter the
                  batches below. Incomplete when a linked credit balance is Unknown — never shown
                  as $0.
                </p>
                {selectedProfile ? (
                  <div className="toolbar" style={{ marginBottom: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Showing credits for <strong>{selectedProfile.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn small ghost"
                      aria-label="Clear Cap1 profile filter"
                      onClick={() => {
                        setCap1ProfileFilter('All');
                        setTablePage(1);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Profile</th>
                        <th>Credits</th>
                        <th className="money">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileRows.map((row) => {
                        const selected = cap1ProfileFilter === row.profile_id;
                        return (
                          <tr
                            key={row.profile_id}
                            className={selected ? 'is-focused' : undefined}
                          >
                            <td>
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ padding: 0, textAlign: 'left' }}
                                aria-pressed={selected}
                                aria-label={`Filter credits for ${row.name}`}
                                onClick={() => {
                                  setCap1ProfileFilter(
                                    toggleCap1ProfileFilter(
                                      cap1ProfileFilter,
                                      row.profile_id,
                                    ),
                                  );
                                  setTablePage(1);
                                }}
                              >
                                <strong>{row.name}</strong>
                              </button>
                              {row.provider ? <small>{row.provider}</small> : null}
                            </td>
                            <td>{row.credit_count}</td>
                            <td
                              className="money"
                              style={{
                                color:
                                  row.balance_cents != null && row.balance_cents > 0
                                    ? '#2f6b4f'
                                    : undefined,
                              }}
                            >
                              {cap1ProfileBalanceLabel(row, money)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}
        <div className="list-block">
        <div className="asset-grid">
          {assetPager.items.map((a: R) => (
            <div className="card asset-card" key={a.id}>
              <div className="asset-head">
                <span className="travel-icon">
                  {isPoints(a) ? <Coins size={19} /> : <Ticket size={19} />}
                </span>
                {isVoucherAsset(a.kind) && a.voucher_status ? (
                  <Badge
                    tone={
                      a.voucher_status === 'expired' ||
                      a.voucher_status === 'sold' ||
                      a.voucher_status === 'used'
                        ? 'amber'
                        : 'green'
                    }
                  >
                    {a.voucher_status}
                  </Badge>
                ) : null}
                <Badge tone={a.ownership === 'Padova' ? '' : 'amber'}>{a.ownership}</Badge>
              </div>
              <button
                style={{ textAlign: 'left', padding: 0 }}
                onClick={() => openRecord('asset', a.id)}
              >
                <h3>
                  {a.name} <ChevronRight size={12} />
                </h3>
              </button>
              <p>
                {a.issuer} · {a.kind}
              </p>
              <div className="balance">{assetQuantity(a, a.balance)}</div>
              {isPoints(a) &&
                (() => {
                  const batch = pointsBatchSummary({
                    remaining: a.balance == null ? null : Number(a.balance),
                    remaining_basis_cents:
                      a.remaining_basis == null ? null : Number(a.remaining_basis),
                    opening:
                      a.opening_quantity == null ? null : Number(a.opening_quantity),
                  });
                  return (
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                      {pointsBatchListLabel(batch, (n) =>
                        n.toLocaleString('en-US'),
                      )}
                    </p>
                  );
                })()}
              <p>
                Remaining cost basis{' '}
                <strong style={{ color: '#53685b' }}>{money(a.remaining_basis)}</strong>
              </p>
              <div className="progress">
                <span style={{ width: Number(a.balance) > 0 ? '100%' : '0%' }} />
              </div>
              <p>
                <Clock size={11} />{' '}
                {a.expires_on
                  ? `Expires ${dateLabel(a.expires_on, { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'No expiration recorded'}
              </p>
              {a.restrictions && <p>{a.restrictions}</p>}
              <div className="asset-actions">
                <button className="btn small" onClick={() => action('fund', { asset_id: a.id })}>
                  Use for booking
                </button>
                <button
                  className="btn small"
                  onClick={() => action('sell_asset', { asset_id: a.id })}
                >
                  Sell
                </button>
                <button className="btn small" onClick={() => openRecord('asset', a.id)}>
                  Ledger
                </button>
                <button
                  type="button"
                  className="btn small ghost"
                  aria-label={`Copy link for ${a.name}`}
                  onClick={() => {
                    const path = workspaceRecordUrl('asset', a.id);
                    if (path) void copyWorkspacePath(path);
                  }}
                >
                  Copy link
                </button>
              </div>
            </div>
          ))}
        </div>
        <ListPager
          page={assetPager.page}
          totalPages={assetPager.totalPages}
          total={assetPager.total}
          from={assetPager.from}
          to={assetPager.to}
          onPage={setTablePage}
          label="assets"
        />
        </div>
        {!canAssets && (
          <Empty>
            {creditsPointsPage ? 'Credits & points' : 'Travel Assets'} access requires permission.
          </Empty>
        )}
        {creditsPointsPage && canAssets && !list.length ? (
          <Empty>No credit or points balances yet. Acquire a batch or record a Cap1 credit.</Empty>
        ) : null}
        {s.fulfillmentEnabled && can('manage_assets') && (
          <div className="detail-section list-block">
            <Card
              title="Pending transfers & rewards"
              count={expectedPager.total}
              action={newButton('Track expected event', 'expected_event')}
            >
              <div className="section-body expected-events-panel">
                <p className="expected-events-intro">
                  Expected value does not change inventory or profit. Post only the actual issuer
                  receipt.
                </p>
                <label className="directory-search" htmlFor="expected-events-search">
                  {' '}
                  <input
                    id="expected-events-search"
                    type="search"
                    aria-label="Search pending transfers and rewards"
                    placeholder="Search kind, reference or booking…"
                    value={expectedQuery}
                    onChange={(e) => {
                      setExpectedQuery(e.target.value);
                      setExpectedPage(1);
                    }}
                  />
                </label>
                {expectedPager.items.length === 0 ? (
                  <Empty>
                    {expectedQuery.trim()
                      ? 'No pending transfers or rewards match this search.'
                      : 'No pending transfers or rewards to show.'}
                  </Empty>
                ) : (
                  <div className="expected-events-list">
                    {expectedPager.items.map((e: R) => {
                      const status = String(e.status || 'Pending');
                      const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                      const expectedQty =
                        e.quantity_expected !== null && e.quantity_expected !== undefined
                          ? Number(e.quantity_expected).toLocaleString()
                          : null;
                      const actualQty =
                        e.quantity_actual !== null && e.quantity_actual !== undefined
                          ? Number(e.quantity_actual).toLocaleString()
                          : null;
                      return (
                        <article className="expected-event-card" key={e.id}>
                          <div className="expected-event-card-main">
                            <div className="expected-event-identity">
                              <div className="expected-event-title-row">
                                <strong>{e.kind}</strong>
                                <span
                                  className={`expected-event-status is-${statusClass}`}
                                >
                                  {status}
                                </span>
                              </div>
                              {e.reference ? (
                                <span className="expected-event-ref">{e.reference}</span>
                              ) : null}
                            </div>
                            <div className="expected-event-metrics">
                              <div className="expected-event-metric">
                                <span className="detail-label">Expected</span>
                                <strong>
                                  {expectedQty ?? 'Unknown'}
                                  <small>points</small>
                                </strong>
                              </div>
                              <div className="expected-event-metric">
                                <span className="detail-label">Received</span>
                                <strong className={actualQty ? '' : 'is-empty'}>
                                  {actualQty ?? '—'}
                                  {actualQty ? <small>points</small> : null}
                                </strong>
                              </div>
                            </div>
                          </div>
                          {(() => {
                            const bookingId = String(e.booking_id || '').trim();
                            const share = expectedEventBookingSharePath(e);
                            const canRecord = !['Denied', 'Reversed'].includes(status);
                            if (!bookingId && !canRecord) return null;
                            return (
                              <div className="expected-event-card-actions">
                                {bookingId ? (
                                  <button
                                    type="button"
                                    className="btn small ghost"
                                    onClick={() => openRecord('booking', bookingId)}
                                  >
                                    Open booking
                                  </button>
                                ) : null}
                                {share ? (
                                  <button
                                    type="button"
                                    className="btn small ghost"
                                    aria-label="Copy link for booking"
                                    onClick={() => void copyWorkspacePath(share)}
                                  >
                                    Copy link
                                  </button>
                                ) : null}
                                {canRecord ? (
                                  <button
                                    className="btn small"
                                    onClick={() =>
                                      action('update_expected_event', { event_id: e.id })
                                    }
                                  >
                                    Record issuer result
                                  </button>
                                ) : null}
                              </div>
                            );
                          })()}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
            <ListPager
              page={expectedPager.page}
              totalPages={expectedPager.totalPages}
              total={expectedPager.total}
              from={expectedPager.from}
              to={expectedPager.to}
              onPage={setExpectedPage}
              label="expected events"
            />
          </div>
        )}
      </>
    );
  } else if (page === 'Expected commissions') {
    view = (
      <CommissionsPage
        commissions={s.commissions}
        referrals={s.referrals}
        referralPayments={s.referralPayments ?? []}
        referralTerms={s.referralTerms ?? []}
        referralPaymentAdjustments={s.referralPaymentAdjustments ?? []}
        bookings={bks}
        canManage={can('manage_commissions')}
        canEditPayments={can('edit_payments')}
        payableTermsEnabled={s.payableTermsEnabled}
        today={s.today}
        action={action}
        openBooking={(id) => openRecord('booking', id)}
        copyBookingLink={(id) => {
          const path = calendarBookingSharePath(id);
          if (path) void copyWorkspacePath(path);
        }}
        newCommissionButton={
          can('manage_commissions') && newButton('Add commission', 'commission')
        }
      />
    );
  } else if (page === 'Refunds') {
    view = (
      <>
        {heading(
          'Refunds & cancellations',
          'Track each original funding component and what actually came back.',
          can('issue_refunds') && newButton('Record cancellation', 'cancel'),
        )}
        <div className="toolbar">
          {['Outstanding', 'All'].map((x) => (
            <button
              className={filter === x ? 'btn small primary' : 'btn small'}
              key={x}
              onClick={() => {
                setFilter(x);
                setTablePage(1);
              }}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="refunds-search">
            {' '}
            <input
              id="refunds-search"
              type="search"
              aria-label="Search refunds"
              placeholder="Search booking #, customer or reason…"
              value={refundQuery}
              onChange={(e) => {
                setRefundQuery(e.target.value);
                setTablePage(1);
              }}
            />
          </label>
        </div>
        {(() => {
          const refundRows = s.refunds
            .filter(
              (r: R) =>
                (filter === 'All' ||
                  Number(r.received) < Number(r.supplier_expected) ||
                  Number(r.paid) + Number(r.handed_over ?? 0) < Number(r.customer_due)) &&
                refundMatchesSearch(r, refundQuery),
            )
            .slice()
            .sort((a: R, b: R) =>
              compareRefundFollowUpDue(
                { due_on: a.due_on },
                { due_on: b.due_on },
                today,
              ),
            );
          const refundPager = pageSlice<R>(refundRows, tablePage, 12);
          return (
            <div className="list-block">
              <Card title="Refund follow-ups" count={refundRows.length}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Booking / reason</th>
                        <th>Follow-up</th>
                        <th>Customer</th>
                        {canRefunds && (
                          <>
                            <th className="money">Supplier expected</th>
                            <th className="money">Supplier received</th>
                          </>
                        )}
                        <th>Customer status</th>
                        <th className="money">Customer due</th>
                        <th className="money">Customer paid</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {refundPager.items.map((r: R) => (
                        <tr
                          key={r.id}
                          id={`refund-row-${r.id}`}
                          className={focusRefundId === r.id ? 'is-focused' : undefined}
                        >
                          <td>
                            <button
                              className="booking-code"
                              onClick={() => openRecord('booking', r.booking_id)}
                            >
                              {r.code}
                            </button>
                            <small>{r.reason}</small>
                            {r.call_notes_latest ? (
                              <small>Call note: {r.call_notes_latest}</small>
                            ) : null}
                            {(() => {
                              const cb = chargebackStatusLabel(
                                parseChargebackStatus(r.reason) ||
                                  parseChargebackStatus(r.call_notes_latest),
                              );
                              return cb ? <small>{cb}</small> : null;
                            })()}
                          </td>
                          <td>
                            {(() => {
                              const due = refundFollowUpDueOn(r.due_on);
                              if (!due) return <span className="muted">—</span>;
                              const label = refundFollowUpUrgencyLabel(
                                refundFollowUpUrgency(due, today),
                              );
                              return (
                                <>
                                  {dateLabel(due)}
                                  {label ? <small>{label}</small> : null}
                                </>
                              );
                            })()}
                          </td>
                          <td>{r.customer}</td>
                          {canRefunds && (
                            <>
                              <td className="money">{refundValue(r, r.supplier_expected)}</td>
                              <td className="money">
                                {refundValue(r, r.received)}
                                <small>{r.received_forms || 'Not received'}</small>
                              </td>
                            </>
                          )}
                          <td>{customerRefundStatusLabel(customerRefundStatus(r))}</td>
                          <td className="money">{money(r.customer_due)}</td>
                          <td className="money">{money(r.paid)}</td>
                          <td className="payments-actions">
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={async () => {
                                const path = workspaceRecordUrl('refund', r.id);
                                await navigator.clipboard.writeText(
                                  `${window.location.origin}${path}`,
                                );
                                setFocusRefundId(r.id);
                                setFocusPaymentId(null);
                                setFilter('All');
                                setToast('Refund link copied');
                                if (typeof window !== 'undefined') {
                                  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                                  if (current !== path)
                                    window.history.replaceState(null, '', path);
                                }
                              }}
                            >
                              Copy link
                            </button>
                            {canRefunds && (
                              <>
                                <button
                                  className="btn small"
                                  hidden={Number(r.received) >= Number(r.supplier_expected)}
                                  disabled={!canAction('receive_refund')}
                                  onClick={() => action('receive_refund', { refund_id: r.id })}
                                >
                                  Receive
                                </button>
                                <button
                                  className="btn small"
                                  hidden={Number(r.received) >= Number(r.supplier_expected)}
                                  disabled={!canAction('receive_refund')}
                                  onClick={() =>
                                    action('receive_refund', {
                                      refund_id: r.id,
                                      form: SUPPLIER_REFUND_DENIED_FORM,
                                      amount: Math.max(
                                        0,
                                        Number(r.supplier_expected) - Number(r.received),
                                      ),
                                    })
                                  }
                                >
                                  Deny supplier
                                </button>
                                <button
                                  className="btn small"
                                  hidden={
                                    Number(r.paid) + Number(r.handed_over ?? 0) >=
                                    Number(r.customer_due)
                                  }
                                  disabled={!canAction('pay_refund')}
                                  onClick={() => action('pay_refund', { refund_id: r.id })}
                                >
                                  Pay customer
                                </button>
                                <button
                                  className="btn small"
                                  disabled={!canAction('note')}
                                  onClick={() =>
                                    action('note', {
                                      call_note: true,
                                      record_type: 'refund',
                                      record_id: r.id,
                                    })
                                  }
                                >
                                  Call note
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!s.refunds.length && <Empty>No refunds recorded.</Empty>}
              </Card>
              <ListPager
                page={refundPager.page}
                totalPages={refundPager.totalPages}
                total={refundPager.total}
                from={refundPager.from}
                to={refundPager.to}
                onPage={setTablePage}
                label="refunds"
              />
            </div>
          );
        })()}
      </>
    );
  } else if (page === 'Calendar') {
    view = (
      <>
        {heading(
          'Travel calendar',
          'Live booking dates, travelers and status.',
          newButton('New booking', 'booking'),
        )}
        <TravelCalendar
          bookings={bks}
          components={s.travelComponents ?? []}
          today={today}
          open={(id) => openRecord('booking', id)}
          copyLink={async (id) => {
            const path = calendarBookingSharePath(id);
            if (!path) return;
            await navigator.clipboard.writeText(`${window.location.origin}${path}`);
            setToast('Link copied');
            if (typeof window !== 'undefined') {
              const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
              if (current !== path) window.history.replaceState(null, '', path);
            }
          }}
        />
      </>
    );
  } else if (page === 'To-do') {
    const planTodos = planTodosAll;
    const filteredTodos = filterPlanTodoList(planTodos, todoCategory).filter((item) =>
      planTodoMatchesSearch(item, todoQuery),
    );
    const categoryCounts = (Object.keys(PLAN_TODO_CATEGORY_LABELS) as PlanTodoCategory[]).map(
      (cat) => ({
        cat,
        count: planTodos.filter((i) => i.category === cat).length,
      }),
    );
    view = (
      <>
        {heading(
          'To-do',
          'Refunds due, pending price matches, commissions, expiring credits, missing cost, unpaid balances.',
          newButton('New task', 'task'),
        )}
        <div className="toolbar transactions-toolbar" role="group" aria-label="To-do category">
          <button
            type="button"
            className={`btn ${todoCategory === 'All' ? 'primary' : ''}`}
            onClick={() => setTodoCategory('All')}
          >
            All ({planTodos.length})
          </button>
          {categoryCounts
            .filter((c) => c.count > 0 || c.cat !== 'other')
            .map(({ cat, count }) => (
              <button
                type="button"
                key={cat}
                className={`btn ${todoCategory === cat ? 'primary' : ''}`}
                onClick={() => setTodoCategory(cat)}
              >
                {PLAN_TODO_CATEGORY_LABELS[cat]}
                {count ? ` (${count})` : ''}
              </button>
            ))}
          <button type="button" className="btn ghost" onClick={() => go('Attention')}>
            Needs attention <Badge tone="amber">{s.attention.length}</Badge>
          </button>
          <button type="button" className="btn ghost" onClick={() => go('Tasks')}>
            Team tasks
          </button>
          <button type="button" className="btn ghost" onClick={() => go('Follow-up')}>
            Operational views
          </button>
        </div>
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="todo-search">
            {' '}
            <input
              id="todo-search"
              type="search"
              aria-label="Search to-do"
              placeholder="Search title, detail or booking…"
              value={todoQuery}
              onChange={(e) => setTodoQuery(e.target.value)}
            />
          </label>
        </div>
        <Card title="To-do" count={filteredTodos.length}>
          {!filteredTodos.length ? (
            <Empty>Nothing in this To-do view right now.</Empty>
          ) : (
            <ul className="plain-list dashboard-todo-list">
              {filteredTodos.map((item) => (
                <li key={item.id} className="dashboard-todo-item">
                  <button
                    type="button"
                    className="dashboard-todo-main"
                    onClick={() => {
                      if (item.booking_id) void openRecord('booking', item.booking_id);
                      else if (item.record_type && item.record_id)
                        void openRecord(item.record_type, item.record_id);
                      else if (item.kind === 'task') go('Tasks');
                      else {
                        setFollowupSelected('Needs Attention');
                        go('Follow-up');
                      }
                    }}
                  >
                    <strong>{item.title}</strong>
                    <small>{PLAN_TODO_CATEGORY_LABELS[item.category]}</small>
                    {item.detail ? <small>{item.detail}</small> : null}
                    {item.due_on ? <small>Due {dateLabel(item.due_on)}</small> : null}
                  </button>
                  {planTodoRecordUrl(item) ? (
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const path = planTodoRecordUrl(item);
                        if (!path) return;
                        await navigator.clipboard.writeText(
                          `${window.location.origin}${path}`,
                        );
                        setToast('Link copied');
                        if (typeof window !== 'undefined') {
                          const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                          if (current !== path)
                            window.history.replaceState(null, '', path);
                        }
                      }}
                    >
                      Copy link
                    </button>
                  ) : null}
                  {item.kind === 'task' && item.task_id ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => action('complete_task', { task_id: item.task_id })}
                    >
                      Done
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  } else if (page === 'Follow-up') {
    view = (
      <>
        {heading('Operational follow-up', 'Exceptions from recorded transactions.')}
        <OperationalViews
          initialSelected={followupSelected}
          views={s.operationalViews ?? {}}
          open={(r: R) =>
            void openRecord(
              r.booking_id ? 'booking' : (r.record_type ?? 'asset'),
              r.booking_id ?? r.record_id,
            )
          }
          copyLink={copyWorkspacePath}
        />
      </>
    );
  } else if (page === 'Tasks' || page === 'Attention') {
    view = (
      <>
        {heading(
          page === 'Tasks' ? 'Tasks & follow-ups' : 'Things that need attention',
          page === 'Tasks'
            ? 'Human follow-ups alongside system-generated exceptions.'
            : 'Live checks derived from bookings, payments, assets, and refunds.',
          newButton('New task', 'task'),
        )}
        <div className="toolbar">
          <button
            className={`btn ${page === 'Tasks' ? 'primary' : ''}`}
            onClick={() => go('Tasks')}
          >
            Tasks
          </button>
          <button
            className={`btn ${page === 'Attention' ? 'primary' : ''}`}
            onClick={() => go('Attention')}
          >
            Needs attention <Badge tone="amber">{s.attention.length}</Badge>
          </button>
        </div>
        {page === 'Attention' ? (
          <>
            <div className="toolbar directory-toolbar">
              <label className="directory-search" htmlFor="attention-search">
                {' '}
                <input
                  id="attention-search"
                  type="search"
                  aria-label="Search attention"
                  placeholder="Search title, detail or booking…"
                  value={attentionQuery}
                  onChange={(e) => setAttentionQuery(e.target.value)}
                />
              </label>
            </div>
            {(() => {
              const filteredAttention = (s.attention as R[]).filter((a) =>
                followupRowMatchesSearch(a, attentionQuery),
              );
              return (
                <Card title="Open exceptions" count={filteredAttention.length}>
                  {filteredAttention.length ? (
                    attentionRows(filteredAttention)
                  ) : (
                    <Empty>
                      {attentionQuery.trim()
                        ? 'No exceptions match this search.'
                        : 'All current exceptions have been resolved.'}
                    </Empty>
                  )}
                </Card>
              );
            })()}
          </>
        ) : (
          <>
            <div className="toolbar directory-toolbar">
              <label className="directory-search" htmlFor="tasks-search">
                {' '}
                <input
                  id="tasks-search"
                  type="search"
                  aria-label="Search team tasks"
                  placeholder="Search title, notes or assignee…"
                  value={taskQuery}
                  onChange={(e) => setTaskQuery(e.target.value)}
                />
              </label>
            </div>
            {(() => {
              const filteredTasks = (s.tasks as R[]).filter((t) =>
                teamTaskMatchesSearch(
                  {
                    ...t,
                    assignee_name: t.assignee_id
                      ? (s.staff.find((person: R) => person.id === t.assignee_id)?.name ??
                        'Inactive staff member')
                      : null,
                  },
                  taskQuery,
                ),
              );
              const openCount = filteredTasks.filter((t) => t.status === 'Open').length;
              return (
                <Card title="Team tasks" count={openCount}>
                  {!filteredTasks.length ? (
                    <Empty>No team tasks match this search.</Empty>
                  ) : (
                    filteredTasks.map((t: R) => (
                      <div className="attention-row" key={t.id}>
                        <button
                          className="icon-button"
                          disabled={t.status === 'Done' || busy}
                          aria-label={
                            t.status === 'Done'
                              ? `Completed task: ${t.title}`
                              : `Complete task: ${t.title}`
                          }
                          onClick={() => action('complete_task', { task_id: t.id })}
                        >
                          <CheckCircle2
                            size={20}
                            color={t.status === 'Done' ? '#69977b' : '#c6d0c9'}
                          />
                        </button>
                        <div className="attention-text">
                          <strong
                            style={{
                              textDecoration: t.status === 'Done' ? 'line-through' : '',
                            }}
                          >
                            {t.title}
                          </strong>
                          <small>
                            {t.due_on ? `Due ${dateLabel(t.due_on)}` : 'No due date'} · {t.status}
                            {t.assignee_id &&
                              ` · ${s.staff.find((person: R) => person.id === t.assignee_id)?.name ?? 'Inactive staff member'}`}
                            {t.notes && ` · ${t.notes}`}
                          </small>
                        </div>
                        <Badge tone={t.priority === 'Normal' ? 'gray' : 'amber'}>
                          {t.priority}
                        </Badge>
                        <button
                          className="btn ghost"
                          onClick={() => action('update_task', { ...t, task_id: t.id })}
                        >
                          Edit
                        </button>
                        {(() => {
                          const sharePath = planTodoRecordUrl({
                            booking_id:
                              t.record_type === 'booking' ? t.record_id : undefined,
                            record_type: t.record_type,
                            record_id: t.record_id,
                          });
                          if (!sharePath) return null;
                          return (
                            <>
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() =>
                                  void openRecord(
                                    t.record_type === 'booking' ? 'booking' : t.record_type,
                                    t.record_id,
                                  )
                                }
                              >
                                {t.record_type === 'booking' ? 'Booking' : 'Open'}{' '}
                                <ChevronRight size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(
                                    `${window.location.origin}${sharePath}`,
                                  );
                                  setToast('Link copied');
                                  if (typeof window !== 'undefined') {
                                    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                                    if (current !== sharePath)
                                      window.history.replaceState(null, '', sharePath);
                                  }
                                }}
                              >
                                Copy link
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </Card>
              );
            })()}
          </>
        )}
        {page === 'Attention' && s.travelerReview && (
          <Card title="Traveler source review" count={s.travelerReview.remaining}>
            <TravelerSourceReview
              review={s.travelerReview}
              parties={parties}
              save={async (data) => {
                await command('review_resolution', data);
                await refresh();
              }}
            />
          </Card>
        )}
        {page === 'Attention' && historicalPreparation && (
          <div className="detail-section" style={{ marginTop: 22 }}>
            <Card
              title="Historical booking preparation"
              count={historicalPreparation.reconciliation.totalSourceRows}
            >
              <div className="section-body">
                <p>
                  {historicalPreparation.reconciliation.uniquePreparedBookings} prepared bookings ·{' '}
                  {historicalPreparation.reconciliation.mappedSourceRows} mapped source rows ·{' '}
                  {historicalPreparation.reconciliation.counts['Needs Review']} rows need review.
                  All source fields are retained. Financial claims remain staged.
                </p>
                <label htmlFor="historical-search">
                  Find historical customer, route, confirmation or source
                </label>
                <input
                  id="historical-search"
                  value={historicalQuery}
                  onChange={(e) => setHistoricalQuery(e.target.value)}
                />
                <label htmlFor="historical-status">Preparation status</label>
                <select
                  id="historical-status"
                  value={historicalStatus}
                  onChange={(e) => setHistoricalStatus(e.target.value)}
                >
                  {[
                    'Prepared booking',
                    'Needs Review',
                    'Linked supporting row',
                    'Preserved supporting row',
                    'All',
                  ].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <p className="muted">
                  Showing up to 100 matching source rows. Prepared records are separate from live
                  financial bookings.
                </p>
              </div>
              <div className="toolbar">
                <button
                  className="btn ghost"
                  disabled={historicalOffset === 0}
                  onClick={() => setHistoricalOffset(Math.max(0, historicalOffset - 100))}
                >
                  Previous
                </button>
                <span>
                  Rows {historicalOffset + 1}�{historicalOffset + historicalPreparation.rows.length}
                </span>
                <button
                  className="btn ghost"
                  disabled={!historicalPreparation.hasMore}
                  onClick={() => setHistoricalOffset(historicalOffset + 100)}
                >
                  Next
                </button>
              </div>
              {historicalPreparation.rows.map((r: R) => (
                <div className="attention-row" key={r.id}>
                  <div className="attention-text">
                    <strong>
                      {r.customer ?? 'Identity not confirmed'} · {r.route ?? r.tab}
                    </strong>
                    <small>
                      {r.workbook} · {r.tab} · row {r.row} · {(r.confirmations ?? []).join(' · ')}
                    </small>
                  </div>
                  <Badge tone="amber">{r.status}</Badge>
                  <button className="btn ghost" onClick={() => openRecord('historical', r.id)}>
                    Source details <ChevronRight size={12} />
                  </button>
                </div>
              ))}
            </Card>
          </div>
        )}
        {page === 'Attention' && s.sourceReviewCount > 0 && (
          <div className="detail-section" style={{ marginTop: 22 }}>
            <Card title="Preserved source reviews" count={s.sourceReviewCount}>
              <div className="section-body">
                <p className="subtitle">
                  Historical evidence remains separate from live bookings and payments. Showing up
                  to 100 open reviews; these records are read-only here.
                </p>
              </div>
              {s.sourceReviews.map((r: R) => (
                <div className="attention-row" key={r.id}>
                  <div className="attention-text">
                    <strong>{r.title}</strong>
                    <small>
                      {r.category} · {r.status}
                    </small>
                  </div>
                  <Badge tone="amber">Source review</Badge>
                  {s.finalIntegrityEnabled && (
                    <button
                      className="btn small"
                      onClick={() =>
                        action('review_resolution', {
                          source_key: `review_case:${r.id}`,
                          source_link: `padova.review_cases/${r.id}`,
                          issue_type: r.category,
                          status: 'Held',
                          source_locator: { review_case_id: r.id },
                        })
                      }
                    >
                      Record decision
                    </button>
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}
        {page === 'Attention' && s.finalIntegrityEnabled && s.actor.role === 'OWNER' && (
          <Card title="Source resolution history" count={s.reviewResolutionEvents?.length ?? 0}>
            <div className="section-body">
              <button
                className="btn"
                onClick={() => action('review_resolution', { status: 'Held' })}
              >
                Record source review decision
              </button>
              <p className="subtitle">
                Append decisions against stable source keys. Original evidence and previously
                approved mappings remain preserved. Counts for preparation, source cases, traveler
                holds and financial flags remain separate.
              </p>
              {(s.reviewResolutionEvents ?? []).map((e: R) => (
                <p key={e.id}>
                  <strong>{e.source_key}</strong> · {e.status} · {e.decision} · {e.actor} ·{' '}
                  {dateLabel(e.created_at)}
                </p>
              ))}
            </div>
          </Card>
        )}
      </>
    );
  } else if (page === 'Accounting') {
    const movements = s.movements.filter((m: R) => m.effective_on.slice(0, 7) === month),
      prior = movements
        .filter((m: R) => m.booking_month && m.booking_month !== month)
        .reduce((a: number, m: R) => a + Number(m.amount), 0),
      net = movements.reduce((a: number, m: R) => a + Number(m.amount), 0);
    const cash = s.cashMovements
      .filter((m: R) => m.effective_on.slice(0, 7) === month)
      .reduce((a: number, m: R) => a + Number(m.amount), 0);
    const reportYear = Number(month.slice(0, 4)) || new Date().getFullYear();
    const profitByMonth = canTotalProfit
      ? buildProfitByMonth(
          bks.map((b) => ({
            booked_on: b.booked_on,
            created_at: b.created_at,
            profit: b.profit == null ? null : Number(b.profit),
            reservation_status: b.reservation_status,
          })),
        )
      : [];
    view = (
      <>
        {heading(
          'Accounting & profit',
          'On-demand reports. Company totals are Owner-only.',
          <input
            aria-label="Reporting month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="btn"
          />,
        )}
        {finance || canTotalProfit ? (
          <>
            <div className="month-report">
              <div className="metric">
                <div className="metric-label">Prior-period / bookkeeping adjustments</div>
                <div className="report-num">{money(canTotalProfit ? prior : undefined)}</div>
                <p className="subtitle">Older bookings changed this month</p>
              </div>
              <div className="metric">
                <div className="metric-label">Net monthly profit movement</div>
                <div className="report-num">{money(canTotalProfit ? net : undefined)}</div>
                <p className="subtitle">New bookings, adjustments, assets & commissions</p>
              </div>
              <div className="metric">
                <div className="metric-label">Net cash movement</div>
                <div className="report-num">{money(finance ? cash : undefined)}</div>
                <p className="subtitle">Actual receipts less actual payments</p>
              </div>
            </div>
            {canTotalProfit && (
              <>
                <Card
                  title="Profit by month"
                  action={
                    <button
                      className="btn ghost"
                      onClick={() =>
                        downloadCSV(
                          yearEndFileNames(reportYear).profit_by_month,
                          profitByMonth.map((r) => ({ ...r })),
                        )
                      }
                    >
                      <Download size={13} />
                      Export CSV
                    </button>
                  }
                >
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th className="money">Bookings</th>
                          <th className="money">Confirmed profit</th>
                          <th className="money">Incomplete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitByMonth.map((r) => (
                          <tr key={r.month}>
                            <td>{r.month}</td>
                            <td className="money">{r.booking_count}</td>
                            <td className="money">
                              {r.confirmed_profit_usd === 'incomplete'
                                ? 'Incomplete'
                                : `$${r.confirmed_profit_usd}`}
                            </td>
                            <td className="money">{r.incomplete_bookings}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!profitByMonth.length && (
                    <Empty>No booked months with profit data yet.</Empty>
                  )}
                  <p className="subtitle" style={{ marginTop: 10 }}>
                    Incomplete months keep Unknown profit — never shown as $0.
                  </p>
                </Card>
                <Card
                  title={`Year-end accountant pack · ${reportYear}`}
                  action={
                    <button
                      className="btn ghost"
                      onClick={() => {
                        const pack = buildYearEndExportPack({
                          year: reportYear,
                          bookings: bks,
                          payments: s.payments ?? [],
                          commissions: s.commissions ?? [],
                          referrals: s.referrals ?? [],
                          referralPayments: s.referralPayments ?? [],
                        });
                        const names = yearEndFileNames(reportYear);
                        const files: [string, Record<string, string>[]][] = [
                          [names.bookings, pack.bookings],
                          [names.payments, pack.payments],
                          [names.commissions, pack.commissions],
                          [names.referrer_payments, pack.referrer_payments],
                        ];
                        for (const [name, rows] of files) {
                          if (rows.length) downloadCSV(name, rows);
                          else
                            downloadText(
                              name,
                              rowsToCsv([
                                {
                                  note: `No ${name.replace(`padova-${reportYear}-`, '').replace('.csv', '')} rows for ${reportYear}`,
                                },
                              ]),
                            );
                        }
                        setToast(`Downloaded ${reportYear} accountant CSVs (open in Excel).`);
                      }}
                    >
                      <Download size={13} />
                      Download CSVs
                    </button>
                  }
                >
                  <p className="subtitle">
                    Bookings, payments, commissions, and referrer payments for the year of the
                    month picker. CSV opens in Excel. Staff accounts do not see this pack.
                  </p>
                </Card>
              </>
            )}
            <Card
              title="Monthly financial movements"
              action={
                <button
                  className="btn ghost"
                  onClick={() =>
                    downloadCSV(
                      `padova-profit-${month}.csv`,
                      movements.map(({ amount, ...record }: R) => ({
                        ...record,
                        amount_usd: (Number(amount) / 100).toFixed(2),
                      })),
                    )
                  }
                >
                  <Download size={13} />
                  Export CSV (USD)
                </button>
              }
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Booking</th>
                      <th>Movement</th>
                      <th className="money">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m: R) => (
                      <tr key={m.id}>
                        <td>{dateLabel(m.effective_on)}</td>
                        <td>{m.code ?? 'Asset sale'}</td>
                        <td>{pretty(m.kind)}</td>
                        <td className={`money ${Number(m.amount) < 0 ? 'text-red' : 'text-green'}`}>
                          {money(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!movements.length && <Empty>No financial movement in this month.</Empty>}
            </Card>
            <div style={{ marginTop: 22 }}>
              <Card title="Operational trial balance" action={<Badge>USD · all dates</Badge>}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th className="money">Debits</th>
                        <th className="money">Credits</th>
                        <th className="money">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.journal.map((r: R) => (
                        <tr key={r.account}>
                          <td>{pretty(r.account)}</td>
                          <td className="money">{money(r.debit)}</td>
                          <td className="money">{money(r.credit)}</td>
                          <td className="money">{money(Number(r.debit) - Number(r.credit))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            <p className="subtitle">
              Operational ledger for travel workflows. Tax accounting, period locks, bank
              reconciliation, and QuickBooks integration require further work.
            </p>
          </>
        ) : (
          <Empty>Financial reporting requires permission.</Empty>
        )}
      </>
    );
  } else if (page === 'Activity') {
    view = (
      <>
        {heading(
          'Activity history',
          'Attributed, chronological events. Financial history is append-only.',
        )}
        <div className="toolbar directory-toolbar">
          <label className="directory-search" htmlFor="activity-search">
            {' '}
            <input
              id="activity-search"
              type="search"
              aria-label="Search activity"
              placeholder="Search summary, actor or source…"
              value={activityQuery}
              onChange={(e) => {
                setActivityQuery(e.target.value);
                setTablePage(1);
              }}
            />
          </label>
        </div>
        {(() => {
          const filteredAudit = (s.audit as R[]).filter((a) =>
            auditMatchesSearch(a, activityQuery),
          );
          const activityPager = pageSlice<R>(filteredAudit, tablePage, 12);
          return (
            <div className="list-block">
              <Card title="Recent events" count={filteredAudit.length}>
                {activityPager.items.map((a: R) => (
                  <div className="activity" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.summary || pretty(a.kind)}</strong>
                      <p>
                        {dateTimeLabel(a.created_at)} · {a.actor_name ?? a.actor}
                        {a.source_label ? (
                          <>
                            {' · '}
                            <Badge
                              tone={
                                a.source_channel === 'whatsapp' || a.source_channel === 'email'
                                  ? 'blue'
                                  : a.source_channel === 'import'
                                    ? 'amber'
                                    : 'gray'
                              }
                            >
                              {a.source_label}
                            </Badge>
                          </>
                        ) : null}
                      </p>
                      {bks.some((b) => b.id === a.record_id) ? (
                        <div className="activity-actions" style={{ marginTop: 8 }}>
                          <button
                            className="btn ghost"
                            onClick={() => openRecord('booking', a.record_id)}
                          >
                            Open booking <ArrowRight size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn small ghost"
                            aria-label="Copy shareable link"
                            onClick={() => {
                              const path = calendarBookingSharePath(a.record_id);
                              if (path) void copyWorkspacePath(path);
                            }}
                          >
                            Copy link
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </Card>
              <ListPager
                page={activityPager.page}
                totalPages={activityPager.totalPages}
                total={activityPager.total}
                from={activityPager.from}
                to={activityPager.to}
                onPage={setTablePage}
                label="events"
              />
            </div>
          );
        })()}
      </>
    );
  } else if (page === 'Users & Permissions') {
    view = (
      <>
        {heading('Users & permissions', 'Individual accounts, role defaults and explicit grants.')}
        {can('manage_users') ? (
          <UserAdministration />
        ) : (
          <Empty>User administration requires permission.</Empty>
        )}
      </>
    );
  } else {
    view = (
      <>
        {heading(
          'Your account & settings',
          'Your individual identity and authorized workspace settings.',
        )}
        <div className="detail-section">
          <Card title="Signed-in user">
            <div className="section-body">
              <strong>{s.actor.name}</strong>
              <p className="subtitle">
                {s.actor.role === 'OWNER' ? 'Owner / Admin' : 'Employee / Worker'} · Individual
                staff account
              </p>
              <p className="subtitle">
                Your actions are attributed to your account and recorded with a timestamp.
              </p>
            </div>
          </Card>
        </div>
        <PasswordChange />
        <PersonalRecoveryCodes />
        {can('manage_settings') && (
          <div className="detail-section">
            <Card title="Programs, instruments & holder accounts">
              <div className="section-body">
                {s.fulfillmentEnabled ? (
                  <>
                    <div className="heading-actions">
                      {newButton('Add program', 'program')}
                      {newButton('Add instrument', 'instrument')}
                      {newButton('Add holder account', 'program_account')}
                    </div>
                    {(s.programs ?? []).map((p: R) => (
                      <div className="note" key={p.id}>
                        <strong>{p.name}</strong> · {p.category}
                        {(s.instruments ?? [])
                          .filter((i: R) => i.program_id === p.id)
                          .map((i: R) => (
                            <p key={i.id}>
                              {i.name} · {i.unit} · {i.role}
                            </p>
                          ))}
                      </div>
                    ))}
                    {(s.programAccounts ?? []).map((a: R) => (
                      <p key={a.id}>
                        {a.name} · {person(a.holder_id)} · {a.ownership}
                        {a.masked_reference && ` · …${a.masked_reference}`}
                      </p>
                    ))}
                  </>
                ) : (
                  <p>
                    The incremental program/fulfillment extension is prepared locally. This
                    workspace continues using its installed adapter until the extension has been
                    reviewed and applied.
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}
        {can('manage_settings') && (
          <div className="detail-section" style={{ marginTop: 22 }}>
            <Card title="Card fee defaults">
              <div className="section-body">
                <ul className="plain-list">
                  <li>
                    Customer card fee:{' '}
                    {(Number(s.feeSettings?.customer_card_fee_bps ?? 290) / 100).toFixed(2)}%
                    pass-through
                  </li>
                  <li>
                    Padova card cost:{' '}
                    {(Number(s.feeSettings?.padova_card_fee_bps ?? 270) / 100).toFixed(2)}% +{' '}
                    {money(s.feeSettings?.padova_card_fee_flat_cents ?? 30)}
                  </li>
                  {!s.feeSettingsEnabled && (
                    <li>
                      Using Plan defaults in this workspace until the fee-settings extension is
                      installed. Values still guide booking Card fee suggestions.
                    </li>
                  )}
                </ul>
                <button
                  className="btn"
                  disabled={!s.feeSettingsEnabled}
                  onClick={() =>
                    action('update_fee_settings', {
                      customer_card_fee_bps: s.feeSettings?.customer_card_fee_bps ?? 290,
                      padova_card_fee_bps: s.feeSettings?.padova_card_fee_bps ?? 270,
                      padova_card_fee_flat_cents: s.feeSettings?.padova_card_fee_flat_cents ?? 30,
                    })
                  }
                >
                  Edit card fee defaults
                </button>
              </div>
            </Card>
          </div>
        )}
        {can('manage_settings') && (
          <div className="detail-section" style={{ marginTop: 22 }}>
            <Card title="Workspace & backup administration">
              <div className="section-body">
                <button className="btn" onClick={() => action('payment_account')}>
                  Add reusable payment account
                </button>
                <ul className="plain-list">
                  {s.paymentAccounts.map((a: R) => (
                    <li key={a.id}>
                      {a.name} · {a.kind}
                      {a.last_four && ' · ' + a.last_four}
                    </li>
                  ))}
                  <li>Reporting currency: USD</li>
                  {s.operationalGate && (
                    <li>
                      Business timezone: {s.operationalGate.business_timezone}. Operational entry:{' '}
                      {s.operationalGate.operational_entry_enabled &&
                      s.operationalGate.backup_verified_at
                        ? 'Enabled'
                        : 'Locked pending independent backup and restore verification'}
                      .
                    </li>
                  )}
                  <li>Independent scheduled backups and production hosting remain unconfigured.</li>
                  <li>
                    Encrypted backup export and isolated restore checks are implemented. See
                    BUILD_STATE for operational recovery setup.
                  </li>
                </ul>
              </div>
            </Card>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="app">
      {mobile && (
        <button
          className="navigation-shade"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobile ? 'open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="brand">
          <div className="brand-symbol">P</div>
          <div>
            <strong>PADOVA</strong>
            <small style={s.developmentData ? { color: '#f4c46c' } : undefined}>
              {s.developmentData ? 'TEST / SYNTHETIC' : 'TRAVEL OPERATIONS'}
            </small>
          </div>
          <button className="mobile-close" onClick={() => setMobile(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        {nav
          .filter(([name]) =>
            [
              'Bookings',
              'Dashboard',
              'People & Families',
              'Companies',
              'Suppliers',
              'Sources & Brokers',
              ...(hasPermission(s.actor, 'view_partnerships') ? ['Partnerships'] : []),
            ].includes(name),
          )
          .map(([name, I]) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => go(name)}
            >
              <I />
              {name === 'People & Families' ? 'Customers' : name}
            </button>
          ))}
        <div className="nav-label">FINANCE & OPERATIONS</div>
        {nav
          .filter(
            ([name]) =>
              ![
                'Dashboard',
                'Bookings',
                'People & Families',
                'Companies',
                'Suppliers',
                'Sources & Brokers',
                'Activity',
                'Settings',
                'Partnerships',
              ].includes(name),
          )
          .filter(([name]) =>
            name === 'Tasks'
              ? false
              : name === 'Travel Assets'
                ? false
                : name === 'Credits & points' || name === 'Trade desk'
                  ? canAssets
                  : name === 'Expected commissions'
                    ? canCommissions
                    : name === 'Refunds'
                      ? canRefunds
                      : name === 'Accounting'
                        ? finance || canTotalProfit
                        : true,
          )
          .map(([name, I]) => (
            <button
              key={name}
              className={`nav-item ${page === name || (name === 'To-do' && page === 'Tasks') ? 'active' : ''}`}
              onClick={() => go(name)}
            >
              <I />
              {name}
              {name === 'To-do' && planTodosAll.length > 0 && (
                <span className="nav-count">{planTodosAll.length}</span>
              )}
            </button>
          ))}
        <div className="sidebar-bottom">
          {can('manage_users') && (
            <button
              className={`nav-item ${page === 'Users & Permissions' ? 'active' : ''}`}
              onClick={() => go('Users & Permissions')}
            >
              <Users />
              Users & Permissions
            </button>
          )}
          {nav
            .filter(([name]) => ['Activity', 'Settings'].includes(name))
            .map(([name, I]) => (
              <button
                key={name}
                className={`nav-item ${page === name ? 'active' : ''}`}
                onClick={() => go(name)}
              >
                <I />
                {name}
              </button>
            ))}
          <div className="workspace-mark">
            <span className="avatar">PT</span>
            <div>
              <strong>Padova Travel</strong>
              <small>
                {s.developmentData ? 'TEST · Local synthetic ledger' : 'Private workspace'}
              </small>
            </div>
            <ShieldCheck size={15} style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />
            <b>
              {selected
                ? 'Record details'
                : page === 'People & Families'
                  ? 'Customers'
                  : page}
            </b>
          </div>
          <div className="top-right">
            <div className="search">
              <Search size={15} color="#9ca69f" />
              <input
                aria-label="Global search"
                placeholder="Search customers, bookings, PNRs, tickets…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>Search</kbd>
            </div>
            <button
              className="icon-button"
              onClick={() => go('Attention')}
              title="Things that need attention"
            >
              <Bell size={18} />
            </button>
            {s.qaMode && (
              <details className="action-menu qa-help">
                <summary className="btn">Help</summary>
                <div className="action-menu-panel">
                  <QAReports
                    owner={s.actor.role === 'OWNER'}
                    section={
                      selected
                        ? 'Record details'
                        : page === 'People & Families'
                          ? 'Customers'
                          : page
                    }
                    booking={detail?.booking?.code ?? detail?.code ?? selected?.id ?? ''}
                  />
                </div>
              </details>
            )}
            <span className="divider" />
            <button className="avatar" onClick={() => go('Settings')} title={s.actor.name}>
              {initials(s.actor.name)}
            </button>
            {!s.localDemo && (
              <button
                className="icon-button"
                title="Sign out"
                onClick={async () => {
                  await fetch('/api/auth', { method: 'DELETE' });
                  setUnauth(true);
                  setS(null);
                  setSelected(null);
                  setDetail(null);
                  setModal(null);
                  setQuery('');
                  setPage(WORKSPACE_HOME_PAGE);
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
          {query && (
            <div className="search-results">
              {searchHits.length ? (
                searchHits.map((h, i) => (
                  <button
                    key={i}
                    className="search-result"
                    onClick={() =>
                      'open' in h && h.open
                        ? h.open()
                        : h.page
                          ? go(h.page)
                          : openRecord(h.type!, h.id!)
                    }
                  >
                    {h.label}
                    <small>{h.sub}</small>
                  </button>
                ))
              ) : (
                <Empty>
                  {/^pdv[-\s]?\d+/i.test(query.trim()) && s.qaMode
                    ? 'No matching records on QA. Production booking codes (PDV-…) usually live only on production, not in this QA database.'
                    : 'No matching records.'}
                </Empty>
              )}
            </div>
          )}
        </header>
        <div className="content">
          {s.qaMode && !s.developmentData && (
            <div className="demo-banner qa-host-banner">
              <ShieldCheck size={13} />
              <strong>QA practice workspace</strong>
              <span>
                Intake and UX testing only. 2026 production books and Batch A history allocations are
                not in this database until Owner moves work to production.
              </span>
            </div>
          )}
          {s.developmentData && (
            <div className="demo-banner">
              <ShieldCheck size={13} />
              <strong>
                {s.qaMode ? 'PRACTICE / QA (NOT REAL DATA)' : 'TEST / SYNTHETIC (PRACTICE ONLY)'}
              </strong>
              <span>
                This is the local test workspace. Entries here do not go to the real US Padova
                ledger.
              </span>
            </div>
          )}
          {recoveryOffer && !(modal?.kind === 'booking' && modal?.key === recoveryOffer.commandKey) ? (
            <div className="demo-banner recovery-offer-banner" role="status">
              <strong>Unfinished booking on this device</strong>
              <span>
                Not opened automatically (Plan). Continue when ready
                {recoveryOffer.hasPaste ? ' — paste is still saved' : ''}. Discard clears only this
                device draft — nothing was posted.
              </span>
              <div className="recovery-offer-actions">
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => {
                    const draft = readBookingRecovery(s.actor.id);
                    if (!draft || draft.commandKey !== recoveryOffer.commandKey) {
                      setRecoveryOffer(null);
                      return;
                    }
                    setModal({
                      kind: 'booking',
                      key: draft.commandKey,
                      defaults: bookingRecoveryContinueDefaults(draft),
                    });
                  }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: 'Discard unfinished booking?',
                      message:
                        'Clears the draft saved on this device only. Nothing was posted to the books.',
                      confirmLabel: 'Discard',
                    });
                    if (!ok) return;
                    clearBookingRecovery(s.actor.id);
                    clearBookingRecoverySnooze(s.actor.id);
                    setRecoveryOffer(null);
                    setToast('Unfinished booking discarded on this device.');
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
          {view}
          <div className="footer-note">
            <span>PADOVA TRAVEL · Private operating workspace</span>
            <span>USD · All financial changes preserve history</span>
          </div>
        </div>
      </main>
      {intakeOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!intakeBusy) closeIntake();
          }}
        >
          <div
            className={`modal intake-modal intake-modal-client${intakeBusy ? ' is-busy' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-draft-title"
            aria-busy={intakeBusy}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head intake-modal-head">
              <div>
                <h2 id="intake-draft-title">Intake draft</h2>
                <p>
                  Paste reservation details or drop a file. We fill in what we can – you review
                  before saving.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close intake draft"
                onClick={() => closeIntake()}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body intake-modal-body">
              <section className="intake-preview intake-preview-client" aria-live="polite">
                <div className="intake-preview-grid">
                  {intakeBusy && (
                    <div className="intake-loading-overlay" role="status" aria-live="assertive">
                      <span className="intake-loading-spinner" aria-hidden />
                      <strong>
                        {intakeProgress
                          ? `Uploading ${intakeProgress.processed.toLocaleString()}/${intakeProgress.total.toLocaleString()}…`
                          : intakeFile && !intakeText.trim()
                            ? `Reading ${intakeFile.name}…`
                            : 'Working…'}
                      </strong>
                      <span>Press Escape to cancel</span>
                    </div>
                  )}
                  <div className="intake-preview-left">
                    <div
                      className={`intake-paste-box${intakeDrag ? ' is-dragging' : ''}`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!intakeBusy) setIntakeDrag(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!intakeBusy) setIntakeDrag(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIntakeDrag(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIntakeDrag(false);
                        if (intakeBusy) return;
                        const file = e.dataTransfer.files?.[0] ?? null;
                        if (file) void chooseIntakeFile(file);
                      }}
                    >
                      <div className="intake-panel-head-row">
                        <h3>What you pasted</h3>
                      </div>
                      <textarea
                        id="intake-text"
                        className="intake-preview-raw intake-preview-editable"
                        rows={12}
                        value={intakeText}
                        disabled={intakeBusy}
                        aria-label="What you pasted"
                        placeholder="Paste Field: Value lines here…"
                        onChange={(e) => {
                          setIntakeText(e.target.value);
                          setIntakeOverrides({});
                          setIntakeRemapRow(null);
                        }}
                      />
                      <div className="intake-paste-actions">
                        <label className="intake-file-link" htmlFor="intake-file">
                          <Upload size={14} aria-hidden />
                          Drop a file or browse
                          <input
                            id="intake-file"
                            type="file"
                            className="intake-file-input"
                            disabled={intakeBusy}
                            accept=".txt,.csv,.md,.eml,.json,.pdf,.png,.jpg,.jpeg,text/plain,text/csv,message/rfc822,application/pdf,image/png,image/jpeg"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              void chooseIntakeFile(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="intake-sample-btn"
                          disabled={intakeBusy}
                          onClick={() => {
                            setIntakeText(INTAKE_SAMPLE_PASTE);
                            setIntakeOverrides({});
                            setIntakeRemapRow(null);
                            setIntakeFile(null);
                            setIntakePreview(null);
                          }}
                        >
                          Use sample
                        </button>
                        {intakeFile && (
                          <span className="intake-file-chip">
                            {intakeFile.name}
                            <button
                              type="button"
                              className="btn small ghost"
                              disabled={intakeBusy}
                              onClick={() => {
                                setIntakeFile(null);
                              }}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="intake-preview-right">
                    <div className="intake-preview-right-head">
                      <h3>What we’ll fill in</h3>
                      {liveIntakePreview &&
                        !liveIntakePreview.unread &&
                        Boolean(intakeText.trim()) && (
                          <span className="intake-preview-count">
                            {liveIntakePreview.found} found
                            {liveIntakePreview.missing
                              ? ` · ${liveIntakePreview.missing} missing`
                              : ''}
                          </span>
                        )}
                    </div>
                    <div className="intake-preview-scroll">
                      {liveIntakePreview?.reservationBlock ? (
                        <p className="intake-preview-unread intake-reservation-gate" role="alert">
                          {liveIntakePreview.reservationBlock}
                        </p>
                      ) : null}
                      {liveIntakePreview?.unread ? (
                        <p className="intake-preview-unread" role="alert">
                          {liveIntakePreview.unreadMessage || UNREAD_FILE_MESSAGE}
                        </p>
                      ) : !intakeText.trim() ? (
                        <div className="intake-preview-empty-state">
                          <p>Mapping shows here after you paste or drop a file.</p>
                        </div>
                      ) : liveIntakePreview ? (
                        <ul className="intake-preview-rows">
                          {liveIntakePreview.rows.map((row) => {
                            const selected =
                              row.id in intakeOverrides
                                ? intakeOverrides[row.id]
                                : undefined;
                            const remapping = intakeRemapRow === row.id;
                            const remapped = selected !== undefined;
                            const required = INTAKE_REQUIRED_ROWS.has(row.id);
                            const needsAttention =
                              (row.status === 'missing' || row.status === 'confirm') &&
                              required;
                            return (
                              <li
                                key={row.id}
                                className={`${row.status}${remapped ? ' is-remapped' : ''}${remapping ? ' is-open' : ''}${needsAttention ? ' is-required-missing' : ''}`}
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
                                    <button
                                      type="button"
                                      className="intake-remap-toggle"
                                      disabled={
                                        intakeBusy || !liveIntakePreview.lines.length
                                      }
                                      aria-expanded={remapping}
                                      onClick={() =>
                                        setIntakeRemapRow(remapping ? null : row.id)
                                      }
                                    >
                                      {remapped ? 'Mapped' : 'Map'}
                                    </button>
                                  </div>
                                </div>
                                {remapping && (
                                  <label className="intake-remap">
                                    <span>Use paste line</span>
                                    <select
                                      autoFocus
                                      value={
                                        selected === undefined
                                          ? '__auto__'
                                          : selected || '__clear__'
                                      }
                                      disabled={intakeBusy}
                                      aria-label={`Map ${row.fieldLabel}`}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setIntakeOverrides((prev) => {
                                          const next = { ...prev };
                                          if (v === '__auto__') delete next[row.id];
                                          else if (v === '__clear__') next[row.id] = '';
                                          else next[row.id] = v;
                                          return next;
                                        });
                                        setIntakeRemapRow(null);
                                      }}
                                    >
                                      <option value="__auto__">
                                        {row.sourceLabel
                                          ? `Auto · ${row.sourceLabel}`
                                          : 'Auto-detect'}
                                      </option>
                                      <option value="__clear__">Clear · add after</option>
                                      {liveIntakePreview.lines.map((line) => (
                                        <option key={line.id} value={line.id}>
                                          {line.label}: {line.value.slice(0, 56)}
                                          {line.value.length > 56 ? '…' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <details className="intake-advanced">
                <summary>Email / WhatsApp options</summary>
                {intakeChannelStatus && (
                  <div className="intake-hint" role="status">
                    <strong>Channel status</strong>
                    <span>{intakeChannelStatus.email}</span>
                    <span>{intakeChannelStatus.whatsapp}</span>
                  </div>
                )}
                <label className="intake-email-toggle">
                  <input
                    type="checkbox"
                    checked={intakeAsEmail}
                    disabled={intakeBusy}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setIntakeAsEmail(on);
                      if (on) setIntakeAsWhatsApp(false);
                    }}
                  />
                  Forwarded email (Shmuel@ or mindy@ only). Saves as an email intake draft.
                </label>
                {intakeAsEmail && (
                  <div className="intake-email-fields">
                    <label>
                      Intake mailbox
                      <select
                        value={intakeMailbox}
                        disabled={intakeBusy}
                        onChange={(e) =>
                          setIntakeMailbox(e.target.value as (typeof INTAKE_EMAIL_MAILBOXES)[number])
                        }
                      >
                        {INTAKE_EMAIL_MAILBOXES.map((box) => (
                          <option key={box} value={box}>
                            {box}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      From
                      <input
                        value={intakeEmailFrom}
                        disabled={intakeBusy}
                        placeholder="sender@example.com"
                        onChange={(e) => setIntakeEmailFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Subject
                      <input
                        value={intakeEmailSubject}
                        disabled={intakeBusy}
                        placeholder="Reservation confirmation"
                        onChange={(e) => setIntakeEmailSubject(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <label className="intake-email-toggle">
                  <input
                    type="checkbox"
                    checked={intakeAsWhatsApp}
                    disabled={intakeBusy}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setIntakeAsWhatsApp(on);
                      if (on) setIntakeAsEmail(false);
                    }}
                  />
                  WhatsApp chat paste. Saves as a WhatsApp intake draft (read-only; never sends).
                </label>
                {intakeAsWhatsApp && (
                  <div className="intake-email-fields">
                    <label>
                      Chat name (optional)
                      <input
                        value={intakeWaChat}
                        disabled={intakeBusy}
                        placeholder="Customer chat"
                        onChange={(e) => setIntakeWaChat(e.target.value)}
                      />
                    </label>
                    <label>
                      From number (optional)
                      <input
                        value={intakeWaFrom}
                        disabled={intakeBusy}
                        placeholder="+1…"
                        onChange={(e) => setIntakeWaFrom(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </details>

              {intakeProgress && (
                <div className="intake-progress" role="status" aria-live="polite">
                  <div className="intake-progress-meta">
                    <strong>
                      {intakeProgress.processed.toLocaleString()} /{' '}
                      {intakeProgress.total.toLocaleString()} uploaded
                    </strong>
                    <span>
                      {intakeProgress.remaining.toLocaleString()} remaining
                      {intakeProgress.total
                        ? ` · ${Math.min(
                            100,
                            Math.round((intakeProgress.processed / intakeProgress.total) * 100),
                          )}%`
                        : ''}
                    </span>
                  </div>
                  <div
                    className="progress intake-progress-bar"
                    aria-valuemin={0}
                    aria-valuemax={intakeProgress.total}
                    aria-valuenow={intakeProgress.processed}
                  >
                    <span
                      style={{
                        width: `${
                          intakeProgress.total
                            ? Math.min(
                                100,
                                (intakeProgress.processed / intakeProgress.total) * 100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {intakeStatus && (
                <p className="intake-status form-error" role="alert">
                  {intakeStatus}
                </p>
              )}
            </div>
            <div className="modal-footer intake-modal-footer">
              <p className="intake-preview-summary">
                {intakeBusy
                  ? intakeProgress
                    ? `Uploading ${intakeProgress.processed.toLocaleString()}/${intakeProgress.total.toLocaleString()}…`
                    : intakeFile && !intakeText.trim()
                      ? 'Reading file…'
                      : 'Working…'
                  : liveIntakePreview?.unread
                    ? 'Could not read. Paste text instead.'
                    : !intakeText.trim()
                      ? 'Paste text or Use sample to map fields'
                      : liveIntakePreview
                        ? `${liveIntakePreview.found} found · ${liveIntakePreview.missing} to add yourself`
                        : 'Paste or drop a file to preview'}
              </p>
              <div className="intake-footer-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={intakeBusy}
                  onClick={() => closeIntake()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={
                    intakeBusy ||
                    (!intakeText.trim() && !intakeFile) ||
                    Boolean(liveIntakePreview?.unread) ||
                    Boolean(liveIntakePreview?.reservationBlock) ||
                    !liveIntakePreview ||
                    liveIntakePreview.found === 0
                  }
                  onClick={() => {
                    void (async () => {
                      setIntakeStatus('');
                      setError('');
                      try {
                        const emlFile = Boolean(
                          intakeFile &&
                            (/\.eml$/i.test(intakeFile.name) ||
                              intakeFile.type === 'message/rfc822'),
                        );
                        const mailbox = String(intakeMailbox || '').trim() || undefined;
                        const asEmail = Boolean(intakeAsEmail || (emlFile && mailbox));
                        const asWhatsApp = Boolean(intakeAsWhatsApp && !asEmail);
                        const fromAddress = asWhatsApp
                          ? intakeWaFrom.trim() || undefined
                          : intakeEmailFrom.trim() || undefined;
                        const subject = asWhatsApp
                          ? intakeWaChat.trim() || undefined
                          : intakeEmailSubject.trim() || undefined;

                        const binary =
                          !asEmail &&
                          !asWhatsApp &&
                          intakeFile &&
                          !/\.(txt|csv|md|eml|json)$/i.test(intakeFile.name) &&
                          !/^text\//i.test(intakeFile.type || '');

                        if (!liveIntakePreview || liveIntakePreview.unread)
                          throw new Error('Review the mapping before creating a draft');
                        if (liveIntakePreview.reservationBlock)
                          throw new Error(liveIntakePreview.reservationBlock);
                        if (!intakeText.trim() && !intakeFile)
                          throw new Error('Paste reservation text or drop a file first');

                        const mappedText = applyIntakeFieldOverrides(
                          intakeText,
                          liveIntakePreview.rows,
                          intakeOverrides,
                          liveIntakePreview.lines,
                        );

                        setIntakeBusy(true);
                      setIntakeProgress(null);
                      let created = 0;
                      let lastTitle = '';

                      if (binary && intakeFile) {
                        if (!mappedText.trim()) throw new Error(UNREAD_FILE_MESSAGE);
                        setIntakeProgress({ processed: 0, total: 1, remaining: 1 });
                        const data = new FormData();
                        data.append('command_id', crypto.randomUUID());
                        data.append('file', intakeFile);
                        data.append('source', 'staff_upload');
                        data.append('text', mappedText);
                        if (fromAddress) data.append('from_address', fromAddress);
                        if (subject) data.append('subject', subject);
                        if (mailbox) data.append('mailbox', mailbox);
                        const response = await fetch('/api/booking-intake', {
                          method: 'POST',
                          body: data,
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || 'Intake failed');
                        created = Number(result.count) || 1;
                        lastTitle = String(result.title || '');
                        setIntakeProgress({ processed: created, total: created, remaining: 0 });
                      } else {
                        let raw = mappedText;
                        if (intakeFile && !asWhatsApp && !mappedText.trim()) {
                          const fileText = await intakeFile.text();
                          const stripped =
                            looksLikeEml(fileText, intakeFile.name) ||
                            /\.eml$/i.test(intakeFile.name)
                              ? extractTextFromEml(fileText)
                              : fileText;
                          raw = stripped;
                        }
                        if (asEmail && !raw.trim())
                          throw new Error(
                            'Paste the email body or choose a .eml file; drafts never post money',
                          );
                        if (asWhatsApp && !raw.trim())
                          throw new Error(
                            'Paste the WhatsApp chat text as Field: Value; drafts never post money',
                          );
                        const entries = splitIntakeEntries(
                          raw,
                          asWhatsApp ? undefined : intakeFile?.name,
                        );
                        if (!entries.length)
                          throw new Error(
                            'Provide intake text and/or a file; drafts never post money',
                          );
                        if (entries.length > INTAKE_MAX_ENTRIES)
                          throw new Error(
                            `Intake supports up to ${INTAKE_MAX_ENTRIES.toLocaleString()} entries`,
                          );
                        const total = entries.length;
                        setIntakeProgress({ processed: 0, total, remaining: total });
                        const source = asEmail
                          ? 'email'
                          : asWhatsApp
                            ? 'whatsapp'
                            : intakeFile
                              ? 'staff_upload'
                              : 'staff_paste';
                        const filename = asWhatsApp
                          ? intakeWaChat.trim()
                            ? `whatsapp-chat:${intakeWaChat.trim()}`
                            : 'whatsapp-paste'
                          : intakeFile?.name;
                        for (let offset = 0; offset < total; offset += INTAKE_BATCH_SIZE) {
                          const batch = entries.slice(offset, offset + INTAKE_BATCH_SIZE);
                          const response = await fetch('/api/booking-intake', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              source,
                              filename,
                              command_id: crypto.randomUUID(),
                              entries: batch,
                              entry_offset: offset,
                              entry_total: total,
                              from_address: fromAddress,
                              subject,
                              mailbox: asEmail ? mailbox : undefined,
                            }),
                          });
                          const result = await response.json();
                          if (!response.ok) throw new Error(result.error || 'Intake failed');
                          created += Number(result.count) || batch.length;
                          lastTitle = String(result.title || lastTitle);
                          const processed = Math.min(
                            total,
                            Number(result.processed) || offset + batch.length,
                          );
                          setIntakeProgress({
                            processed,
                            total,
                            remaining: Math.max(0, total - processed),
                          });
                        }
                      }

                      await refresh();
                      setIntakeOpen(false);
                      resetIntakeChannels(true);
                      setToast(
                        created > 1
                          ? `${created.toLocaleString()} intake drafts created. Open each from Drafts, review, then Save Booking.`
                          : `Intake draft saved${lastTitle ? `: ${lastTitle}` : ''}. Open it from Drafts, review, then Save Booking.`,
                      );
                    } catch (err) {
                      setIntakeStatus(err instanceof Error ? err.message : 'Intake failed');
                    } finally {
                      setIntakeBusy(false);
                    }
                  })();
                }}
              >
                {intakeBusy
                  ? intakeProgress
                    ? `Uploading ${intakeProgress.processed.toLocaleString()}/${intakeProgress.total.toLocaleString()}…`
                    : 'Saving draft…'
                  : 'Create intake draft'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {invoicePreview && (
        <div className="modal-backdrop" role="presentation" onClick={() => setInvoicePreview(null)}>
          <div
            className="modal"
            role="dialog"
            aria-label="Invoice preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Invoice preview · {invoicePreview.preview.customer_name}</h2>
              <button type="button" className="btn" onClick={() => setInvoicePreview(null)}>
                Close
              </button>
            </div>
            <p className="note">
              Save as draft for Owner approve → mark sent. Nothing emails the customer
              automatically. Owner sample layout still ☐ open.
            </p>
            {invoicePreview.preview.incomplete && (
              <p className="note">Some line amounts are unknown — total is incomplete.</p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th className="money">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicePreview.preview.lines.map((line, i) => (
                    <tr key={`${line.kind}-${i}`}>
                      <td>
                        {line.kind === 'total' ? <strong>{line.label}</strong> : line.label}
                      </td>
                      <td className="money">
                        {line.amount_cents == null ? 'Unknown' : money(line.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invoicePreview.preview.payment && (
              <div className="note" style={{ marginTop: 12 }}>
                <div className="detail-label">Payment receipt</div>
                {formatInvoicePaymentReceiptLines(invoicePreview.preview.payment).map((row) => (
                  <div key={row}>{row}</div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                disabled={invoiceBusy || !can('view_sale_price')}
                onClick={() => {
                  void (async () => {
                    setInvoiceBusy(true);
                    try {
                      await command('invoice_draft', {
                        customer_id: invoicePreview.customer_id,
                        customer_name: invoicePreview.preview.customer_name,
                        lines: invoicePreview.preview.lines,
                        total_cents: invoicePreview.preview.total_cents,
                        incomplete: invoicePreview.preview.incomplete,
                        note: '',
                      });
                      setInvoicePreview(null);
                      setToast('Invoice draft saved. Owner can approve, then mark sent.');
                      await refresh();
                      if (selected) await openRecord(selected.type, selected.id);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setInvoiceBusy(false);
                    }
                  })();
                }}
              >
                {invoiceBusy ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(
                        formatInvoicePreviewPlainText(invoicePreview.preview),
                      );
                      setToast('Invoice text copied — paste into WhatsApp or email yourself.');
                    } catch {
                      setToast('Could not copy invoice text.');
                    }
                  })();
                }}
              >
                Copy text
              </button>
              <button type="button" className="btn" onClick={() => setInvoicePreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {statementPreview && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setStatementPreview(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-label="Customer statement preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Statement · {statementPreview.customer_name}</h2>
              <button type="button" className="btn" onClick={() => setStatementPreview(null)}>
                Close
              </button>
            </div>
            <p className="note">
              On-demand statement across bookings and payments as of{' '}
              {dateLabel(statementPreview.as_of)}. Preview only — nothing emails automatically.
              Owner sample layout still ☐ open.
            </p>
            {statementPreview.incomplete && (
              <p className="note">Some amounts are unknown — statement is incomplete.</p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="money">Charge</th>
                    <th className="money">Payment</th>
                    <th className="money">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementPreview.lines.map((line, i) => (
                    <tr key={`${line.date}-${i}`}>
                      <td>{line.date ? dateLabel(line.date) : '—'}</td>
                      <td>{line.label}</td>
                      <td className="money">
                        {line.charge_cents == null ? '—' : money(line.charge_cents)}
                      </td>
                      <td className="money">
                        {line.payment_cents == null ? '—' : money(line.payment_cents)}
                      </td>
                      <td className="money">
                        {line.balance_cents == null ? 'Unknown' : money(line.balance_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="statement-balance" style={{ marginTop: 12 }}>
              <span>Closing balance</span>
              <span>
                {statementPreview.closing_balance_cents == null
                  ? 'Unknown'
                  : money(statementPreview.closing_balance_cents)}
              </span>
            </div>
            <div className="modal-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(
                        formatCustomerStatementPlainText(statementPreview),
                      );
                      setToast('Statement text copied — paste into WhatsApp or email yourself.');
                    } catch {
                      setToast('Could not copy statement text.');
                    }
                  })();
                }}
              >
                Copy text
              </button>
              <button type="button" className="btn" onClick={() => setStatementPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {modal && (
        <CommandForm
          key={modal.key}
          config={modal}
          state={s}
          onClose={() => {
            setModal(null);
            refreshRecoveryOffer();
          }}
          onCreateParty={async (data: R, key: string) => {
            // Party create merges into booking local state — skip full /api/state wait.
            return command('party', data, key);
          }}
          onInlineCommand={async (kind: string, data: R, key: string) => {
            const result = await command(kind, data, key);
            // Inline party create is merged by BookingEntry; other commands still need refresh.
            if (kind !== 'party') await refresh();
            return result;
          }}
          onSubmit={async (data: R) => {
            const r = await command(modal.kind, data, modal.key);
            await refresh();
            setModal(null);
            refreshRecoveryOffer();
            if (modal.kind === 'booking') {
              await openRecord('booking', r.id);
              if (canAction('commission')) {
                setToast(
                  'Booking saved. Use Add commission for who owes Padova (IATA / secondary).',
                );
              } else {
                setToast('Saved. Linked balances and history updated.');
              }
            } else {
              setToast('Saved. Linked balances and history updated.');
              if (modal.kind === 'party') await openRecord('person', r.id);
              else if (selected) await openRecord(selected.type, selected.id);
            }
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
          {toast}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(name: string, rows: R[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    cell = csvCell;
  const text = [
    keys.map(cell).join(','),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(',')),
  ].join('\r\n');
  downloadText(name, text);
}
