import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOTEL_PAID_BY_OPTIONS,
  hotelPaidByDefaultPaymentType,
  hotelPaidByHint,
  hotelPaidBySetsPadovaOwedZero,
  isHotelPaidBy,
} from '../src/lib/hotel-paid-by';
import { operationalEntry } from '../src/lib/booking-entry';

test('Plan hotel paid-by has four ways', () => {
  assert.deepEqual([...HOTEL_PAID_BY_OPTIONS], [
    'Padova card',
    'Customer card (Padova prepays)',
    'Customer pays at checkout',
    'Split',
  ]);
});

test('customer-pay paths set Padova room owed to $0; Padova card does not', () => {
  assert.equal(hotelPaidBySetsPadovaOwedZero('Customer pays at checkout'), true);
  assert.equal(hotelPaidBySetsPadovaOwedZero('Customer card (Padova prepays)'), true);
  assert.equal(hotelPaidBySetsPadovaOwedZero('Padova card'), false);
  assert.equal(hotelPaidBySetsPadovaOwedZero('Split'), false);
  assert.equal(hotelPaidBySetsPadovaOwedZero(''), false);
});

test('payment type nudge matches path', () => {
  assert.equal(hotelPaidByDefaultPaymentType('Padova card'), 'Padova payment');
  assert.equal(hotelPaidByDefaultPaymentType('Customer card (Padova prepays)'), 'Customer card');
  assert.equal(hotelPaidByDefaultPaymentType('Customer pays at checkout'), 'Customer card');
  assert.equal(hotelPaidByDefaultPaymentType('Split'), null);
});

test('hints never invent amounts; checkout says owed $0', () => {
  assert.match(hotelPaidByHint('Customer pays at checkout'), /owed \$0/i);
  assert.match(hotelPaidByHint('Customer card (Padova prepays)'), /commission only/i);
  assert.match(hotelPaidByHint('Split'), /do not invent/i);
  assert.ok(isHotelPaidBy('Padova card'));
  assert.equal(isHotelPaidBy('Other'), false);
});

test('operationalEntry accepts hotel_paid_by on Hotel with commission', () => {
  const parsed = operationalEntry.parse({
    version: 1,
    how_booked: 'Hotel with commission',
    hotel_paid_by: 'Customer pays at checkout',
    references: [],
    new_travelers: [],
    notes: '',
    sale_known: true,
    components: [],
    additional_charge: 0,
  });
  assert.equal(parsed.hotel_paid_by, 'Customer pays at checkout');
});
