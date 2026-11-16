import { historicalSourceValue } from '@/lib/historical-source-values';

export default function HistoricalDraftDetails({ sources }: { sources: Record<string, any>[] }) {
  return (
    <>
      {sources.map((source, index) => {
        const fields = Object.entries(source.original_fields ?? {})
          .map(([label, value]) => [label, historicalSourceValue(value)])
          .filter(([, value]) => value !== '');
        return (
          <section className="card" key={index}>
            <div className="card-header">
              <h2>
                {source.workbook_title || 'Original source'} · {source.tab || 'Sheet'} · row{' '}
                {source.row ?? 'Unknown'}
              </h2>
            </div>
            <div className="section-body">
              <p>
                Original recorded information. Payment and cost entries below are source claims, not
                confirmation of posted or settled balances.
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Recorded information</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([label, value]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
