'use client';
type Segment = { origin?: string; destination?: string; date?: string; flight_number?: string };
export default function FlightSegments({
  value,
  onChange,
}: {
  value: Segment[];
  onChange: (segments: Segment[]) => void;
}) {
  return (
    <div className="full segment-editor">
      {value.map((s, i) => (
        <div className="segment-row" key={i}>
          {(['origin', 'destination', 'date', 'flight_number'] as const).map((key) => (
            <input
              key={key}
              type={key === 'date' ? 'date' : 'text'}
              aria-label={`Segment ${i + 1} ${key}`}
              placeholder={key.replace('_', ' ')}
              value={s[key] ?? ''}
              onInput={(e) => {
                if (key === 'date')
                  onChange(
                    value.map((r, j) => (i === j ? { ...r, date: e.currentTarget.value } : r)),
                  );
              }}
              onChange={(e) =>
                onChange(value.map((r, j) => (i === j ? { ...r, [key]: e.target.value } : r)))
              }
            />
          ))}
          <button
            type="button"
            className="btn small"
            disabled={value.length <= 2}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...value, {}])}>
        + Add segment
      </button>
    </div>
  );
}
