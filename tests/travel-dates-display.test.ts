import assert from 'node:assert/strict';
import test from 'node:test';
import { travelDatesDisplay } from '../src/lib/travel-dates-display';
import { travelerNames, travelerPasteNeedsReview } from '../src/lib/booking-ux';

test('missing hotel checkout shows as missing, not a complete span', () => {
  const span = travelDatesDisplay(
    { product: 'Hotel', travel_start: '2026-06-01', travel_end: '2026-06-01' },
    { product: 'Hotel', travel_start: '2026-06-01', travel_end: '2026-06-01', details: { end_date_known: false } },
  );
  assert.match(span.label, /Jun/);
  assert.equal(span.missing, 'Check-out missing');
});

test('round trip with known return shows a date range', () => {
  const span = travelDatesDisplay(
    {
      product: 'Flight',
      travel_start: '2026-06-01',
      travel_end: '2026-06-10',
      itinerary: { trip_type: 'Round Trip', end_date_known: true },
    },
    {
      product: 'Flight',
      travel_start: '2026-06-01',
      travel_end: '2026-06-10',
      details: { trip_type: 'Round Trip', end_date_known: true },
    },
  );
  assert.equal(span.missing, undefined);
  assert.match(span.label, /–/);
});

test('travelerNames splits safe multi-name pastes', () => {
  assert.deepEqual(travelerNames('Alex Winter & Jamie Summer'), [
    'Alex Winter',
    'Jamie Summer',
  ]);
  assert.equal(travelerPasteNeedsReview('Alex and Jamie Winter'), true);
  assert.equal(travelerPasteNeedsReview('Alex Winter'), false);
});
