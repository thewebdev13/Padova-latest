-- Plan v1 Held PNR: padova.bookings.status is unconstrained text via adapter.
-- App writes reservation_status='Held' and itinerary.ticketing_deadline (YYYY-MM-DD).
-- No destructive adapter change. Reviewed QA apply not required for status values.
SELECT 1;
