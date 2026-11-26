/** Workspace section routes: /w/transactions (shareable). Legacy #page= still migrates. */

export const WORKSPACE_BASE = '/w';

/** Plan v1 home screen — Bookings list (URL slug remains `transactions`). */
export const WORKSPACE_HOME_PAGE = 'Bookings';

const PAGE_TO_SLUG: Record<string, string> = {
  Dashboard: 'dashboard',
  Bookings: 'transactions',
  'People & Families': 'people',
  Companies: 'companies',
  Suppliers: 'suppliers',
  'Sources & Brokers': 'sources',
  Partnerships: 'partnerships',
  Payments: 'payments',
  'Credits & points': 'credits-points',
  'Trade desk': 'trade',
  'Travel Assets': 'travel-assets',
  // Plan main screen name; legacy /w/commissions still resolves below.
  'Expected commissions': 'expected-commissions',
  Refunds: 'refunds',
  Calendar: 'calendar',
  'To-do': 'todo',
  Tasks: 'tasks',
  Accounting: 'accounting',
  Activity: 'activity',
  Settings: 'settings',
  'Users & Permissions': 'users',
  'Follow-up': 'follow-up',
  Attention: 'attention',
};

const SLUG_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_TO_SLUG).map(([page, slug]) => [slug, page]),
) as Record<string, string>;

export function workspacePageToSlug(page: string): string | null {
  return PAGE_TO_SLUG[page] ?? null;
}

export function workspaceSlugToPage(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  // Legacy Tasks bookmarks open Plan To-do.
  if (key === 'tasks') return 'To-do';
  // Legacy Commissions slug → Plan Expected commissions screen.
  if (key === 'commissions') return 'Expected commissions';
  return SLUG_TO_PAGE[key] ?? null;
}

export function isWorkspaceSlug(slug: string | null | undefined): boolean {
  return workspaceSlugToPage(slug) != null;
}

export function workspacePath(page: string): string {
  const slug = workspacePageToSlug(page) ?? workspacePageToSlug(WORKSPACE_HOME_PAGE) ?? 'transactions';
  return `${WORKSPACE_BASE}/${slug}`;
}

/** Parse /w/<slug> → page name. */
export function workspacePathToPage(pathname: string): string | null {
  const cleaned = pathname.replace(/\/+$/, '') || '/';
  if (cleaned === WORKSPACE_BASE) return WORKSPACE_HOME_PAGE;
  if (!cleaned.startsWith(`${WORKSPACE_BASE}/`)) return null;
  const slug = cleaned.slice(WORKSPACE_BASE.length + 1).split('/')[0] ?? '';
  return workspaceSlugToPage(slug);
}

export function readWorkspaceHash(hash = typeof window !== 'undefined' ? window.location.hash : ''): {
  reset: boolean;
  page: string | null;
} {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const pageSlug = params.get('page');
  return {
    reset: params.has('reset'),
    page: workspaceSlugToPage(pageSlug),
  };
}

/**
 * Resolve current section from path first, then legacy #page=.
 * Password reset (#reset=) is separate and must not be lost.
 */
export function readWorkspaceLocation(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): {
  reset: boolean;
  page: string | null;
  fromLegacyHash: boolean;
} {
  const { reset, page: hashPage } = readWorkspaceHash(hash);
  const pathPage = workspacePathToPage(pathname);
  if (pathPage) return { reset, page: pathPage, fromLegacyHash: false };
  if (hashPage) return { reset, page: hashPage, fromLegacyHash: true };
  if (pathname === '/' || pathname === '')
    return { reset, page: WORKSPACE_HOME_PAGE, fromLegacyHash: false };
  return { reset, page: null, fromLegacyHash: false };
}

/** Record deep-link keys in the hash (`#booking=<uuid>`). */
export const WORKSPACE_RECORD_KEYS = [
  'booking',
  'person',
  'asset',
  'draft',
  'payment',
  'refund',
] as const;
export type WorkspaceRecordKey = (typeof WORKSPACE_RECORD_KEYS)[number];

