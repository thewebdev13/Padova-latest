import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActiveReservationStatus,
  isCompletedReservationStatus,
  reservationStatusForForm,
  reservationStatusLabel,
  toStoredReservationStatus,
} from '../src/lib/booking-status';

test('Plan labels: Booked→Active, Traveled→Completed', () => {
  assert.equal(reservationStatusLabel('Booked'), 'Active');
  assert.equal(reservationStatusLabel('Traveled'), 'Completed');
  assert.equal(reservationStatusLabel('Held'), 'Held');
  assert.equal(reservationStatusLabel('Cancelled'), 'Cancelled');
  assert.equal(reservationStatusLabel('Refund Pending'), 'Refund Pending');
  assert.equal(reservationStatusLabel(''), '');
});

test('form ↔ store round-trip; never invent status', () => {
  assert.equal(reservationStatusForForm('Booked'), 'Active');
  assert.equal(reservationStatusForForm('Traveled'), 'Completed');
  assert.equal(toStoredReservationStatus('Active'), 'Booked');
  assert.equal(toStoredReservationStatus('Completed'), 'Traveled');
  assert.equal(toStoredReservationStatus('Booked'), 'Booked');
  assert.equal(toStoredReservationStatus('Held'), 'Held');
  assert.equal(toStoredReservationStatus('bogus'), null);
  assert.equal(toStoredReservationStatus(''), null);
});

test('active / completed helpers accept Plan aliases', () => {
  assert.equal(isActiveReservationStatus('Booked'), true);
  assert.equal(isActiveReservationStatus('Active'), true);
  assert.equal(isActiveReservationStatus('Traveled'), false);
  assert.equal(isCompletedReservationStatus('Traveled'), true);
  assert.equal(isCompletedReservationStatus('Completed'), true);
  assert.equal(isCompletedReservationStatus('Booked'), false);
});
