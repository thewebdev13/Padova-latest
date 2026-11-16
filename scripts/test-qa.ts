import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { assertQAIsolation } from '../src/lib/qa';

assertQAIsolation();
const base = process.argv[2];
if (!base || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(base))
  throw new Error('Explicit QA HTTPS URL required');
const owner = JSON.parse(await readFile('.data/remote-qa-access/owner.json', 'utf8'));
const tester = JSON.parse(await readFile('.data/remote-qa-access/tester.json', 'utf8'));
async function request(path: string, cookie = '', body?: unknown, origin = base) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { origin, 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  return { r, value };
}
async function signIn(access: unknown) {
  const { r, value } = await request('/api/auth', '', access);
  assert.equal(r.status, 200, JSON.stringify(value));
  assert.match(r.headers.get('set-cookie')!, /Secure/i);
  return r.headers.get('set-cookie')!.split(';')[0];
}
assert.equal((await request('/api/state')).r.status, 401);
assert.equal((await request('/api/qa/issues')).r.status, 401);
const cookie = await signIn(tester),
  ownerCookie = await signIn(owner);
const state = (await request('/api/state', cookie)).value;
assert.equal(state.qaMode, true);
assert.equal(state.developmentData, true);
assert.equal(state.actor.role, 'EMPLOYEE');
for (const permission of [
  'manage_users',
  'manage_settings',
  'view_accounting',
  'view_audit',
  'view_total_profit',
])
  assert.ok(!state.actor.permissions.includes(permission));
assert.equal(state.historicalPreparation, null);
assert.deepEqual(state.sourceReviews, []);
assert.ok(state.parties.every((p: any) => p.name.startsWith('QA ')));
assert.ok(state.bookings.every((b: any) => b.code.startsWith('QA-')));
assert.equal((await request('/api/users', cookie)).r.status, 403);
assert.equal(
  (
    await request('/api/users', cookie, {
      action: 'create',
      email: 'forged@example.invalid',
      name: 'Forged owner',
      role: 'OWNER',
    })
  ).r.status,
  403,
);
assert.equal(
  (await request('/api/state?type=historical&id=' + randomUUID(), cookie)).r.status,
  400,
);
assert.equal(
  (await request('/api/state?type=historical&id=' + randomUUID(), ownerCookie)).r.status,
  400,
);
for (const p of [
  '/admin',
  '/api/migrate',
  '/api/import',
  '/api/cutover',
  '/.env.local',
  '/.data/remote-qa-access/owner.json',
  '/docs/MASTER_REQUIREMENTS.md',
])
  assert.equal((await fetch(base + p, { headers: { cookie } })).status, 404, p);
async function command(kind: string, data: unknown, c = cookie) {
  return request('/api/commands', c, { id: randomUUID(), kind, data });
}
const denied = await command('payment_account', {
  name: 'Forbidden card',
  kind: 'Card',
  last_four: '1234',
});
assert.equal(denied.r.status, 403);
assert.equal(
  (
    await command('review_resolution', {
      case_id: randomUUID(),
      expected_version: 0,
      reason: 'Forbidden',
    })
  ).r.status >= 400,
  true,
);
assert.equal(
  (
    await request(
      '/api/commands',
      cookie,
      {
        id: randomUUID(),
        kind: 'party',
        data: { name: 'Forged origin', kind: 'person', roles: ['customer'] },
      },
      'https://invalid.example',
    )
  ).r.status,
  400,
);
const stamp = randomUUID().slice(0, 8);
const party = await command('party', {
  name: `QA Remote Traveler ${stamp}`,
  kind: 'person',
  roles: ['customer', 'traveler'],
});
assert.equal(party.r.status, 200, JSON.stringify(party.value));
const seller = await command('party', {
  name: `QA Remote Seller ${stamp}`,
  kind: 'person',
  roles: ['seller'],
});
assert.equal(seller.r.status, 200, JSON.stringify(seller.value));
for (const role of ['traveler', 'seller', 'airline', 'property'])
  assert.ok((await request(`/api/directory?q=QA&role=${role}`, cookie)).value.results.length);
