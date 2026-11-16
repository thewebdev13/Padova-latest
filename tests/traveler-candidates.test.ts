import test from 'node:test';
import assert from 'node:assert/strict';
import {
  travelerCandidates,
  exactIdentityKey,
  similarTravelerName,
} from '../src/lib/traveler-candidates';
import { partyVisibility } from '../src/lib/visibility';
test('traveler candidates split only complete names, retain ambiguous labels, and never fuzzy-merge identities', () => {
  assert.deepEqual(travelerCandidates('Alex Winter; Jamie Summer').names, [
    'Alex Winter',
    'Jamie Summer',
  ]);
  assert.deepEqual(travelerCandidates('Alex Winter\nJamie Summer').names, [
    'Alex Winter',
    'Jamie Summer',
  ]);
  assert.deepEqual(travelerCandidates('Alex Winter & Jamie Summer').names, [
    'Alex Winter',
    'Jamie Summer',
  ]);
  for (const raw of [
    'Winter, Alex',
    'Alex and Jamie Winter',
    'Alex/Jamie',
    '2 passengers',
    'Winter family',
  ])
    assert.equal(travelerCandidates(raw).review, true, raw);
  assert.equal(exactIdentityKey('Alex Winter'), null);
  assert.equal(similarTravelerName('Alex Winter', 'Alex Wnter'), true);
  assert.equal(similarTravelerName('Alex Winter', 'Jamie Summer'), false);
  assert.notEqual(
    exactIdentityKey('Alex Winter', { dob: '1990-01-01' }),
    exactIdentityKey('Alex Winter', { dob: '1991-01-01' }),
  );
  assert.equal(
    partyVisibility(
      {
        name: 'Alex Winter',
        details: { traveler_source_claims: [{ raw_cell: { note: 'private' } }] },
      },
      { id: 'worker', name: 'Worker', role: 'EMPLOYEE', permissions: ['operations'] },
    ).details.traveler_source_claims,
    undefined,
  );
});
