'use client';
import SearchableSelect from './searchable-select';
import ChoiceInput from './choice-input';
import { FUNDING_KINDS } from '@/lib/entry-options';
import { isDirectBookingChannel } from '@/lib/entry-options';
import { assetUnit } from '@/lib/asset-units';
type R = Record<string, any>;

export default function BookingFunding({
  rows,
  onChange,
  state,
  bookingChannel = '',
  acquisitionSourceId = '',
  onAddSource,
  onAddAsset,
  travelComponents = [],
}: {
  rows: R[];
  onChange: (rows: R[]) => void;
  state: R;
  bookingChannel?: string;
  acquisitionSourceId?: string;
  onAddSource?: (index: number) => void;
  onAddAsset?: (index: number) => void;
  travelComponents?: R[];
}) {
  const update = (index: number, key: string, value: any) =>
    onChange(
      rows.map((row, i) =>
        i === index
          ? { ...row, [key]: value, ...(key === 'kind' ? { asset_id: '', face_amount: '' } : {}) }
          : row,
      ),
    );
  const choices = (items: R[]) => items.map((r) => ({ value: r.id, label: r.name }));
  return (
    <fieldset className="form-field full">
      <legend>How Padova paid / funded it</legend>
      <p>
        Record Padova’s cost separately from customer payments. Add another source for mixed
        funding. Mark paid only when the supplier or seller was actually paid.
      </p>
      {rows.map((row, index) => {
        const travel =
          row.travel_index !== undefined && row.travel_index !== ''
            ? travelComponents[Number(row.travel_index)]
            : undefined;
        const effectiveChannel = travel?.channel ?? bookingChannel;
        const effectiveSource = travel?.acquisition_source_id ?? acquisitionSourceId;
        const asset = state.assets.find((a: R) => a.id === row.asset_id);
        const points = asset && assetUnit(asset) !== 'money';
        const customerOwned = asset?.ownership === 'Customer';
        const owned = asset && (asset.ownership === 'Padova' || customerOwned);
        const cash = ['Card', 'Cash', 'Bank', 'Seller-funded reservation'].includes(row.kind);
        return (
          <fieldset key={index} className="form-grid">
            <legend>Funding source {index + 1}</legend>
            {travelComponents.length > 0 && (
              <div className="form-field full">
                <label htmlFor={`fund-${index}-travel`}>
                  Travel funded by source {index + 1} *
                </label>
                <select
                  id={`fund-${index}-travel`}
                  required
                  value={row.travel_index ?? ''}
                  onChange={(e) => update(index, 'travel_index', e.target.value)}
                >
                  <option value="">Choose travel…</option>
                  {travelComponents.map((travel, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {travel.product} ·{' '}
                      {travel.summary || travel.route || 'Travel component'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-field">
              <label htmlFor={`fund-${index}-kind`}>Funding type *</label>
              <ChoiceInput
                id={`fund-${index}-kind`}
                label="Funding type"
                options={FUNDING_KINDS}
                required
                value={row.kind ?? ''}
                onChange={(v) => update(index, 'kind', v)}
              />
            </div>
            {!cash && (
              <div className="form-field">
                <label htmlFor={`fund-${index}-asset`}>
                  Asset / customer credit / on-demand account
                </label>
                <SearchableSelect
                  id={`fund-${index}-asset`}
                  required={[
                    'Voucher',
                    'Airline credit',
                    'Hotel credit',
                    'Capital One credit',
                    'Gift card',
                    'Points',
                  ].includes(row.kind)}
                  options={choices(state.assets)}
                  value={row.asset_id ?? ''}
                  onChange={(v) => update(index, 'asset_id', v)}
                />
                {onAddAsset && (
                  <button className="btn small" type="button" onClick={() => onAddAsset(index)}>
                    Acquire / add asset, then return
                  </button>
                )}
              </div>
            )}
            {!cash && (
              <div className="form-field">
                <label htmlFor={`fund-${index}-face`}>
                  {asset?.unit === 'count'
                    ? 'Whole certificates used'
                    : points
                      ? 'Whole points used'
                      : 'Face amount (USD)'}{' '}
                  *
                </label>
                <input
                  id={`fund-${index}-face`}
                  type="number"
                  min={points ? '1' : '0.01'}
                  step={points ? '1' : '0.01'}
                  required
                  value={row.face_amount ?? ''}
                  onChange={(e) => update(index, 'face_amount', e.target.value)}
                />
              </div>
            )}
            {owned ? (
              <p>
                {customerOwned
                  ? 'Customer-owned value: ownership stays with the customer. Its use has zero Padova cost and creates no supplier payment.'
                  : 'Cost basis is calculated from the selected asset’s acquisition lots. It is not another cash payment.'}
              </p>
            ) : (
              <div className="form-field">
                <label htmlFor={`fund-${index}-cost`}>Actual cost (USD) *</label>
                <input
                  id={`fund-${index}-cost`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={row.cost ?? ''}
                  onChange={(e) => update(index, 'cost', e.target.value)}
                />
              </div>
            )}
            <div className="form-field full">
              <div className="form-field">
                <label htmlFor={`fund-${index}-seller`}>
                  {!owned && !isDirectBookingChannel(effectiveChannel) && !effectiveSource
                    ? 'Actual payee / acquisition source *'
                    : 'Actual supplier / payee override (optional)'}
                </label>
                <SearchableSelect
                  id={`fund-${index}-seller`}
                  required={!owned && !isDirectBookingChannel(effectiveChannel) && !effectiveSource}
                  options={choices(state.parties)}
                  value={row.seller_id ?? ''}
                  onChange={(v) => update(index, 'seller_id', v)}
                />
                {onAddSource && (
                  <button className="btn small" type="button" onClick={() => onAddSource(index)}>
                    Add new payee / source
                  </button>
                )}
              </div>
            </div>
            {!owned && (
              <div className="form-field">
                <label htmlFor={`fund-${index}-account`}>Payment account / card</label>
                <SearchableSelect
                  id={`fund-${index}-account`}
                  options={choices(state.paymentAccounts)}
                  value={row.account_id ?? ''}
                  onChange={(v) => update(index, 'account_id', v)}
                />
              </div>
            )}
            <div className="form-field">
              <label htmlFor={`fund-${index}-date`}>Acquired / funded on *</label>
              <input
                id={`fund-${index}-date`}
                type="date"
                required
                value={row.date}
                onChange={(e) => update(index, 'date', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`fund-${index}-reference`}>Supplier / payment reference</label>
              <input
                id={`fund-${index}-reference`}
                value={row.reference ?? ''}
                onChange={(e) => update(index, 'reference', e.target.value)}
              />
            </div>
            {!owned && (
              <label>
                <input
                  type="checkbox"
                  checked={!!row.settled}
                  onChange={(e) => update(index, 'settled', e.target.checked)}
                />{' '}
                Supplier actually paid
              </label>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove source {index + 1}
            </button>
          </fieldset>
        );
      })}
      <button
        className="btn"
        type="button"
        onClick={() => onChange([...rows, { date: state.today }])}
      >
        Add funding source
      </button>
    </fieldset>
  );
}
