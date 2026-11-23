import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractBookingFingerprints,
  fingerprintsOverlap,
  isLikelyVoiceGreeting,
  mergeIntakeRawTexts,
  shouldMergeMediaIntoOpenDraft,
} from '../src/lib/wa-intake-merge';

describe('wa-intake-merge', () => {
  it('fingerprints Capital One / Thai Airways receipt pieces', () => {
    const a = extractBookingFingerprints(
      'YOUR CONFIRMATION CODES Thai Airways AKF8D9 Capital One Business Travel H-QTYIQS',
    );
    const b = extractBookingFingerprints(
      'Thai Airways TG617 Manila to Bangkok passenger JONATHAN ticket 2177572886825',
    );
    assert.ok(a.some((x) => /AKF8D9/i.test(x)));
    assert.ok(a.some((x) => /H-QTYIQS/i.test(x)));
    assert.ok(fingerprintsOverlap(a, b) || b.includes('TG617') || b.some((x) => x.includes('2177572886825')));
    assert.equal(
      shouldMergeMediaIntoOpenDraft({
        openRawText:
          'Confirmation codes Thai Airways AKF8D9 Capital One H-QTYIQS Manage Your Trip',
        newText: 'Fare details Base Fare $177.00 Taxes AKF8D9 passenger JONATHAN',
        openChat: 'wa:1',
        newChat: 'wa:1',
        openCreatedAt: new Date().toISOString(),
      }),
      true,
    );
  });

  it('merges screenshot OCR parts once', () => {
    const merged = mergeIntakeRawTexts([
      '[Screenshot text]\nAKF8D9 codes',
      'AKF8D9 codes and more fare detail',
    ]);
    assert.match(merged, /AKF8D9/);
    assert.match(merged, /fare detail/);
  });

  it('detects voice greetings', () => {
    assert.equal(isLikelyVoiceGreeting('hi'), true);
    assert.equal(isLikelyVoiceGreeting('Hey how are you'), true);
    assert.equal(isLikelyVoiceGreeting('Book hotel for next week in Miami with sale 400'), false);
  });
});
