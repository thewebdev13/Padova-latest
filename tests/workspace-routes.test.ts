import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWorkspaceSlug,
  listWorkspaceSlugs,
  readWorkspaceHash,
  readWorkspaceLocation,
  workspacePageHash,
  workspacePageToSlug,
  workspacePath,
  workspacePathToPage,
  workspaceSlugToPage,
  workspaceUrl,
} from '../src/lib/workspace-routes';

test('transactions slug maps to Bookings page', () => {
  assert.equal(workspacePageToSlug('Bookings'), 'transactions');
  assert.equal(workspaceSlugToPage('transactions'), 'Bookings');
  assert.equal(workspaceSlugToPage('TRANSACTIONS'), 'Bookings');
  assert.equal(isWorkspaceSlug('transactions'), true);
  assert.equal(isWorkspaceSlug('nope'), false);
});

test('path routes map both ways', () => {
  assert.equal(workspacePath('Bookings'), '/w/transactions');
  assert.equal(workspacePath('Dashboard'), '/w/dashboard');
  assert.equal(workspacePathToPage('/w/transactions'), 'Bookings');
  assert.equal(workspacePathToPage('/w/transactions/'), 'Bookings');
  assert.equal(workspacePathToPage('/w'), 'Dashboard');
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
    page: 'Dashboard',
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
    page: 'Dashboard',
    fromLegacyHash: false,
  });
});

test('workspaceUrl writes path and strips page/reset hash keys', () => {
  assert.equal(workspaceUrl('Bookings'), '/w/transactions');
  assert.equal(workspaceUrl('Partnerships', '#reset=1&foo=1'), '/w/partnerships#foo=1');
  assert.equal(workspaceUrl('Bookings', '#page=old'), '/w/transactions');
});

test('legacy workspacePageHash still available for migration helpers', () => {
  assert.equal(workspacePageHash('Bookings'), '#page=transactions');
});

test('known slugs cover main nav sections', () => {
  const slugs = listWorkspaceSlugs();
  assert.ok(slugs.includes('dashboard'));
  assert.ok(slugs.includes('transactions'));
  assert.ok(slugs.includes('partnerships'));
  assert.ok(slugs.includes('users'));
});
