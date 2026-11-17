import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAllowedIntakeMailbox,
  buildIntakeDraft,
  buildIntakeDrafts,
  extractIntakeText,
  extractTextFromEml,
  INTAKE_EMAIL_MAILBOXES,
  parseEmlEnvelope,
  splitIntakeEntries,
} from '../src/lib/booking-intake';
import { draftKind } from '../src/lib/draft-kind';
import { emailIntakeStatus, prepareEmailIntakeDraft } from '../src/lib/email-intake';
import {
  formatIntakeProvenanceLine,
  intakeChannelBadge,
  intakeChannelFilterKey,
} from '../src/lib/intake-channel-label';
import { prepareWhatsAppIntakeDraft, whatsappIntakeStatus } from '../src/lib/whatsapp-intake';

test('plain text Field: Value builds a booking-shaped draft without posting signals', () => {
  const built = buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer: Sample Co
Product: Hotel
Route: Miami Beach
Check-in: 2027-03-01
Check-out: 2027-03-04
PNR: ABCD12
Customer Price: 450.00
Summary: Three nights sample stay
Notes: Intake unit test`,
    receivedAt: '2026-11-16T12:00:00.000Z',
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.product, 'Hotel');
  assert.equal(entry.primary_reference, 'ABCD12');
  assert.equal(entry.travel_start, '2027-03-01');
  assert.equal(entry.location, 'Miami Beach');
  assert.equal(entry.intake_customer_label, 'Sample Co');
  assert.equal(entry.intake_provenance.source, 'staff_paste');
  assert.equal(entry.intake_provenance.text_extractable, true);
  assert.equal(entry.intake_party_hints.customer, 'Sample Co');
  assert.ok(Array.isArray(entry.traveler_ids));
  assert.equal(entry.traveler_ids.length, 0);
  assert.equal(draftKind({ summary: entry.summary as string }), 'booking');
  assert.ok(built.recognized_fields.includes('product'));
  assert.match(built.title, /Sample Co/);
});

test('multi-entry --- file creates one draft per booking block', () => {
  const text = `Customer: Alpha Corp
Product: Hotel
Route: Miami
Check-in: 2027-03-01
PNR: A1
Summary: First

---

Customer: Beta LLC
Product: Flight
Route: JFK-MIA
Departure: 2027-04-01
PNR: B2
Summary: Second`;
  assert.equal(splitIntakeEntries(text).length, 2);
  const drafts = buildIntakeDrafts({ source: 'staff_upload', text, filename: 'multi.txt' });
  assert.equal(drafts.length, 2);
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Alpha Corp');
  assert.equal((drafts[0].entry as any).product, 'Hotel');
  assert.equal((drafts[1].entry as any).intake_customer_label, 'Beta LLC');
  assert.equal((drafts[1].entry as any).product, 'Flight');
});

test('CSV rows become separate intake drafts', () => {
  const csv = `Product,Route,Departure,PNR,Customer,Customer Price,Summary
Hotel,Miami,2027-03-01,H1,Alpha,450.00,Row one
Flight,JFK-ATL,2027-09-01,F2,Beta,612.00,Row two`;
  const drafts = buildIntakeDrafts({
    source: 'staff_upload',
    text: csv,
    filename: 'two.csv',
  });
  assert.equal(drafts.length, 2);
  assert.equal((drafts[0].entry as any).product, 'Hotel');
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Alpha');
  assert.equal((drafts[1].entry as any).product, 'Flight');
  assert.equal((drafts[1].entry as any).intake_customer_label, 'Beta');
  assert.equal((drafts[0].entry as any).sale, '450.00');
});

test('Customer Name alias fills intake customer label', () => {
  const built = buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer Name: Jordan Guest\nProduct: Hotel\nRoute: Miami\nPNR: JG01`,
  });
  assert.equal((built.entry as any).intake_customer_label, 'Jordan Guest');
});

test('confirmation location and check-in aliases map without inventing money', () => {
  const built = buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer: Alias Guest
Product: Hotel
Location: Miami Beach
Check in: 2027-05-01
Check out: 2027-05-04
Confirmation Number: CONF99
Summary: Alias hotel stay`,
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.product, 'Hotel');
  assert.equal(entry.location, 'Miami Beach');
  assert.equal(entry.travel_start, '2027-05-01');
  assert.equal(entry.travel_end, '2027-05-04');
  assert.equal(entry.primary_reference, 'CONF99');
  assert.equal(entry.sale, undefined);
});

test('referring organization aliases are recognized without inventing money or org id', () => {
  const built = buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer: Referral Guest
Product: Flight
Trip Type: One Way
Route: JFK-MIA
Departure: 2027-06-01
PNR: REF111
Referred By: Sample Synagogue
Customer Price: 400.00
Summary: Referral sample`,
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.intake_party_hints.referring_organization, 'Sample Synagogue');
  assert.ok(built.recognized_fields.includes('referring_organization'));
  assert.equal(entry.referring_organization_id, undefined);
  assert.equal(entry.sale, '400.00');
});

