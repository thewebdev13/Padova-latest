import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';
import {
  TRADE_DEFAULT_STATUS,
  TRADE_DEFAULT_STOCK_MODE,
  TRADE_STATUSES,
  TRADE_WHAT_OTHER,
  TRADE_WHATS,
  buildTradeBuyPayload,
  buildTradeSellPayload,
  encodeTradeStatusInNotes,
  encodeTradeStatusInReference,
  encodeTradeToCompleteInNotes,
  formatTradeRateLabel,
  listTradesToComplete,
  mergeTradeWhatOptions,
  parseTradeStatus,
  parseTradeToComplete,
  resolveTradeWhat,
  suggestTradeStatus,
  tradeRateMilliCentsPerUnit,
  tradeStatusLabel,
  tradeToComplete,
  tradeToCompleteMatchesSearch,
  tradeUnit,
} from '../src/lib/trade-desk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Plan trade What drop-down merges owner-added kinds', () => {
  const opts = mergeTradeWhatOptions(['Centurion lounge pass', 'Points', 'FHR credit', '']);
  assert.ok(opts.includes('Points'));
  assert.ok(opts.includes('Centurion lounge pass'));
  assert.equal(opts.filter((o) => o === 'Points').length, 1);
  assert.equal(opts[opts.length - 1], TRADE_WHAT_OTHER);
  assert.equal(resolveTradeWhat(TRADE_WHAT_OTHER, 'Hyatt FNC resale'), 'Hyatt FNC resale');
  assert.equal(resolveTradeWhat('Voucher', 'ignored'), 'Voucher');
  assert.equal(resolveTradeWhat(TRADE_WHAT_OTHER, '  '), '');
  assert.equal(tradeUnit('United miles batch'), 'points');
  assert.equal(tradeUnit('Centurion lounge pass'), 'money');
  assert.ok(TRADE_WHATS.includes('FHR credit'));
});

test('Plan trade statuses offered · agreed · paid · delivered', () => {
  assert.deepEqual([...TRADE_STATUSES], ['offered', 'agreed', 'paid', 'delivered']);
  assert.equal(TRADE_DEFAULT_STATUS, 'agreed');
  assert.equal(tradeStatusLabel('offered'), 'Offered');
  assert.equal(suggestTradeStatus({ side: 'Buy' }), 'delivered');
  assert.equal(suggestTradeStatus({ side: 'Sell', paid: true }), 'paid');
  assert.equal(
    suggestTradeStatus({ side: 'Sell', paid: false, to_complete: ['Buyer'] }),
    'offered',
  );
  assert.equal(suggestTradeStatus({ side: 'Sell', paid: false }), 'agreed');
  assert.equal(parseTradeStatus('Trade status: delivered'), 'delivered');
  assert.equal(parseTradeStatus('plain notes'), null);
  assert.equal(
    encodeTradeStatusInNotes('Seller note', 'agreed'),
    'Seller note\nTrade status: agreed',
  );
  assert.equal(encodeTradeStatusInReference('wire-1', 'paid'), 'Trade status: paid · wire-1');
});

test('Plan To complete persists on trade record and lists for follow-up', () => {
  const encoded = encodeTradeToCompleteInNotes('Trade status: offered', [
    'Linked booking',
    'Counterparty',
  ]);
  assert.match(encoded, /To complete: Linked booking · Counterparty/);
  assert.deepEqual(parseTradeToComplete(encoded), ['Linked booking', 'Counterparty']);
  assert.deepEqual(parseTradeToComplete('plain'), []);
  const buy = buildTradeBuyPayload({
    what: 'Points',
    amount_units: 10000,
    price_cents: 13000,
    date: '2026-11-26',
    stock_mode: 'for_booking',
    to_complete: ['Linked booking', 'Counterparty'],
  });
  assert.deepEqual(parseTradeToComplete(buy.restrictions), [
    'Linked booking',
    'Counterparty',
  ]);
  assert.deepEqual(
    listTradesToComplete([{ id: 'a1', name: 'UA pts', restrictions: buy.restrictions }]),
    [{ id: 'a1', name: 'UA pts', missing: ['Linked booking', 'Counterparty'] }],
  );
  assert.deepEqual(listTradesToComplete([{ id: 'a2', name: 'Done', restrictions: '' }]), []);
});

