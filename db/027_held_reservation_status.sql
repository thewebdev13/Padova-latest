-- Plan v1: Held PNR (with ticketing deadline stored on itinerary JSON).
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_reservation_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_reservation_status_check
  CHECK (reservation_status IN ('Held','Booked','Traveled','Cancelled','Refund Pending'));
INSERT INTO schema_migrations(version) VALUES('027_held_reservation_status');