test('quoted CSV commas stay inside field values', () => {
  const csv = `Product,Customer,Route,PNR,Customer Price,Summary
Hotel,"Guest, Jr.",Miami,Q1,"450.00","Stay, ocean view"
Flight,Beta,"JFK, ATL",F2,612.00,Row two`;
  const drafts = buildIntakeDrafts({
    source: 'staff_upload',
    text: csv,
    filename: 'quoted.csv',
  });
  assert.equal(drafts.length, 2);
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Guest, Jr.');
  assert.equal((drafts[0].entry as any).sale, '450.00');
  assert.match(String((drafts[0].entry as any).reservation_summary), /Stay, ocean view/);
  assert.equal((drafts[1].entry as any).route, 'JFK, ATL');
});

test('PDF bytes create provenance draft without inventing amounts', () => {
  const bytes = Buffer.from('%PDF-1.4 fake content');
  const built = buildIntakeDraft({
    source: 'staff_upload',
    filename: 'conf.pdf',
    mimeType: 'application/pdf',
    bytes,
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.product, '');
  assert.equal(entry.intake_provenance.text_extractable, false);
  assert.equal(entry.intake_provenance.filename, 'conf.pdf');
  assert.equal(entry.intake_provenance.sha256?.length, 64);
  assert.ok(String(entry.intake_provenance.extract_note).includes('PDF'));
  assert.ok(!('sale' in entry) || entry.sale === undefined || entry.sale === '');
});

test('extractIntakeText accepts utf8 text and rejects null bytes', () => {
  const ok = extractIntakeText('text/plain', Buffer.from('Product: Flight\n'), 'a.txt');
  assert.equal(ok.extractable, true);
  assert.match(ok.text, /Product: Flight/);
  const bad = extractIntakeText('text/plain', Buffer.from('a\0b'), 'x.txt');
  assert.equal(bad.extractable, false);
});

test('email intake mailboxes are limited to the two Owner-approved addresses', () => {
  assert.deepEqual([...INTAKE_EMAIL_MAILBOXES], [
    'shmuel@padovatravel.com',
    'mindy@padovatravel.com',
  ]);
  assert.equal(assertAllowedIntakeMailbox('Mindy@padovatravel.com'), 'mindy@padovatravel.com');
  assert.throws(() => assertAllowedIntakeMailbox('other@padovatravel.com'), /limited/);
  assert.throws(
    () =>
      prepareEmailIntakeDraft({
        mailbox: 'other@example.com',
        text: 'Product: Flight\nRoute: JFK-TLV',
      }),
    /limited/,
  );
  const emailDraft = prepareEmailIntakeDraft({
    mailbox: 'Shmuel@padovatravel.com',
    from_address: 'client@example.com',
    subject: 'Conf ABC',
    text: 'Product: Flight\nRoute: JFK-TLV\nPNR: ZZ11YY',
  });
  const emailEntry = emailDraft.entry as Record<string, any>;
  assert.equal(emailEntry.intake_provenance.source, 'email');
  assert.equal(emailEntry.intake_provenance.mailbox, 'shmuel@padovatravel.com');
  assert.equal(emailIntakeStatus().posts_money, false);
  assert.equal(emailIntakeStatus().polling_configured, false);
});

test('eml extract prefers text/plain and keeps Field: Value lines', () => {
  const eml = `From: desk@example.com
To: mindy@padovatravel.com
Subject: Conf
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="bound"

--bound
Content-Type: text/plain; charset=utf-8

Customer: Eml Guest
Product: Hotel
Route: Miami
PNR: EML01
--bound
Content-Type: text/html; charset=utf-8

<html><body>ignore html</body></html>
--bound--
`;
  const body = extractTextFromEml(eml);
  assert.match(body, /Customer: Eml Guest/);
  assert.match(body, /PNR: EML01/);
  const envelope = parseEmlEnvelope(eml);
  assert.equal(envelope.from_address, 'desk@example.com');
  assert.equal(envelope.subject, 'Conf');
  assert.equal(envelope.mailbox, 'mindy@padovatravel.com');
  const extracted = extractIntakeText('message/rfc822', Buffer.from(eml), 'conf.eml');
  assert.equal(extracted.extractable, true);
  const built = buildIntakeDraft({
    source: 'email',
    mailbox: 'mindy@padovatravel.com',
    text: extracted.text,
    filename: 'conf.eml',
    mimeType: 'message/rfc822',
  });
  assert.equal((built.entry as any).intake_customer_label, 'Eml Guest');
  assert.equal((built.entry as any).product, 'Hotel');
});

test('parseEmlEnvelope maps Shmuel mailbox and angle-bracket From', () => {
  const eml = `From: Hotel Desk <desk@example-hotel.com>
To: Ops <shmuel@padovatravel.com>
Subject: Fwd: Hold for review
MIME-Version: 1.0
Content-Type: text/plain

Customer: Envelope Guest
Product: Hotel
PNR: ENV01
`;
  const envelope = parseEmlEnvelope(eml);
  assert.equal(envelope.from_address, 'desk@example-hotel.com');
  assert.equal(envelope.mailbox, 'shmuel@padovatravel.com');
  assert.equal(envelope.subject, 'Fwd: Hold for review');
});

test('batch text .eml entry strips headers before Field: Value parse', () => {
  const eml = `From: a@example.com
To: mindy@padovatravel.com
MIME-Version: 1.0
Content-Type: text/plain

Customer: Batch Eml Guest
Product: Flight
Route: JFK-MIA
PNR: BEML1
`;
  const drafts = buildIntakeDrafts({
    source: 'staff_upload',
    text: eml,
    filename: 'batch.eml',
  });
  assert.equal(drafts.length, 1);
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Batch Eml Guest');
  assert.equal((drafts[0].entry as any).product, 'Flight');
  assert.equal((drafts[0].entry as any).intake_provenance.source, 'email');
  assert.equal((drafts[0].entry as any).intake_provenance.from_address, 'a@example.com');
  assert.equal((drafts[0].entry as any).intake_provenance.mailbox, 'mindy@padovatravel.com');
});

test('eml bytes-only upload fills envelope without UI prefill', () => {
  const eml = `From: reservations@example-hotel.com
To: mindy@padovatravel.com
Subject: Hotel confirmation EML01
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Customer: Eml Sample Guest
Product: Hotel
Route: Miami Beach
PNR: EML01
Customer Price: 380.00
`;
  const drafts = buildIntakeDrafts({
    source: 'staff_upload',
    text: '',
    filename: '08-reservation.eml',
    mimeType: 'message/rfc822',
    bytes: Buffer.from(eml),
  });
  assert.equal(drafts.length, 1);
  const prov = (drafts[0].entry as any).intake_provenance;
  assert.equal(prov.source, 'email');
  assert.equal(prov.from_address, 'reservations@example-hotel.com');
  assert.equal(prov.mailbox, 'mindy@padovatravel.com');
  assert.equal(prov.subject, 'Hotel confirmation EML01');
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Eml Sample Guest');
  assert.equal((drafts[0].entry as any).sale, '380.00');
});

test('intake channel labels distinguish email WhatsApp and staff', () => {
  assert.equal(intakeChannelBadge('email'), 'Email intake');
  assert.equal(intakeChannelBadge('whatsapp'), 'WhatsApp intake');
  assert.equal(intakeChannelFilterKey('staff_upload'), 'staff');
  assert.equal(intakeChannelFilterKey(null), 'manual');
  assert.match(
    formatIntakeProvenanceLine({
      source: 'email',
      mailbox: 'mindy@padovatravel.com',
      from_address: 'desk@example.com',
      subject: 'Hold',
    }),
    /Email intake · → mindy@padovatravel.com · from desk@example.com · “Hold”/,
  );
});

test('WhatsApp intake is read-only draft provenance and never claims send', () => {
  const built = prepareWhatsAppIntakeDraft({
    chat_name: 'Client chat',
    from_number: '+10000000000',
    text: 'Product: Car\nRoute: MIA airport\nNotes: WA paste test',
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.intake_provenance.source, 'whatsapp');
  assert.equal(entry.product, 'Car');
  const status = whatsappIntakeStatus();
  assert.equal(status.read_only, true);
  assert.equal(status.auto_send, false);
  assert.equal(status.meta_cloud_api, false);
  assert.equal(status.posts_money, false);
});