test('Trade desk search: name · missing fact; blank query matches all ≠ invent', () => {
  const row = {
    id: 'a1',
    name: 'UA pts batch',
    missing: ['Linked booking', 'Counterparty'],
  };
  assert.equal(tradeToCompleteMatchesSearch(row, ''), true);
  assert.equal(tradeToCompleteMatchesSearch(row, null), true);
  assert.equal(tradeToCompleteMatchesSearch(row, 'ua pts'), true);
  assert.equal(tradeToCompleteMatchesSearch(row, 'COUNTERPARTY'), true);
  assert.equal(tradeToCompleteMatchesSearch(row, 'a1'), true);
  assert.equal(tradeToCompleteMatchesSearch(row, 'expiration'), false);
  assert.equal(tradeToCompleteMatchesSearch({ name: null, missing: [] }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /tradeToCompleteMatchesSearch/);
  assert.match(src, /trade-search/);
  assert.match(src, /Search trade name or missing fact/);
});

test('Plan default stock is for this booking; to-complete lists missing optional facts', () => {
  assert.equal(TRADE_DEFAULT_STOCK_MODE, 'for_booking');
  assert.deepEqual(
    tradeToComplete({ side: 'Buy', stock_mode: 'for_booking', what: 'Points' }),
    ['Linked booking', 'Counterparty'],
  );
  assert.deepEqual(
    tradeToComplete({
      side: 'Buy',
      stock_mode: 'for_booking',
      booking_id: 'b1',
      counterparty_id: 'p1',
      what: 'Points',
    }),
    [],
  );
  assert.deepEqual(
    tradeToComplete({ side: 'Buy', stock_mode: 'hold_in_stock', what: 'Voucher' }),
    ['Counterparty', 'Expiration'],
  );
  assert.ok(tradeToComplete({ side: 'Sell', what: 'Points' }).includes('Buyer'));
});

test('trade rate is exact cents-per-point when divisible', () => {
  assert.equal(tradeRateMilliCentsPerUnit(100_000, 150_000), 150);
  assert.equal(formatTradeRateLabel('Points', 100_000, 150_000), '1.50¢ / pt');
  assert.equal(formatTradeRateLabel('Points', 100_000, 100_000), '1¢ / pt');
});

test('trade rate stays incomplete when amount missing — never invents $0', () => {
  assert.equal(tradeRateMilliCentsPerUnit(null, 100), null);
  assert.equal(formatTradeRateLabel('Points', null, 100), 'Rate incomplete');
  assert.equal(formatTradeRateLabel('Hotel credit', 10000, 8000), '80% of face');
});

test('buy payload maps points and money face into acquire_asset shape', () => {
  const points = buildTradeBuyPayload({
    what: 'Points',
    amount_units: 50_000,
    price_cents: 75_000,
    date: '2026-11-25',
    stock_mode: 'hold_in_stock',
    counterparty_id: 'seller-1',
  });
  assert.equal(points.unit, 'points');
  assert.equal(points.quantity, 50_000);
  assert.equal(points.cost, 75_000);
  assert.equal(points.ownership, 'Padova');
  assert.equal(points.source_booking_id, undefined);
  assert.equal(parseTradeStatus(points.restrictions), 'delivered');
  assert.deepEqual(parseTradeToComplete(points.restrictions), []);

  // Missing counterparty → offered + To complete (layer-1 still saves).
  const incomplete = buildTradeBuyPayload({
    what: 'Points',
    amount_units: 10_000,
    price_cents: 13_000,
    date: '2026-11-25',
    stock_mode: 'hold_in_stock',
  });
  assert.equal(parseTradeStatus(incomplete.restrictions), 'offered');
  assert.deepEqual(parseTradeToComplete(incomplete.restrictions), ['Counterparty']);

  const credit = buildTradeBuyPayload({
    what: 'Hotel credit',
    amount_units: 20_000,
    price_cents: 16_000,
    date: '2026-11-25',
    stock_mode: 'for_booking',
    booking_id: 'booking-1',
    counterparty_id: 'seller-1',
  });
  assert.equal(tradeUnit('Hotel credit'), 'money');
  assert.equal(credit.unit, 'money');
  assert.equal(credit.quantity, 20_000);
  assert.equal(credit.cost, 16_000);
  assert.equal(credit.source_booking_id, 'booking-1');
  assert.equal(credit.seller_id, 'seller-1');
});

test('sell payload maps to sell_asset fields', () => {
  const sell = buildTradeSellPayload({
    asset_id: 'asset-1',
    amount_units: 10_000,
    price_cents: 9_000,
    counterparty_id: 'buyer-1',
    date: '2026-11-25',
    paid: true,
    method: 'Zelle',
    what: 'Points',
  });
  assert.equal(sell.asset_id, 'asset-1');
  assert.equal(sell.buyer_id, 'buyer-1');
  assert.equal(sell.quantity, 10_000);
  assert.equal(sell.proceeds, 9_000);
  assert.equal(sell.paid, true);
  assert.equal(parseTradeStatus(sell.reference), 'paid');
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for isolated trade desk tests';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Trade Owner',
    email: 'trade-owner@example.invalid',
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

test('trade Buy accepts owner-added What kind', async () => {
  const asset = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Buy',
      what: 'Centurion lounge pass',
      amount_units: 15_000,
      price_cents: 12_000,
      date: '2026-11-26',
      stock_mode: 'hold_in_stock',
    },
  });
  const row = await one(db, 'SELECT kind, name FROM assets WHERE id=$1', [asset.id]);
  assert.equal(row.kind, 'Centurion lounge pass');
  assert.match(String(row.name), /Centurion lounge pass/);
});

