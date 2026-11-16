import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalRecordPresentation } from '../src/lib/historical-record-presentation';

test('a recorded sheet cost remains readable without presenting it as independently confirmed', () => {
  const entry = {
    itinerary: {
      cost_status: 'Pending',
      historical_sources: [
        {
          original_fields: {
            'F — cost': {
              effectiveValue: { numberValue: 845.6 },
              formattedValue: '$845.60',
            },
          },
        },
      ],
    },
  };
  const result = historicalRecordPresentation(entry);
  assert.equal(result.recordedCost, '$845.60');
  assert.equal(result.cost, null);
  assert.equal(result.paymentStatus, 'Needs reconciliation');
});

test('normal historical details prefer actual itinerary over accounting arithmetic without inventing payment or dates', () => {
  const entry = {
    summary: '$$100 + 200 = 300$$',
    itinerary: {
      source_claims: { customer_sale_cents: 30000 },
      historical_sources: [
        { original_fields: { 'K — Route/stay': '$$100 + 200 = 300$$', 'E — Paid': 'paid' } },
        {
          original_fields: {
            'D — Pax': 'EXAMPLE, Alex / Sam',
            'E — Route/stay': 'EWR-TLV / LY26 / 9:00 PM (Wait)\nEWR-TLV / LY26 / 9:00 PM BOOKED',
            'G — Date of travel': 'Apr 19\nApr 20',
          },
        },
      ],
    },
  };
  const p = historicalRecordPresentation(entry);
  assert.equal(p.route, 'EWR–TLV');
  assert.equal(p.flights, 'LY26');
  assert.equal(p.travelers, 'EXAMPLE, Alex / Sam');
  assert.equal(p.travelDates, 'Apr 19\nApr 20');
  assert.equal(p.bookedOn, null);
  assert.equal(p.sale, 30000);
  assert.equal(p.cost, null);
  assert.equal(p.paymentStatus, 'Needs reconciliation');
  assert.equal(entry.summary, '$$100 + 200 = 300$$');
});

test('explicit review corrections supersede display facts while Unknown stays distinct from zero', () => {
  const p = historicalRecordPresentation(
    { itinerary: {} },
    {
      values: {
        travel_details: 'LHR–JFK',
        traveler_names: 'Synthetic Traveler',
        travel_dates: 'November 4, 2026',
        sale_cents: 0,
        cost_cents: null,
        booked_on: '2026-11-03',
        date_certainty: 'Approximate',
      },
    },
  );
  assert.equal(p.sale, 0);
  assert.equal(p.cost, null);
  assert.equal(p.route, 'LHR–JFK');
  assert.equal(p.dateCertainty, 'Approximate');
});

test('legacy drafts without normalized money retain readable source prices without inventing posted amounts', () => {
  const p = historicalRecordPresentation({
    itinerary: {
      historical_sources: [
        { original_fields: { 'D — Sale Price': '2,549.50', 'F — cost': '2,183.55' } },
      ],
    },
  });
  assert.equal(p.recordedSale, '2,549.50');
  assert.equal(p.recordedCost, '2,183.55');
  assert.equal(p.sale, null);
  assert.equal(p.cost, null);
});
