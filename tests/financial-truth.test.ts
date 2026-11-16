import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { detail } from '../src/lib/queries';

test('financial truth: unknown totals, provider-based commission cash, and independent tax recovery', async (t) => {
  const db = await financialDatabase(),
    date = '2026-10-31';
  const run = (kind: any, data: any, id = randomUUID()) =>
    execute(db, testOwner, { id, kind, data });
  try {
    const customer = await run('party', {
      name: 'Truth customer',
      kind: 'person',
      roles: ['customer'],
    });
    const provider = await run('party', {
      name: 'Truth hotel',
      kind: 'company',
      roles: ['property', 'seller', 'commission_payer'],
    });
    const card = await run('payment_account', {
      name: 'Truth saved card',
      kind: 'Card',
      ownership: 'Padova',
    });
    const hotel = (commission: any, extra: any = {}) => ({
      customer_id: customer.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Truth hotel stay',
      booked_on: date,
      travel_start: '2026-11-10',
      travel_end: '2026-11-12',
      sale: 5000,
      travel_components_input: [
        {
          product: 'Hotel',
          summary: 'Truth hotel stay',
          provider_id: provider.id,
          travel_start: '2026-11-10',
          travel_end: '2026-11-12',
          details: { end_date_known: true },
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        components: [
          {
            type: 'Customer card',
            owner_id: customer.id,
            supplied: 'Complete Booking / Ticket',
            cost: 200000,
            date,
          },
        ],
        commission,
        ...extra,
      },
    });
    await t.test('unknown sale, cost and total seller balance never become zero', async () => {
      const b = await run('booking', {
        customer_id: customer.id,
        product: 'Flight',
        channel: 'Direct',
        summary: 'Unknown historical economics',
        booked_on: date,
        travel_start: date,
        travel_end: date,
        itinerary: { sale_known: false, cost_status: 'Pending' },
      });
      const e = await economics(db, b.id);
      assert.equal(e.sale, null);
      assert.equal(e.customer_balance, null);
      assert.equal(e.profit, null);
      assert.equal(e.supplier_balance, null);
      assert.equal(e.recorded_supplier_balance, 0);
      assert.equal(e.net_economic_cost, null);
      const employee = await financialEmployee(db),
        view = await detail(db, employee, 'booking', b.id);
      assert.equal('recorded_supplier_balance' in view.booking, false);
    });
    await t.test('known net cost is independent of an unknown customer price', async () => {
      const b = await run('booking', {
        ...hotel(undefined, {
          sale_known: false,
          components: [{ type: 'Outside seller', seller_id: provider.id, cost: 10000, date }],
        }),
        sale: 0,
      });
      const e = await economics(db, b.id);
      assert.equal(e.sale, null);
      assert.equal(e.customer_balance, null);
      assert.equal(e.profit, null);
      assert.equal(e.current_profit, null);
      assert.equal(e.cost_incomplete, true);
      assert.equal(e.supplier_cost_incomplete, false);
      assert.equal(e.funding_cost, 10000);
      assert.equal(e.net_economic_cost, 10000);
      const employee = await financialEmployee(db);
      const view = await detail(db, employee, 'booking', b.id);
      assert.equal('net_economic_cost' in view.booking, false);
    });
    await t.test(
      'unknown expected commission is not no commission; recorded actual economics stay separate',
      async () => {
        const b = await run('booking', hotel({ expected: 'Unknown' })),
          e = await economics(db, b.id);
        assert.equal(e.expected_commission, null);
        assert.equal(e.gross_profit, null);
        assert.equal(e.profit, null);
        assert.equal(e.current_profit, 5000);
        assert.equal(e.funding_cost, 0);
        const unresolvedPayer = await run('booking', hotel({ expected: 'Yes', amount: 20000 }));
        assert.equal((await economics(db, unresolvedPayer.id)).expected_commission, null);
      },
    );
    await t.test(
      'provider percentage uses its agreed basis, not the Padova service fee; actual receipt posts cash once',
      async () => {
        const data = hotel({
            expected: 'Yes',
            percentage_bps: 1000,
            basis_kind: 'Provider amount',
            basis_amount: 200000,
            basis_description: 'Commissionable room rate',
            payer_id: provider.id,
            received: 5000,
            received_on: date,
            method: 'ACH',
          }),
          id = randomUUID();
        const b = await run('booking', data, id),
          e = await economics(db, b.id);
        assert.equal(Number(e.expected_commission), 20000);
        assert.equal(e.received_commission, 5000);
        assert.equal(e.current_profit, 10000);
        assert.equal(e.profit, 25000);
        const cash = Number(
          (
            await db.query(
              "SELECT COALESCE(sum(debit-credit),0) n FROM journal_lines WHERE command_id=$1 AND account='cash'",
              [id],
            )
          ).rows[0].n,
        );
        assert.equal(cash, 5000);
        const payments = (
          await db.query('SELECT * FROM payments WHERE reference=$1', [
            'Booking commission receipt',
          ])
        ).rows;
        assert.equal(payments.length, 1);
        assert.equal(Number(payments[0].amount), 5000);
        await run('booking', data, id);
        assert.equal(
          Number(
            (
              await db.query('SELECT count(*) n FROM payments WHERE reference=$1', [
                'Booking commission receipt',
              ])
            ).rows[0].n,
          ),
          1,
        );
        const missing = hotel({
          expected: 'Yes',
          percentage_bps: 1000,
          basis_kind: 'Provider amount',
          payer_id: provider.id,
        });
        await assert.rejects(run('booking', missing), /basis/);
        const zeroExpected = hotel({
          expected: 'Yes',
          amount: 0,
          payer_id: provider.id,
          received: 1,
          received_on: date,
          method: 'ACH',
        });
        await assert.rejects(run('booking', zeroExpected), /cover the actual receipt/);
      },
    );
    await t.test(
      'Padova tax payment and customer recovery remain separate; no repeated sale or included tax',
      async () => {
        const unknownTax = await run(
          'booking',
          hotel({ expected: 'No' }, { taxes: { amount: 3000, bearer: 'Unknown' } }),
        );
        assert.equal((await economics(db, unknownTax.id)).profit, null);
        const zeroTax = await run(
          'booking',
          hotel({ expected: 'No' }, { taxes: { amount: 0, bearer: 'Unknown' } }),
        );
        assert.equal((await economics(db, zeroTax.id)).profit, 5000);
        const tax = {
          amount: 3000,
          bearer: 'Padova',
          economic_bearer: 'Customer',
          customer_recovery: 3000,
          method: 'Card',
          account_id: card.id,
        };
        const data = hotel({ expected: 'No' }, { taxes: tax });
        data.sale = 8000;
        const b = await run('booking', data),
          e = await economics(db, b.id);
        assert.equal(Number(e.sale), 8000);
        assert.equal(Number(e.funding_cost), 3000);
        assert.equal(e.profit, 5000);
        const stored = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id]))
          .rows[0].itinerary.operational_entry.taxes;
        assert.equal(stored.bearer, 'Padova');
        assert.equal(stored.economic_bearer, 'Customer');
        assert.equal(stored.customer_recovery, 3000);
        const separateCharge = hotel({ expected: 'No' }, { taxes: tax, additional_charge: 3000 });
        separateCharge.sale = 1000;
        const separate = await run('booking', separateCharge),
          separateEconomics = await economics(db, separate.id);
        assert.equal(Number(separateEconomics.sale), 4000);
        assert.equal(separateEconomics.profit, 1000);
        const included = hotel(
          { expected: 'No' },
          {
            components: [
              {
                type: 'Padova payment',
                supplied: 'Complete Booking / Ticket',
                cost: 13000,
                date,
                method: 'Card',
                account_id: card.id,
              },
            ],
            taxes: { ...tax, included_in_component: true },
          },
        );
        included.sale = 16000;
        const ib = await run('booking', included),
          ie = await economics(db, ib.id);
        assert.equal(Number(ie.funding_cost), 13000);
        assert.equal(Number(ie.sale), 16000);
        assert.equal(ie.profit, 3000);
        const invalid = hotel({ expected: 'No' }, { taxes: { ...tax, customer_recovery: 3001 } });
        await assert.rejects(run('booking', invalid), /exceed/);
      },
    );
    assert.equal(
      Number(
        (await db.query('SELECT COALESCE(sum(debit-credit),0) n FROM journal_lines')).rows[0].n,
      ),
      0,
    );
  } finally {
    await db.close();
  }
});
