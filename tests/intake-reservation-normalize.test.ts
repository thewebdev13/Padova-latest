import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  isReservationProse,
  normalizeReservationProseToPaste,
} from '../src/lib/intake-reservation-normalize';
import { parseQuickPaste } from '../src/lib/quick-paste';
import { buildIntakeMappingPreview } from '../src/lib/intake-preview';
import { extractBinaryIntakeText } from '../src/lib/intake-file-text';

const fixtureText = readFileSync(
  new URL('../testdata/intake-samples/gmail-bangkok-flight-details.txt', import.meta.url),
  'utf8',
);

test('Capital One Bangkok confirmation maps primary traveler as customer (not cardholder)', () => {
  assert.equal(isReservationProse(fixtureText), true);
  const paste = parseQuickPaste(fixtureText);
  assert.equal(paste.fields.product, 'Flight');
  assert.equal(paste.fields.airline, 'Thai Airways');
  assert.equal(paste.fields.flight_numbers, 'TG617');
  assert.equal(paste.fields.route, 'MNL-BKK');
  assert.equal(paste.fields.travel_start, '2026-11-17');
  assert.equal(paste.fields.trip_type, 'One Way');
  assert.equal(paste.fields.cabin, 'Economy');
  assert.equal(paste.fields.primary_reference, 'AKF8D9');
  assert.equal(paste.fields.booking_source_confirmation, 'H-QTYIQS');
  assert.equal(paste.fields.customer, 'Jonathan Martin Machado');
  assert.match(String(paste.fields.traveler), /Jonathan Martin Machado/i);
  assert.match(String(paste.fields.traveler), /Minindy Bernabe Quirona/i);
  assert.equal(paste.fields.sale, '407.20');
  assert.equal(paste.fields.method, 'Capital One Business Travel');
  // Agency Capital One card imprint must not become Customer.
  assert.notEqual(String(paste.fields.customer || '').toLowerCase(), 'shmuel padawer');
  const preview = buildIntakeMappingPreview(fixtureText);
  assert.equal(preview.unread, false);
  assert.ok(preview.found >= 6);
  assert.equal(preview.rows.find((r) => r.id === 'customer')?.status, 'found');
});

test('structured Field:Value paste is left unchanged', () => {
  const raw = `Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`;
  assert.equal(isReservationProse(raw), false);
  assert.equal(normalizeReservationProseToPaste(raw), raw);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.customer, 'QA Alex Morgan');
  assert.equal(paste.fields.sale, '200');
});

test('client Gmail Bangkok PDF extracts and maps like the text fixture', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/gmail-bangkok-flight-details.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'gmail-bangkok-flight-details.pdf',
  );
  assert.equal(extracted.extractable, true);
  assert.equal(extracted.method, 'pdf-text');
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.airline, 'Thai Airways');
  assert.equal(paste.fields.primary_reference, 'AKF8D9');
  assert.match(String(paste.fields.traveler || ''), /Jonathan Martin Machado/i);
  assert.equal(paste.fields.customer, 'Jonathan Martin Machado');
});

test('GDS Travel Reservation (Josh Gluck / El Al) maps PNR, route, three travelers', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/travel-reservation-josh-gluck.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Flight');
  assert.match(String(paste.fields.airline), /EL AL/i);
  assert.equal(paste.fields.flight_numbers, 'LY2');
  assert.equal(paste.fields.route, 'JFK-TLV');
  assert.equal(paste.fields.travel_start, '2026-12-14');
  assert.equal(paste.fields.trip_type, 'One Way');
  assert.equal(paste.fields.cabin, 'Economy');
  assert.equal(paste.fields.primary_reference, 'CVTA5Y');
  assert.equal(paste.fields.booking_source_confirmation, 'ITBPRM');
  assert.equal(paste.fields.customer, 'Josh Gluck');
  assert.equal(
    paste.fields.traveler,
    'Josh Gluck, Michelle Eisikovic, Frida Gluck',
  );
  assert.match(String(paste.fields.ticket_numbers), /1147449565267/);
  assert.match(String(paste.fields.ticket_numbers), /1147572668516/);
  assert.equal(paste.fields.sale, undefined);
});

test('client Josh Gluck Travel Reservation PDF extracts and maps', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/travel-reservation-josh-gluck.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'travel-reservation-josh-gluck.pdf',
  );
  assert.equal(extracted.extractable, true);
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.primary_reference, 'CVTA5Y');
  assert.equal(paste.fields.route, 'JFK-TLV');
  assert.equal(paste.fields.traveler, 'Josh Gluck, Michelle Eisikovic, Frida Gluck');
});

