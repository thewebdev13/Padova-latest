import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cancelScopeFieldErrors,
  mapErrorMessageToFields,
  requiredFieldMessage,
  isEmptyFieldValue,
} from '../src/lib/form-field-errors';

describe('form-field-errors', () => {
  it('maps transfer accounts must differ onto both account fields', () => {
    const mapped = mapErrorMessageToFields('Transfer accounts must differ', [
      'source_asset_id',
      'target_asset_id',
      'kind',
    ]);
    assert.equal(mapped.leftover, '');
    assert.equal(
      mapped.fieldErrors.source_asset_id,
      'Sending and receiving accounts must be different',
    );
    assert.equal(
      mapped.fieldErrors.target_asset_id,
      'Sending and receiving accounts must be different',
    );
  });

  it('maps cancel traveler vs travel-component conflict to both scope fields', () => {
    const mapped = mapErrorMessageToFields(
      'Use either a booking traveler cancellation or a travel-component cancellation',
      ['travel_component_id', 'traveler_id', 'booking_id', 'reason'],
    );
    assert.equal(mapped.leftover, '');
    assert.match(mapped.fieldErrors.travel_component_id ?? '', /either one flight\/stay OR one traveler/i);
    assert.match(mapped.fieldErrors.traveler_id ?? '', /either one flight\/stay OR one traveler/i);
  });

  it('keeps unmapped permission errors as leftover banner text', () => {
    const mapped = mapErrorMessageToFields('This action is not allowed', ['booking_id']);
    assert.equal(mapped.leftover, 'This action is not allowed');
    assert.deepEqual(mapped.fieldErrors, {});
  });

  it('maps seller eligibility onto party / seller fields', () => {
    const mapped = mapErrorMessageToFields('Selected party is not eligible as seller', [
      'party_id',
      'amount',
      'direction',
    ]);
    assert.equal(mapped.leftover, '');
    assert.match(mapped.fieldErrors.party_id ?? '', /Purchased From|seller party/i);
  });

  it('maps missing payee onto seller_id for Record cost', () => {
    const mapped = mapErrorMessageToFields(
      'Choose the actual supplier/payee or acquisition source; an indirect channel does not identify who Padova owes',
      ['seller_id', 'cost', 'kind'],
    );
    assert.equal(mapped.leftover, '');
    assert.match(mapped.fieldErrors.seller_id ?? '', /Purchased From|payee/i);
  });

  it('detects cancel scope conflict client-side', () => {
    assert.deepEqual(cancelScopeFieldErrors({ travel_component_id: '', traveler_id: 'p1' }), {});
    assert.deepEqual(cancelScopeFieldErrors({ travel_component_id: 't1', traveler_id: '' }), {});
    const both = cancelScopeFieldErrors({ travel_component_id: 't1', traveler_id: 'p1' });
    assert.ok(both.travel_component_id);
    assert.ok(both.traveler_id);
  });

  it('required and empty helpers', () => {
    assert.equal(requiredFieldMessage('Booking'), 'Booking is required');
    assert.equal(isEmptyFieldValue(''), true);
    assert.equal(isEmptyFieldValue('x'), false);
    assert.equal(isEmptyFieldValue(0), false);
  });
});
