import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditEventChannel,
  auditEventChannelLabel,
  auditMatchesSearch,
} from '../src/lib/audit-channel';
import { summarizeActivity } from '../src/lib/activity-summary';
import type { Actor } from '../src/lib/permissions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const owner = {
  id: 'owner',
  role: 'OWNER',
  permissions: ['view_sale_price', 'edit_payments'],
} as Actor;

test('audit channel defaults to screen — never invents WhatsApp/email', () => {
  assert.equal(auditEventChannel({}), 'screen');
  assert.equal(auditEventChannel({ after_value: { input: {} } }), 'screen');
  assert.equal(auditEventChannelLabel('screen'), 'Screen');
});

test('audit channel reads intake_source / provenance', () => {
  assert.equal(
    auditEventChannel({
      after_value: { input: { intake_source: 'whatsapp' } },
    }),
    'whatsapp',
  );
  assert.equal(
    auditEventChannel({
      after_value: {
        input: { intake_provenance: { source: 'email' } },
      },
    }),
    'email',
  );
  assert.equal(
    auditEventChannel({
      after_value: { input: { source: 'historical_import' } },
    }),
    'import',
  );
  assert.equal(auditEventChannelLabel('whatsapp'), 'WhatsApp');
  assert.equal(auditEventChannelLabel('email'), 'Email');
});

test('summarizeActivity attaches source_channel for Activity UI', () => {
  const row = summarizeActivity(
    {
      id: 'e1',
      kind: 'note',
      actor: 'owner',
      actor_name: 'Owner',
      created_at: '2026-11-26T12:00:00Z',
      after_value: { input: { intake_source: 'gmail' } },
    },
    owner,
    [],
  );
  assert.equal(row.source_channel, 'email');
  assert.equal(row.source_label, 'Email');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /source_label/);
  assert.match(src, /source_channel/);
});

test('Activity + Dashboard recent offer Copy link when booking is linked', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /page === 'Activity'[\s\S]*Open booking[\s\S]*calendarBookingSharePath\(a\.record_id\)[\s\S]*Copy link/,
  );
  assert.match(
    src,
    /Recent activity[\s\S]*calendarBookingSharePath\(a\.record_id\)[\s\S]*Copy link/,
  );
});

test('Activity search: summary · actor · source; blank query matches all ≠ invent', () => {
  const row = {
    id: 'evt-1',
    summary: 'Recorded payment for PDV-100',
    kind: 'payment',
    actor_name: 'Minindy',
    source_label: 'Screen',
    source_channel: 'screen',
    record_id: 'b-abc',
  };
  assert.equal(auditMatchesSearch(row, ''), true);
  assert.equal(auditMatchesSearch(row, null), true);
  assert.equal(auditMatchesSearch(row, 'pdv-100'), true);
  assert.equal(auditMatchesSearch(row, 'MININDY'), true);
  assert.equal(auditMatchesSearch(row, 'screen'), true);
  assert.equal(auditMatchesSearch(row, 'b-abc'), true);
  assert.equal(auditMatchesSearch(row, 'whatsapp'), false);
  assert.equal(auditMatchesSearch({ summary: null, actor_name: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /auditMatchesSearch/);
  assert.match(src, /activity-search/);
  assert.match(src, /Search summary, actor or source/);
});
