import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyIntakeFieldOverrides,
  buildIntakeMappingPreview,
  intakePreviewMark,
  listIntakePasteLines,
  UNREAD_FILE_MESSAGE,
} from '../src/lib/intake-preview';
import { parseQuickPaste } from '../src/lib/quick-paste';

test('flexible labels: booking reference number, Price $, Guest→traveler', () => {
  const paste = parseQuickPaste(`Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`);
  assert.equal(paste.fields.customer, 'QA Alex Morgan');
  assert.equal(paste.fields.traveler, 'Minindy Quirona');
  assert.equal(paste.fields.route, 'Miami');
  assert.equal(paste.fields.primary_reference, '123456003');
  assert.equal(paste.fields.sale, '200');
  assert.equal(paste.fieldSources.primary_reference, 'Booking reference number');
  assert.equal(paste.fieldSources.sale, 'Price');
  assert.equal(paste.fieldSources.traveler, 'Guest');
});

test('Cost maps to customer price; Seller Cost stays seller', () => {
  const paste = parseQuickPaste(`Product: Hotel
Cost: 250
Seller Cost: 180`);
  assert.equal(paste.fields.sale, '250');
  assert.equal(paste.fields.seller_cost, '180');
});

test('preview rows match Site Feedback sample shape', () => {
  const preview = buildIntakeMappingPreview(`Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`);
  assert.equal(preview.unread, false);
  assert.equal(preview.found, 6);
  assert.equal(preview.missing, 1);
  const byId = Object.fromEntries(preview.rows.map((r) => [r.id, r]));
  assert.equal(byId.customer.value, 'QA Alex Morgan');
  assert.equal(byId.traveler.value, 'Minindy Quirona');
  assert.equal(byId.traveler.sourceLabel, 'Guest');
  assert.equal(byId.route.value, 'Miami');
  assert.equal(byId.route.sourceLabel, 'Location');
  assert.equal(byId.primary_reference.fieldLabel, 'Confirmation #');
  assert.equal(byId.primary_reference.sourceLabel, 'Booking reference number');
  assert.equal(byId.primary_reference.value, '123456003');
  assert.equal(byId.sale.value, '$200.00');
  assert.equal(byId.sale.sourceLabel, 'Price');
  assert.equal(byId.dates.status, 'missing');
  assert.equal(byId.dates.value, 'Not found – add after');
  const withParty = buildIntakeMappingPreview(
    `Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`,
    { parties: [{ name: 'QA Alex Morgan' }, { name: 'Minindy Quirona' }] },
  );
  assert.equal(withParty.rows.find((r) => r.id === 'customer')?.sourceHint, 'existing person');
  assert.equal(withParty.rows.find((r) => r.id === 'traveler')?.sourceHint, 'existing person');
  assert.equal(intakePreviewMark('found'), '✓');
  assert.equal(intakePreviewMark('confirm'), '?');
  assert.equal(intakePreviewMark('missing'), '!');
  const ambiguous = buildIntakeMappingPreview(
    `Customer: Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`,
    {
      parties: [
        { name: 'Alex Morgan' },
        { name: 'Alex Morgan' },
        { name: 'Minindy Quirona' },
      ],
    },
  );
  const ambCustomer = ambiguous.rows.find((r) => r.id === 'customer');
  assert.equal(ambCustomer?.sourceHint, 'multiple matches, confirm');
  assert.equal(ambCustomer?.status, 'confirm');
  assert.equal(intakePreviewMark(ambCustomer!.status), '?');
  assert.equal(ambiguous.rows.find((r) => r.id === 'traveler')?.status, 'found');
  // Ambiguous person is not counted as a confident found.
  assert.equal(ambiguous.found, withParty.found - 1);
});

test('unread preview uses client message and blocks inventing fields', () => {
  const preview = buildIntakeMappingPreview('', {
    unread: true,
    unreadMessage: UNREAD_FILE_MESSAGE,
  });
  assert.equal(preview.unread, true);
  assert.equal(preview.rows.length, 0);
  assert.match(preview.unreadMessage || '', /couldn't read this file/i);
});

test('field remap overrides auto-detect without inventing values', () => {
  const raw = `Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Confirmation: ALT-999
Price: $200`;
  const lines = listIntakePasteLines(raw);
  const alt = lines.find((l) => /ALT-999/i.test(l.value));
  assert.ok(alt);
  const preview = buildIntakeMappingPreview(raw, {
    overrides: { primary_reference: alt!.id },
  });
  const conf = preview.rows.find((r) => r.id === 'primary_reference');
  assert.equal(conf?.value, 'ALT-999');
  assert.equal(conf?.sourceHint, 'remapped');
  const merged = applyIntakeFieldOverrides(
    raw,
    preview.rows,
    { primary_reference: alt!.id },
    preview.lines,
  );
  assert.match(merged, /Confirmation:\s*ALT-999/i);
});
