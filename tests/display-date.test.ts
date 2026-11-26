import assert from 'node:assert/strict';
import test from 'node:test';
import { dateLabel, dateTimeLabel } from '../src/lib/display-date';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('dateLabel — blank / bad stay Not set / Unknown; never invent today', () => {
  assert.equal(dateLabel(null), 'Not set');
  assert.equal(dateLabel(''), 'Not set');
  assert.equal(dateLabel('not-a-date'), 'Unknown date');
  assert.match(dateLabel('2026-11-26'), /Nov/);
});

test('dateTimeLabel — Plan one date style for activity timestamps', () => {
  assert.equal(dateTimeLabel(null), 'Not set');
  assert.equal(dateTimeLabel(''), 'Not set');
  assert.equal(dateTimeLabel('not-a-date'), 'Unknown date');
  const labeled = dateTimeLabel('2026-11-26T15:30:00.000Z');
  assert.match(labeled, /Nov/);
  assert.match(labeled, /2026/);
  assert.match(labeled, /\d/);
});

test('Activity / booking notes use dateTimeLabel — no Traveler(s) hedge', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /dateTimeLabel\(a\.created_at\)/);
  assert.doesNotMatch(src, /new Date\(a\.created_at\)\.toLocaleString\(\)/);
  assert.doesNotMatch(src, /Traveler\(s\)/);
  assert.doesNotMatch(src, /prior duplicate\(s\)/);
  assert.match(src, /'Travelers'/);
});
