import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareHistoricalRows } from '../src/lib/historical-preparation';

const cell = (v: any) => ({
  userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v },
  effectiveValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v },
});
const row = (number: number, fields: any, tab = 'accounting') => ({
  workbook_id: 'source-workbook',
  tab,
  row: number,
  snapshot_id: 'unchanged-capture',
  source_sha256: 'source-hash',
  original_fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, cell(v)])),
  raw_payload: { allOriginalFields: true },
});

test('matching complete main/PM records preserve both sources as one booking without merging real conflicts', () => {
  const main = row(20, {
    A: 'Customer',
    J: 'Example Traveler',
    K: 'JFK-TLV',
    L: '2026-10-01',
    M: '2026-11-20',
    N: 'ABC123',
  });
  const pm = {
    ...row(
      30,
      {
        B: 'Customer',
        K: 'Example Traveler',
        L: 'JFK-TLV',
        M: '2026-10-01',
        N: '2026-11-20',
        O: 'ABC123',
      },
      '2026 accounting',
    ),
    workbook_id: 'pm-workbook',
  };
  const resolve = () => 'Example Company';
  const result = prepareHistoricalRows([main, pm], resolve);
  assert.equal(result.bookings.length, 1);
  assert.equal(result.bookings[0].sources.length, 2);
  const replay = prepareHistoricalRows([main, pm], resolve, result.mappings);
  assert.equal(replay.reconciliation.newPreparedBookings, 0);
  assert.deepEqual(replay.mappings, result.mappings);
  const changed = structuredClone(pm);
  changed.original_fields.K = cell('Different Traveler');
  assert.equal(prepareHistoricalRows([main, changed], resolve).bookings.length, 0);
  changed.original_fields.K = cell('Example Traveler');
  changed.original_fields.N = cell('2026-11-21');
  assert.equal(prepareHistoricalRows([main, changed], resolve).bookings.length, 0);
});
test('historical preparation accepts exact identities, preserves every source field and unknown money, and replays without new targets', () => {
  const rows = [
    row(2, {
      A: 'Approved alias',
      K: 'JFK TLV',
      N: 'ABC123',
      D: '1,200.25',
      S: 'Original note',
      Z: 'Unclassified meaningful field',
    }),
    row(3, { A: 'Canonical Company LLC', K: 'JFK TLV', N: 'ABC123' }),
    row(4, { B: 'ABC123', C: '2026-10-29' }, 'tranactions'),
    row(5, { A: 'refund uncertain', K: 'TLV', N: 'XYZ987' }),
    row(1, { A: 'Customer', K: 'Route/stay' }),
  ];
  const result = prepareHistoricalRows(rows, (name) =>
    name === 'Approved alias' ? 'Canonical Company LLC' : undefined,
  );
  assert.equal(result.reconciliation.uniquePreparedBookings, 1);
  assert.equal(result.reconciliation.counts['Linked supporting row'], 2);
  assert.equal(result.reconciliation.counts['Needs Review'], 1);
  assert.equal(result.reconciliation.counts['Preserved supporting row'], 1);
  assert.equal(result.bookings[0].facts.customer_sale_cents, 120025);
  assert.equal(result.bookings[0].facts.source_cost_cents, null);
  assert.equal(result.bookings[0].facts.cost_status, 'Unknown');
  assert.deepEqual(
    result.mappings.map((r) => r.source),
    rows,
  );
  assert.equal(result.reconciliation.intentionallyExcluded, 0);
  const replay = prepareHistoricalRows(
    rows,
    (name) => (name === 'Approved alias' ? 'Canonical Company LLC' : undefined),
    result.mappings,
  );
  assert.equal(replay.reconciliation.newPreparedBookings, 0);
  assert.deepEqual(replay.mappings, result.mappings);
  const changed = structuredClone(rows);
  changed[0].original_fields.N = cell('NEW123');
  const correction = prepareHistoricalRows(
    changed,
    (name) => (name === 'Approved alias' ? 'Canonical Company LLC' : undefined),
    result.mappings,
  );
  assert.equal(correction.mappings[0].status, 'Needs Review');
  assert.match(correction.mappings[0].rationale, /changed/);
});
test('conflicting PNR identities, ambiguous dates, formula costs and payment claims never become guessed financial records', () => {
  const first = row(2, {
    A: 'One customer',
    K: 'JFK TLV',
    N: 'ABC123',
    F: 10.01,
    M: '12/03',
    E: 'Paid',
  });
  first.original_fields.F = { ...cell(10.01), userEnteredValue: { formulaValue: '=G2+H2' } } as any;
  const result = prepareHistoricalRows([
    first,
    row(3, { A: 'Another customer', K: 'JFK TLV', N: 'ABC123' }),
    row(4, { B: 'ABC123' }, 'tranactions'),
  ]);
  assert.equal(result.reconciliation.uniquePreparedBookings, 0);
  assert.equal(result.reconciliation.counts['Needs Review'], 3);
  assert.ok(result.mappings.every((m) => m.status !== 'Linked supporting row'));
  assert.equal(result.mappings[0].facts.source_cost_cents, null);
  assert.equal(result.mappings[0].facts.travel_on, null);
  assert.match(result.mappings[0].facts.payment_status, /no receipts/);
  assert.equal(result.reconciliation.liveFinancialPostings, 0);
});
