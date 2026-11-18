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
import { looksLikeBookingRelatedEmail } from '../src/lib/email-gmail';
import { emailIntakeStatus, prepareEmailIntakeDraft } from '../src/lib/email-intake';
import {
  formatIntakeProvenanceLine,
  intakeChannelBadge,
  intakeChannelFilterKey,
} from '../src/lib/intake-channel-label';
import {
  assertInstinctAuth,
  instinctIntakeStatus,
  prepareInstinctIntakeDraft,
  readInstinctAuthHeader,
} from '../src/lib/instinct-intake';
import {
  looksLikeBookingRelatedWhatsApp,
  prepareWhatsAppIntakeDraft,
  whatsappIntakeStatus,
} from '../src/lib/whatsapp-intake';

test('plain text Field: Value builds a booking-shaped draft without posting signals', async () => {
  const built = await buildIntakeDraft({
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

test('multi-entry --- file creates one draft per booking block', async () => {
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
  const drafts = await buildIntakeDrafts({ source: 'staff_upload', text, filename: 'multi.txt' });
  assert.equal(drafts.length, 2);
  assert.equal((drafts[0].entry as any).intake_customer_label, 'Alpha Corp');
  assert.equal((drafts[0].entry as any).product, 'Hotel');
  assert.equal((drafts[1].entry as any).intake_customer_label, 'Beta LLC');
  assert.equal((drafts[1].entry as any).product, 'Flight');
});

test('CSV rows become separate intake drafts', async () => {
  const csv = `Product,Route,Departure,PNR,Customer,Customer Price,Summary
Hotel,Miami,2027-03-01,H1,Alpha,450.00,Row one
Flight,JFK-ATL,2027-09-01,F2,Beta,612.00,Row two`;
  const drafts = await buildIntakeDrafts({
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

test('Customer Name alias fills intake customer label', async () => {
  const built = await buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer Name: Jordan Guest\nProduct: Hotel\nRoute: Miami\nPNR: JG01`,
  });
  assert.equal((built.entry as any).intake_customer_label, 'Jordan Guest');
});

test('confirmation location and check-in aliases map without inventing money', async () => {
  const built = await buildIntakeDraft({
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

test('referring organization aliases are recognized without inventing money or org id', async () => {
  const built = await buildIntakeDraft({
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

test('quoted CSV commas stay inside field values', async () => {
  const csv = `Product,Customer,Route,PNR,Customer Price,Summary
Hotel,"Guest, Jr.",Miami,Q1,"450.00","Stay, ocean view"
Flight,Beta,"JFK, ATL",F2,612.00,Row two`;
  const drafts = await buildIntakeDrafts({
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

test('unread PDF bytes do not create a silent empty draft', async () => {
  const bytes = Buffer.from('%PDF-1.4 fake content');
  await assert.rejects(
    () =>
      buildIntakeDraft({
        source: 'staff_upload',
        filename: 'conf.pdf',
        mimeType: 'application/pdf',
        bytes,
      }),
    /couldn't read this file/i,
  );
  const extracted = await extractIntakeText(
    'application/pdf',
    bytes,
    'conf.pdf',
  );
  assert.equal(extracted.extractable, false);
  assert.match(String(extracted.note), /couldn't read this file/i);
});

test('booking reference number and Price $ map; Guest is traveler not customer', async () => {
  const built = await buildIntakeDraft({
    source: 'staff_paste',
    text: `Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`,
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.product, 'Hotel');
  assert.equal(entry.location, 'Miami');
  assert.equal(entry.primary_reference, '123456003');
  assert.equal(entry.sale, '200');
  assert.equal(entry.intake_customer_label, 'QA Alex Morgan');
  assert.equal(entry.intake_traveler_label, 'Minindy Quirona');
  assert.equal(entry.intake_party_hints.traveler, 'Minindy Quirona');
  assert.equal(entry.intake_party_hints.customer, 'QA Alex Morgan');
});

test('extractIntakeText accepts utf8 text and rejects null bytes', async () => {
  const ok = await extractIntakeText('text/plain', Buffer.from('Product: Flight\n'), 'a.txt');
  assert.equal(ok.extractable, true);
  assert.match(ok.text, /Product: Flight/);
  const bad = await extractIntakeText('text/plain', Buffer.from('a\0b'), 'x.txt');
  assert.equal(bad.extractable, false);
});

test('email intake mailboxes are limited to the Owner-approved addresses', async () => {
  assert.deepEqual([...INTAKE_EMAIL_MAILBOXES], [
    'shmuel@padovatravel.com',
    'mindy@padovatravel.com',
    'bookings@padovatravel.com',
  ]);
  assert.equal(assertAllowedIntakeMailbox('Mindy@padovatravel.com'), 'mindy@padovatravel.com');
  assert.equal(
    assertAllowedIntakeMailbox('bookings@padovatravels.com'),
    'bookings@padovatravel.com',
  );
  assert.throws(() => assertAllowedIntakeMailbox('other@padovatravel.com'), /limited/);
  await assert.rejects(
    () =>
      prepareEmailIntakeDraft({
        mailbox: 'other@example.com',
        text: 'Product: Flight\nRoute: JFK-TLV',
      }),
    /limited/,
  );
  const emailDraft = await prepareEmailIntakeDraft({
    mailbox: 'Shmuel@padovatravel.com',
    from_address: 'client@example.com',
    subject: 'Conf ABC',
    text: 'Product: Flight\nRoute: JFK-TLV\nPNR: ZZ11YY',
  });
  const emailEntry = emailDraft.entry as Record<string, any>;
  assert.equal(emailEntry.intake_provenance.source, 'email');
  assert.equal(emailEntry.intake_provenance.mailbox, 'shmuel@padovatravel.com');
  assert.equal(emailIntakeStatus().posts_money, false);
  assert.equal(emailIntakeStatus().draft_only, true);
  // Isolate status checks from ambient shell/.env tokens left over from local OAuth setup.
  const prevTokens = {
    shmuel: process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL,
    mindy: process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY,
    bookings: process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS,
    shared: process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN,
    testMb: process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX,
    clientId: process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID,
    clientSecret: process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET,
  };
  delete process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL;
  delete process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY;
  delete process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS;
  delete process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN;
  delete process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX;
  delete process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID;
  delete process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET;
  assert.equal(emailIntakeStatus().polling_configured, false);
  assert.equal(emailIntakeStatus().mailbox_tokens['shmuel@padovatravel.com'], false);
  assert.equal(emailIntakeStatus().mailbox_tokens['bookings@padovatravel.com'], false);
  assert.equal(emailIntakeStatus().test_mailbox, null);
  if (prevTokens.shmuel) process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL = prevTokens.shmuel;
  if (prevTokens.mindy) process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY = prevTokens.mindy;
  if (prevTokens.bookings)
    process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS = prevTokens.bookings;
  if (prevTokens.shared) process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN = prevTokens.shared;
  if (prevTokens.testMb) process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX = prevTokens.testMb;
  if (prevTokens.clientId) process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID = prevTokens.clientId;
  if (prevTokens.clientSecret)
    process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET = prevTokens.clientSecret;
  assert.ok(
    looksLikeBookingRelatedEmail({
      subject: 'Your hotel confirmation 910637',
      text:
        'Check-in: 2026-12-01\nGuest Name: Abraham\nProperty: Test Inn Miami Beach\nReservation confirmed for your stay.',
      from_address: 'reservations@marriott.com',
    }),
  );
  assert.ok(
    looksLikeBookingRelatedEmail({
      subject: 'Confirmed: Your Trip',
      text:
        'American Express Travel reservation. Trip ID 12345. Hotel confirmation and flight itinerary attached for the guest.',
      from_address: 'noreply@americanexpress.com',
    }),
  );
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: 'Weekly newsletter',
      text: 'Unsubscribe here for deals and lunch tips this week',
      from_address: 'marketing@example.com',
    }),
    false,
  );
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: "It's Time To Check In For Your Flight",
      text:
        'Online check-in is now open for your Delta flight. Download your boarding pass when ready.',
      from_address: 'DeltaAirLines@t.delta.com',
    }),
    false,
  );
  assert.ok(
    looksLikeBookingRelatedEmail({
      subject: 'Fwd: Thanks for your purchase, reference 88MRHN',
      text: 'Thanks for your purchase. Reference 88MRHN. Your order details are below.',
      from_address: 'desk@padovatravel.com',
    }),
  );
  assert.ok(
    looksLikeBookingRelatedEmail({
      subject: 'Fw: Kona Village, A Rosewood Resort — direct booking enquiry',
      text: 'Guest asked about dates for a direct booking enquiry at the resort.',
      from_address: 'sales@example.com',
    }),
  );
  await assert.rejects(
    () =>
      prepareEmailIntakeDraft({
        mailbox: 'mindy@padovatravel.com',
        subject: 'Team lunch',
        text: 'Hi team, lunch tomorrow at noon?',
      }),
    /does not look like a booking/,
  );
});

test('loose hotel enquiry / purchase subjects fill draft card fields without inventing sale', async () => {
  const { intakeDraftHasMinimumShape } = await import('../src/lib/intake-email-hints');
  const hotel = await prepareEmailIntakeDraft({
    mailbox: 'bookings@padovatravel.com',
    subject: 'Fw: W Aspen — direct booking enquiry',
    from_address: 'Chris.Sanchez@whotels.com',
    text:
      'Following up on the direct booking enquiry for W Aspen. Guest Name: Sam Guest\nCheck-in: March 12, 2027\nCheck-out: March 15, 2027',
  });
  const hotelEntry = hotel.entry as Record<string, any>;
  assert.equal(hotelEntry.product, 'Hotel');
  assert.equal(hotelEntry.route, 'W Aspen');
  assert.equal(hotelEntry.location, 'W Aspen');
  assert.equal(hotelEntry.intake_provider_label, 'W Aspen');
  assert.equal(hotelEntry.intake_customer_label, 'Sam Guest');
  assert.equal(hotelEntry.travel_start, '2027-03-12');
  assert.equal(hotelEntry.travel_end, '2027-03-15');
  assert.equal(hotelEntry.sale, undefined);
  assert.equal(intakeDraftHasMinimumShape({ entry: hotelEntry, recognized_fields: hotel.recognized_fields }), true);

  const purchase = await prepareEmailIntakeDraft({
    mailbox: 'bookings@padovatravel.com',
    subject: 'Fwd: Thanks for your purchase, reference 88MRHN',
    from_address: 'shpadawer@gmail.com',
    text: 'Thanks for your purchase. Reference 88MRHN. Details below.',
  });
  const purchaseEntry = purchase.entry as Record<string, any>;
  assert.equal(purchaseEntry.primary_reference, '88MRHN');
  assert.equal(purchaseEntry.sale, undefined);
  assert.equal(
    intakeDraftHasMinimumShape({
      entry: purchaseEntry,
      recognized_fields: purchase.recognized_fields,
    }),
    true,
  );

  const capitalOne = await prepareEmailIntakeDraft({
    mailbox: 'bookings@padovatravel.com',
    subject: 'Rachel, you have a new inquiry',
    from_address: 'capitalone@notification.capitalone.com',
    text: 'Rachel, you have a new inquiry on Capital One Travel. Please review the request.',
  });
  const capitalEntry = capitalOne.entry as Record<string, any>;
  assert.equal(capitalEntry.intake_customer_label, 'Rachel');
  assert.equal(capitalEntry.sale, undefined);

  assert.equal(
    intakeDraftHasMinimumShape({
      entry: { product: '', route: '', primary_reference: '', intake_customer_label: '' },
      recognized_fields: [],
    }),
    false,
  );
});

test('eml extract prefers text/plain and keeps Field: Value lines', async () => {
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
  const extracted = await extractIntakeText('message/rfc822', Buffer.from(eml), 'conf.eml');
  assert.equal(extracted.extractable, true);
  const built = await buildIntakeDraft({
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

test('batch text .eml entry strips headers before Field: Value parse', async () => {
  const eml = `From: a@example.com
To: mindy@padovatravel.com
MIME-Version: 1.0
Content-Type: text/plain

Customer: Batch Eml Guest
Product: Flight
Route: JFK-MIA
PNR: BEML1
`;
  const drafts = await buildIntakeDrafts({
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

test('eml bytes-only upload fills envelope without UI prefill', async () => {
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
  const drafts = await buildIntakeDrafts({
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

test('WhatsApp intake is read-only draft provenance and never claims send', async () => {
  const built = await prepareWhatsAppIntakeDraft({
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
  assert.equal(looksLikeBookingRelatedWhatsApp('hi'), false);
  assert.equal(looksLikeBookingRelatedWhatsApp('ok thanks'), false);
  assert.equal(looksLikeBookingRelatedWhatsApp('Smoke Guest,'), false);
  assert.equal(looksLikeBookingRelatedWhatsApp('I need a hotel please'), false);
  assert.equal(looksLikeBookingRelatedWhatsApp('can you book something'), false);
  assert.ok(looksLikeBookingRelatedWhatsApp('Product: Hotel\nCustomer: Test Guest'));
  assert.ok(
    looksLikeBookingRelatedWhatsApp(
      'Your hotel confirmation 910637\nCheck-in: 2026-12-01\nGuest Name: Abraham\nProperty: Test Inn Miami Beach',
    ),
  );
  await assert.rejects(
    () =>
      prepareWhatsAppIntakeDraft({
        chat_name: 'wa:123',
        text: 'hi hotel please',
      }),
    /does not look like a booking/,
  );
  const fromPdfBytes = await prepareWhatsAppIntakeDraft({
    chat_name: 'Client PDF',
    from_number: '+10000000001',
    text: '',
    bytes: Buffer.from(
      'Product: Hotel\nCustomer: PDF Guest\nConfirmation: WA-PDF-01\nCheck-in: 2026-12-10\n',
      'utf8',
    ),
    filename: 'reservation-note.txt',
    mimeType: 'text/plain',
  });
  assert.equal((fromPdfBytes.entry as any).intake_provenance.source, 'whatsapp');
  assert.match(String((fromPdfBytes.entry as any).intake_customer_label || ''), /PDF Guest/);
});

test('Instinct intake is draft-only provenance and rejects bad auth', async () => {
  assert.equal(intakeChannelBadge('instinct'), 'Instinct intake');
  assert.equal(intakeChannelFilterKey('instinct'), 'instinct');
  const built = await prepareInstinctIntakeDraft({
    chat_name: 'Owner ↔ Instinct',
    text: 'Product: Hotel\nProperty: Instinct Test Inn\nNotes: agent draft',
    title: 'Instinct draft title',
  });
  const entry = built.entry as Record<string, any>;
  assert.equal(entry.intake_provenance.source, 'instinct');
  assert.equal(entry.product, 'Hotel');
  assert.equal(built.title, 'Instinct draft title');
  const prev = process.env.PADOVA_INSTINCT_TOKEN;
  process.env.PADOVA_INSTINCT_TOKEN = 'test-instinct-token';
  try {
    assertInstinctAuth('test-instinct-token');
    assert.throws(() => assertInstinctAuth('wrong'), /rejected/);
    const status = instinctIntakeStatus();
    assert.equal(status.draft_only, true);
    assert.equal(status.posts_money, false);
    assert.equal(status.live_booking, false);
    assert.equal(
      readInstinctAuthHeader(
        new Request('http://local/test', {
          headers: { Authorization: 'Bearer test-instinct-token' },
        }),
      ),
      'test-instinct-token',
    );
    assert.equal(
      readInstinctAuthHeader(
        new Request('http://local/test', {
          headers: { 'x-padova-instinct': 'header-token' },
        }),
      ),
      'header-token',
    );
  } finally {
    if (prev === undefined) delete process.env.PADOVA_INSTINCT_TOKEN;
    else process.env.PADOVA_INSTINCT_TOKEN = prev;
  }
});
