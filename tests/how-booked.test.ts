import assert from 'node:assert/strict';
import test from 'node:test';
import { HOW_BOOKED_PRESETS } from '../src/lib/entry-options';
import { howBookedHint, howBookedVisibility } from '../src/lib/how-booked';

test('Plan v1 how-booked presets are complete', () => {
  assert.deepEqual([...HOW_BOOKED_PRESETS], [
    'Cash / GDS',
    'Capital One',
    'Points (Padova-owned)',
    'Outside seller',
    'Hotel with commission',
    'Voucher / credit',
    'Hotel at program rate (FHR)',
    'Other',
  ]);
});

test('empty how-booked keeps booked-through visible and no specialty flags', () => {
  const v = howBookedVisibility('');
  assert.equal(v.showBookedThrough, true);
  assert.equal(v.showCap1Hints, false);
  assert.equal(v.showOutsideSeller, false);
  assert.equal(v.showPointsFunding, false);
  assert.match(howBookedHint(''), /Choose how it was booked/);
});

test('Capital One shows profile + Cap1 hints', () => {
  const v = howBookedVisibility('Capital One');
  assert.equal(v.showSourceProfile, true);
  assert.equal(v.showCap1Hints, true);
  assert.equal(v.showOutsideSeller, false);
  assert.equal(v.defaultPaymentType, 'Padova payment');
  assert.ok(v.paymentTypes.includes('Owned value'));
  assert.match(howBookedHint('Capital One'), /Cap1/);
});

test('Cap1 portal card may omit Padova saved card', async () => {
  const { cap1PortalCardAllowsMissingAccount } = await import('../src/lib/how-booked');
  assert.equal(
    cap1PortalCardAllowsMissingAccount({ howBooked: 'Capital One', channel: 'GDS' }),
    true,
  );
  assert.equal(
    cap1PortalCardAllowsMissingAccount({
      howBooked: 'Cash / GDS',
      channel: 'Capital One Travel',
    }),
    true,
  );
  assert.equal(
    cap1PortalCardAllowsMissingAccount({ howBooked: 'Cash / GDS', channel: 'GDS' }),
    false,
  );
});

test('Outside seller defaults payment type to Outside seller', () => {
  const v = howBookedVisibility('Outside seller');
  assert.equal(v.showOutsideSeller, true);
  assert.equal(v.defaultPaymentType, 'Outside seller');
  assert.match(howBookedHint('Outside seller'), /not Padova income/i);
});

test('Points and voucher presets expose funding hints only', () => {
  assert.equal(howBookedVisibility('Points (Padova-owned)').showPointsFunding, true);
  assert.equal(howBookedVisibility('Voucher / credit').showVoucherFunding, true);
  assert.equal(howBookedVisibility('Points (Padova-owned)').showOutsideSeller, false);
});

test('Hotel commission and FHR hints are distinct', () => {
  const hotel = howBookedVisibility('Hotel with commission');
  const fhr = howBookedVisibility('Hotel at program rate (FHR)');
  assert.equal(hotel.showHotelCommissionHints, true);
  assert.equal(hotel.showSrulyFeeHints, true);
  assert.equal(fhr.showFhrHints, true);
  assert.equal(fhr.showSourceProfile, true);
  assert.equal(fhr.showHotelCommissionHints, false);
  assert.match(howBookedHint('Hotel at program rate (FHR)'), /No default commission/i);
  assert.match(howBookedHint('Hotel at program rate (FHR)'), /perks/i);
});