test('United Airlines Gmail confirmation PQNGJN maps round-trip fields', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/united-booking-pqngjn.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Flight');
  assert.equal(paste.fields.airline, 'United Airlines');
  assert.equal(paste.fields.flight_numbers, 'UA84, UA91');
  assert.equal(paste.fields.route, 'EWR-TLV');
  assert.equal(paste.fields.travel_start, '2026-11-18');
  assert.equal(paste.fields.travel_end, '2026-11-23');
  assert.equal(paste.fields.trip_type, 'Round Trip');
  assert.equal(paste.fields.cabin, 'Economy');
  assert.equal(paste.fields.primary_reference, 'PQNGJN');
  assert.equal(paste.fields.customer, 'Shoshana Schechter');
  assert.equal(paste.fields.traveler, 'Shoshana Schechter');
  assert.equal(paste.fields.sale, '1419.36');
});

test('Amex Travel Confirmed trip to New York maps Delta round-trip', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/confirmed-trip-new-york.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Flight');
  assert.match(String(paste.fields.airline), /Delta/i);
  assert.equal(paste.fields.flight_numbers, 'DL249, DL234');
  assert.equal(paste.fields.route, 'TLV-JFK');
  assert.equal(paste.fields.travel_start, '2027-01-07');
  assert.equal(paste.fields.travel_end, '2027-01-17');
  assert.equal(paste.fields.trip_type, 'Round Trip');
  assert.equal(paste.fields.cabin, 'Economy');
  assert.equal(paste.fields.primary_reference, 'GM6OLU');
  assert.equal(paste.fields.booking_source_confirmation, 'ZO-AX1092-67178');
  assert.equal(paste.fields.customer, 'Annaminh Mansour');
  assert.equal(
    paste.fields.traveler,
    'Shmuel Padawer, Nechama Thav, Tzipora Padawer, Sara R Padawer',
  );
  assert.match(String(paste.fields.ticket_numbers), /0067565451179/);
  assert.equal(paste.fields.sale, '3634.50');
  assert.equal(paste.fields.method, 'American Express Travel');
});

test('Amex Travel hotel Sunny Isles maps guest as customer (not agency card)', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/confirmed-trip-sunny-isles-beach.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Hotel');
  assert.match(String(paste.fields.property), /Acqualina Resort/i);
  assert.equal(paste.fields.route, 'Sunny Isles Beach');
  assert.equal(paste.fields.travel_start, '2026-11-17');
  assert.equal(paste.fields.travel_end, '2026-11-18');
  assert.equal(paste.fields.primary_reference, '9106373710690');
  assert.equal(paste.fields.booking_source_confirmation, 'ZO-AX1099-80493');
  assert.equal(paste.fields.customer, 'Abraham Stefansky');
  assert.equal(paste.fields.traveler, 'Abraham Stefansky');
  assert.match(String(paste.fields.room_type || ''), /Intracoastal/i);
  assert.equal(paste.fields.sale, '960.50');
  assert.equal(paste.fields.method, 'American Express Travel');
  // Agency Amex imprint and trip fragment must not become Customer / flight.
  assert.notEqual(String(paste.fields.customer || '').toLowerCase(), 'shmuel padawer');
  assert.equal(paste.fields.flight_numbers, undefined);
  assert.equal(paste.fields.ticket_numbers, undefined);
  const preview = buildIntakeMappingPreview(raw);
  assert.equal(preview.rows.find((r) => r.id === 'customer')?.status, 'found');
});

test('client Amex Sunny Isles Beach hotel PDF extracts and maps', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/confirmed-trip-sunny-isles-beach.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'confirmed-trip-sunny-isles-beach.pdf',
  );
  assert.equal(extracted.extractable, true);
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.product, 'Hotel');
  assert.equal(paste.fields.customer, 'Abraham Stefansky');
  assert.equal(paste.fields.primary_reference, '9106373710690');
  assert.match(String(paste.fields.property || ''), /Acqualina/i);
  assert.equal(paste.fields.sale, '960.50');
});

test('Expedia TAAP Hilton Buffalo hotel maps guest, stay, itinerary, total', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/taap-hilton-buffalo-airport.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Hotel');
  assert.match(String(paste.fields.property), /Hilton Garden Inn Buffalo Airport/i);
  assert.match(String(paste.fields.route || paste.fields.location || ''), /Buffalo/i);
  assert.equal(paste.fields.travel_start, '2026-01-30');
  assert.equal(paste.fields.travel_end, '2026-01-31');
  assert.equal(paste.fields.primary_reference, '73360715600284');
  assert.equal(paste.fields.customer, 'Enmanuel Nunez');
  assert.equal(paste.fields.traveler, 'Enmanuel Nunez');
  assert.match(String(paste.fields.room_type || ''), /King/i);
  assert.equal(paste.fields.sale, '171.75');
  assert.equal(paste.fields.method, 'Expedia TAAP');
  assert.equal(paste.fields.flight_numbers, undefined);
});

