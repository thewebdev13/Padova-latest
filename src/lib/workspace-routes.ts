/** Workspace section routes: /w/transactions (shareable). Legacy #page= still migrates. */

export const WORKSPACE_BASE = '/w';

const PAGE_TO_SLUG: Record<string, string> = {
  Dashboard: 'dashboard',
  Bookings: 'transactions',
  'People & Families': 'people',
  Companies: 'companies',
  Suppliers: 'suppliers',
  'Sources & Brokers': 'sources',
  Partnerships: 'partnerships',
  Payments: 'payments',
  'Travel Assets': 'travel-assets',
  Commissions: 'commissions',
  Refunds: 'refunds',
  Calendar: 'calendar',
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
  return SLUG_TO_PAGE[slug.trim().toLowerCase()] ?? null;
}

export function isWorkspaceSlug(slug: string | null | undefined): boolean {
  return workspaceSlugToPage(slug) != null;
}

export function workspacePath(page: string): string {
  const slug = workspacePageToSlug(page) ?? 'dashboard';
  return `${WORKSPACE_BASE}/${slug}`;
}

/** Parse /w/<slug> → page name. */
export function workspacePathToPage(pathname: string): string | null {
  const cleaned = pathname.replace(/\/+$/, '') || '/';
  if (cleaned === WORKSPACE_BASE) return 'Dashboard';
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
  if (pathname === '/' || pathname === '') return { reset, page: 'Dashboard', fromLegacyHash: false };
  return { reset, page: null, fromLegacyHash: false };
}

/** Path URL for a section. Drops #page= / #reset=; keeps any other hash params. */
export function workspaceUrl(page: string, currentHash = ''): string {
  const path = workspacePath(page);
  const raw = currentHash.startsWith('#') ? currentHash.slice(1) : currentHash;
  const params = new URLSearchParams(raw);
  params.delete('reset');
  params.delete('page');
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
