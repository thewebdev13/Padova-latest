CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 name text NOT NULL, password_hash text NOT NULL, permissions text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, staff_id uuid NOT NULL REFERENCES staff(id), expires_at timestamptz NOT NULL);
CREATE TABLE parties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK (kind IN ('person','company','family','supplier','partner')),
 name text NOT NULL CHECK(length(trim(name))>0), email text, phone text, roles text[] NOT NULL DEFAULT '{}',
 details jsonb NOT NULL DEFAULT '{}', archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE party_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES parties(id),
 group_id uuid NOT NULL REFERENCES parties(id), relationship text NOT NULL, rules jsonb NOT NULL DEFAULT '{}',
 UNIQUE(person_id,group_id,relationship), CHECK(person_id<>group_id)
);
CREATE TABLE traveler_private (person_id uuid PRIMARY KEY REFERENCES parties(id), legal_first text, middle_name text, last_name text,
 dob date, ktn text, documents jsonb NOT NULL DEFAULT '[]', memberships jsonb NOT NULL DEFAULT '[]', preferences jsonb NOT NULL DEFAULT '{}');
CREATE TABLE payment_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL,
 last_four text CHECK(last_four ~ '^[0-9]{4}$'), archived_at timestamptz);
CREATE SEQUENCE booking_number START 1001;
CREATE TABLE bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE DEFAULT ('PDV-' || nextval('booking_number')),
 customer_id uuid NOT NULL REFERENCES parties(id), supplier_id uuid REFERENCES parties(id), product text NOT NULL,
 channel text NOT NULL, summary text NOT NULL, booked_on date NOT NULL, travel_start date NOT NULL, travel_end date NOT NULL,
 reservation_status text NOT NULL DEFAULT 'Booked' CHECK(reservation_status IN ('Booked','Traveled','Cancelled','Refund Pending')),
 confirmation_status text NOT NULL DEFAULT 'Confirmed', document_status text NOT NULL DEFAULT 'Not prepared',
 itinerary jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'), created_at timestamptz NOT NULL DEFAULT now(), CHECK(travel_end>=travel_start)
);
CREATE TABLE booking_travelers (booking_id uuid NOT NULL REFERENCES bookings(id), person_id uuid NOT NULL REFERENCES parties(id),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Cancelled')), PRIMARY KEY(booking_id,person_id));
CREATE TABLE confirmations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 reference text NOT NULL, provider text NOT NULL DEFAULT '', UNIQUE(booking_id,reference,provider));
CREATE TABLE itinerary_revisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 revision integer NOT NULL, snapshot jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,revision));
CREATE TABLE commands (id uuid PRIMARY KEY, actor text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
 result jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE charges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 kind text NOT NULL, amount bigint NOT NULL CHECK(abs(amount)<=9000000000000), effective_on date NOT NULL,
 command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), direction text NOT NULL CHECK(direction IN ('customer','supplier','commission','referral','customer_refund','supplier_refund','asset_purchase','asset_sale')),
 party_id uuid NOT NULL REFERENCES parties(id), amount bigint NOT NULL CHECK(amount>0 AND amount<=9000000000000),
 paid_on date NOT NULL, method text NOT NULL, reference text NOT NULL DEFAULT '', verification text NOT NULL DEFAULT 'Unverified',
 account_id uuid REFERENCES payment_accounts(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payment_adjustments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id),
 delta bigint NOT NULL, reason text NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE payment_allocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id),
 booking_id uuid NOT NULL REFERENCES bookings(id), amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE supplier_obligations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 supplier_id uuid NOT NULL REFERENCES parties(id), amount bigint NOT NULL CHECK(amount>0), effective_on date NOT NULL,
 description text NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL,
 issuer text NOT NULL, holder_id uuid REFERENCES parties(id), seller_id uuid REFERENCES parties(id), source_booking_id uuid REFERENCES bookings(id),
 ownership text NOT NULL DEFAULT 'Padova' CHECK(ownership IN ('Padova','External','Customer')), expires_on date,
 restrictions text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE asset_lots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id),
 quantity bigint NOT NULL CHECK(quantity>0), cost bigint NOT NULL CHECK(cost>=0), acquired_on date NOT NULL,
 source_lot_id uuid REFERENCES asset_lots(id), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE asset_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id),
 lot_id uuid NOT NULL REFERENCES asset_lots(id), booking_id uuid REFERENCES bookings(id), quantity bigint NOT NULL CHECK(quantity<>0),
 basis bigint NOT NULL, kind text NOT NULL, effective_on date NOT NULL, original_movement_id uuid REFERENCES asset_movements(id),
 command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE funding_components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 kind text NOT NULL, face_amount bigint NOT NULL CHECK(face_amount>0), cost bigint NOT NULL CHECK(cost>=0),
 asset_id uuid REFERENCES assets(id), asset_movement_id uuid REFERENCES asset_movements(id), account_id uuid REFERENCES payment_accounts(id),
 seller_id uuid REFERENCES parties(id), reference text NOT NULL DEFAULT '', effective_on date NOT NULL,
 command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE asset_sales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id),
 buyer_id uuid NOT NULL REFERENCES parties(id), quantity bigint NOT NULL CHECK(quantity>0), proceeds bigint NOT NULL CHECK(proceeds>=0),
 basis bigint NOT NULL CHECK(basis>=0), effective_on date NOT NULL, payment_id uuid REFERENCES payments(id), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 payer_id uuid NOT NULL REFERENCES parties(id), collector_id uuid REFERENCES parties(id), gross bigint NOT NULL CHECK(gross>=0),
 retained bigint NOT NULL CHECK(retained>=0 AND retained<=gross), due_on date NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE commission_allocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commission_id uuid NOT NULL REFERENCES commissions(id),
 payment_id uuid NOT NULL REFERENCES payments(id), amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE referrals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
 referrer_id uuid NOT NULL REFERENCES parties(id), basis text NOT NULL CHECK(basis IN ('profit','fixed')),
 rate_bps integer NOT NULL DEFAULT 0 CHECK(rate_bps BETWEEN 0 AND 10000), fixed_amount bigint NOT NULL DEFAULT 0 CHECK(fixed_amount>=0),
 after_receipt boolean NOT NULL DEFAULT true, due_on date NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE referral_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referral_id uuid NOT NULL REFERENCES referrals(id),
 payment_id uuid NOT NULL REFERENCES payments(id), amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE refunds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 traveler_id uuid REFERENCES parties(id), funding_component_id uuid REFERENCES funding_components(id), supplier_expected bigint NOT NULL CHECK(supplier_expected>=0),
 customer_due bigint NOT NULL CHECK(customer_due>=0), due_on date NOT NULL, reason text NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE refund_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_id uuid NOT NULL REFERENCES refunds(id),
 kind text NOT NULL CHECK(kind IN ('supplier_received','customer_paid','customer_credit_handed_over')),
 form text NOT NULL, amount bigint NOT NULL CHECK(amount>0), payment_id uuid REFERENCES payments(id), asset_id uuid REFERENCES assets(id),
 effective_on date NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE profit_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid REFERENCES bookings(id),
 kind text NOT NULL, amount bigint NOT NULL, effective_on date NOT NULL, command_id uuid NOT NULL REFERENCES commands(id));
