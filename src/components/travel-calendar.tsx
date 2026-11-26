'use client';
import { useState } from 'react';
import {
  addDays,
  calendarEntries,
  calendarEntryMatchesSearch,
  calendarEntryVisibleWithCancelled,
  calendarLanes,
  tripTitle,
} from '@/lib/travel-presentation';
import { dateLabel } from '@/lib/display-date';
type R = Record<string, any>;
export default function TravelCalendar({
  bookings,
  components,
  today,
  open,
  copyLink,
}: {
  bookings: R[];
  components: R[];
  today: string;
  open: (id: string) => void;
  /** Plan shareable booking address — blank id never called. */
  copyLink?: (bookingId: string) => void;
}) {
  const [anchor, setAnchor] = useState(today),
    [mode, setMode] = useState('Month'),
    [filter, setFilter] = useState('All'),
    [query, setQuery] = useState(''),
    [hideCancelled, setHideCancelled] = useState(false);
  const first = mode === 'Month' ? anchor.slice(0, 7) + '-01' : anchor;
  const offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);
  const count =
    mode === 'Week'
      ? 1
      : Math.ceil(
          (offset + new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate()) /
            7,
        );
  const entries = calendarEntries(bookings, components, filter).filter(
    (e) =>
      calendarEntryMatchesSearch(e, query) &&
      calendarEntryVisibleWithCancelled(e, hideCancelled),
  );
  return (
    <>
      <div className="toolbar calendar-controls">
        {['All', 'Flight', 'Hotel', 'Car', 'Other'].map((name) => (
          <button
            type="button"
            key={name}
            className={`btn small ${filter === name ? 'primary' : ''}`}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
        <label className="directory-search" htmlFor="calendar-search">
          {' '}
          <input
            id="calendar-search"
            type="search"
            aria-label="Search calendar"
            placeholder="Search booking #, customer or trip…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`btn small ${hideCancelled ? 'primary' : ''}`}
          aria-pressed={hideCancelled}
          aria-label="Hide cancelled trips"
          onClick={() => setHideCancelled((v) => !v)}
        >
          Hide cancelled
        </button>
        <div className="tabs">
          {['Month', 'Week'].map((v) => (
            <button key={v} className={mode === v ? 'active' : ''} onClick={() => setMode(v)}>
              {v}
            </button>
          ))}
        </div>
        <button
          className="btn"
          aria-label={`Previous ${mode.toLowerCase()}`}
          onClick={() =>
            setAnchor(
              mode === 'Week'
                ? addDays(anchor, -7)
                : new Date(
                    Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 2, 1, 12),
                  )
                    .toISOString()
                    .slice(0, 10),
            )
          }
        >
          ‹
        </button>
        <strong>
          {dateLabel(first, {
            month: 'long',
            year: 'numeric',
            ...(mode === 'Week' ? { day: 'numeric' as const } : {}),
          })}
        </strong>
        <button
          className="btn"
          aria-label={`Next ${mode.toLowerCase()}`}
          onClick={() =>
            setAnchor(
              mode === 'Week'
                ? addDays(anchor, 7)
                : new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 1, 12))
                    .toISOString()
                    .slice(0, 10),
            )
          }
        >
          ›
        </button>
        <button className="btn" onClick={() => setAnchor(today)}>
          Today
        </button>
      </div>
      <div className="calendar-legend">
        {['Flight', 'Hotel', 'Car', 'Other'].map((type) => (
          <span key={type} className={`trip-${type.toLowerCase()}`}>
            {type}
          </span>
        ))}
        <span>
          Orange edge: needs attention · strike-through: cancelled / refund pending
          {copyLink ? ' · right-click trip: copy link' : ''}
        </span>
      </div>
      <div className="card travel-calendar">
        <div className="calendar-week">
          <div className="calendar-days">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <strong key={d}>{d}</strong>
            ))}
          </div>
        </div>
        {Array.from({ length: count }, (_, week) => {
          const days = Array.from({ length: 7 }, (_, i) => addDays(start, week * 7 + i));
          const bars = calendarLanes(entries, days);
          return (
            <div className="calendar-week" key={days[0]}>
              <div className="calendar-days">
                {days.map((day, i) => (
                  <button
                    className={`${i > 4 ? 'weekend' : ''} ${day === today ? 'is-today' : ''} ${day.slice(0, 7) !== anchor.slice(0, 7) ? 'outside-month' : ''}`}
                    key={day}
                    onClick={() => {
                      setAnchor(day);
                      setMode('Week');
                    }}
                    aria-label={`Show week of ${day}`}
                  >
                    {Number(day.slice(-2))}
                  </button>
                ))}
              </div>
              <div className="calendar-bars" style={{ minHeight: mode === 'Month' ? 92 : 160 }}>
                {bars
                  .filter((b) => mode === 'Week' || b.lane < 6)
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`calendar-bar trip-${b.product.toLowerCase()} ${b.attention ? 'needs-attention' : ''} ${b.cancelled ? 'cancelled-trip' : ''}`}
                      style={{ gridColumn: `${b.start + 1} / ${b.end + 2}`, gridRow: b.lane + 1 }}
                      title={`${tripTitle(b)}\n${dateLabel(b.travel_start)}${b.travel_end && b.travel_end !== b.travel_start ? ` – ${dateLabel(b.travel_end)}` : ''}\nTravelers: ${b.travelers || 'Unknown'}\nCustomer: ${b.customer}\n${b.code}${b.cancelled ? '\nCancelled / refund pending' : ''}${copyLink && b.booking_id ? '\nRight-click: copy link' : ''}`}
                      aria-label={`${tripTitle(b)}${copyLink && b.booking_id ? '. Right-click to copy shareable link' : ''}`}
                      onClick={() => open(b.booking_id)}
                      onContextMenu={(e) => {
                        if (!copyLink || !b.booking_id) return;
                        e.preventDefault();
                        copyLink(String(b.booking_id));
                      }}
                    >
                      {({ Flight: '↗', Hotel: '▤', Car: '▰', Other: '•' } as R)[b.product]}{' '}
                      {tripTitle(b)} · {b.travelers || 'Traveler missing'}
                    </button>
                  ))}
              </div>
              {mode === 'Month' && bars.some((b) => b.lane >= 6) && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setAnchor(days[0]);
                    setMode('Week');
                  }}
                >
                  +{bars.filter((b) => b.lane >= 6).length} more · View week
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
