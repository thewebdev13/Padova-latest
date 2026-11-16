-- Synthetic local fixture. Hosted equivalent is prepared separately; never auto-run on Supabase.
CREATE TABLE pt_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legacy_id text UNIQUE,
 parent_id uuid REFERENCES pt_organizations(id), accounting_party_id uuid REFERENCES parties(id),
 name text NOT NULL CHECK(length(trim(name))>0), location text NOT NULL DEFAULT '',
 country text NOT NULL DEFAULT '', region text NOT NULL DEFAULT '', service_areas text NOT NULL DEFAULT '',
 summary text NOT NULL DEFAULT '', relationship text NOT NULL DEFAULT 'prospect'
 CHECK(relationship IN ('prospect','interested','awaiting_reply','active','paused','declined','ended','do_not_contact')),
 do_not_contact boolean NOT NULL DEFAULT false, dnc_reason text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_by uuid NOT NULL REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(parent_id IS DISTINCT FROM id), CHECK(NOT do_not_contact OR COALESCE(length(trim(dnc_reason)),0)>0),
 CHECK((relationship='do_not_contact')=do_not_contact)
);
CREATE TABLE pt_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 name text NOT NULL, role_title text NOT NULL DEFAULT '', preferred_channel text NOT NULL DEFAULT '',
 verification text NOT NULL DEFAULT 'unverified' CHECK(verification IN ('unverified','verified','invalid')),
 verified_at timestamptz, do_not_contact boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id)
);
CREATE TABLE pt_contact_methods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 contact_id uuid REFERENCES pt_contacts(id), kind text NOT NULL CHECK(kind IN ('email','phone','website','whatsapp','other')),
 value text NOT NULL CHECK(length(trim(value))>0), verification text NOT NULL DEFAULT 'unverified'
 CHECK(verification IN ('unverified','verified','invalid')), verified_at timestamptz, source_url text,
 do_not_contact boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 UNIQUE(organization_id,kind,value),
 FOREIGN KEY(contact_id,organization_id) REFERENCES pt_contacts(id,organization_id)
);
CREATE TABLE pt_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('historical_affiliate','historical_direct','historical_unclear','current_direct','other')),
 historical boolean NOT NULL, starts_on date, ends_on date, CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on)
);
CREATE TABLE pt_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 campaign_id uuid NOT NULL REFERENCES pt_campaigns(id),
 stage text NOT NULL CHECK(stage IN ('needs_research','ready_for_outreach','contacted','awaiting_reply','follow_up_due','interested','discussing_terms','active_partner','paused','declined','do_not_contact','ended')),
 owner_id uuid NOT NULL REFERENCES staff(id), next_action text NOT NULL CHECK(length(trim(next_action))>0),
 due_on date, unscheduled_reason text, priority integer NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 5),
 rationale text NOT NULL DEFAULT '', reply_review boolean NOT NULL DEFAULT false,
 history_version integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,campaign_id),
 CHECK(due_on IS NOT NULL OR COALESCE(length(trim(unscheduled_reason)),0)>0)
);
CREATE TABLE pt_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, title text NOT NULL,
 kind text NOT NULL, location text NOT NULL, coverage text NOT NULL,
 status text NOT NULL CHECK(status IN ('discovered','fully_imported','partially_imported','inaccessible','awaiting_review')),
 last_success_at timestamptz, last_error text, sync_mode text NOT NULL DEFAULT 'manual' CHECK(sync_mode IN ('manual','configured_background')),
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE pt_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, source_id uuid NOT NULL REFERENCES pt_sources(id),
 capture_hash text NOT NULL CHECK(capture_hash ~ '^[a-f0-9]{64}$'), actor_id uuid NOT NULL REFERENCES staff(id),
 imported_at timestamptz NOT NULL DEFAULT now(), manifest jsonb NOT NULL
);
CREATE TABLE pt_source_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES pt_sources(id),
 batch_id uuid NOT NULL REFERENCES pt_import_batches(id), source_key text NOT NULL, locator text NOT NULL,
 source_url text, legacy_id text, original_date text, original_timezone text, original_status text,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), original_text text NOT NULL,
 payload jsonb NOT NULL, outcome text NOT NULL CHECK(outcome IN ('imported','duplicate_linked','unresolved','excluded','error')),
 reason text NOT NULL, matching_method text NOT NULL, organization_id uuid REFERENCES pt_organizations(id),
 target_id uuid, imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,source_key,fingerprint)
);
CREATE TABLE pt_interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES pt_organizations(id),
 campaign_id uuid REFERENCES pt_campaigns(id), source_item_id uuid REFERENCES pt_source_items(id),
 legacy_id text UNIQUE, kind text NOT NULL CHECK(kind IN ('note','call','email','whatsapp','meeting','document','import')),
 direction text NOT NULL CHECK(direction IN ('inbound','outbound','internal','unknown','automated')),
 occurred_at timestamptz, original_date text, original_timezone text, subject text NOT NULL DEFAULT '',
 body text NOT NULL, summary text, source_url text, account_key text, message_id text, rfc_message_id text,
 actor_id uuid NOT NULL REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_key,message_id)
);
CREATE TABLE pt_research (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 kind text NOT NULL CHECK(kind IN ('research','hotel_recommendation','hotel_agreement','restriction','published_contact','reported_inquiry')),
 title text NOT NULL, body text NOT NULL, source_url text NOT NULL, source_item_id uuid REFERENCES pt_source_items(id),
 observed_on date, verified_on date, rank integer CHECK(rank>0), actor_id uuid NOT NULL REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN ('proposed','accepted','superseded','unconfirmed','ended')),
 supersedes_id uuid REFERENCES pt_agreements(id), original_wording text NOT NULL,
 confirmed_on date, confirmation_method text, evidence_url text, starts_on date, ends_on date,
 terms jsonb NOT NULL DEFAULT '{}', actor_id uuid NOT NULL REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,version), CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on),
 CHECK(status<>'accepted' OR (confirmed_on IS NOT NULL AND starts_on IS NOT NULL AND
 COALESCE(length(trim(confirmation_method)),0)>0 AND COALESCE(length(trim(evidence_url)),0)>0 AND length(trim(original_wording))>0))
);
CREATE TABLE pt_referrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 agreement_id uuid REFERENCES pt_agreements(id), booking_id uuid REFERENCES bookings(id),
 accounting_referral_id uuid UNIQUE REFERENCES referrals(id),
 accounting_terms_revision_id uuid REFERENCES commission_payable_revisions(id),
 kind text NOT NULL CHECK(kind IN ('reported_inquiry','verified_inquiry','booking')),
 occurred_on date, reference text NOT NULL, source_url text, actor_id uuid NOT NULL REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(kind<>'booking' OR booking_id IS NOT NULL),
 CHECK(accounting_referral_id IS NULL OR (booking_id IS NOT NULL AND agreement_id IS NOT NULL AND accounting_terms_revision_id IS NOT NULL))
);
CREATE TABLE pt_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES pt_organizations(id),
 source_item_id uuid REFERENCES pt_source_items(id), kind text NOT NULL, details text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','deferred')),
 resolution text, resolved_by uuid REFERENCES staff(id), resolved_at timestamptz, version integer NOT NULL DEFAULT 1,
 CHECK(status<>'resolved' OR (COALESCE(length(trim(resolution)),0)>0 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE TABLE pt_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES pt_opportunities(id),
 method_id uuid NOT NULL REFERENCES pt_contact_methods(id), subject text NOT NULL, body text NOT NULL,
 context_version integer NOT NULL, opportunity_version integer NOT NULL, method_version integer NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','invalidated','rejected','manually_sent')),
 approved_by uuid REFERENCES staff(id), approved_at timestamptz, approval_hash text,
 created_by uuid NOT NULL REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 CHECK(state<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_hash IS NOT NULL))
);
CREATE TABLE pt_source_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_item_id uuid NOT NULL REFERENCES pt_source_items(id),
 organization_id uuid NOT NULL REFERENCES pt_organizations(id), review_id uuid NOT NULL REFERENCES pt_reviews(id),
 actor_id uuid NOT NULL REFERENCES staff(id), reason text NOT NULL CHECK(length(trim(reason))>0),
 version integer NOT NULL CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_item_id,version)
);
CREATE TABLE pt_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES pt_organizations(id),
 interaction_id uuid REFERENCES pt_interactions(id), filename text NOT NULL, mime_type text NOT NULL,
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 10485760), sha256 text NOT NULL,
 encrypted_content text NOT NULL, actor_id uuid NOT NULL REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_commands (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES staff(id), kind text NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, channel text NOT NULL CHECK(channel IN ('staff','ai','import')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL REFERENCES pt_commands(id) DEFERRABLE INITIALLY DEFERRED,
 actor_id uuid NOT NULL REFERENCES staff(id), channel text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
 before_value jsonb, after_value jsonb NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pt_ai_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL REFERENCES staff(id),
 token_hash text NOT NULL UNIQUE, scopes text[] NOT NULL, auth_version integer NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 resource text NOT NULL, client_id text NOT NULL, last_used_at timestamptz
);
CREATE TABLE pt_oauth_codes (
 code_hash text PRIMARY KEY, staff_id uuid NOT NULL REFERENCES staff(id), client_id text NOT NULL,
 redirect_uri text NOT NULL, challenge text NOT NULL, resource text NOT NULL,
 scopes text[] NOT NULL, auth_version integer NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE pt_oauth_clients (
 id text PRIMARY KEY, redirect_uris text[] NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pt_org_search ON pt_organizations(lower(name));
CREATE INDEX pt_contact_org ON pt_contacts(organization_id);
CREATE INDEX pt_methods_org ON pt_contact_methods(organization_id);
CREATE INDEX pt_methods_contact ON pt_contact_methods(contact_id);
CREATE INDEX pt_opportunity_queue ON pt_opportunities(owner_id,due_on,priority);
CREATE INDEX pt_interaction_history ON pt_interactions(organization_id,occurred_at,created_at);
CREATE INDEX pt_research_org ON pt_research(organization_id);
CREATE INDEX pt_sources_locator ON pt_source_items(source_id,source_key);
CREATE INDEX pt_sources_org ON pt_source_items(organization_id);
CREATE INDEX pt_reviews_status ON pt_reviews(status,organization_id);
CREATE INDEX pt_referrals_org ON pt_referrals(organization_id);
CREATE INDEX pt_drafts_queue ON pt_drafts(state,opportunity_id);
CREATE INDEX pt_docs_org ON pt_documents(organization_id);
CREATE INDEX pt_audit_entity ON pt_audit(entity_id,created_at);
CREATE INDEX pt_org_parent ON pt_organizations(parent_id);
CREATE INDEX pt_org_party ON pt_organizations(accounting_party_id);
CREATE INDEX pt_opportunity_campaign ON pt_opportunities(campaign_id);
CREATE INDEX pt_batch_source ON pt_import_batches(source_id);
CREATE INDEX pt_items_batch ON pt_source_items(batch_id);
CREATE INDEX pt_interaction_source ON pt_interactions(source_item_id);
CREATE INDEX pt_interaction_campaign ON pt_interactions(campaign_id);
CREATE INDEX pt_research_source ON pt_research(source_item_id);
CREATE INDEX pt_agreement_previous ON pt_agreements(supersedes_id);
CREATE INDEX pt_referral_booking ON pt_referrals(booking_id);
CREATE INDEX pt_referral_agreement ON pt_referrals(agreement_id);
CREATE INDEX pt_referral_revision ON pt_referrals(accounting_terms_revision_id);
CREATE INDEX pt_review_source ON pt_reviews(source_item_id);
CREATE INDEX pt_draft_method ON pt_drafts(method_id);
CREATE INDEX pt_document_interaction ON pt_documents(interaction_id);
CREATE INDEX pt_grant_staff ON pt_ai_grants(staff_id);
CREATE INDEX pt_code_staff ON pt_oauth_codes(staff_id);
CREATE INDEX pt_resolution_org ON pt_source_resolutions(organization_id);
CREATE FUNCTION pt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Partnership history is immutable; append a correction with reason'; END $$;
DO $$ DECLARE t text; api_role text; BEGIN
 FOREACH t IN ARRAY ARRAY['pt_import_batches','pt_source_items','pt_source_resolutions','pt_interactions','pt_research','pt_agreements','pt_referrals','pt_documents','pt_commands','pt_audit'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pt_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['pt_organizations','pt_contacts','pt_contact_methods','pt_campaigns','pt_opportunities','pt_sources','pt_import_batches','pt_source_items','pt_interactions','pt_research','pt_agreements','pt_referrals','pt_reviews','pt_drafts','pt_source_resolutions','pt_documents','pt_commands','pt_audit','pt_ai_grants','pt_oauth_codes','pt_oauth_clients'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
 EXECUTE format('REVOKE ALL ON %I FROM %I',t,api_role);
 END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION pt_immutable() FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('021_partnerships');