CREATE TABLE journal_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL REFERENCES commands(id),
 account text NOT NULL, debit bigint NOT NULL DEFAULT 0 CHECK(debit>=0), credit bigint NOT NULL DEFAULT 0 CHECK(credit>=0),
 booking_id uuid REFERENCES bookings(id), party_id uuid REFERENCES parties(id), effective_on date NOT NULL,
 CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE TABLE tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, record_type text, record_id uuid,
 assignee_id uuid REFERENCES staff(id), due_on date, priority text NOT NULL DEFAULT 'Normal', status text NOT NULL DEFAULT 'Open',
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attention_resolutions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attention_key text NOT NULL,
 fingerprint text NOT NULL, resolver text NOT NULL, note text NOT NULL, resolved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attention_key,fingerprint));
CREATE TABLE notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_type text NOT NULL, record_id uuid NOT NULL,
 body text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_type text NOT NULL, record_id uuid NOT NULL,
 storage_key text NOT NULL UNIQUE, original_name text NOT NULL, content_type text NOT NULL, bytes bigint NOT NULL CHECK(bytes>=0),
 classification text NOT NULL, uploaded_by uuid REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE migration_staging (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_file text NOT NULL, source_tab text, source_row text,
 raw_data jsonb NOT NULL, status text NOT NULL DEFAULT 'Needs Review', reason text NOT NULL, reviewed_by uuid REFERENCES staff(id));
CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL REFERENCES commands(id),
 actor text NOT NULL, kind text NOT NULL, record_id uuid, before_value jsonb, after_value jsonb NOT NULL,
 reason text, created_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION prevent_history_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'History is immutable; post a correcting event'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['charges','payments','payment_adjustments','payment_allocations','supplier_obligations','asset_lots','asset_movements','funding_components','asset_sales','commissions','commission_allocations','referrals','referral_payments','refunds','refund_movements','profit_movements','journal_lines','audit_events','itinerary_revisions','attention_resolutions'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
CREATE INDEX booking_customer_idx ON bookings(customer_id);
CREATE INDEX booking_travel_idx ON bookings(travel_start,travel_end);
CREATE INDEX confirmation_reference_idx ON confirmations(lower(reference));
CREATE INDEX party_name_idx ON parties(lower(name));
CREATE INDEX allocation_booking_idx ON payment_allocations(booking_id);
CREATE INDEX allocation_payment_idx ON payment_allocations(payment_id);
CREATE INDEX asset_movement_lot_idx ON asset_movements(lot_id);
CREATE INDEX funding_booking_idx ON funding_components(booking_id);
CREATE INDEX profit_date_idx ON profit_movements(effective_on);
CREATE INDEX audit_record_idx ON audit_events(record_id,created_at);
CREATE INDEX note_record_idx ON notes(record_id);
CREATE VIEW payment_balances AS SELECT p.*, p.amount+COALESCE((SELECT sum(delta) FROM payment_adjustments a WHERE a.payment_id=p.id),0)::bigint AS current_amount,
 COALESCE((SELECT sum(amount) FROM payment_allocations a WHERE a.payment_id=p.id),0)::bigint AS allocated,
 COALESCE((SELECT sum(amount) FROM commission_allocations a WHERE a.payment_id=p.id),0)::bigint AS commission_allocated FROM payments p;
CREATE VIEW asset_balances AS SELECT a.*, COALESCE((SELECT sum(quantity) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 COALESCE((SELECT sum(basis) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint AS remaining_basis FROM assets a;
CREATE VIEW booking_balances AS SELECT b.*,
 COALESCE((SELECT sum(amount) FROM charges c WHERE c.booking_id=b.id),0)::bigint AS sale,
 COALESCE((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='customer'),0)::bigint AS paid,
 COALESCE((SELECT sum(cost) FROM funding_components f WHERE f.booking_id=b.id),0)::bigint AS funding_cost,
 COALESCE((SELECT sum(amount) FROM supplier_obligations o WHERE o.booking_id=b.id),0)::bigint AS obligations,
 COALESCE((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='supplier'),0)::bigint AS supplier_paid,
 COALESCE((SELECT sum(gross-retained) FROM commissions c WHERE c.booking_id=b.id),0)::bigint AS expected_commission,
 COALESCE((SELECT sum(amount) FROM profit_movements m WHERE m.booking_id=b.id),0)::bigint AS profit,
 COALESCE((SELECT sum(customer_due) FROM refunds r WHERE r.booking_id=b.id),0)::bigint AS refund_due FROM bookings b;
INSERT INTO schema_migrations(version) VALUES ('001_initial');
