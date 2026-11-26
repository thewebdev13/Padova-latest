import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { followupRowMatchesSearch } from '../src/lib/operational-views';

test('Follow-up search: code · title · detail; blank query matches all ≠ invent', () => {
  const row = {
    id: 'r1',
    code: 'PDV-100',
    title: 'Customer owes',
    detail: 'Balance open on Cap1 booking',
    kind: 'Customer Owes',
    status: 'Open',
    booking_id: 'b-abc',
  };
  assert.equal(followupRowMatchesSearch(row, ''), true);
  assert.equal(followupRowMatchesSearch(row, null), true);
  assert.equal(followupRowMatchesSearch(row, 'pdv-100'), true);
  assert.equal(followupRowMatchesSearch(row, 'CAP1'), true);
  assert.equal(followupRowMatchesSearch(row, 'customer owes'), true);
  assert.equal(followupRowMatchesSearch(row, 'b-abc'), true);
  assert.equal(followupRowMatchesSearch(row, 'sruly'), false);
  assert.equal(followupRowMatchesSearch({ title: null, detail: null }, 'x'), false);

  const component = readFileSync(
    join(process.cwd(), 'src/components/operational-views.tsx'),
    'utf8',
  );
  assert.match(component, /followupRowMatchesSearch/);
  assert.match(component, /followup-search/);
  assert.match(component, /Search booking #, title or detail/);
  // Dashboard compact Needs attention also searches (expands past 5-row cap while querying).
  assert.match(component, /const searching = Boolean\(query\.trim\(\)\)/);
  assert.doesNotMatch(component, /\{!compact \? \(\s*<div className="toolbar directory-toolbar"/);
  assert.match(
    component,
    /compact\s*\?\s*searching\s*\?\s*rows\s*:\s*rows\.slice\(0, 5\)/,
  );

  const workspace = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(workspace, /followupRowMatchesSearch/);
  assert.match(workspace, /attention-search/);
  assert.match(workspace, /Search title, detail or booking/);
});
