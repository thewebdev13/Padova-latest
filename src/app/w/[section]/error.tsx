'use client';

/** Catch render crashes on /w/* so the whole shell does not go blank. */
export default function WorkspaceSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div>
        <p style={{ fontSize: 18, fontWeight: 650, marginBottom: 8 }}>This page couldn’t load</p>
        <p style={{ color: '#5b6b66', marginBottom: 16, maxWidth: 420 }}>
          Reload to try again, or go back. Bad AI intake drafts stay under Drafts, delete those
          only; live bookings are unchanged.
        </p>
        <p style={{ color: '#8a9692', fontSize: 12, marginBottom: 16 }}>
          {error?.message ? String(error.message).slice(0, 180) : ''}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#10231f',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/w/transactions';
            }}
            style={{
              background: '#fff',
              color: '#10231f',
              border: '1px solid #d5ddd9',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
