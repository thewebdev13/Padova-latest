import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStandingDealExpectations,
  entryExtraIncomeDraftStarted,
  mergeStandingDealExpectations,
  normalizeEntryExtraIncomeDraft,
  partyStandingDeals,
  standingDealAmountCents,
  standingDealBasisCents,
  upsertPrimaryStandingDeal,
} from '../src/lib/standing-deals';

test('sale_ex_tax basis subtracts taxes; unknown tax → null amount', () => {
  assert.equal(
    standingDealBasisCents({ basis: 'sale_ex_tax', saleCents: 110000, taxCents: 10000 }),
    100000,
  );
  assert.equal(
    standingDealBasisCents({ basis: 'sale_ex_tax', saleCents: 110000, taxCents: null }),
    null,
  );
  assert.equal(standingDealAmountCents(1000, 100000), 10000);
  assert.equal(standingDealAmountCents(1000, null), null);
});

test('partyStandingDeals drops invalid rows; upsertPrimary clearable', () => {
  const deals = partyStandingDeals({
    details: {
      standing_deals: [
        {
          id: 'primary',
          label: 'Extra 10% cash',
          rate_bps: 1000,
          basis: 'sale_ex_tax',
          product: 'Hotel',
          active: true,
        },
        { id: 'bad', label: 'x', rate_bps: -1, basis: 'sale', product: 'Any' },
      ],
    },
  });
  assert.equal(deals.length, 1);
  assert.equal(deals[0].label, 'Extra 10% cash');
  assert.equal(upsertPrimaryStandingDeal(deals, null).length, 0);
});

test('buildStandingDealExpectations seeds Hotel deal; skips Flight when product=Hotel', () => {
  const deals = partyStandingDeals({
    details: {
      standing_deals: [
        {
          id: 'primary',
          label: 'Extra 10% cash',
          rate_bps: 1000,
          basis: 'sale_ex_tax',
          product: 'Hotel',
          active: true,
        },
      ],
    },
  });
  const hotel = buildStandingDealExpectations({
    deals,
    product: 'Hotel',
    saleCents: 110000,
    taxCents: 10000,
  });
  assert.equal(hotel.length, 1);
  assert.equal(hotel[0].amount_cents, 10000);
  const flight = buildStandingDealExpectations({
    deals,
    product: 'Flight',
    saleCents: 110000,
    taxCents: 10000,
  });
  assert.equal(flight.length, 0);
});

test('entry Extra income draft: blank / required / Incomplete amount / merge', () => {
  assert.equal(normalizeEntryExtraIncomeDraft({}), null);
  assert.equal(entryExtraIncomeDraftStarted({}), false);
  assert.equal(entryExtraIncomeDraftStarted({ extra_income_label: 'x' }), true);
  assert.throws(() => normalizeEntryExtraIncomeDraft({ percent: '10' }), /label/i);
  assert.throws(
    () => normalizeEntryExtraIncomeDraft({ label: 'Marriott cash' }),
    /rate/i,
  );
  const known = normalizeEntryExtraIncomeDraft({
    label: 'Marriott cash',
    percent: '10',
    basis: 'sale_ex_tax',
    saleCents: 110000,
    taxCents: 10000,
  });
  assert.equal(known?.rate_bps, 1000);
  assert.equal(known?.amount_cents, 10000);
  assert.equal(known?.deal_id, 'entry-more');
  const unknownTax = normalizeEntryExtraIncomeDraft({
    label: 'Marriott cash',
    percent: 10,
    basis: 'sale_ex_tax',
    saleCents: 110000,
    taxCents: null,
  });
  assert.equal(unknownTax?.amount_cents, null);
  const seeded = buildStandingDealExpectations({
    deals: partyStandingDeals({
      details: {
        standing_deals: [
          {
            id: 'primary',
            label: 'Profile deal',
            rate_bps: 500,
            basis: 'sale',
            product: 'Any',
            active: true,
          },
        ],
      },
    }),
    product: 'Hotel',
    saleCents: 100000,
    taxCents: 0,
  });
  const merged = mergeStandingDealExpectations(seeded, known);
  assert.equal(merged?.length, 2);
  assert.ok(merged?.some((d) => d.deal_id === 'entry-more'));
  assert.equal(mergeStandingDealExpectations([], null), undefined);
});