test('trade Buy persists Trade status on asset restrictions', async () => {
  const asset = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Buy',
      what: 'Points',
      amount_units: 5_000,
      price_cents: 7_500,
      date: '2026-11-26',
      stock_mode: 'hold_in_stock',
      status: 'agreed',
      notes: 'Desk note',
    },
  });
  const row = await one(db, 'SELECT restrictions FROM assets WHERE id=$1', [asset.id]);
  assert.match(String(row.restrictions), /Desk note/);
  assert.equal(parseTradeStatus(String(row.restrictions)), 'agreed');
});

test('trade Buy posts through acquire_asset ledger with exact cost', async () => {
  const asset = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Buy',
      what: 'Points',
      amount_units: 40_000,
      price_cents: 60_000,
      date: '2026-11-25',
      stock_mode: 'hold_in_stock',
    },
  });
  assert.ok(asset.id);
  const row = await one(db, 'SELECT * FROM assets WHERE id=$1', [asset.id]);
  assert.equal(row.kind, 'Points');
  const bal = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [asset.id]);
  assert.equal(Number(bal.balance), 40_000);
  const lot = await one(db, 'SELECT * FROM asset_lots WHERE asset_id=$1', [asset.id]);
  assert.equal(Number(lot.cost), 60_000);
  assert.equal(Number(lot.quantity), 40_000);
});

test('trade Buy for_booking without booking still saves (hold until linked)', async () => {
  const asset = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Buy',
      what: 'FHR credit',
      amount_units: 20_000,
      price_cents: 18_500,
      date: '2026-11-26',
      stock_mode: 'for_booking',
    },
  });
  assert.ok(asset.id);
  const row = await one(db, 'SELECT kind, source_booking_id FROM assets WHERE id=$1', [asset.id]);
  assert.equal(row.kind, 'FHR credit');
  assert.equal(row.source_booking_id, null);
});

test('trade Sell requires asset + counterparty and posts sell_asset', async () => {
  const bought = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Buy',
      what: 'Voucher',
      amount_units: 25_000,
      price_cents: 20_000,
      date: '2026-11-25',
      stock_mode: 'hold_in_stock',
    },
  });
  const buyer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: {
      kind: 'person',
      name: 'Trade Buyer',
      roles: ['customer', 'traveler', 'seller'],
    },
  });
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'trade',
        data: {
          side: 'Sell',
          what: 'Voucher',
          amount_units: 25_000,
          price_cents: 22_000,
          date: '2026-11-25',
          asset_id: bought.id,
        },
      }),
    /buyer/i,
  );
  const sale = await execute(db, owner, {
    id: randomUUID(),
    kind: 'trade',
    data: {
      side: 'Sell',
      what: 'Voucher',
      amount_units: 25_000,
      price_cents: 22_000,
      date: '2026-11-25',
      asset_id: bought.id,
      counterparty_id: buyer.id,
      paid: false,
    },
  });
  assert.ok(sale.id);
  const remaining = await one(db, 'SELECT balance FROM asset_balances WHERE id=$1', [bought.id]);
  assert.equal(Number(remaining.balance), 0);
});
