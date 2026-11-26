import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import { operationalEntry } from '../src/lib/booking-entry';
import {
  FHR_PROGRAM_BENEFIT_COUNTS_AS_INCOME,
  fhrProgramBenefitLabel,
  fhrProgramBenefitNote,
} from '../src/lib/fhr-program-benefit';

test('operationalEntry accepts optional FHR program name and perks', () => {
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    how_booked: 'Hotel at program rate (FHR)',
    program_rate_name: 'FHR',
    program_perks: 'Breakfast, $100 credit',
    program_benefit_gained: 'Amex $200 credit noted',
    components: [],
  });
  assert.equal(parsed.program_rate_name, 'FHR');
  assert.equal(parsed.program_perks, 'Breakfast, $100 credit');
  assert.equal(parsed.program_benefit_gained, 'Amex $200 credit noted');
});

test('blank FHR program fields stay empty — never invent perks or benefit income', () => {
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    how_booked: 'Hotel at program rate (FHR)',
    program_rate_name: '  ',
    program_perks: '',
    program_benefit_gained: '  ',
    components: [],
  });
  assert.equal(parsed.program_rate_name, '');
  assert.equal(parsed.program_perks, '');
  assert.equal(parsed.program_benefit_gained, '');
  assert.equal(fhrProgramBenefitLabel(''), 'None');
  assert.equal(fhrProgramBenefitNote(''), null);
  assert.equal(FHR_PROGRAM_BENEFIT_COUNTS_AS_INCOME, false);
});

test('booking persists FHR program fields including benefit gained (info only)', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'FHR guest',
      kind: 'person',
      roles: ['customer'],
    });
    const hotel = await run('party', {
      name: 'Program Rate Hotel',
      kind: 'company',
      roles: ['property'],
    });
    const method = (
      await db.query(
        "SELECT * FROM booking_source_methods WHERE name='Amex Travel / Business Platinum'",
      )
    ).rows[0];
    const b = await run('booking', {
      customer_id: customer.id,
      product: 'Hotel',
      channel: method?.name || 'Amex Travel / Business Platinum',
      summary: 'FHR night',
      booked_on: '2026-11-20',
      travel_start: '2026-12-10',
      travel_end: '2026-12-12',
      sale: 45000,
      travel_components_input: [
        {
          product: 'Hotel',
          summary: 'FHR night',
          provider_id: hotel.id,
          travel_start: '2026-12-10',
          travel_end: '2026-12-12',
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        how_booked: 'Hotel at program rate (FHR)',
        program_rate_name: 'FHR',
        program_perks: 'Breakfast, $100 credit',
        program_benefit_gained: 'Amex $200 statement credit',
        source_method_id: method?.id,
        components: [
          {
            type: 'Padova payment',
            cost: 38000,
            method: 'Cash',
            date: '2026-11-20',
          },
        ],
      },
    });
    const row = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id])).rows[0];
    const op = row.itinerary.operational_entry;
    assert.equal(op.how_booked, 'Hotel at program rate (FHR)');
    assert.equal(op.program_rate_name, 'FHR');
    assert.equal(op.program_perks, 'Breakfast, $100 credit');
    assert.equal(op.program_benefit_gained, 'Amex $200 statement credit');
    assert.equal(fhrProgramBenefitLabel(op.program_benefit_gained), 'Amex $200 statement credit');
    assert.equal(FHR_PROGRAM_BENEFIT_COUNTS_AS_INCOME, false);
  } finally {
    await db.close();
  }
});
