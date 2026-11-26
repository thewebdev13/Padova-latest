import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWorkspaceSlug,
  listPageForRecordId,
  listWorkspaceSlugs,
  readWorkspaceHash,
  readWorkspaceInvoiceId,
  readWorkspaceLocation,
  readWorkspaceRecord,
  WORKSPACE_HOME_PAGE,
  workspaceInvoiceUrl,
  workspacePageHash,
  workspacePageForRecord,
  workspacePageToSlug,
  workspacePath,
  workspacePathToPage,
  workspaceRecordUrl,
  workspaceSlugToPage,
  workspaceUrl,
} from '../src/lib/workspace-routes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('transactions slug maps to Bookings page', () => {
  assert.equal(workspacePageToSlug('Bookings'), 'transactions');
  assert.equal(workspaceSlugToPage('transactions'), 'Bookings');
  assert.equal(workspaceSlugToPage('TRANSACTIONS'), 'Bookings');
  assert.equal(isWorkspaceSlug('transactions'), true);
  assert.equal(isWorkspaceSlug('nope'), false);
});

test('Plan home is Bookings (transactions slug)', () => {
  assert.equal(WORKSPACE_HOME_PAGE, 'Bookings');
  assert.equal(workspacePath(WORKSPACE_HOME_PAGE), '/w/transactions');
  assert.equal(workspacePathToPage('/w'), 'Bookings');
});

test('path routes map both ways', () => {
  assert.equal(workspacePath('Bookings'), '/w/transactions');
  assert.equal(workspacePath('Dashboard'), '/w/dashboard');
  assert.equal(workspacePathToPage('/w/transactions'), 'Bookings');
  assert.equal(workspacePathToPage('/w/transactions/'), 'Bookings');
  assert.equal(workspacePathToPage('/w'), 'Bookings');
  assert.equal(workspacePathToPage('/partnerships/connect'), null);
  assert.equal(workspacePathToPage('/api/state'), null);
});

test('readWorkspaceLocation prefers path over legacy hash page', () => {
  assert.deepEqual(readWorkspaceLocation('/w/payments', '#page=transactions'), {
    reset: false,
    page: 'Payments',
    fromLegacyHash: false,
  });
  assert.deepEqual(readWorkspaceLocation('/', '#page=transactions'), {
    reset: false,
    page: 'Bookings',
    fromLegacyHash: true,
  });
  assert.deepEqual(readWorkspaceLocation('/', ''), {
    reset: false,
    page: 'Bookings',
    fromLegacyHash: false,
  });
});

test('password reset hash is preserved and not confused with section', () => {
  assert.deepEqual(readWorkspaceHash('#reset=abc'), { reset: true, page: null });
  assert.deepEqual(readWorkspaceLocation('/w/dashboard', '#reset=abc'), {
    reset: true,
    page: 'Dashboard',
    fromLegacyHash: false,
  });
  assert.deepEqual(readWorkspaceLocation('/', '#reset=abc'), {
    reset: true,
    page: 'Bookings',
    fromLegacyHash: false,
  });
});

test('workspaceUrl writes path and strips page/reset hash keys', () => {
  assert.equal(workspaceUrl('Bookings'), '/w/transactions');
  assert.equal(workspaceUrl('Partnerships', '#reset=1&foo=1'), '/w/partnerships#foo=1');
  assert.equal(workspaceUrl('Bookings', '#page=old'), '/w/transactions');
});

test('booking, person, asset, draft, payment, and refund have shareable record URLs', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(workspaceRecordUrl('booking', id), `/w/transactions#booking=${id}`);
  assert.equal(workspaceRecordUrl('person', id), `/w/people#person=${id}`);
  assert.equal(workspaceRecordUrl('asset', id), `/w/credits-points#asset=${id}`);
  assert.equal(workspaceRecordUrl('draft', id), `/w/transactions#draft=${id}`);
  assert.equal(workspaceRecordUrl('payment', id), `/w/payments#payment=${id}`);
  assert.equal(workspaceRecordUrl('refund', id), `/w/refunds#refund=${id}`);
  assert.equal(workspacePageForRecord('payment'), 'Payments');
  assert.equal(workspacePageForRecord('refund'), 'Refunds');
  assert.deepEqual(readWorkspaceRecord(`#booking=${id}`), { type: 'booking', id });
  assert.deepEqual(readWorkspaceRecord(`#person=${id}`), { type: 'person', id });
  assert.deepEqual(readWorkspaceRecord(`#asset=${id}`), { type: 'asset', id });
  assert.deepEqual(readWorkspaceRecord(`#draft=${id}`), { type: 'draft', id });
  assert.deepEqual(readWorkspaceRecord(`#payment=${id}`), { type: 'payment', id });
  assert.deepEqual(readWorkspaceRecord(`#refund=${id}`), { type: 'refund', id });
  assert.equal(workspaceUrl('Bookings', `#booking=${id}`), '/w/transactions');
  assert.equal(
    workspaceUrl('Bookings', `#booking=${id}`, { keepRecord: true }),
    `/w/transactions#booking=${id}`,
  );
  assert.equal(
    workspaceUrl('Credits & points', `#asset=${id}`, { keepRecord: true }),
    `/w/credits-points#asset=${id}`,
  );
  assert.equal(
    workspaceUrl('Bookings', `#draft=${id}`, { keepRecord: true }),
    `/w/transactions#draft=${id}`,
  );
  assert.equal(
    workspaceUrl('Payments', `#payment=${id}`, { keepRecord: true }),
    `/w/payments#payment=${id}`,
  );
  assert.equal(
    workspaceUrl('Refunds', `#refund=${id}`, { keepRecord: true }),
    `/w/refunds#refund=${id}`,
  );
});

