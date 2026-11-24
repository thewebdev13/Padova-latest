import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIntakeCapture } from '../src/lib/intake-confidence';
import {
  looksLikeBookingRelatedEmail,
  looksLikeBookingRelatedWhatsApp,
  isScheduleChangeNotice,
  intakeReservationBlockReason,
} from '../src/lib/booking-message-detect';
import { parseQuickPaste } from '../src/lib/quick-paste';

/** Phase 5 accuracy pack — golden gates (no live DB, no invented money). */

const FLIGHT_PASTE = `Customer: Yitz Gross
Traveler: Yitz Gross
Product: Flight
Trip Type: Round Trip
Airline: El Al
Route: TLV-LHR-TLV
Departure: 2027-03-10
Return: 2027-03-20
PNR: AB12CD
Customer Price: Unknown
Seller Cost: Unknown`;

const HOTEL_WA = `Hotel confirmation Marriott Tel Aviv
Guest: Sara Cohen
Check-in: 2027-05-01
Check-out: 2027-05-04
Confirmation: HTL99881
Rate: TBD — please advise`;

test('flight Field:Value → high confidence; sale stays Unknown not zero', () => {
  const preview = parseQuickPaste(FLIGHT_PASTE);
  assert.equal(preview.fields.sale, undefined);
  assert.equal(preview.fields.seller_cost, undefined);
  const capture = assessIntakeCapture({
    entry: {
      product: 'Flight',
      travel_start: '2027-03-10',
      travel_end: '2027-03-20',
      route: 'TLV-LHR-TLV',
      intake_traveler_label: 'Yitz Gross',
      intake_customer_label: 'Yitz Gross',
      ai_created: true,
      intake_provenance: { ai: { used: true } },
    },
    recognized_fields: Object.keys(preview.fields),
  });
  assert.equal(capture.confidence, 'high');
  assert.ok(capture.tags.includes('ai_generated'));
});

test('marketing email skipped; reservation email kept', () => {
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: '20% off your next trip!',
      text: 'Unsubscribe here. Flash sale weekend.',
    }),
    false,
  );
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: 'Your El Al e-ticket confirmation AB12CD',
      text: 'Passenger Yitz Gross TLV-LHR 10 Mar',
    }),
    true,
  );
});

test('Capital One flight-change notice is not a new booking', () => {
  const change = `Your flight details have changed
Here are your Capital One Business Travel and airline confirmation details.
TLV-BRU SN3294 updated departure time.`;
  assert.equal(isScheduleChangeNotice(change), true);
  assert.equal(looksLikeBookingRelatedWhatsApp(change), false);
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: 'Your flight details have changed',
      text: change,
      from_address: 'noreply@capitalone.com',
    }),
    false,
  );
  assert.match(String(intakeReservationBlockReason(change)), /change notice/i);
});

test('real purchase confirmation still passes booking gate', () => {
  const purchase = `Thanks for your purchase
Capital One Travel itinerary confirmation
Passenger: Ada Lovelace
Route: TLV-JFK
PNR: AB12CD
Ticket issued`;
  assert.equal(isScheduleChangeNotice(purchase), false);
  assert.equal(looksLikeBookingRelatedWhatsApp(purchase), true);
  assert.equal(intakeReservationBlockReason(purchase), null);
});

test('whatsapp hotel confirmation looks booking-related; chatter does not', () => {
  assert.equal(looksLikeBookingRelatedWhatsApp(HOTEL_WA), true);
  assert.equal(looksLikeBookingRelatedWhatsApp('ok thanks see you tomorrow'), false);
});

test('Padova reminder digests never look like bookings', () => {
  const digest = `Padova reminders — 2026-11-20
55 open items (DB facts only):
• [MISSING INFO] Flight EWR-MIA — needs traveler
• [MISSING INFO] Hotel HKG-SFO — needs location
Open Padova to fix. This alert is automated from your PC helper.`;
  assert.equal(looksLikeBookingRelatedWhatsApp(digest), false);
  assert.equal(
    looksLikeBookingRelatedEmail({
      subject: 'Padova intake alert',
      text: digest,
    }),
    false,
  );
});

test('missing travel dates → low confidence + owner alert flag', () => {
  const capture = assessIntakeCapture({
    entry: {
      product: 'Hotel',
      intake_traveler_label: 'Sara Cohen',
      travel_start: '',
    },
  });
  assert.equal(capture.confidence, 'low');
  assert.equal(capture.needs_owner_alert, true);
  assert.ok(capture.missing.includes('travel_start'));
});
