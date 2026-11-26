import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeActivity,
  summarizeBookingChangeActivity,
  summarizeBookingExtraActivity,
} from '../src/lib/activity-summary';
import type { Actor } from '../src/lib/permissions';

const owner = {
  id: 'owner',
  role: 'OWNER',
  permissions: [
    'view_sale_price',
    'edit_payments',
    'view_supplier_cost',
    'manage_funding',
  ],
} as Actor;

const staffNoCost = {
  id: 'staff',
  role: 'EMPLOYEE',
  permissions: ['view_sale_price', 'edit_payments'],
} as Actor;

test('booking change summary includes dates and permission-gated fees; never invents', () => {
  const text = summarizeBookingChangeActivity({
    who: 'Minindy',
    context: ' against PDV-100',
    data: {
      travel_start: '2026-12-05',
      travel_end: '2026-12-12',
      summary: 'JFK-TLV reissue',
      fare_difference: 10000,
      supplier_change_fee: 2500,
      padova_change_fee: 5000,
      additional_customer_charge: 17500,
      reason: 'Passenger moved dates',
    },
    result: { envelope_changed: true, fees_posted: true },
    canSeeSale: true,
    canSeeCost: true,
  });
  assert.match(text, /Minindy recorded a booking change against PDV-100/);
  assert.match(text, /dates 2026-12-05→2026-12-12/);
  assert.match(text, /airline fare \$100\.00/);
  assert.match(text, /customer charge \$175\.00/);
  assert.match(text, /Reason: Passenger moved dates/);

  const feesOnly = summarizeBookingChangeActivity({
    who: 'Minindy',
    context: ' against PDV-100',
    data: {
      fare_difference: 10000,
      reason: 'Fees only',
    },
    result: { envelope_changed: false, fees_posted: true },
    canSeeSale: false,
    canSeeCost: true,
  });
  assert.match(feesOnly, /airline fare \$100\.00/);
  assert.doesNotMatch(feesOnly, /customer charge/);
  assert.match(feesOnly, /Fees only — trip details unchanged/);
});

test('booking extra summary keeps Unknown when amount omitted', () => {
  const text = summarizeBookingExtraActivity({
    who: 'Staff',
    context: ' against PDV-2',
    data: { category: 'Seat', description: 'Exit row' },
    result: { label: 'Seat · Exit row', customer_amount: null, cost_amount: null },
    canSeeSale: true,
    canSeeCost: true,
  });
  assert.match(text, /added booking extra Seat · Exit row against PDV-2/);
  assert.match(text, /customer Unknown/);
  assert.match(text, /cost Unknown/);

  const priced = summarizeBookingExtraActivity({
    who: 'Staff',
    context: '',
    data: { category: 'Bag', customer_amount: 7500, cost_amount: 4000 },
    result: { label: 'Bag', customer_amount: 7500, cost_amount: 4000 },
    canSeeSale: true,
    canSeeCost: false,
  });
  assert.match(priced, /customer \$75\.00/);
  assert.doesNotMatch(priced, /cost/);
});

test('summarizeActivity routes booking_change / booking_extra with code context', () => {
  const bookings = [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', code: 'PDV-9' }];
  const change = summarizeActivity(
    {
      kind: 'booking_change',
      actor_name: 'Owner',
      after_value: {
        input: {
          booking_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          reason: 'Date move',
          travel_start: '2026-12-01',
          travel_end: '2026-12-08',
          additional_customer_charge: 5000,
        },
        result: { envelope_changed: true, fees_posted: true },
      },
    },
    owner,
    bookings,
  );
  assert.match(change.summary, /against PDV-9/);
  assert.match(change.summary, /customer charge \$50\.00/);

  const extra = summarizeActivity(
    {
      kind: 'booking_extra',
      actor_name: 'Owner',
      after_value: {
        input: {
          booking_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          category: 'Other',
          customer_amount: 2000,
        },
        result: { label: 'Other', customer_amount: 2000, cost_amount: null },
      },
    },
    staffNoCost,
    bookings,
  );
  assert.match(extra.summary, /added booking extra Other against PDV-9/);
  assert.match(extra.summary, /customer \$20\.00/);
  assert.doesNotMatch(extra.summary, /cost/);
});
