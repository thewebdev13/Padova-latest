type Source = Record<string, any>;
export default function HistoricalSourceDetails({ sources }: { sources: Source[] }) {
  if (!sources?.length) return null;
  return (
    <section className="card" style={{ margin: '20px 0' }}>
      <details className="section-body">
        <summary>Historical Source Details ({sources.length} linked source rows)</summary>
        <p className="muted" style={{ margin: '12px 0' }}>
          Original evidence is preserved below. A payment, funding or cost claim here is not proof
          that a financial transaction was posted or verified.
        </p>
        {sources.map((source, index) => (
          <details key={source.evidence_id ?? index} style={{ margin: '14px 0' }}>
            <summary>
              {source.workbook_title ?? source.workbook_id ?? 'Original source'} ·{' '}
              {source.tab ?? source.sheet ?? 'Tab not supplied'} · row{' '}
              {source.row ?? 'not supplied'}
            </summary>
            <p style={{ margin: '10px 0' }}>
              Snapshot / batch: {source.batch_id ?? source.snapshot_id ?? 'Not supplied'} ·
              Evidence:{' '}
              {(source.evidence_ids ?? []).join(', ') || source.evidence_id || 'Not yet mapped'}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Original field / column</th>
                    <th>Original value / note</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(source.original_fields ?? {}).map(([field, raw]) => {
                    const value = raw as any;
                    return (
                      <tr key={field}>
                        <td>{field}</td>
                        <td style={{ whiteSpace: 'pre-wrap', minWidth: 180 }}>
                          {typeof value === 'object' && value !== null
                            ? JSON.stringify(value, null, 2)
                            : String(value ?? '')}
                        </td>
                        <td>
                          {source.field_classifications?.[field] ??
                            'Preserved source detail; not an automatic posting'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 10 }}>
              <summary>Complete original row payload and provenance</summary>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {JSON.stringify(source, null, 2)}
              </pre>
            </details>
          </details>
        ))}
      </details>
    </section>
  );
}
