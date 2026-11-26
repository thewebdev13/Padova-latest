import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_REFERRER_RATE_HINT_BPS,
  formatReferralRateLabel,
  parseReferralRatePercentInput,
  partyReferralRateBps,
  suggestReferrerShareCents,
} from '../src/lib/referrer-defaults';

test('party referral rate stays Unknown when unset', () => {
  assert.equal(partyReferralRateBps({ roles: ['referrer'], details: {} }), null);
  assert.equal(partyReferralRateBps({ details: { referral_rate_bps: 1500 } }), 1500);
  assert.equal(partyReferralRateBps({ details: { referral_rate_bps: 15.5 } }), null);
  assert.equal(PLAN_REFERRER_RATE_HINT_BPS, 2000);
});

test('suggest referrer share uses exact bps math and never invents', () => {
  assert.equal(suggestReferrerShareCents(100000, 2000), 20000);
  assert.equal(suggestReferrerShareCents(100000, 1500), 15000);
  assert.equal(suggestReferrerShareCents(null, 2000), null);
  assert.equal(suggestReferrerShareCents(100000, null), null);
  // Fractional cents blocked (same integrity as commission %)
  assert.equal(suggestReferrerShareCents(333, 2000), null);
});

test('percent input parses to bps; blank is Unknown', () => {
  assert.equal(parseReferralRatePercentInput(''), null);
  assert.equal(parseReferralRatePercentInput('20'), 2000);
  assert.equal(parseReferralRatePercentInput('15.5'), 1550);
  assert.equal(formatReferralRateLabel(2000), '20%');
  assert.equal(formatReferralRateLabel(null), 'Unknown');
  assert.throws(() => parseReferralRatePercentInput('101'), /0–100/);
});
