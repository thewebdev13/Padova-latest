'use client';
import TravelCalendar from '@/components/travel-calendar';
import { tripTitle } from '@/lib/travel-presentation';
import QAReports from '@/components/qa-reports';
import Partnerships from '@/components/partnerships/workspace';
import TravelerSourceReview from '@/components/traveler-source-review';
import SourceAccount from '@/components/source-account';
import { bookingSearchTerms } from '@/lib/booking-search';
import { draftKind } from '@/lib/draft-kind';
import { transactionList, transactionIndicators } from '@/lib/transaction-list';
import { dateLabel } from '@/lib/display-date';
import { incompleteProfitReason, supplierCostIncomplete } from '@/lib/financial-display';
import { useState, useEffect, useCallback, useRef } from 'react';
import CommandForm from '@/components/command-form';
import HistoricalDraftDetails from '@/components/historical-draft-details';
import HistoricalRecordEditor from '@/components/historical-record-editor';
import { historicalRecordPresentation } from '@/lib/historical-record-presentation';
import HistoricalSourceDetails from '@/components/historical-source-details';
import { csvCell } from '@/lib/csv';
import { travelsBetween, upcomingBookings, nextTravelDate } from '@/lib/travel-schedule';
import { assetUnit, formatQuantity, refundQuantityUnit } from '@/lib/asset-units';
import { latestCreditRequests, sourceConfirmationLabel } from '@/lib/v1-entry';
import AuthScreen from '@/components/auth-screen';
import CommissionPayables from '@/components/commission-payables';
import OperationalViews from '@/components/operational-views';
import {
  clearBookingRecovery,
  clearBookingRecoverySnooze,
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
} from '@/lib/intake-channel-label';
import {
  expectedCommissionDisplay,
  receivableCommissionLabel,
} from '@/lib/commission-line-label';
import { readWorkspaceLocation, workspaceUrl } from '@/lib/workspace-routes';
import ListPager, { pageSlice } from '@/components/list-pager';
import UserAdministration, {
  PasswordChange,
  PersonalRecoveryCodes,
} from '@/components/user-administration';
import { hasPermission, commandPermission, Permission } from '@/lib/permissions';
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
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Hotel,
  Car,
  MoreHorizontal,
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
} from 'lucide-react';
type R = Record<string, any>;
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
function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Card({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
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
  ['Dashboard', LayoutDashboard],
  ['Bookings', Plane],
  ['People & Families', Users],
  ['Companies', Building2],
  ['Suppliers', Landmark],
  ['Sources & Brokers', Users],
  ['Partnerships', Building2],
  ['Payments', Wallet],
  ['Travel Assets', Ticket],
  ['Commissions', Coins],
  ['Refunds', ArrowDownLeft],
  ['Calendar', CalendarDays],
  ['Tasks', ClipboardList],
  ['Accounting', ChartNoAxesCombined],
  ['Activity', History],
  ['Settings', Settings],
] as const;

export default function Workspace({ synthetic = false }: { synthetic?: boolean }) {
  const [authReset, setAuthReset] = useState(() =>
    typeof window === 'undefined' ? false : readWorkspaceLocation().reset,
  );
  const [s, setS] = useState<R | null>(null),
    [page, setPage] = useState(() =>
      typeof window === 'undefined' ? 'Dashboard' : (readWorkspaceLocation().page ?? 'Dashboard'),
    ),
    [selected, setSelected] = useState<R | null>(null),
    [detail, setDetail] = useState<R | null>(null),
    [modal, setModal] = useState<R | null>(null),
    [query, setQuery] = useState(''),
    [historicalQuery, setHistoricalQuery] = useState(''),
    [directoryQuery, setDirectoryQuery] = useState(''),
    [directoryPage, setDirectoryPage] = useState(1),
    [directoryType, setDirectoryType] = useState('All'),
    [directorySort, setDirectorySort] = useState('name'),
    [bookingStatus, setBookingStatus] = useState('All'),
    [historicalStatus, setHistoricalStatus] = useState('Prepared booking'),
    [filter, setFilter] = useState('All'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [unauth, setUnauth] = useState(false),
    [horizon, setHorizon] = useState(7),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [followupSelected, setFollowupSelected] = useState('Needs Attention'),
    [bookingPage, setBookingPage] = useState(1),
    [tablePage, setTablePage] = useState(1),
    [calendarMonth, setCalendarMonth] = useState(new Date().toISOString().slice(0, 7)),
    [day, setDay] = useState(''),
    [intakeOpen, setIntakeOpen] = useState(false),
    [intakeText, setIntakeText] = useState(''),
    [intakeFile, setIntakeFile] = useState<File | null>(null),
    [intakeStatus, setIntakeStatus] = useState(''),
    [intakeBusy, setIntakeBusy] = useState(false),
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
    [draftPage, setDraftPage] = useState(1);
  const resetIntakeChannels = (clearText = false) => {
    setIntakeFile(null);
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
    if (intakeBusy) return;
    setIntakeOpen(false);
    // Keep pasted text on cancel; clear channel toggles / file so reopen is clean.
    resetIntakeChannels(false);
  };
  useEffect(() => {
    if (!intakeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeIntake();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intakeOpen, intakeBusy]);
  const chooseIntakeFile = async (file: File | null) => {
    setIntakeFile(file);
    setIntakeStatus('');
    if (!file || !/\.eml$/i.test(file.name)) return;
    try {
      const raw = await file.text();
      const envelope = parseEmlEnvelope(raw);
      const body = extractTextFromEml(raw);
      setIntakeAsEmail(true);
      setIntakeAsWhatsApp(false);
      if (envelope.mailbox) setIntakeMailbox(envelope.mailbox);
      if (envelope.from_address) setIntakeEmailFrom(envelope.from_address);
      if (envelope.subject) setIntakeEmailSubject(envelope.subject);
      if (body.trim()) setIntakeText((prev) => (prev.trim() ? prev : body));
    } catch {
      setIntakeStatus('Could not read that .eml file. Paste the email body instead.');
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
      setPage('Dashboard');
      setUnauth(true);
      if (typeof window !== 'undefined') {
        const next = workspaceUrl('Dashboard', window.location.hash);
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current !== next) window.history.replaceState(null, '', next);
      }
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
  useEffect(() => {
    if (!s?.actor?.id) return;
    const draft = readBookingRecovery(s.actor.id);
    // Server "Continue Draft" rows stay in Drafts — do not pop the modal on every /w/… refresh.
    // New unfinished bookings still auto-restore unless Cancel snoozed this tab session.
    if (!shouldAutoOpenBookingRecovery(s.actor.id, draft)) {
      if (draft && draft.values?.draft_id) clearBookingRecovery(s.actor.id);
      return;
    }
    setModal({
      kind: 'booking',
      key: draft!.commandKey,
      defaults: {
        ...draft!.values,
        components: draft!.components,
        pending_traveler: draft!.traveler,
        recovery_paste: draft!.paste,
      },
    });
    setToast('Your unfinished booking has been restored.');
  }, [s?.actor?.id]);
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
  const openRecord = async (type: string, id: string) => {
    setSelected({ type, id });
    setDetail(null);
    setQuery('');
    setError('');
    try {
      const r = await fetch(`/api/state?type=${type}&id=${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    const applyLocation = (opts?: { replaceLegacy?: boolean; initial?: boolean }) => {
      const loc = readWorkspaceLocation();
      if (loc.reset) {
        setAuthReset(true);
        setS(null);
        setSelected(null);
        setDetail(null);
        setModal(null);
        setPage('Dashboard');
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
    applyLocation({ replaceLegacy: true, initial: true });
    const onPop = () => applyLocation({ replaceLegacy: false });
    const onHash = () => {
      const loc = readWorkspaceLocation();
      if (loc.reset) {
        applyLocation({ replaceLegacy: false });
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
  }, []);
  const go = (name: string) => {
    setDirectoryQuery('');
    setDirectoryPage(1);
    setDirectoryType('All');
    setPage(name);
    setSelected(null);
    setDetail(null);
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
        defaults = {
          ...defaults,
          amount: (
            (kind === 'pay_refund'
              ? Number(r.customer_due) - Number(r.paid) - Number(r.handed_over ?? 0)
              : Number(r.supplier_expected) - Number(r.received)) /
            (kind === 'receive_refund' && ['points', 'count'].includes(r.unit) ? 1 : 100)
          ).toFixed(2),
          ...(kind === 'receive_refund'
            ? {
                form:
                  r.unit === 'points'
                    ? 'points'
                    : r.unit === 'count'
                      ? 'Certificate'
                      : f?.asset_id
                        ? 'Voucher'
                        : 'cash',
                asset_id: f?.asset_id,
                account_id: f?.account_id,
                ...(f?.account_id
                  ? {
                      method:
                        s?.paymentAccounts.find((a: R) => a.id === f.account_id)?.kind === 'Card'
                          ? 'Card'
                          : 'ACH',
                    }
                  : {}),
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
        defaults = {
          ...defaults,
          charge_reduction: b.sale == null ? '' : (Number(b.sale) / 100).toFixed(2),
          customer_due:
            b.customer_balance == null
              ? ''
              : (Math.max(0, Number(b.sale) - Number(b.customer_balance)) / 100).toFixed(2),
          ...(f
            ? {
                funding_component_id: f.id,
                supplier_expected:
                  recoverable == null
                    ? ''
                    : (Number(recoverable) / (unit === 'money' ? 100 : 1)).toString(),
              }
            : {}),
        };
      }
    }
    if (kind === 'booking' && s?.actor?.id) clearBookingRecoverySnooze(s.actor.id);
    const draft =
      kind === 'booking' && !defaults.draft_id && s?.actor?.id
        ? readBookingRecovery(s.actor.id)
        : null;
    setModal(
      draft
        ? {
            kind,
            key: draft.commandKey,
            defaults: {
              ...draft.values,
              components: draft.components,
              pending_traveler: draft.traveler,
              recovery_paste: draft.paste,
            },
          }
        : { kind, defaults, key: crypto.randomUUID() },
    );
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
  const bks: R[] = s.bookings,
    parties: R[] = s.parties;
  const today = s.today,
    person = (id: string) => parties.find((p) => p.id === id)?.name ?? '—';
  const currentMonth = today.slice(0, 7);
  const owed = bks.reduce((a, b) => a + Math.max(0, Number(b.customer_balance)), 0);
  const owing =
    s.journal
      .filter((r: R) =>
        ['supplier_payable', 'asset_acquisition_payable', 'referral_payable'].includes(r.account),
      )
      .reduce((a: number, r: R) => a + Number(r.credit) - Number(r.debit), 0) +
    s.refunds.reduce(
      (a: number, r: R) => a + Math.max(0, Number(r.customer_due) - Number(r.paid)),
      0,
    );
  const monthProfit = s.movements
    .filter((m: R) => m.effective_on.slice(0, 7) === currentMonth)
    .reduce((a: number, m: R) => a + Number(m.amount), 0);
  const monthSale = bks
    .filter((b) => b.booked_on.slice(0, 7) === currentMonth)
    .reduce((a, b) => a + Number(b.sale), 0);
  const travelMatches = (b: R, start: string, end = start, product = 'All') =>
    travelsBetween(
      b as Parameters<typeof travelsBetween>[0],
      s.travelComponents ?? [],
      start,
      end,
      product,
    );
  const todayTravel = bks.filter(
    (b) => b.reservation_status !== 'Traveled' && travelMatches(b, today),
  );
  const upcoming = upcomingBookings(
    bks as (R & Parameters<typeof travelsBetween>[0])[],
    s.travelComponents ?? [],
    today,
    new Date(new Date(today).getTime() + horizon * 86400000).toISOString().slice(0, 10),
  );
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
  const searchHits = query.trim()
    ? [
        ...bks.filter(matches).map((b) => ({
          type: 'booking',
          id: b.id,
          label: `${b.code} · ${b.summary}`,
          sub: `${b.customer} · ${b.confirmations}`,
        })),
        ...parties.filter(matches).map((p) => ({
          type: 'person',
          id: p.id,
          label: p.name,
          sub: `${pretty(p.kind)} · ${p.email ?? p.phone ?? ''}`,
        })),
        ...s.assets.filter(matches).map((a: R) => ({
          page: 'Travel Assets',
          label: a.name,
          sub: `${a.kind} · ${a.reference}`,
        })),
        ...s.payments.filter(matches).map((p: R) => ({
          page: 'Payments',
          label: `${p.party} · ${money(p.current_amount)}`,
          sub: p.reference,
        })),
        ...s.commissions.filter(matches).map((c: R) => ({
          type: 'booking',
          id: c.booking_id,
          label: `Commission · ${c.code}`,
          sub: c.collector ?? c.payer,
        })),
      ].slice(0, 14)
    : [];
  const tripView = (b: R) => {
    const travels = (s.travelComponents ?? []).filter((t: R) => t.booking_id === b.id);
    return travels.length === 1
      ? { ...b, details: travels[0].details, provider: person(travels[0].provider_id) }
      : b;
  };
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
                className="clickable"
                onClick={() =>
                  openRecord(
                    kind === 'booking' ? 'booking' : 'asset',
                    kind === 'booking' ? r.id : r.asset_id,
                  )
                }
              >
                <td>{date ? dateLabel(date) : 'Unknown date'}</td>
                <td>
                  <span
                    className="transaction-description"
                    title={kind === 'booking' ? tripTitle(tripView(r)) : r.asset}
                  >
                    <strong>{kind === 'booking' ? tripTitle(tripView(r)) : r.asset}</strong>
                    <span className="transaction-meta">
                      {' '}
                      ·
                      {kind === 'booking'
                        ? [r.product, r.code, r.confirmations].filter(Boolean).join(' · ')
                        : 'Voucher / asset sale'}
                    </span>
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
                    {kind === 'booking' && r.travelers && (
                      <span className="transaction-meta"> · {r.travelers}</span>
                    )}
                  </span>
                </td>
                <td>
                  <Badge>{kind === 'booking' ? r.reservation_status : 'Sale'}</Badge>
                </td>
                <td>
                  <span className="transaction-indicators">
                    {transactionIndicators(kind, r, s.operationalViews ?? {}, {
                      sale: canSale,
                      cost: canCosts,
                    }).map((flag) => (
                      <Badge key={flag.label} tone={flag.tone}>
                        {flag.label}
                      </Badge>
                    ))}
                  </span>
                </td>
                {canSale && (
                  <td className="money">{money(kind === 'booking' ? r.sale : r.proceeds)}</td>
                )}
                <td>
                  <button
                    className="btn ghost"
                    aria-label={'Open ' + (kind === 'booking' ? r.code : r.asset)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRecord(
                        kind === 'booking' ? 'booking' : 'asset',
                        kind === 'booking' ? r.id : r.asset_id,
                      );
                    }}
                  >
                    Open
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
              <th>Trip / booking</th>
              <th>Customer / traveler</th>
              <th>Travel date</th>
              <th>Status</th>
              {canSale && (
                <>
                  <th className="money">Price / balance</th>
                </>
              )}
              {canBookingProfit && <th className="money">Expected profit</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr className="clickable" key={b.id} onClick={() => openRecord('booking', b.id)}>
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
                    {b.code} · {b.confirmations || 'Confirmation missing'}
                  </small>
                </td>
                <td>
                  <strong>{b.customer}</strong>
                  <small>{b.travelers || <Badge tone="amber">Traveler missing</Badge>}</small>
                </td>
                <td>
                  {b.travel_start ? dateLabel(b.travel_start) : 'No date'}
                  {b.travel_end && b.travel_end !== b.travel_start
                    ? ` – ${dateLabel(b.travel_end)}`
                    : ''}
                  <small>{b.itinerary?.trip_type || b.product}</small>
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
                    {b.reservation_status}
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
                {canBookingProfit && (
                  <td
                    className={`money ${b.cost_incomplete || b.profit == null ? 'text-amber' : 'text-green'}`}
                  >
                    <small className="mobile-cell-label">Expected profit</small>
                    {incompleteProfitReason(b) ?? money(b.profit)}
                  </td>
                )}
                <td>
                  <ChevronRight size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty>No bookings match this view.</Empty>
    );
  const attentionRows = (items: R[], limit = 100) =>
    items.slice(0, limit).map((a) => (
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
                : go(a.kind === 'Payment allocation' ? 'Payments' : 'Travel Assets')
            }
          >
            <strong>{a.title}</strong>
            <small>{a.detail}</small>
          </button>
        </div>
        {a.amount !== undefined && <span className="row-amount">{money(a.amount)}</span>}
        <button
          className="icon-button"
          title="Acknowledge with a note; outstanding balances remain open"
          onClick={() => action('resolve_attention', { key: a.key, fingerprint: a.fingerprint })}
        >
          <Check size={14} />
        </button>
      </div>
    ));
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
            Back to {page === 'Bookings' ? 'Transactions' : page}
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
          <button className="back" onClick={() => setSelected(null)}>
            <ChevronLeft size={14} />
            Back to Transactions
          </button>
          {heading(
            heldSale ? 'Voucher sale' : held.route ? `Flight · ${held.route}` : 'Booking details',
            [person(detail.entry?.customer_id), (detail.entry?.confirmations ?? []).join(' · ')]
              .filter(Boolean)
              .join(' · '),
            <Badge tone="amber">Needs review</Badge>,
          )}
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
          <button className="back" onClick={() => setSelected(null)}>
            <ChevronLeft size={14} />
            Back to {page === 'Bookings' ? 'Transactions' : page}
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
                Travel date: {m.facts.travel_on ?? 'Unknown — original text preserved'} · Cost:{' '}
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
          b.itinerary?.operational_entry?.trip_type === 'One Way'
            ? dateLabel(b.travel_start)
            : `${dateLabel(b.travel_start)} – ${dateLabel(b.travel_end)}`,
        ],
        ['Booked on', dateLabel(b.booked_on)],
        ['Reservation', b.reservation_status],
        ...(b.itinerary?.operational_entry
          ? []
          : [['Confirmation / ticketing', b.confirmation_status]]),
        ['Itinerary / documents', b.document_status],
        [
          'Traveler(s)',
          detail.travelers
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
          <button className="back" onClick={() => setSelected(null)}>
            <ChevronLeft size={14} />
            Back to {page === 'Bookings' ? 'Transactions' : page}
          </button>
          {heading(
            b.summary,
            `${b.code} · ${c.confirmations || 'No confirmation'} · ${person(b.customer_id)}`,
            <Badge>{b.reservation_status}</Badge>,
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
            {canBookingProfit && (
              <Metric
                label="Expected final profit"
                value={incompleteProfitReason(b) ?? money(b.profit)}
                foot="Includes expected commission and referrals"
                icon={ChartNoAxesCombined}
              />
            )}
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
                      ['authorize_payer', 'Authorize payer'],
                      ['voucherize', 'Voucherize'],
                      ['benefit', 'Price match credit'],
                      ['price_match_event', 'Price match case'],
                      ['booking_source_profile_link', 'Set source account/profile'],
                      ['commission', 'Add commission'],
                      ['referral', 'Add Commission Payable'],
                    ]
                      .filter(([kind]) => {
                        const actionGroup = ['charge', 'authorize_payer'].includes(kind)
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
                          onClick={() => action(kind, { booking_id: b.id })}
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
          <div className="grid-2">
            <Card
              title="Customer charges & payments"
              action={
                canPay &&
                newButton('Add payment', 'payment', { party_id: b.customer_id, booking_id: b.id })
              }
            >
              <div className="section-body">
                <ul className="plain-list">
                  {detail.charges.map((r: R) => (
                    <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        {pretty(r.kind)} <small>· {dateLabel(r.effective_on)}</small>
                      </span>
                      <strong>{money(r.amount)}</strong>
                    </li>
                  ))}
                </ul>
                {detail.allocations
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
              action={
                canAction('fund') &&
                b.reservation_status !== 'Cancelled' &&
                newButton('Record cost', 'fund', { booking_id: b.id })
              }
            >
              {canCosts || can('manage_funding') || can('issue_refunds') ? (
                <div className="section-body">
                  <div className="details-grid">
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
                    {(() => {
                      const primary = expectedCommissionDisplay(
                        b.itinerary?.operational_entry?.commission,
                      );
                      const secondary = expectedCommissionDisplay(
                        b.itinerary?.operational_entry?.secondary_commission,
                      );
                      const referral = (s.referrals ?? []).find((r: R) => r.booking_id === b.id);
                      return (
                        <>
                          <div>
                            <div className="detail-label">
                              Primary IATA / partner commission (receivable)
                            </div>
                            <strong>
                              {primary.status === 'unknown'
                                ? 'Unknown'
                                : primary.status === 'none' && b.expected_commission == null
                                  ? '—'
                                  : money(
                                      primary.amount != null
                                        ? primary.amount
                                        : b.expected_commission,
                                    )}
                            </strong>
                          </div>
                          <div>
                            <div className="detail-label">
                              Secondary commission expected (receivable)
                            </div>
                            <strong>
                              {secondary.status === 'unknown'
                                ? 'Unknown'
                                : secondary.status === 'none'
                                  ? '—'
                                  : secondary.amount != null
                                    ? money(secondary.amount)
                                    : 'Expected (amount TBD)'}
                            </strong>
                          </div>
                          <div>
                            <div className="detail-label">
                              Referring-org commission payable
                            </div>
                            <strong>
                              {referral
                                ? money(referral.expected_due)
                                : b.referring_organization_name
                                  ? 'Linked (see payables)'
                                  : '—'}
                            </strong>
                          </div>
                        </>
                      );
                    })()}
                    {canCosts && b.itinerary?.operational_entry?.taxes && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="detail-label">Taxes / customer recovery</div>
                        <p style={{ margin: 0 }}>
                          <strong>{money(b.itinerary.operational_entry.taxes.amount)}</strong> ·{' '}
                          Paid by {b.itinerary.operational_entry.taxes.bearer} · Cost borne by{' '}
                          {b.itinerary.operational_entry.taxes.economic_bearer ?? 'Not specified'}
                          {b.itinerary.operational_entry.taxes.customer_recovery !== undefined && (
                            <>
                              {' '}
                              · Included in customer price:{' '}
                              {money(b.itinerary.operational_entry.taxes.customer_recovery)}
                            </>
                          )}
                        </p>
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
                  <ul className="plain-list">
                    {detail.funding.map((f: R) => (
                      <li key={f.id}>
                        {f.kind} {f.asset && `· ${f.asset}`}
                        {f.seller_id && (
                          <small>Purchased from / payable to {person(f.seller_id)}</small>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <small>
                            {formatQuantity(
                              f.face_amount,
                              f.unit ??
                                assetUnit(s.assets.find((a: R) => a.id === f.asset_id) ?? f),
                            )}{' '}
                            · {f.reversed ? 'Original reversed cost' : 'Cost basis'}:{' '}
                            {money(f.cost)}
                            {f.reversed && (
                              <Badge tone="gray">Reversed · excluded from current cost</Badge>
                            )}
                          </small>
                        </div>
                      </li>
                    ))}
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
                    <div className="note travel-detail-card" key={t.id}>
                      <strong>
                        {t.product} · {t.summary}
                      </strong>
                      <Badge tone={t.status === 'Cancelled' ? 'danger' : ''}>
                        {t.status ?? 'Booked'}
                      </Badge>
                      {can('operations') && (
                        <button
                          className="btn small"
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
                                detail.travelers
                                  .filter((p: R) => p.status !== 'Cancelled')
                                  .map((p: R) => p.id),
                            })
                          }
                        >
                          Edit this travel
                        </button>
                      )}
                      <p>
                        {person(t.provider_id)} · {t.channel || 'Channel unknown'} ·{' '}
                        {t.travel_start} – {t.travel_end}
                      </p>
                      {t.details?.segments?.length > 0 && (
                        <ul className="plain-list">
                          {t.details.segments.map((segment: R, i: number) => (
                            <li key={i}>
                              {segment.origin} → {segment.destination} · {dateLabel(segment.date)}{' '}
                              {segment.flight_number}
                            </li>
                          ))}
                        </ul>
                      )}
                      {t.details?.confirmations?.length > 0 && (
                        <p>Confirmations: {t.details.confirmations.join(' · ')}</p>
                      )}
                      {t.details?.provider_references?.map((r: R) => (
                        <p key={`${r.provider_id}:${r.value}`}>
                          {person(r.provider_id)} · PNR {r.value}
                        </p>
                      ))}
                      {t.details?.booking_source_confirmation?.length > 0 && (
                        <p>
                          Booking Source Confirmation:{' '}
                          {t.details.booking_source_confirmation.join(' · ')}
                        </p>
                      )}
                      {t.details?.reservation_summary &&
                        t.details.reservation_summary !== t.summary && (
                          <p style={{ whiteSpace: 'pre-wrap' }}>
                            Reservation Summary: {t.details.reservation_summary}
                          </p>
                        )}
                      {(t.details?.pickup_location || t.details?.dropoff_location) && (
                        <p>
                          Pickup: {t.details.pickup_location || 'Unknown'} · Drop-off:{' '}
                          {t.details.dropoff_location || 'Unknown'}
                        </p>
                      )}
                      {(t.details?.route ||
                        t.details?.hotel ||
                        t.details?.hotel_name ||
                        t.details?.origin ||
                        t.details?.destination) && (
                        <p>
                          {t.details.route ||
                            t.details.hotel ||
                            t.details.hotel_name ||
                            [t.details.origin, t.details.destination].filter(Boolean).join(' → ')}
                        </p>
                      )}
                      {t.acquisition_source_id && (
                        <p>Acquired from: {person(t.acquisition_source_id)}</p>
                      )}
                      {t.details?.traveler_ids?.length > 0 && (
                        <p>Travelers: {t.details.traveler_ids.map(person).join(' · ')}</p>
                      )}
                      {t.details?.flight_numbers?.length > 0 && (
                        <p>
                          Flights: {t.details.flight_numbers.join(' · ')}
                          {t.details.cabin ? ` · ${t.details.cabin}` : ''}
                        </p>
                      )}
                      {t.details?.ticket_numbers?.length > 0 && (
                        <p>Tickets: {t.details.ticket_numbers.join(' · ')}</p>
                      )}
                      {(t.details?.departure_local || t.details?.arrival_local) && (
                        <p>
                          Local times: {t.details.departure_local ?? 'Unknown'} →{' '}
                          {t.details.arrival_local ?? 'Unknown'}
                        </p>
                      )}
                      {t.details?.room_type && <p>Room: {t.details.room_type}</p>}
                      {t.details?.benefits && <p>Benefits: {t.details.benefits}</p>}
                      {t.details?.restrictions && <p>Restrictions: {t.details.restrictions}</p>}
                      {(detail.fulfillments ?? [])
                        .filter((f: R) => f.travel_component_id === t.id)
                        .map((f: R) => (
                          <div key={f.id}>
                            {f.role === 'Ancillary' ? 'Extra benefit' : 'Main trip'} ·{' '}
                            {f.asset_ownership === 'Customer' ? 'Customer-owned value' : f.mode} ·{' '}
                            {f.instrument ??
                              (f.mode === 'Outside source'
                                ? (f.terms?.supplied ?? 'Agreed seller price')
                                : f.mode === 'Owned inventory'
                                  ? 'Owned value'
                                  : f.terms?.operational_kind === 'Customer card'
                                    ? 'Customer direct card'
                                    : 'Cash/Card')}{' '}
                            {f.quantity != null && <>· {formatQuantity(f.quantity, f.unit)}</>}
                            {canCosts && <> · Cost {money(f.cost)}</>}
                            {f.terms?.mechanism && (
                              <p>
                                {f.terms.mechanism} ·{' '}
                                {f.terms.booked_through ?? 'Booking channel not supplied'}
                              </p>
                            )}
                            {f.terms?.account_holder_id && (
                              <p>Account holder: {person(f.terms.account_holder_id)}</p>
                            )}
                            {canCosts && f.terms?.quoted_rate && (
                              <p>
                                Quoted rate: {f.terms.quoted_rate}{' '}
                                {f.terms.rate_unit ?? '(unit not supplied)'} · Quote only; actual
                                cost shown above
                              </p>
                            )}
                            {f.terms?.notes && <p>{f.terms.notes}</p>}
                            {canCosts && f.terms?.portal_price !== undefined && (
                              <p>
                                Portal cash price: {money(f.terms.portal_price)} ·{' '}
                                {f.terms?.reference_price !== undefined &&
                                  `Reference / online price: ${money(f.terms.reference_price)} · `}
                                Comparison evidence only
                              </p>
                            )}
                            {canCosts &&
                              f.terms?.rate_cents_numerator !== undefined &&
                              f.terms?.rate_points_denominator && (
                                <p>
                                  Actual redemption quote: {money(f.terms.rate_cents_numerator)} for{' '}
                                  {Number(f.terms.rate_points_denominator).toLocaleString()} points
                                  · No additional revenue
                                </p>
                              )}
                            {f.status !== 'Active' && f.status && (
                              <Badge tone="gray">{f.status} · original history</Badge>
                            )}
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
                                          detail.funding.find(
                                            (x: R) => x.id === f.funding_component_id,
                                          )?.kind === 'Bank'
                                            ? 'Bank'
                                            : detail.funding.find(
                                                  (x: R) => x.id === f.funding_component_id,
                                                )?.kind === 'Cash'
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
                      {can('manage_funding') && (
                        <button
                          className="btn small"
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
                      <details className="travel-corrections">
                        <summary className="btn small">More travel actions</summary>
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
                    </div>
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
                  {detail.assetAcquisitions.map((a: R) => (
                    <div className="note" key={a.id}>
                      <button className="btn small" onClick={() => openRecord('asset', a.id)}>
                        {a.name}
                      </button>
                      <p>
                        {a.seller} · Original acquisition {money(a.cost)} · Payments recorded{' '}
                        {money(a.paid)} · Balance owed {money(a.due)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {canCosts && detail.sourceBalances?.length > 0 && (
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
                        {detail.sourceBalances.map((source: R) => (
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
                        ))}
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
                <div className="section-body">
                  <p>
                    Expected points are tracked separately. Inventory and profit change only on an
                    actual issuer posting.
                  </p>
                  {(s.expectedEvents ?? [])
                    .filter((e: R) => e.booking_id === b.id)
                    .map((e: R) => (
                      <div className="note" key={e.id}>
                        <strong>
                          {e.kind} · {e.status}
                        </strong>
                        <p>
                          {e.quantity_expected !== undefined &&
                            `${Number(e.quantity_expected).toLocaleString()} expected points · `}
                          {e.quantity_actual !== null &&
                            e.quantity_actual !== undefined &&
                            `${Number(e.quantity_actual).toLocaleString()} actually received points · `}
                          {e.reference}
                        </p>
                        {can('manage_assets') && !['Denied', 'Reversed'].includes(e.status) && (
                          <button
                            className="btn small"
                            onClick={() => action('update_expected_event', { event_id: e.id })}
                          >
                            Record issuer result
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          )}
          {(canCommissions || canRefunds) && (
            <div className="detail-section">
              <Card title="Commissions, referrals & refunds">
                <div className="section-body">
                  <ul className="plain-list">
                    {s.commissions
                      .filter((r: R) => r.booking_id === b.id)
                      .map((r: R) => {
                        const siblings = s.commissions.filter((x: R) => x.booking_id === b.id);
                        return (
                        <li key={r.id}>
                          {receivableCommissionLabel(
                            r,
                            b.itinerary?.operational_entry,
                            siblings,
                          )}{' '}
                          · via {r.collector ?? r.payer} · Expected{' '}
                          {money(Number(r.gross) - Number(r.retained))} · Received{' '}
                          {money(r.received)}{' '}
                          <button
                            className="btn small"
                            onClick={() => action('commission_receipt', { commission_id: r.id })}
                          >
                            Allocate receipt
                          </button>
                        </li>
                        );
                      })}
                    {s.referrals
                      .filter((r: R) => r.booking_id === b.id)
                      .map((r: R) => (
                        <li key={r.id}>
                          Referring-org commission payable · {r.referrer}
                          {b.referring_organization_name
                            ? ` · ${b.referring_organization_name}`
                            : ''}{' '}
                          · Expected {money(r.expected_due)} · Earned {money(r.accrued)} · Paid{' '}
                          {money(r.paid)} · Outstanding {money(r.outstanding)}
                          <small>
                            {r.reason} · {r.status}
                          </small>
                          <button
                            className="btn small"
                            disabled={!can('manage_commissions') || !(r.payable_now > 0)}
                            onClick={() => action('pay_referral', { referral_id: r.id })}
                          >
                            Record payout
                          </button>
                          {can('manage_commissions') &&
                            s.payableTermsEnabled &&
                            r.active !== false && (
                              <button
                                className="btn small ghost"
                                onClick={() =>
                                  action('revise_referral', {
                                    ...r,
                                    referral_id: r.id,
                                    basis: r.calculation === 'fixed' ? 'fixed' : 'percentage',
                                  })
                                }
                              >
                                Correct terms
                              </button>
                            )}
                        </li>
                      ))}
                    {s.refunds
                      .filter((r: R) => r.booking_id === b.id)
                      .map((r: R) => (
                        <li key={r.id}>
                          Refund · Expected {refundValue(r, r.supplier_expected)} · Received{' '}
                          {refundValue(r, r.received)} · Customer due {money(r.customer_due)}{' '}
                          <small>Supplier return form: {r.received_forms || 'Not received'}</small>
                          <button
                            className="btn small"
                            disabled={
                              !canAction('receive_refund') ||
                              Number(r.received) >= Number(r.supplier_expected)
                            }
                            hidden={Number(r.received) >= Number(r.supplier_expected)}
                            onClick={() => action('receive_refund', { refund_id: r.id })}
                          >
                            Receive
                          </button>{' '}
                          <button
                            className="btn small"
                            disabled={
                              !canAction('pay_refund') ||
                              Number(r.paid) + Number(r.handed_over ?? 0) >= Number(r.customer_due)
                            }
                            hidden={
                              Number(r.paid) + Number(r.handed_over ?? 0) >= Number(r.customer_due)
                            }
                            onClick={() => action('pay_refund', { refund_id: r.id })}
                          >
                            Pay customer
                          </button>
                        </li>
                      ))}
                  </ul>
                  {!s.commissions.some((r: R) => r.booking_id === b.id) &&
                    !s.referrals.some((r: R) => r.booking_id === b.id) &&
                    !s.refunds.some((r: R) => r.booking_id === b.id) && (
                      <Empty>No commissions, referrals, or refunds recorded.</Empty>
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
                {detail.revisions.map((r: R) => (
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
            <Card title="Notes & Activity">
              {[
                ...detail.activity.filter((a: R) => a.kind !== 'note'),
                ...detail.notes.map((n: R) => ({
                  ...n,
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
                        {new Date(a.created_at).toLocaleString()} · {a.actor_name ?? a.actor}
                      </p>
                      {a.shared_note && <p style={{ whiteSpace: 'pre-wrap' }}>{a.shared_note}</p>}
                      {a.reason && <p>{a.reason}</p>}
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
            </Card>
          </div>
        </>
      );
    } else if (selected.type === 'asset') {
      const a = detail.asset;
      view = (
        <>
          <button className="back" onClick={() => setSelected(null)}>
            <ChevronLeft size={14} />
            Back to {page === 'Bookings' ? 'Transactions' : page}
          </button>
          {heading(
            a.name,
            `${a.kind} · ${a.issuer} · ${a.ownership}`,
            <Badge>{a.ownership}</Badge>,
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
            <Metric
              label="Remaining cost basis"
              value={money(a.remaining_basis)}
              foot="Exact acquisition-lot basis"
              icon={Landmark}
            />
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={() => action('fund', { asset_id: a.id })}>
              Use for booking
            </button>
            {can('manage_assets') && (
              <button
                className="btn"
                onClick={() => action('revise_asset', { ...a, asset_id: a.id })}
              >
                Edit asset details
              </button>
            )}
            <button className="btn" onClick={() => action('sell_asset', { asset_id: a.id })}>
              Sell asset
            </button>
            <button
              className="btn"
              onClick={() => action('transfer_asset', { sending_asset_id: a.id })}
            >
              Transfer value
            </button>
            <button className="btn" onClick={() => action('convert_asset', { asset_id: a.id })}>
              Convert into new asset
            </button>
            <button className="btn" onClick={() => action('expire_asset', { asset_id: a.id })}>
              Record expiration
            </button>
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
                  {detail.sales.map((sale: R) => (
                    <li key={sale.id}>
                      Sold to {sale.buyer} · Proceeds {money(sale.proceeds)} · Received{' '}
                      {money(sale.received)}
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
                  ))}
                </ul>
              </div>
            </Card>
            <Card title="Source & restrictions">
              <div className="section-body">
                <p>Holder: {person(a.holder_id)}</p>
                <p className="subtitle">Seller: {person(a.seller_id)}</p>
                <p className="subtitle">
                  {a.expires_on ? `Expires ${dateLabel(a.expires_on)}` : 'No expiration recorded'}
                </p>
                <p className="subtitle">{a.restrictions || 'No restrictions recorded'}</p>
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
                  </div>
                ))}
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
      const isSource =
        p.roles.some((role: string) =>
          ['seller', 'supplier', 'source', 'partner'].includes(role),
        ) || p.kind === 'supplier';
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
          <button className="back" onClick={() => setSelected(null)}>
            <ChevronLeft size={14} />
            Back to {page === 'Bookings' ? 'Transactions' : page}
          </button>
          {heading(
            p.name,
            `${pretty(p.kind)} · ${p.email || p.phone || 'No contact information'}`,
            <Badge>{(p.roles ?? []).join(' · ') || p.kind}</Badge>,
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
            {canPay && (p.roles.includes('customer') || !isSource) && (
              <button className="btn" onClick={() => action('payment', { party_id: p.id })}>
                Add payment
              </button>
            )}
            {isSource && can('manage_funding') && (
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
                <p className="muted" style={{ fontSize: 11 }}>
                  {isSource && !p.roles.includes('customer')
                    ? 'Authorized booking payables and inventory purchases, less recorded payments and corrections. Negative amounts represent a seller advance or credit.'
                    : 'Charges less all receipts. Negative amounts represent credit or refund liability. Traveler-only bookings remain billed to their responsible customer.'}
                </p>
                {detail.notes.map((n: R) => (
                  <div className="note" key={n.id}>
                    {n.body}
                  </div>
                ))}
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
          {(p.roles.includes('customer') || !isSource || entries.length > 0) && (
            <Card
              title="Running customer statement"
              action={
                <button
                  className="btn ghost"
                  onClick={() => downloadCSV(`${p.name}-statement.csv`, entries)}
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
    view = (
      <>
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
        <div className="metrics">
          <Metric
            label="Active bookings"
            value={String(bks.filter((b) => b.reservation_status === 'Booked').length)}
            foot="Operational reservations"
            icon={Plane}
          />
          <Metric
            label="Traveling today"
            value={String(todayTravel.length)}
            foot="Live travel records"
            icon={Plane}
          />
          <Metric
            label="Upcoming travel"
            value={String(upcoming.length)}
            foot="Next 7 days"
            icon={CalendarDays}
          />
          <Metric
            label="Open tasks"
            value={String(s.tasks.filter((t: R) => t.status === 'Open').length)}
            foot="Team follow-ups"
            icon={ClipboardList}
          />
          {canAssetBasis && (
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
        <Card title="Recent transactions">
          {transactionTable(transactions.slice(0, 10))}
          <button className="btn ghost" onClick={() => go('Bookings')}>
            View all transactions
          </button>
        </Card>
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
                todayTravel.slice(0, 4).map((b) => (
                  <button
                    className="travel-item"
                    style={{ width: '100%', textAlign: 'left' }}
                    key={b.id}
                    onClick={() => openRecord('booking', b.id)}
                  >
                    <span className="travel-icon">
                      <Icon name={b.product} />
                    </span>
                    <div>
                      <strong>{b.summary}</strong>
                      <p>{b.travelers || 'Traveler missing'}</p>
                      <p>
                        {b.confirmations} · {b.code}
                      </p>
                    </div>
                    <Badge>Today</Badge>
                  </button>
                ))
              ) : (
                <Empty>No travelers traveling today.</Empty>
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
                    <button
                      type="button"
                      className="dashboard-trip"
                      key={b.id}
                      onClick={() => openRecord('booking', b.id)}
                    >
                      <Icon name={b.product} />
                      <span>
                        <strong title={b.summary}>{tripTitle(tripView(b))}</strong>
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
                  ))}
                </div>
              ) : (
                <Empty>No upcoming travel.</Empty>
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
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </>
    );
  } else if (page === 'Bookings') {
    const items = transactions.filter(
      ({ kind, record: r }) =>
        (filter === 'All' ||
          (kind === 'sale' ? filter === 'Voucher / asset sales' : r.product === filter)) &&
        (!day || (kind === 'booking' && r.travel_start <= day && r.travel_end >= day)) &&
        (bookingStatus === 'All' || (kind === 'booking' && r.reservation_status === bookingStatus)),
    );
    const filteredDrafts = (s.bookingDrafts ?? []).filter((draft: R) => {
      if (draftChannelFilter === 'All') return true;
      if (draftChannelFilter === 'historical') return draft.kind === 'historical_booking';
      if (draftChannelFilter === 'voucher') return draft.kind === 'voucher_sale';
      if (draft.kind === 'historical_booking' || draft.kind === 'voucher_sale') return false;
      return intakeChannelFilterKey(draft.intake_source) === draftChannelFilter;
    });
    view = (
      <>
        {heading(
          'Transactions',
          'One row per booking or sale, newest booked or sold first. Payments stay inside each record.',
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
                            : 'WhatsApp: paste chat or PC bridge — token not set on this server yet.'
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
        <div className="toolbar">
          {['All', 'Flight', 'Hotel', 'Car', 'Other', 'Voucher / asset sales'].map((v) => (
            <button
              className={`btn ${filter === v ? 'primary' : ''}`}
              key={v}
              onClick={() => setFilter(v)}
            >
              {v}
            </button>
          ))}
          <label>
            Status{' '}
            <select
              aria-label="Booking status"
              value={bookingStatus}
              onChange={(e) => setBookingStatus(e.target.value)}
            >
              {['All', ...new Set<string>(bks.map((b) => b.reservation_status))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {day && (
            <button className="btn" onClick={() => setDay('')}>
              {day}
              <X size={12} />
            </button>
          )}
        </div>
        {!!s.bookingDrafts?.length && (
          <details className="card section-body intake-drafts" open>
            <summary>
              Drafts & unposted historical records (
              {draftChannelFilter === 'All'
                ? filteredDrafts.length
                : `${filteredDrafts.length} of ${s.bookingDrafts.length}`}
              ) — separate from the transactions below
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
            <div className="intake-draft-grid">
              {(() => {
                if (!filteredDrafts.length) {
                  return (
                    <p className="intake-draft-empty">
                      No drafts in this filter. Try All, or create one from Intake.
                    </p>
                  );
                }
                const draftPager = pageSlice<R>(filteredDrafts, draftPage, 8);
                return (
                  <>
                    {draftPager.items.map((draft: R) => (
                      <button
                        key={draft.id}
                        type="button"
                        className="intake-draft-card"
                        onClick={async () => {
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
                        <div className="intake-draft-card-top">
                          <strong>
                            {draft.display_title ??
                              (draft.kind === 'voucher_sale' ? draft.summary : draft.title)}
                          </strong>
                          <span className="intake-draft-badge">
                            {draft.kind === 'voucher_sale'
                              ? 'Voucher sale'
                              : draft.kind === 'historical_booking'
                                ? 'Historical'
                                : intakeChannelBadge(draft.intake_source)}
                          </span>
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
                        <dl className="intake-draft-meta">
                          <div>
                            <dt>Customer</dt>
                            <dd>
                              {draft.intake_customer ||
                                (draft.intake_source
                                  ? 'No customer in intake'
                                  : 'Not linked yet')}
                            </dd>
                          </div>
                          <div>
                            <dt>Product</dt>
                            <dd>{draft.intake_product || '—'}</dd>
                          </div>
                          <div>
                            <dt>Route / place</dt>
                            <dd>{draft.intake_route || '—'}</dd>
                          </div>
                          <div>
                            <dt>Travel</dt>
                            <dd>{draft.intake_travel_start || '—'}</dd>
                          </div>
                          <div>
                            <dt>PNR</dt>
                            <dd>{draft.intake_pnr || '—'}</dd>
                          </div>
                          <div>
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
                            ? 'Review voucher details'
                            : draft.kind === 'historical_booking'
                              ? 'View historical details'
                              : draft.intake_source
                                ? `Continue intake${draft.intake_filename ? ` · ${draft.intake_filename}` : ''}`
                                : 'Continue draft'}
                        </span>
                      </button>
                    ))}
                    <div className="intake-draft-more">
                      <ListPager
                        page={draftPager.page}
                        totalPages={draftPager.totalPages}
                        total={draftPager.total}
                        from={draftPager.from}
                        to={draftPager.to}
                        onPage={setDraftPage}
                        label="drafts"
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </details>
        )}
        <Card title="Transactions" count={items.length}>
          {(() => {
            const bookingPager = pageSlice(items, bookingPage, 20);
            return (
              <>
                {transactionTable(bookingPager.items)}
                <ListPager
                  page={bookingPager.page}
                  totalPages={bookingPager.totalPages}
                  total={bookingPager.total}
                  from={bookingPager.from}
                  to={bookingPager.to}
                  onPage={setBookingPage}
                  label="transactions"
                />
              </>
            );
          })()}
        </Card>
      </>
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
      .sort((a, b) =>
        directorySort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
      );
    view = (
      <>
        {heading(
          page === 'Companies'
            ? 'Companies'
            : page === 'Suppliers'
              ? 'Suppliers'
              : page === 'Sources & Brokers'
                ? 'Sources & brokers'
                : 'People',
          page === 'Companies'
            ? 'Corporate travelers, billing relationships, and travel rules.'
            : page === 'Suppliers'
              ? 'Actual travel providers, separate from booking channels and acquisition sellers.'
              : page === 'Sources & Brokers'
                ? 'People and companies supplying awards, points, certificates or other travel value. Open a profile for transactions and history.'
                : 'One person. Every role. A connected history.',
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
            </select>
          </label>
        </div>
        {(() => {
          const directoryPager = pageSlice(list, directoryPage, 40);
          return (
            <>
        <div
          className="directory-list"
          role="list"
          aria-label={
            page === 'Bookings' ? 'Transactions' : page === 'People & Families' ? 'People' : page
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
                  <strong>{linked.length} bookings</strong>
                  <small>
                    {upcoming
                      ? `Next: ${dateLabel(upcoming.travel_start)}`
                      : past
                        ? `Last: ${dateLabel(past.travel_start)}`
                        : 'No dated travel in view'}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Open ${p.name}`}
                  onClick={() => openRecord('person', p.id)}
                >
                  <ChevronRight size={16} />
                </button>
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
            </>
          );
        })()}
      </>
    );
  } else if (page === 'Payments') {
    const list = s.payments.filter((p: R) => filter === 'All' || p.direction === filter);
    const activity = s.financialActivity ?? [];
    view = (
      <>
        {heading(
          'Payments',
          'Enter once. Allocate across the right bookings.',
          canPay && newButton('Add payment', 'payment'),
        )}
        <div className="toolbar">
          {[
            'All',
            'customer',
            ...new Set<string>(
              s.payments.filter((p: R) => p.direction !== 'customer').map((p: R) => p.direction),
            ),
          ].map((v) => (
            <button
              className={`btn ${filter === v ? 'primary' : ''}`}
              key={v}
              onClick={() => {
                setFilter(v);
                setTablePage(1);
              }}
            >
              {pretty(v)}
            </button>
          ))}
        </div>
        <Card title="Cash, card and bank activity" count={activity.length}>
          <p className="section-body">
            Actual money movements from the accounting ledger, including direct Padova payments and
            refunds. Each movement appears once.
          </p>
          {(() => {
            const activityPager = pageSlice<R>(activity, tablePage, 20);
            return (
              <>
          <div className="table-wrap">
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
          <ListPager
            page={activityPager.page}
            totalPages={activityPager.totalPages}
            total={activityPager.total}
            from={activityPager.from}
            to={activityPager.to}
            onPage={setTablePage}
            label="activity rows"
          />
              </>
            );
          })()}
        </Card>
        <Card title="Receipts, payments and allocations" count={list.length}>
          {(() => {
            const paymentPager = pageSlice<R>(list, tablePage, 20);
            return (
              <>
          <div className="table-wrap">
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
                  <tr key={p.id}>
                    <td>
                      <strong>{p.party}</strong>
                      <small>{p.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <Badge tone={['customer', 'commission'].includes(p.direction) ? '' : 'gray'}>
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
                      {['customer', 'supplier', 'commission'].includes(p.direction)
                        ? money(
                            Number(p.current_amount) -
                              Number(p.allocated) -
                              Number(p.commission_allocated),
                          )
                        : '—'}
                    </td>
                    <td>
                      {canPay && ['customer', 'supplier'].includes(p.direction) && (
                        <button
                          className="btn small"
                          onClick={() => action('allocate', { payment_id: p.id })}
                        >
                          Allocate
                        </button>
                      )}{' '}
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
          <ListPager
            page={paymentPager.page}
            totalPages={paymentPager.totalPages}
            total={paymentPager.total}
            from={paymentPager.from}
            to={paymentPager.to}
            onPage={setTablePage}
            label="payments"
          />
              </>
            );
          })()}
          {!list.length && <Empty />}
        </Card>
      </>
    );
  } else if (page === 'Travel Assets') {
    const list = s.assets.filter((a: R) => filter === 'All' || a.kind === filter);
    const assetPager = pageSlice<R>(list, tablePage, 20);
    view = (
      <>
        {heading(
          'Travel assets',
          'Reusable value, with provenance and exact cost basis.',
          can('manage_assets') && newButton('Buy travel asset', 'acquire_asset'),
        )}
        <div className="toolbar">
          {['All', ...new Set(s.assets.map((a: R) => a.kind))].map((v: any) => (
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
        <div className="asset-grid">
          {assetPager.items.map((a: R) => (
            <div className="card asset-card" key={a.id}>
              <div className="asset-head">
                <span className="travel-icon">
                  {isPoints(a) ? <Coins size={19} /> : <Ticket size={19} />}
                </span>
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
        {!canAssets && <Empty>Travel Assets access requires permission.</Empty>}
        {s.fulfillmentEnabled && can('manage_assets') && (
          <div className="detail-section">
            <Card
              title="Pending transfers & rewards"
              action={newButton('Track expected event', 'expected_event')}
            >
              <div className="section-body">
                <p>
                  Expected value does not change inventory or profit. Post only the actual issuer
                  receipt.
                </p>
                {(s.expectedEvents ?? []).map((e: R) => (
                  <div className="note" key={e.id}>
                    <strong>
                      {e.kind} · {e.status}
                    </strong>
                    {e.quantity_expected && (
                      <p>
                        {Number(e.quantity_expected).toLocaleString()} expected points ·{' '}
                        {e.reference}
                      </p>
                    )}
                    {e.quantity_actual !== null && e.quantity_actual !== undefined && (
                      <p>{Number(e.quantity_actual).toLocaleString()} actually received points</p>
                    )}
                    {!['Denied', 'Reversed'].includes(e.status) && (
                      <button
                        className="btn small"
                        onClick={() => action('update_expected_event', { event_id: e.id })}
                      >
                        Record issuer result
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </>
    );
  } else if (page === 'Commissions') {
    view = (
      <>
        {heading(
          'Commissions',
          'Commissions receivable and commissions owed to other people or companies.',
          can('manage_commissions') && newButton('Add commission', 'commission'),
        )}
        <Card title="Commission receivables" count={s.commissions.length}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Payer / collecting agency</th>
                  <th className="money">Gross</th>
                  <th className="money">Retained</th>
                  <th className="money">Padova net</th>
                  <th className="money">Received</th>
                  <th className="money">Outstanding</th>
                  <th>Expected date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageSlice<R>(s.commissions, tablePage, 20).items.map((c: R) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="booking-code"
                        onClick={() => openRecord('booking', c.booking_id)}
                      >
                        {c.code}
                      </button>
                    </td>
                    <td>
                      {c.payer}
                      <small>{c.collector ? `Paid through ${c.collector}` : 'Paid directly'}</small>
                    </td>
                    <td className="money">{money(c.gross)}</td>
                    <td className="money">{money(c.retained)}</td>
                    <td className="money">{money(Number(c.gross) - Number(c.retained))}</td>
                    <td className="money">{money(c.received)}</td>
                    <td className="money">
                      {money(Number(c.gross) - Number(c.retained) - Number(c.received))}
                    </td>
                    <td>{dateLabel(c.due_on)}</td>
                    <td>
                      {can('manage_commissions') && can('edit_payments') && (
                        <button
                          className="btn small"
                          onClick={() =>
                            action('payment', {
                              direction: 'commission',
                              party_id: c.collector_id ?? c.payer_id,
                              commission_id: c.id,
                            })
                          }
                        >
                          Record receipt
                        </button>
                      )}
                      {can('manage_commissions') && (
                        <button
                          className="btn small"
                          onClick={() => action('commission_receipt', { commission_id: c.id })}
                        >
                          Allocate receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(() => {
            const commissionPager = pageSlice<R>(s.commissions, tablePage, 20);
            return (
              <ListPager
                page={commissionPager.page}
                totalPages={commissionPager.totalPages}
                total={commissionPager.total}
                from={commissionPager.from}
                to={commissionPager.to}
                onPage={setTablePage}
                label="commissions"
              />
            );
          })()}
        </Card>
        <div style={{ marginTop: 22 }}>
          <CommissionPayables
            rows={s.referrals}
            payments={s.referralPayments ?? []}
            history={s.referralTerms ?? []}
            adjustments={s.referralPaymentAdjustments ?? []}
            canManage={can('manage_commissions')}
            enabled={s.payableTermsEnabled}
            action={action}
          />
        </div>
      </>
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
        <Card
          title="Refund follow-ups"
          count={
            s.refunds.filter(
              (r: R) =>
                filter === 'All' ||
                Number(r.received) < Number(r.supplier_expected) ||
                Number(r.paid) + Number(r.handed_over ?? 0) < Number(r.customer_due),
            ).length
          }
        >
          {(() => {
            const refundRows = s.refunds.filter(
              (r: R) =>
                filter === 'All' ||
                Number(r.received) < Number(r.supplier_expected) ||
                Number(r.paid) + Number(r.handed_over ?? 0) < Number(r.customer_due),
            );
            const refundPager = pageSlice<R>(refundRows, tablePage, 20);
            return (
              <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking / reason</th>
                  <th>Customer</th>
                  {canRefunds && (
                    <>
                      <th className="money">Supplier expected</th>
                      <th className="money">Supplier received</th>
                    </>
                  )}
                  <th className="money">Customer due</th>
                  <th className="money">Customer paid</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {refundPager.items.map((r: R) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="booking-code"
                          onClick={() => openRecord('booking', r.booking_id)}
                        >
                          {r.code}
                        </button>
                        <small>{r.reason}</small>
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
                      <td className="money">{money(r.customer_due)}</td>
                      <td className="money">{money(r.paid)}</td>
                      <td>
                        {canRefunds && (
                          <>
                            <button
                              className="btn small"
                              hidden={Number(r.received) >= Number(r.supplier_expected)}
                              disabled={!canAction('receive_refund')}
                              onClick={() => action('receive_refund', { refund_id: r.id })}
                            >
                              Receive
                            </button>{' '}
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
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ListPager
            page={refundPager.page}
            totalPages={refundPager.totalPages}
            total={refundPager.total}
            from={refundPager.from}
            to={refundPager.to}
            onPage={setTablePage}
            label="refunds"
          />
              </>
            );
          })()}
          {!s.refunds.length && <Empty>No refunds recorded.</Empty>}
        </Card>
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
        />
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
          <Card title="Open exceptions">
            {s.attention.length ? (
              attentionRows(s.attention)
            ) : (
              <Empty>All current exceptions have been resolved.</Empty>
            )}
          </Card>
        ) : (
          <Card title="Team tasks" count={s.tasks.filter((t: R) => t.status === 'Open').length}>
            {s.tasks.map((t: R) => (
              <div className="attention-row" key={t.id}>
                <button
                  className="icon-button"
                  disabled={t.status === 'Done' || busy}
                  aria-label={
                    t.status === 'Done' ? `Completed task: ${t.title}` : `Complete task: ${t.title}`
                  }
                  onClick={() => action('complete_task', { task_id: t.id })}
                >
                  <CheckCircle2 size={20} color={t.status === 'Done' ? '#69977b' : '#c6d0c9'} />
                </button>
                <div className="attention-text">
                  <strong style={{ textDecoration: t.status === 'Done' ? 'line-through' : '' }}>
                    {t.title}
                  </strong>
                  <small>
                    {t.due_on ? `Due ${dateLabel(t.due_on)}` : 'No due date'} · {t.status}
                    {t.assignee_id &&
                      ` · ${s.staff.find((person: R) => person.id === t.assignee_id)?.name ?? 'Inactive staff member'}`}
                    {t.notes && ` · ${t.notes}`}
                  </small>
                </div>
                <Badge tone={t.priority === 'Normal' ? 'gray' : 'amber'}>{t.priority}</Badge>
                <button
                  className="btn ghost"
                  onClick={() => action('update_task', { ...t, task_id: t.id })}
                >
                  Edit
                </button>
                {t.record_type === 'booking' && (
                  <button className="btn ghost" onClick={() => openRecord('booking', t.record_id)}>
                    Booking <ChevronRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </Card>
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
    view = (
      <>
        {heading(
          'Accounting & profit',
          'Current booking economics and dated financial movements.',
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
        <Card title="Recent events" count={s.audit.length}>
          {(() => {
            const activityPager = pageSlice<R>(s.audit, tablePage, 20);
            return (
              <>
                {activityPager.items.map((a: R) => (
                  <div className="activity" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.summary || pretty(a.kind)}</strong>
                      <p>
                        {new Date(a.created_at).toLocaleString()} · {a.actor_name ?? a.actor}
                      </p>
                      {bks.some((b) => b.id === a.record_id) && (
                        <button
                          className="btn ghost"
                          style={{ marginTop: 8 }}
                          onClick={() => openRecord('booking', a.record_id)}
                        >
                          Open booking <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <ListPager
                  page={activityPager.page}
                  totalPages={activityPager.totalPages}
                  total={activityPager.total}
                  from={activityPager.from}
                  to={activityPager.to}
                  onPage={setTablePage}
                  label="events"
                />
              </>
            );
          })()}
        </Card>
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
              'Dashboard',
              'Bookings',
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
              {name === 'Bookings'
                ? 'Transactions'
                : name === 'People & Families'
                  ? 'People'
                  : name}
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
            name === 'Travel Assets'
              ? canAssets
              : name === 'Commissions'
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
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => go(name)}
            >
              <I />
              {name}
              {name === 'Tasks' && s.tasks.filter((t: R) => t.status === 'Open').length > 0 && (
                <span className="nav-count">
                  {s.tasks.filter((t: R) => t.status === 'Open').length}
                </span>
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
                : page === 'Bookings'
                  ? 'Transactions'
                  : page === 'People & Families'
                    ? 'People'
                    : page}
            </b>
          </div>
          <div className="top-right">
            <div className="search">
              <Search size={15} color="#9ca69f" />
              <input
                aria-label="Global search"
                placeholder="Search people, bookings, PNRs…"
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
                        : page === 'Bookings'
                          ? 'Transactions'
                          : page === 'People & Families'
                            ? 'People'
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
                  setPage('Dashboard');
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
                    onClick={() => (h.page ? go(h.page) : openRecord(h.type!, h.id!))}
                  >
                    {h.label}
                    <small>{h.sub}</small>
                  </button>
                ))
              ) : (
                <Empty>No matching records.</Empty>
              )}
            </div>
          )}
        </header>
        <div className="content">
          {s.developmentData && (
            <div className="demo-banner">
              <ShieldCheck size={13} />
              <strong>
                {s.qaMode ? 'PRACTICE / QA — NOT REAL DATA' : 'TEST / SYNTHETIC — PRACTICE ONLY'}
              </strong>
              <span>
                This is the local test workspace. Entries here do not go to the real US Padova
                ledger.
              </span>
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              {error}
              <button
                style={{ float: 'right' }}
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
            </div>
          )}
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
          onClick={() => closeIntake()}
        >
          <div
            className="modal intake-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-draft-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="intake-draft-title">Intake draft</h2>
                <p>
                  Paste reservation details or drop a file. Draft only — review before Save Booking.
                  Nothing posts money from here.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close intake draft"
                disabled={intakeBusy}
                onClick={() => closeIntake()}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body intake-modal-body">
              {intakeChannelStatus && (
                <div className="intake-hint" role="status">
                  <strong>Channel status</strong>
                  <span>{intakeChannelStatus.email}</span>
                  <span>{intakeChannelStatus.whatsapp}</span>
                </div>
              )}
              <div className="intake-hint" role="note">
                <strong>WhatsApp</strong>
                <span>
                  Paste chat as Field:Value here, or on a PC run the read-only bridge watcher
                  (`npm run intake:whatsapp-bridge`). Incoming only — never sends. Drafts still need
                  staff approve.
                </span>
              </div>
              <section className="intake-panel">
                <div className="intake-panel-head">
                  <FileText size={16} aria-hidden />
                  <div>
                    <h3>Paste reservation text</h3>
                    <p>Field: Value lines work best. Unknown stays Unknown.</p>
                  </div>
                </div>
                <textarea
                  id="intake-text"
                  className="intake-textarea"
                  rows={7}
                  value={intakeText}
                  disabled={intakeBusy}
                  aria-label="Reservation text"
                  placeholder={`Product: Hotel\nRoute: Miami\nCheck-in: 2027-03-01\nPNR: TEST01\nSummary: Local intake test`}
                  onChange={(e) => setIntakeText(e.target.value)}
                />
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
                  Forwarded email (Shmuel@ or mindy@ only) — saves as email intake draft
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
                    <p className="intake-hint">
                      Automatic mailbox poll still waits on Owner Workspace access. This path is
                      staff forward → draft only.
                    </p>
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
                  WhatsApp chat paste — saves as WhatsApp intake draft (read-only; never sends)
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
                    <p className="intake-hint">
                      Paste the reservation facts as Field: Value. Draft only — staff must approve
                      before Save Booking.
                    </p>
                  </div>
                )}
              </section>

              <div className="intake-or" aria-hidden>
                <span>or</span>
              </div>

              <section className="intake-panel">
                <div className="intake-panel-head">
                  <Upload size={16} aria-hidden />
                  <div>
                    <h3>Upload a file</h3>
                    <p>
                      Drag and drop, or choose a file (TXT/CSV/EML). Text/CSV supports up to{' '}
                      {INTAKE_MAX_ENTRIES.toLocaleString()} bookings in batches of{' '}
                      {INTAKE_BATCH_SIZE}.
                    </p>
                  </div>
                </div>
                <label
                  className={`intake-dropzone${intakeDrag ? ' is-dragging' : ''}${intakeFile ? ' has-file' : ''}`}
                  htmlFor="intake-file"
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
                    if (!file) return;
                    void chooseIntakeFile(file);
                  }}
                >
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
                  {intakeFile ? (
                    <div className="intake-file-chosen">
                      <FileText size={22} aria-hidden />
                      <div>
                        <strong>{intakeFile.name}</strong>
                        <span>
                          {intakeFile.size < 1024
                            ? `${intakeFile.size} B`
                            : `${Math.max(1, Math.round(intakeFile.size / 1024))} KB`}
                          · ready to attach
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn small"
                        disabled={intakeBusy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIntakeFile(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="intake-drop-prompt">
                      <span className="intake-drop-icon" aria-hidden>
                        <Upload size={22} />
                      </span>
                      <strong>Drop file here</strong>
                      <span>
                        or click to browse · TXT, CSV, EML preferred (include Customer column) ·
                        PDF/image as provenance
                      </span>
                    </div>
                  )}
                </label>
              </section>

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
            <div className="modal-footer">
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
                disabled={intakeBusy || (!intakeText.trim() && !intakeFile)}
                onClick={() => {
                  void (async () => {
                    setIntakeBusy(true);
                    setIntakeStatus('');
                    setIntakeProgress(null);
                    setError('');
                    try {
                      let created = 0;
                      let lastTitle = '';
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

                      if (binary && intakeFile) {
                        setIntakeProgress({ processed: 0, total: 1, remaining: 1 });
                        const data = new FormData();
                        data.append('command_id', crypto.randomUUID());
                        data.append('file', intakeFile);
                        data.append('source', 'staff_upload');
                        if (intakeText.trim()) data.append('text', intakeText);
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
                        let raw = intakeText;
                        if (intakeFile && !asWhatsApp) {
                          const fileText = await intakeFile.text();
                          const stripped =
                            looksLikeEml(fileText, intakeFile.name) ||
                            /\.eml$/i.test(intakeFile.name)
                              ? extractTextFromEml(fileText)
                              : fileText;
                          raw = `${raw ? `${raw}\n\n` : ''}${stripped}`;
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
      )}
      {modal && (
        <CommandForm
          key={modal.key}
          config={modal}
          state={s}
          onClose={() => setModal(null)}
          onCreateParty={async (data: R, key: string) => {
            const result = await command('party', data, key);
            await refresh();
            return result;
          }}
          onInlineCommand={async (kind: string, data: R, key: string) => {
            const result = await command(kind, data, key);
            await refresh();
            return result;
          }}
          onSubmit={async (data: R) => {
            const r = await command(modal.kind, data, modal.key);
            await refresh();
            setModal(null);
            setToast('Saved. Linked balances and history updated.');
            if (modal.kind === 'booking') await openRecord('booking', r.id);
            else if (modal.kind === 'party') await openRecord('person', r.id);
            else if (selected) await openRecord(selected.type, selected.id);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
          {toast}
        </div>
      )}
    </div>
  );
}

function downloadCSV(name: string, rows: R[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    cell = csvCell;
  const text = [
    keys.map(cell).join(','),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