// Fix the initial synthetic rental's catalog subtype through an audited Owner command.
const rental = state.parties.find((p: any) => p.name === 'QA Hertz Rental');
if (!rental.roles.includes('rental'))
  assert.equal(
    (
      await command(
        'edit_party',
        {
          party_id: rental.id,
          name: rental.name,
          roles: ['rental'],
          details: rental.details,
          reason: 'Correct synthetic QA rental catalog eligibility',
        },
        ownerCookie,
      )
    ).r.status,
    200,
  );
assert.ok((await request('/api/directory?q=QA&role=rental', cookie)).value.results.length);
const today = state.today;
const booking = await command('booking', {
  customer_id: party.value.result.id,
  product: 'Flight',
  channel: 'GDS',
  summary: `QA remote acceptance ${stamp}`,
  booked_on: today,
  travel_start: '2027-02-01',
  travel_end: '2027-02-01',
  traveler_ids: [party.value.result.id],
  sale: 25000,
  operational: {
    version: 1,
    sale_known: true,
    trip_type: 'One Way',
    notes: 'QA acceptance note',
    components: [],
  },
  travel_components_input: [
    {
      product: 'Flight',
      summary: 'QA JFK → MIA',
      travel_start: '2027-02-01',
      travel_end: '2027-02-01',
      details: { trip_type: 'One Way' },
    },
  ],
});
assert.equal(booking.r.status, 200, JSON.stringify(booking.value));
assert.match(booking.value.result.code, /^QA-/);
const savedBooking = (await request('/api/state', cookie)).value.bookings.find(
  (b: any) => b.id === booking.value.result.id,
);
const revision = await command('revise', {
  booking_id: booking.value.result.id,
  summary: `QA remote revised ${stamp}`,
  travel_start: '2027-02-02',
  travel_end: '2027-02-02',
  traveler_ids: [party.value.result.id],
  confirmations: ['QA-REMOTE'],
  date: today,
  reason: 'QA tester remote edit acceptance',
  itinerary: savedBooking.itinerary,
});
assert.equal(revision.r.status, 200, JSON.stringify(revision.value));
const issue = await request('/api/qa/issues', cookie, {
  type: 'Suggestion',
  section: 'New Booking',
  booking: booking.value.result.code,
  expected: 'QA security acceptance report',
  happened: 'Tester created and edited a fake booking over HTTPS successfully',
  notes: 'Automated acceptance; no action needed. card: 4111 1111 1111 1111',
});
assert.equal(issue.r.status, 200, JSON.stringify(issue.value));
const ownReport = await request('/api/qa/issues', ownerCookie, {
  type: 'Suggestion',
  section: 'Owner acceptance',
  expected: 'Private Owner report',
  happened: 'Owner list works',
  notes: 'Automated security acceptance',
});
assert.equal(ownReport.r.status, 200);
const mine = (await request('/api/qa/issues', cookie)).value;
assert.ok(mine.some((i: any) => i.id === issue.value.id));
assert.ok(!mine.some((i: any) => i.id === ownReport.value.id));
assert.ok(!JSON.stringify(mine).includes('4111 1111'));
const all = (await request('/api/qa/issues', ownerCookie)).value;
assert.ok(all.some((i: any) => i.id === issue.value.id));
const ownerState = (await request('/api/state', ownerCookie)).value;
assert.equal(ownerState.historicalPreparation, null);
assert.equal(ownerState.travelerReview, null); // Owner QA must not load historical file evidence.
const proof = {
  url: base,
  checked_at: new Date().toISOString(),
  qa_booking: booking.value.result.code,
  issue_id: issue.value.id,
  authenticated_https: true,
  secure_cookie: true,
  tester_create_edit: true,
  owner_issue_review: true,
  admin_blocked: true,
  source_and_cutover_blocked: true,
  production_credentials_absent: true,
  synthetic_only: true,
};
await writeFile('.data/qa-security-proof.json', JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
