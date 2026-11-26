import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREDITS_POINTS_PAGE,
  CREDITS_POINTS_SLUG,
  assetMatchesSearch,
  expectedEventBookingSharePath,
  expectedEventMatchesSearch,
  filterCreditsAndPointsAssets,
  isPlanCreditsOrPointsAsset,
} from '../src/lib/credits-points';
import {
  workspacePageForRecord,
  workspacePageToSlug,
  workspacePath,
  workspaceRecordUrl,
  workspaceSlugToPage,
} from '../src/lib/workspace-routes';

test('isPlanCreditsOrPointsAsset covers credits, vouchers, points', () => {
  assert.equal(isPlanCreditsOrPointsAsset({ kind: 'Points', unit: 'points' }), true);
  assert.equal(isPlanCreditsOrPointsAsset({ kind: 'Voucher', unit: 'money' }), true);
  assert.equal(isPlanCreditsOrPointsAsset({ kind: 'Travel Credit', issuer: 'Cap1' }), true);
  assert.equal(isPlanCreditsOrPointsAsset({ kind: 'Certificate', unit: 'count' }), false);
  assert.equal(isPlanCreditsOrPointsAsset({ kind: 'Other', name: 'Misc' }), false);
});

test('filterCreditsAndPointsAssets keeps only Plan ledger rows', () => {
  const rows = filterCreditsAndPointsAssets([
    { id: '1', kind: 'Points', unit: 'points' },
    { id: '2', kind: 'Certificate', unit: 'count' },
    { id: '3', kind: 'Voucher' },
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['1', '3'],
  );
});

test('Credits & points route is Plan-named; asset deep links use it', () => {
  assert.equal(CREDITS_POINTS_PAGE, 'Credits & points');
  assert.equal(workspacePageToSlug(CREDITS_POINTS_PAGE), CREDITS_POINTS_SLUG);
  assert.equal(workspaceSlugToPage(CREDITS_POINTS_SLUG), CREDITS_POINTS_PAGE);
  assert.equal(workspacePath(CREDITS_POINTS_PAGE), '/w/credits-points');
  assert.equal(workspacePageForRecord('asset'), CREDITS_POINTS_PAGE);
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(workspaceRecordUrl('asset', id), `/w/credits-points#asset=${id}`);
});

test('Credits & points / Travel Assets cards offer Copy link', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /asset-actions[\s\S]*workspaceRecordUrl\('asset', a\.id\)[\s\S]*Copy link/,
  );
  assert.match(
    src,
    /Trades to complete[\s\S]*workspaceRecordUrl\('asset', row\.id\)[\s\S]*Copy link/,
  );
  assert.match(
    src,
    /page === 'Trade desk'[\s\S]*Trades to complete[\s\S]*workspaceRecordUrl\('asset', row\.id\)[\s\S]*Copy link/,
  );
});

test('Expected events Copy link: booking share path; blank ≠ invent', () => {
  const id = '22222222-2222-2222-2222-222222222222';
  assert.equal(
    expectedEventBookingSharePath({ booking_id: id }),
    `/w/transactions#booking=${id}`,
  );
  assert.equal(expectedEventBookingSharePath({ booking_id: null }), null);
  assert.equal(expectedEventBookingSharePath({ booking_id: '' }), null);
  assert.equal(expectedEventBookingSharePath({}), null);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /expectedEventBookingSharePath/);
  assert.match(
    src,
    /Pending transfers & rewards[\s\S]*expectedEventBookingSharePath[\s\S]*Open booking[\s\S]*Copy link/,
  );
  assert.match(
    src,
    /Points rewards & transfers[\s\S]*expectedEventBookingSharePath[\s\S]*Copy link/,
  );
});

test('Credits/assets search: name · issuer · kind; blank query matches all ≠ invent', () => {
  const row = {
    id: 'asset-abc123',
    name: 'Cap1 PM credit BRWS5J',
    issuer: 'Capital One',
    kind: 'Capital One credit',
    restrictions: 'Profile A',
    ownership: 'Padova',
  };
  assert.equal(assetMatchesSearch(row, ''), true);
  assert.equal(assetMatchesSearch(row, null), true);
  assert.equal(assetMatchesSearch(row, 'brws5j'), true);
  assert.equal(assetMatchesSearch(row, 'CAPITAL ONE'), true);
  assert.equal(assetMatchesSearch(row, 'profile a'), true);
  assert.equal(assetMatchesSearch(row, 'asset-abc'), true);
  assert.equal(assetMatchesSearch(row, 'marriott'), false);
  assert.equal(assetMatchesSearch({ name: null, issuer: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /assetMatchesSearch/);
  assert.match(src, /assets-search/);
  assert.match(src, /Search name, issuer or kind/);
});

test('Pending transfers search: kind · reference · booking; blank query matches all ≠ invent', () => {
  const row = {
    id: 'evt-abc123',
    kind: 'Cap1 transfer',
    reference: 'BRWS5J',
    status: 'Pending',
    booking_id: '22222222-2222-2222-2222-222222222222',
    notes: 'Awaiting issuer',
  };
  assert.equal(expectedEventMatchesSearch(row, ''), true);
  assert.equal(expectedEventMatchesSearch(row, null), true);
  assert.equal(expectedEventMatchesSearch(row, 'cap1'), true);
  assert.equal(expectedEventMatchesSearch(row, 'brws5j'), true);
  assert.equal(expectedEventMatchesSearch(row, 'pending'), true);
  assert.equal(expectedEventMatchesSearch(row, '22222222'), true);
  assert.equal(expectedEventMatchesSearch(row, 'marriott'), false);
  assert.equal(expectedEventMatchesSearch({ kind: null, reference: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /expectedEventMatchesSearch/);
  assert.match(src, /expected-events-search/);
  assert.match(src, /Search kind, reference or booking/);
});
