import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { operationalEntry } from '../src/lib/booking-entry';
import {
  bookingCommissionsEmptyMessage,
  expectedCommissionDisplay,
  expectedCommissionPanelLabel,
  hasExpectedCommissionOnBooking,
  receivableCommissionLabel,
  recordedCommissionTotals,
} from '../src/lib/commission-line-label';

test('operational entry keeps secondary commission and referring org independent', () => {
  const payer = randomUUID();
  const org = randomUUID();
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    referring_organization_id: org,
    commission: {
      expected: 'Yes',
      amount: 9000,
      payer_id: payer,
      notes: 'IATA partner ~90% receivable',
    },
    secondary_commission: {
      expected: 'Yes',
      amount: 2500,
      payer_id: randomUUID(),
      notes: 'Extra expected commission; not received yet',
    },
  });
  assert.equal(parsed.referring_organization_id, org);
  assert.equal(parsed.commission?.expected, 'Yes');
  assert.equal(parsed.commission?.amount, 9000);
  assert.equal(parsed.secondary_commission?.expected, 'Yes');
  assert.equal(parsed.secondary_commission?.amount, 2500);
  assert.notEqual(parsed.commission?.payer_id, parsed.secondary_commission?.payer_id);
});

test('soft-merge C: referring org alone without receivable commission fields', () => {
  const org = randomUUID();
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    referring_organization_id: org,
  });
  assert.equal(parsed.referring_organization_id, org);
  assert.equal(parsed.commission, undefined);
  assert.equal(parsed.secondary_commission, undefined);
});

test('secondary commission can stay Unknown without inventing zero', () => {
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    secondary_commission: { expected: 'Unknown' },
  });
  assert.equal(parsed.secondary_commission?.expected, 'Unknown');
  assert.equal(parsed.secondary_commission?.amount, undefined);
});

test('commission line labels keep primary secondary and payable distinct', () => {
  const primaryPayer = randomUUID();
  const secondaryPayer = randomUUID();
  const operational = {
    commission: { expected: 'Yes', payer_id: primaryPayer, amount: 9000 },
    secondary_commission: { expected: 'Yes', payer_id: secondaryPayer, amount: 2500 },
  };
  assert.equal(
    receivableCommissionLabel({ payer_id: primaryPayer }, operational),
    'Primary IATA / partner commission · recorded receivable',
  );
  assert.equal(
    receivableCommissionLabel({ payer_id: secondaryPayer }, operational),
    'Secondary commission · recorded receivable',
  );
  assert.equal(
    receivableCommissionLabel({
      payer_id: secondaryPayer,
      notes: '[secondary] Secondary expected commission receivable',
    }),
    'Secondary commission · recorded receivable',
  );
  assert.equal(expectedCommissionDisplay({ expected: 'Unknown' }).status, 'unknown');
  assert.equal(expectedCommissionDisplay({ expected: 'Yes', amount: 2500 }).amount, 2500);
  assert.equal(
    expectedCommissionPanelLabel('secondary'),
    'Secondary commission expected',
  );
  assert.equal(hasExpectedCommissionOnBooking(operational), true);
  assert.match(
    bookingCommissionsEmptyMessage({
      hasRecordedReceivable: false,
      hasReferral: false,
      hasRefund: false,
      hasExpectedOnBooking: true,
    }) || '',
    /No recorded receivable or receipt yet/,
  );
  assert.equal(
    bookingCommissionsEmptyMessage({
      hasRecordedReceivable: true,
      hasReferral: false,
      hasRefund: false,
      hasExpectedOnBooking: true,
    }),
    null,
  );
  assert.deepEqual(
    recordedCommissionTotals(
      [
        { payer_id: primaryPayer, is_iata_partner: true, gross: 2500, retained: 0 },
        { payer_id: secondaryPayer, is_iata_partner: false, gross: 3000, retained: 0 },
      ],
      operational,
    ),
    { primaryCents: 2500, secondaryCents: 3000 },
  );
});