test('listPageForRecordId pages a payment deep-link without inventing a match', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(listPageForRecordId(ids, 'a', 2), 1);
  assert.equal(listPageForRecordId(ids, 'c', 2), 2);
  assert.equal(listPageForRecordId(ids, 'e', 2), 3);
  assert.equal(listPageForRecordId(ids, 'missing', 2), 1);
  assert.equal(listPageForRecordId([], 'a', 12), 1);
});

test('Payments and Refunds lists focus deep-links and offer Copy link', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  assert.match(src, /focusPaymentId/);
  assert.match(src, /focusRefundId/);
  assert.match(src, /payment-row-/);
  assert.match(src, /refund-row-/);
  assert.match(src, /workspaceRecordUrl\('payment'/);
  assert.match(src, /workspaceRecordUrl\('refund'/);
  assert.match(src, /focusListRecord/);
  assert.match(css, /tr\.is-focused/);
});

test('invoice shareable URL focuses draft on person (Unknown id stays null)', () => {
  const person = '11111111-1111-1111-1111-111111111111';
  const invoice = '22222222-2222-2222-2222-222222222222';
  assert.equal(
    workspaceInvoiceUrl(person, invoice),
    `/w/people#person=${person}&invoice=${invoice}`,
  );
  assert.equal(workspaceInvoiceUrl(person, ''), `/w/people#person=${person}`);
  assert.equal(
    readWorkspaceInvoiceId(`#person=${person}&invoice=${invoice}`),
    invoice,
  );
  assert.equal(readWorkspaceInvoiceId(`#person=${person}`), null);
  assert.equal(readWorkspaceInvoiceId(''), null);
  assert.deepEqual(readWorkspaceRecord(`#person=${person}&invoice=${invoice}`), {
    type: 'person',
    id: person,
  });
  assert.equal(
    workspaceUrl('People & Families', `#person=${person}&invoice=${invoice}`),
    '/w/people',
  );
  assert.equal(
    workspaceUrl('People & Families', `#person=${person}&invoice=${invoice}`, {
      keepRecord: true,
    }),
    `/w/people#person=${person}&invoice=${invoice}`,
  );
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /focusInvoiceId/);
  assert.match(src, /invoice-row-/);
  assert.match(src, /workspaceInvoiceUrl/);
});

test('legacy workspacePageHash still available for migration helpers', () => {
  assert.equal(workspacePageHash('Bookings'), '#page=transactions');
});

test('known slugs cover main nav sections', () => {
  const slugs = listWorkspaceSlugs();
  assert.ok(slugs.includes('dashboard'));
  assert.ok(slugs.includes('transactions'));
  assert.ok(slugs.includes('todo'));
  assert.ok(slugs.includes('trade'));
  assert.ok(slugs.includes('partnerships'));
  assert.ok(slugs.includes('users'));
});

test('Plan Trade desk has its own /w/trade route', () => {
  assert.equal(workspacePageToSlug('Trade desk'), 'trade');
  assert.equal(workspaceSlugToPage('trade'), 'Trade desk');
  assert.equal(workspacePath('Trade desk'), '/w/trade');
  assert.equal(workspacePathToPage('/w/trade'), 'Trade desk');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /\['Trade desk'/);
  assert.match(src, /page === 'Trade desk'/);
  assert.match(src, /New trade/);
});

test('Plan Expected commissions has /w/expected-commissions; legacy commissions maps', () => {
  assert.equal(workspacePageToSlug('Expected commissions'), 'expected-commissions');
  assert.equal(workspaceSlugToPage('expected-commissions'), 'Expected commissions');
  assert.equal(workspaceSlugToPage('commissions'), 'Expected commissions');
  assert.equal(workspacePath('Expected commissions'), '/w/expected-commissions');
  assert.equal(workspacePathToPage('/w/expected-commissions'), 'Expected commissions');
  assert.equal(workspacePathToPage('/w/commissions'), 'Expected commissions');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /\['Expected commissions'/);
  assert.match(src, /page === 'Expected commissions'/);
  const page = readFileSync(join(process.cwd(), 'src/components/commissions-page.tsx'), 'utf8');
  assert.match(page, /<h1>Expected commissions<\/h1>/);
});

test('Plan To-do slug; legacy tasks opens To-do', () => {
  assert.equal(workspacePageToSlug('To-do'), 'todo');
  assert.equal(workspaceSlugToPage('todo'), 'To-do');
  assert.equal(workspaceSlugToPage('tasks'), 'To-do');
  assert.equal(workspacePath('To-do'), '/w/todo');
});

test('Directory list rows offer person Copy link', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /directory-actions[\s\S]*Copy link for \$\{p\.name\}[\s\S]*workspaceRecordUrl\('person', p\.id\)[\s\S]*copyWorkspacePath/,
  );
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  assert.match(css, /\.directory-actions/);
});

test('Drafts list cards offer draft Copy link', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /intake-draft-copy-link[\s\S]*workspaceRecordUrl\('draft', draft\.id\)[\s\S]*copyWorkspacePath/,
  );
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  assert.match(css, /\.intake-draft-copy-link/);
});
