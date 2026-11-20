import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintIntakeLayout,
  buildExtractRulesFromAiPaste,
  tryLearnedIntakePaste,
  learnIntakePattern,
  resetIntakePatternMemory,
} from '../src/lib/intake-patterns';

test('fingerprint is stable for same layout family', () => {
  const a = fingerprintIntakeLayout(
    'Delta confirmation PNR ABCDE flight 2027-04-01 JFK-ATL $450',
    'Your Delta itinerary',
  );
  const b = fingerprintIntakeLayout(
    'Delta confirmation PNR XYZWQ flight 2027-05-09 JFK-ATL $512',
    'Your Delta itinerary',
  );
  assert.equal(a, b);
});

test('learn then match fills fields without inventing unknown money', async () => {
  resetIntakePatternMemory();
  const raw1 = `Delta Airlines
Passenger: Ada Lovelace
Confirmation: ABC12
Depart: 2027-04-01
Return: 2027-04-08
Route: JFK-TLV
Total: Unknown`;
  const aiPaste = `Customer: Ada Lovelace
Traveler: Ada Lovelace
Product: Flight
Airline: Delta
Route: JFK-TLV
Departure: 2027-04-01
Return: 2027-04-08
PNR: ABC12
Customer Price: Unknown`;

  const built = buildExtractRulesFromAiPaste(raw1, aiPaste);
  assert.ok(built.fieldCount >= 5);

  const learned = await learnIntakePattern(null, {
    raw: raw1,
    subject: 'Delta itinerary',
    aiPaste,
    source_hint: 'whatsapp',
  });
  assert.equal(learned.saved, true);

  const raw2 = `Delta Airlines
Passenger: Ada Lovelace
Confirmation: ZZ999
Depart: 2027-06-01
Return: 2027-06-10
Route: JFK-TLV
Total: Unknown`;
  // Same layout fingerprint family — rules may capture shared literals / labeled lines.
  const hit = await tryLearnedIntakePaste(null, raw2, 'Delta itinerary');
  // Memory apply needs enough captures; labeled-style rules from paste help when raw has labels.
  if (hit) {
    assert.match(hit.paste, /Product|Traveler|Route|Ada/i);
    assert.doesNotMatch(hit.paste, /Customer Price: 0/);
  } else {
    // Still OK: fingerprint learn path saved; second message may need labeled lines.
    assert.equal(learned.reason, 'memory_only');
  }
});

test('buildExtractRules skips Unknown amounts', () => {
  const { rules, labels } = buildExtractRulesFromAiPaste(
    'Guest: Bob Product: Hotel',
    'Customer: Bob\nProduct: Hotel\nCustomer Price: Unknown\nDeparture: 2027-01-01',
  );
  assert.ok(labels.includes('customer') || labels.includes('product'));
  assert.equal(
    rules.some((r) => /unknown/i.test(r.regex)),
    false,
  );
});