/** Secondary focus on a person's invoice draft (`#person=<id>&invoice=<id>`). */
export const WORKSPACE_INVOICE_HASH_KEY = 'invoice' as const;

export function readWorkspaceRecord(
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): { type: WorkspaceRecordKey; id: string } | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  for (const key of WORKSPACE_RECORD_KEYS) {
    const id = String(params.get(key) || '').trim();
    if (id) return { type: key, id };
  }
  return null;
}

/** Optional invoice focus when a person deep-link is open (Unknown id → null, never invent). */
export function readWorkspaceInvoiceId(
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const id = String(new URLSearchParams(raw).get(WORKSPACE_INVOICE_HASH_KEY) || '').trim();
  return id || null;
}

/**
 * Shareable invoice address: opens the customer, then focuses the draft row.
 * Blank customer/invoice → empty path segment avoided (caller must pass real ids).
 */
export function workspaceInvoiceUrl(customerId: string, invoiceId: string): string {
  const person = String(customerId || '').trim();
  const invoice = String(invoiceId || '').trim();
  const base = workspaceRecordUrl('person', person);
  if (!invoice) return base;
  const sep = base.includes('#') ? '&' : '#';
  return `${base}${sep}${WORKSPACE_INVOICE_HASH_KEY}=${encodeURIComponent(invoice)}`;
}

export function workspacePageForRecord(type: WorkspaceRecordKey): string {
  if (type === 'person') return 'People & Families';
  // Plan Credits and points is the primary ledger screen; asset URLs stay shareable.
  if (type === 'asset') return 'Credits & points';
  if (type === 'payment') return 'Payments';
  if (type === 'refund') return 'Refunds';
  return 'Bookings';
}

/** Shareable booking / person / asset / draft / payment / refund address (Plan: own web address). */
export function workspaceRecordUrl(type: WorkspaceRecordKey, id: string): string {
  return `${workspacePath(workspacePageForRecord(type))}#${type}=${encodeURIComponent(id)}`;
}

/**
 * Page number (1-based) for a deep-linked payment/list id.
 * Unknown id → page 1 (caller still shows list; never invents a match).
 */
export function listPageForRecordId(
  ids: readonly string[],
  recordId: string,
  pageSize: number,
): number {
  const id = String(recordId || '').trim();
  if (!id) return 1;
  const size = Math.max(1, pageSize);
  const idx = ids.findIndex((x) => x === id);
  if (idx < 0) return 1;
  return Math.floor(idx / size) + 1;
}

/**
 * Path URL for a section. Drops #page= / #reset=.
 * By default also drops record deep-link keys so section nav does not leave a stale booking open.
 */
export function workspaceUrl(
  page: string,
  currentHash = '',
  opts?: { keepRecord?: boolean },
): string {
  const path = workspacePath(page);
  const raw = currentHash.startsWith('#') ? currentHash.slice(1) : currentHash;
  const params = new URLSearchParams(raw);
  params.delete('reset');
  params.delete('page');
  if (!opts?.keepRecord) {
    for (const key of WORKSPACE_RECORD_KEYS) params.delete(key);
    params.delete(WORKSPACE_INVOICE_HASH_KEY);
  }
  const rest = params.toString();
  return rest ? `${path}#${rest}` : path;
}

/** @deprecated Prefer workspaceUrl — kept for tests / migration helpers. */
export function workspacePageHash(page: string, currentHash = ''): string {
  const slug = workspacePageToSlug(page);
  if (!slug) return currentHash || '#page=dashboard';
  const raw = currentHash.startsWith('#') ? currentHash.slice(1) : currentHash;
  const params = new URLSearchParams(raw);
  params.delete('reset');
  params.set('page', slug);
  return `#${params.toString()}`;
}

export function listWorkspaceSlugs(): string[] {
  return Object.values(PAGE_TO_SLUG);
}

export function workspaceSyntheticFlag(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  return env.PADOVA_QA === '1' || !env.DATABASE_URL;
}
