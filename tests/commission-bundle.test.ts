import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import { receivableCommissionLabel } from '../src/lib/commission-line-label';

test('multi-payer commission save posts two receivables + optional payable with IATA flag', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'Bundle customer',
      kind: 'person',
      roles: ['customer'],
    });
    const iata = await run('party', {
      name: 'IATA agency',
      kind: 'company',
      roles: ['commission_payer'],
    });
    const secondary = await run('party', {
      name: 'Secondary payer',
      kind: 'company',
      roles: ['commission_payer'],
    });
    const referrer = await run('party', {
      name: 'Referrer org payee',
      kind: 'company',
      roles: ['seller'],
    });
    const booking = await run('booking', {
      customer_id: customer.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Multi commission hotel',
      booked_on: '2026-11-17',
      travel_start: '2027-01-10',
      travel_end: '2027-01-12',
      sale: 50000,
    });

    await run('commission', {
      booking_id: booking.id,
      date: '2026-11-17',
      payers: [
        {
          payer_id: iata.id,
          gross: 9000,
          retained: 0,
          is_iata_partner: true,
        },
        {
          payer_id: secondary.id,
          gross: 2500,
          retained: 0,
          is_iata_partner: false,
        },
      ],
      referral: {
        referrer_id: referrer.id,
        basis: 'fixed',
        fixed_amount: 2000,
        rate_bps: 0,
        due_on: '2026-11-17',
        reason: 'Affiliate share on this booking',
        payable_when: 'After travel',
        earned: true,
        cancellation_rule: 'Realized economics',
      },
    });

    const commissions = (
      await db.query('SELECT * FROM commissions WHERE booking_id=$1 ORDER BY gross DESC', [
        booking.id,
      ])
    ).rows;
    assert.equal(commissions.length, 2);
    assert.equal(Number(commissions[0].gross), 9000);
    assert.equal(commissions[0].is_iata_partner, true);
    assert.equal(Number(commissions[1].gross), 2500);
    assert.equal(commissions[1].is_iata_partner, false);
    assert.equal(
      receivableCommissionLabel(commissions[0], null, commissions),
      'Primary IATA / partner commission receivable',
    );
    assert.equal(
      receivableCommissionLabel(commissions[1], null, commissions),
      'Secondary commission receivable',
    );

    const referrals = (await db.query('SELECT * FROM referrals WHERE booking_id=$1', [booking.id]))
      .rows;
    assert.equal(referrals.length, 1);
    assert.equal(referrals[0].referrer_id, referrer.id);
    assert.equal(Number(referrals[0].fixed_amount), 2000);

    await assert.rejects(
      () =>
        run('commission', {
          booking_id: booking.id,
          date: '2026-11-17',
          payers: [{ payer_id: iata.id, gross: 100, is_iata_partner: true }],
        }),
      /double-post/i,
    );
  } finally {
    await db.close();
  }
});
