import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessIntakeCapture,
  formatIntakeOwnerAlert,
  applyIntakeCaptureToEntry,
  formatIntakeMissingLabel,
  formatIntakeMissingSummary,
} from '../src/lib/intake-confidence';

test('high confidence when product, dates, traveler present (sale Unknown OK)', () => {
  const capture = assessIntakeCapture({
    entry: {
      product: 'Flight',
      travel_start: '2027-04-01',
      travel_end: '2027-04-05',
      route: 'JFK-TLV',
      intake_traveler_label: 'Ada Lovelace',
      intake_customer_label: 'Ada Lovelace',
      ai_created: true,
      intake_provenance: { ai: { used: true } },
    },
    recognized_fields: ['product', 'travel_start', 'traveler', 'customer', 'route'],
  });
  assert.equal(capture.confidence, 'high');
  assert.equal(capture.ai_generated, true);
  assert.equal(capture.extract, 'ai');
  assert.ok(capture.tags.includes('ai_generated'));
  assert.equal(capture.missing.includes('product'), false);
});

test('low confidence missing travel dates triggers owner alert', () => {
  const capture = assessIntakeCapture({
    entry: {
      product: 'Hotel',
      travel_start: '',
      intake_traveler_label: 'Guest',
    },
    issues: ['travel dates unclear'],
  });
  assert.equal(capture.confidence, 'low');
  assert.ok(capture.missing.includes('travel_start'));
  assert.equal(capture.needs_owner_alert, true);
});

test('owner alert text never invents money and marks Owner-only', () => {
  const capture = assessIntakeCapture({
    entry: { product: '' },
    issues: ['need review'],
  });
  const text = formatIntakeOwnerAlert({
    channel: 'whatsapp',
    title: 'Test draft',
    draft_id: 'd1',
    live: false,
    capture,
    chat_or_mailbox: 'Family chat',
    reason: 'product_unknown',
  });
  assert.match(text, /Owner only/);
  assert.match(text, /Do not invent amounts/);
  assert.doesNotMatch(text, /\$0/);
  assert.match(text, /Draft only/);
});

test('missing keys render as staff labels, not snake_case', () => {
  assert.equal(formatIntakeMissingLabel('travel_start'), 'Travel date');
  assert.equal(formatIntakeMissingLabel('customer_or_traveler'), 'Customer or traveler');
  assert.match(
    formatIntakeMissingSummary(['product', 'travel_start', 'traveler']),
    /Still need: Product, Travel date, and Traveler/,
  );
  assert.doesNotMatch(
    formatIntakeMissingSummary(['product', 'travel_start']),
    /travel_start|customer_or/,
  );
});

test('applyIntakeCaptureToEntry stores tags on entry', () => {
  const entry: Record<string, unknown> = { product: 'Car' };
  const capture = assessIntakeCapture({
    entry: {
      product: 'Car',
      travel_start: '2027-05-01',
      intake_traveler_label: 'Driver',
    },
  });
  applyIntakeCaptureToEntry(entry, capture);
  assert.ok(Array.isArray(entry.intake_tags));
  assert.equal((entry.intake_capture as { confidence: string }).confidence, capture.confidence);
});