test('client Expedia TAAP Buffalo hotel PDF extracts and maps', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/taap-hilton-buffalo-airport.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'taap-hilton-buffalo-airport.pdf',
  );
  assert.equal(extracted.extractable, true);
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.product, 'Hotel');
  assert.equal(paste.fields.customer, 'Enmanuel Nunez');
  assert.equal(paste.fields.primary_reference, '73360715600284');
  assert.match(String(paste.fields.property || ''), /Hilton Garden Inn/i);
  assert.equal(paste.fields.sale, '171.75');
  assert.equal(paste.fields.method, 'Expedia TAAP');
});

test('Marriott St. Regis Rome maps stay without inventing EUR as USD', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/st-regis-rome-71983299.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Hotel');
  assert.match(String(paste.fields.property), /St\.\s*Regis Rome/i);
  assert.match(String(paste.fields.route || ''), /Rome/i);
  assert.equal(paste.fields.travel_start, '2026-07-05');
  assert.equal(paste.fields.travel_end, '2026-07-07');
  assert.equal(paste.fields.primary_reference, '71983299');
  assert.equal(paste.fields.customer, 'Martin Mittelman');
  assert.match(String(paste.fields.traveler), /Martin Mittelman/);
  assert.match(String(paste.fields.traveler), /Zachary Klein/);
  assert.match(String(paste.fields.room_type || ''), /King Bed.*Superior/i);
  assert.equal(paste.fields.method, 'Marriott');
  // EUR total must not become USD sale.
  assert.equal(paste.fields.sale, undefined);
  assert.match(String(paste.fields.notes || ''), /2,?130\.00 EUR/i);
  assert.match(String(paste.fields.notes || ''), /commissionable/i);
  assert.equal(paste.fields.flight_numbers, undefined);
});

test('client Marriott St. Regis Rome PDF extracts and maps', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/st-regis-rome-71983299.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'st-regis-rome-71983299.pdf',
  );
  assert.equal(extracted.extractable, true);
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.product, 'Hotel');
  assert.equal(paste.fields.customer, 'Martin Mittelman');
  assert.equal(paste.fields.primary_reference, '71983299');
  assert.match(String(paste.fields.property || ''), /St\.\s*Regis/i);
  assert.equal(paste.fields.sale, undefined);
});

test('Chase Travel Reservation Center maps flight without forward From as customer', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/trc-trip-1009839282.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Flight');
  assert.equal(paste.fields.airline, 'United Airlines');
  assert.equal(paste.fields.flight_numbers, 'UA2692');
  assert.equal(paste.fields.route, 'EWR-LAX');
  assert.equal(paste.fields.travel_start, '2026-04-16');
  assert.equal(paste.fields.trip_type, 'One Way');
  assert.equal(paste.fields.primary_reference, 'MKR22M');
  assert.equal(paste.fields.booking_source_confirmation, '1009839282');
  assert.equal(paste.fields.customer, 'Raizy Friedman');
  assert.match(String(paste.fields.traveler), /Hinda Stefansky/i);
  assert.ok(!/Abraham Friedman/i.test(String(paste.fields.customer || '')));
  assert.equal(paste.fields.sale, '1338.49');
  assert.equal(paste.fields.method, 'Chase Travel');
  assert.match(String(paste.fields.cabin || ''), /Business/i);
  assert.match(String(paste.fields.notes || ''), /66,?925/);
});

test('client Chase Travel TRC PDF extracts and maps', async () => {
  const buf = readFileSync(
    new URL('../testdata/intake-samples/trc-trip-1009839282.pdf', import.meta.url),
  );
  const extracted = await extractBinaryIntakeText(
    'application/pdf',
    buf,
    'trc-trip-1009839282.pdf',
  );
  assert.equal(extracted.extractable, true);
  const paste = parseQuickPaste(extracted.text);
  assert.equal(paste.fields.product, 'Flight');
  assert.equal(paste.fields.customer, 'Raizy Friedman');
  assert.equal(paste.fields.primary_reference, 'MKR22M');
  assert.equal(paste.fields.route, 'EWR-LAX');
  assert.equal(paste.fields.sale, '1338.49');
});

test('Etihad extras EMD receipt maps passenger PNR route without inventing flight sale', () => {
  const raw = readFileSync(
    new URL('../testdata/intake-samples/etihad-extras-nechama.txt', import.meta.url),
    'utf8',
  );
  assert.equal(isReservationProse(raw), true);
  const paste = parseQuickPaste(raw);
  assert.equal(paste.fields.product, 'Flight');
  assert.equal(paste.fields.airline, 'Etihad Airways');
  assert.equal(paste.fields.primary_reference, '88MRHN');
  assert.equal(paste.fields.route, 'TLV-AUH');
  assert.match(String(paste.fields.traveler || ''), /Nechama Rivka Thav/i);
  assert.equal(paste.fields.sale, undefined);
  assert.match(String(paste.fields.notes || ''), /extras|EMD|seat/i);
});
