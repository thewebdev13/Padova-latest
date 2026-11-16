'use client';

export function pageSlice<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    page: safePage,
    totalPages,
    total,
    items: slice,
    from: total ? start + 1 : 0,
    to: total ? start + slice.length : 0,
  };
}

function pageWindow(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (current >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (const n of sorted) {
    if (out.length && n - (out[out.length - 1] as number) > 1) out.push('…');
    out.push(n);
  }
  return out;
}

export default function ListPager({
  page,
  totalPages,
  total,
  from,
  to,
  onPage,
  label = 'items',
}: {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  if (total <= 0) return null;
  if (totalPages <= 1) {
    return (
      <p className="list-pager list-pager-only muted" role="status">
        Showing {total} {label}
      </p>
    );
  }
  const numbers = pageWindow(page, totalPages);
  return (
    <nav className="list-pager" aria-label={`${label} pagination`}>
      <p className="muted" role="status">
        Showing {from}–{to} of {total}
      </p>
      <div className="list-pager-controls">
        <button
          type="button"
          className="btn small"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        {numbers.map((n, i) =>
          n === '…' ? (
            <span key={`e-${i}`} className="list-pager-ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`btn small${n === page ? ' primary' : ''}`}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn small"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
