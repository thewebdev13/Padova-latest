import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOwnerReminderDigest,
  normalizeOwnerPhone,
  reminderDigestFingerprint,
} from '../src/lib/ai-reminder-digest';

test('normalizeOwnerPhone keeps digits only', () => {
  assert.equal(normalizeOwnerPhone('+972 50-123-4567'), '972501234567');
  assert.equal(normalizeOwnerPhone('bad'), '');
});

test('digest is stable and does not invent money', () => {
  const items = [
    {
      kind: 'Missing sale price',
      title: 'BK-1 · Missing sale price',
      urgency: 'missing_info' as const,
      booking_id: 'a',
    },
    {
      kind: 'Commission due',
      title: 'C-1 · commission due 2026-11-20',
      due_on: '2026-11-20',
      urgency: 'due_tomorrow' as const,
    },
  ];
  const a = formatOwnerReminderDigest({ as_of: '2026-11-19', items });
  const b = formatOwnerReminderDigest({ as_of: '2026-11-19', items });
  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(a.fingerprint, reminderDigestFingerprint(items, '2026-11-19'));
  assert.match(a.text, /MISSING INFO/);
  assert.match(a.text, /DUE TOMORROW/);
  assert.doesNotMatch(a.text, /\$0\.00/);
  assert.doesNotMatch(a.text, /invent/i);
});
