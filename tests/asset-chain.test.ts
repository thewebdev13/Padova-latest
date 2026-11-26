import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssetChain } from '../src/lib/asset-chain';

test('Plan voucher chain: price match + sold below face → net', () => {
  // Plan example: $500 price match, $1,000 face sold for $900 → +$500 −$100 = +$400.
  const chain = buildAssetChain({
    asset: {
      id: 'asset-1',
      name: 'UA voucher',
      kind: 'Voucher',
      reference: 'PM-1',
      source_booking_id: 'b1',
      face_cents: 100000,
      remaining_basis: 0,
      balance: 0,
    },
    source_booking: { id: 'b1', code: 'PDV-1001', summary: 'JFK–TLV' },
    price_matches: [
      { asset_id: 'asset-1', status: 'Received', credit: 50000, date: '2026-01-10' },
    ],
    siblings: [{ id: 'asset-0', name: 'Cap1 credit', kind: 'Credit' }],
    uses: [
      {
        booking_id: 'b2',
        code: 'PDV-1002',
        basis: 10000,
        quantity: 10000,
        effective_on: '2026-02-01',
        kind: 'use',
      },
    ],
    sales: [
      {
        id: 'sale-1',
        buyer: 'Partner',
        proceeds: 90000,
        received: 90000,
        quantity: 100000,
        effective_on: '2026-03-01',
      },
    ],
  });
  assert.equal(chain.incomplete, false);
  assert.deepEqual(
    chain.steps.map((s) => s.kind),
    ['source_booking', 'price_match', 'sibling_asset', 'use', 'sale', 'net'],
  );
  assert.equal(chain.steps.find((s) => s.kind === 'price_match')?.amount_cents, 50000);
  assert.equal(chain.steps.find((s) => s.kind === 'sale')?.amount_cents, -10000);
  assert.match(String(chain.steps.find((s) => s.kind === 'sale')?.note), /sold below face value/);
  assert.equal(chain.net_cents, 40000);
  assert.equal(chain.steps[0].booking_id, 'b1');
});

test('unknown price-match credit marks chain incomplete', () => {
  const chain = buildAssetChain({
    asset: {
      id: 'asset-2',
      source_booking_id: 'b9',
      remaining_basis: null,
      balance: 5000,
      face_cents: 5000,
    },
    source_booking: { id: 'b9', code: 'PDV-9' },
    price_matches: [{ asset_id: 'asset-2', status: 'Pending' }],
    sales: [],
    uses: [],
  });
  assert.equal(chain.incomplete, true);
  assert.equal(chain.steps.find((s) => s.kind === 'price_match')?.amount_cents, null);
  assert.equal(chain.net_cents, null);
});

test('sale without known face stays Incomplete ≠ invent vs-face', () => {
  const chain = buildAssetChain({
    asset: {
      id: 'asset-3',
      face_cents: null,
      remaining_basis: 20000,
      balance: 0,
    },
    sales: [{ id: 's1', proceeds: 18000, received: 18000 }],
    price_matches: [],
    uses: [],
  });
  assert.equal(chain.incomplete, true);
  assert.equal(chain.steps.find((s) => s.kind === 'sale')?.amount_cents, null);
  assert.equal(chain.net_cents, null);
});
