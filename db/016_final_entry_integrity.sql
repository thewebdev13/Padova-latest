-- Additive only; no eligibility inferred from names or historical account labels.
ALTER TABLE payment_accounts ADD COLUMN ownership text NOT NULL DEFAULT 'Unknown' CHECK(ownership IN ('Unknown','Padova','Customer'));
ALTER TABLE payment_accounts ADD COLUMN supported_methods text[] NOT NULL DEFAULT '{}';
ALTER TABLE payment_accounts ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE payment_accounts ADD COLUMN owner_id uuid REFERENCES parties(id);
CREATE TABLE obligation_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL UNIQUE REFERENCES payment_allocations(id),
 obligation_id uuid NOT NULL REFERENCES supplier_obligations(id),
 command_id uuid NOT NULL REFERENCES commands(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX obligation_settlement_lookup ON obligation_settlements(obligation_id);
CREATE TABLE review_resolution_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL, evidence_id uuid,
 source_locator jsonb NOT NULL, issue_type text NOT NULL, proposed_mapping jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL CHECK(status IN ('Proposed','Held','Approved','Rejected','Resolved')),
 decision text NOT NULL, destination_ids jsonb NOT NULL DEFAULT '{}', actor text NOT NULL,
 command_id uuid NOT NULL REFERENCES commands(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_resolution_source ON review_resolution_events(source_key,created_at);
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['obligation_settlements','review_resolution_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC',t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,r); END IF;
  END LOOP;
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('016_final_entry_integrity');
