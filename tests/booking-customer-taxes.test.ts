import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  applyCustomerTaxAmount,
  customerTaxesDisplay,
  standingDealNeedsTaxesHint,
  standingDealUnknownAmountHint,
  taxAmountCents,
} from '../src/lib/booking-customer-taxes';
import { bookingVisibility } from '../src/lib/visibility';
import type { Actor } from '../src/lib/permissions';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { execute } from '../src/lib/finance';
import { detail } from '../src/lib/queries';

test('customerTaxesDisplay shows amount and sale ex-tax; blank stays null', () => {
  assert.equal(taxAmountCents(null), null);
  assert.deepEqual(
    customerTaxesDisplay({
      taxes: { amount: 15000, bearer: 'Customer' },
      saleCents: 100000,
    }),
    {
      amount_cents: 15000,
      sale_ex_tax_cents: 85000,
      included_in_price: true,
    },
  );
  assert.equal(
    customerTaxesDisplay({ taxes: undefined, saleCents: 100000 }),
    null,
  );
});

test('standingDealNeedsTaxesHint only when sale_ex_tax deal amount Unknown', () => {
  assert.equal(
    standingDealNeedsTaxesHint(
      [{ basis: 'sale_ex_tax', amount_cents: null }],
      null,
    ),
    'Enter taxes (part of the customer price) to compute the standing deal on sale excluding taxes.',
  );
  assert.equal(
    standingDealNeedsTaxesHint(
      [{ basis: 'sale_ex_tax', amount_cents: null }],
      { amount: 1000 },
    ),
    null,
  );
  assert.equal(
    standingDealNeedsTaxesHint([{ basis: 'sale', amount_cents: null }], null),
    null,
  );
  assert.match(
    standingDealUnknownAmountHint({
      basis: 'sale_ex_tax',
      amount_cents: null,
      notes: '10% of stay price excluding taxes',
    }) || '',
    /excluding taxes/,
  );
});

test('bookingVisibility keeps tax amount for sale-price staff without supplier cost', () => {
  const staff = {
    id: 's',
    role: 'EMPLOYEE',
    permissions: ['view_sale_price'],
  } as Actor;
  const row = {
    id: 'b',
    sale: 100000,
    itinerary: {
      operational_entry: {
        taxes: {
          amount: 12000,
          bearer: 'Padova',
          economic_bearer: 'Padova',
          customer_recovery: 12000,
        },
        components: [{ type: 'Cash' }],
      },
    },
  };
  const visible = bookingVisibility(row, staff);
  assert.equal(visible.itinerary.operational_entry.taxes.amount, 12000);
  assert.equal(visible.itinerary.operational_entry.taxes.customer_recovery, 12000);
  assert.equal(visible.itinerary.operational_entry.taxes.bearer, undefined);
  assert.equal(visible.itinerary.operational_entry.components, undefined);
});

test('applyCustomerTaxAmount sets taxes and recomputes sale_ex_tax standing deal', () => {
  const next = applyCustomerTaxAmount(
    {
      version: 1,
      sale_known: true,
      standing_deals: [
        {
          deal_id: 'primary',
          label: 'Marriott extra',
          rate_bps: 1000,
          basis: 'sale_ex_tax',
          amount_cents: null,
          notes: '10% of stay price excluding taxes',
        },
      ],
    },
    { tax_amount_cents: 15000, sale_cents: 100000 },
  );
  assert.equal((next.taxes as { amount: number }).amount, 15000);
  assert.equal((next.standing_deals as Array<{ amount_cents: number }>)[0].amount_cents, 8500);
  const cleared = applyCustomerTaxAmount(next, { tax_amount_cents: null, sale_cents: 100000 });
  assert.equal(cleared.taxes, undefined);
  assert.equal((cleared.standing_deals as Array<{ amount_cents: null }>)[0].amount_cents, null);
});

let db: Database;
let owner: Actor;
const ownerPassword = 'Synthetic owner password for booking taxes tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Taxes Owner',
    email: 'booking-taxes-owner@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

async function cmd(kind: string, data: Record<string, unknown>) {
  return execute(db, owner, { id: randomUUID(), kind: kind as any, data });
}

test('booking_taxes sets then clears customer taxes without changing sale', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Tax Customer',
    roles: ['customer', 'traveler'],
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Tax edit hotel',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 100000,
  });
  let d = await detail(db, owner, 'booking', booking.id);
  assert.equal(d.booking.sale, 100000);
  await cmd('booking_taxes', {
    booking_id: booking.id,
    tax_amount: 20000,
    date,
    reason: 'From folio',
  });
  d = await detail(db, owner, 'booking', booking.id);
  assert.equal(d.booking.itinerary.operational_entry.taxes.amount, 20000);
  assert.equal(d.booking.sale, 100000);
  await cmd('booking_taxes', { booking_id: booking.id, date, reason: 'Clear' });
  d = await detail(db, owner, 'booking', booking.id);
  assert.equal(d.booking.itinerary.operational_entry.taxes?.amount, undefined);
  assert.equal(d.booking.sale, 100000);
});
