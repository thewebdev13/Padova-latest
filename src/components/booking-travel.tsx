'use client';
import SearchableSelect from './searchable-select';
import ChoiceInput from './choice-input';
import { BOOKING_CHANNELS } from '@/lib/entry-options';
type R = Record<string, any>;

export default function BookingTravel({
  rows,
  onChange,
  state,
  start,
  end,
  onAddParty,
}: {
  rows: R[];
  onChange: (rows: R[]) => void;
  state: R;
  start: string;
  end: string;
  onAddParty?: (index: number, field: 'provider_id' | 'acquisition_source_id') => void;
}) {
  const update = (index: number, field: string, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  if (!rows.length)
    return (
      <button className="btn" type="button" onClick={() => onChange([{ product: 'Other' }])}>
        Add separate travel components
      </button>
    );
  return (
    <fieldset className="form-field full">
      <legend>Travel components</legend>
      <p>
        Keep each flight, stay or other service separate. Assign each funding source to its travel
        below.
      </p>
      {rows.map((row, index) => (
        <fieldset className="form-grid" key={index}>
          <legend>Travel {index + 1}</legend>
          <div className="form-field">
            <label htmlFor={`travel-${index}-product`}>Travel {index + 1} product *</label>
            <ChoiceInput
              id={`travel-${index}-product`}
              label="Travel product"
              options={['Flight', 'Hotel', 'Car', 'Other']}
              required
              value={row.product ?? ''}
              onChange={(value) => update(index, 'product', value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`travel-${index}-summary`}>Travel {index + 1} summary</label>
            <input
              id={`travel-${index}-summary`}
              value={row.summary ?? ''}
              onChange={(e) => update(index, 'summary', e.target.value)}
            />
          </div>
          {(['provider_id', 'acquisition_source_id'] as const).map((field) => (
            <div className="form-field" key={field}>
              <label htmlFor={`travel-${index}-${field}`}>
                Travel {index + 1} {field === 'provider_id' ? 'provider' : 'source / broker'}
              </label>
              <SearchableSelect
                id={`travel-${index}-${field}`}
                value={row[field] ?? ''}
                options={state.parties
                  .filter(
                    (p: R) =>
                      field !== 'provider_id' ||
                      p.kind === 'supplier' ||
                      p.roles?.includes('supplier'),
                  )
                  .map((p: R) => ({ value: p.id, label: p.name }))}
                onChange={(value) => update(index, field, value)}
              />
              {onAddParty && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => onAddParty(index, field)}
                >
                  Add new {field === 'provider_id' ? 'provider' : 'source'} for travel {index + 1}
                </button>
              )}
            </div>
          ))}
          <div className="form-field">
            <label htmlFor={`travel-${index}-channel`}>Travel {index + 1} booked through *</label>
            <ChoiceInput
              id={`travel-${index}-channel`}
              label="Booked through"
              options={BOOKING_CHANNELS}
              required
              value={row.channel ?? ''}
              onChange={(value) => update(index, 'channel', value)}
            />
          </div>
          {(['travel_start', 'travel_end'] as const).map((field) => (
            <div className="form-field" key={field}>
              <label htmlFor={`travel-${index}-${field}`}>
                Travel {index + 1} {field === 'travel_start' ? 'start' : 'end'} *
              </label>
              <input
                id={`travel-${index}-${field}`}
                type="date"
                required
                value={row[field] || (field === 'travel_start' ? start : end) || ''}
                min={field === 'travel_end' ? row.travel_start || start : undefined}
                onChange={(e) => update(index, field, e.target.value)}
                onInput={(e) => update(index, field, e.currentTarget.value)}
              />
            </div>
          ))}
          <div className="form-field">
            <label htmlFor={`travel-${index}-reference`}>
              Travel {index + 1} PNR / confirmation
            </label>
            <input
              id={`travel-${index}-reference`}
              value={row.confirmations ?? ''}
              onChange={(e) => update(index, 'confirmations', e.target.value)}
            />
          </div>
          <div className="form-field full">
            <label htmlFor={`travel-${index}-route`}>
              Travel {index + 1} {row.product === 'Hotel' ? 'property / stay' : 'route / itinerary'}
            </label>
            <input
              id={`travel-${index}-route`}
              value={row.route ?? ''}
              onChange={(e) => update(index, 'route', e.target.value)}
            />
          </div>
          <button
            className="btn small"
            type="button"
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove travel {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        className="btn"
        type="button"
        onClick={() => onChange([...rows, { product: 'Other' }])}
      >
        Add another travel component
      </button>
    </fieldset>
  );
}
