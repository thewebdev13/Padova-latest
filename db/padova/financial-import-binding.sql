-- Prepared only. Reuse existing staging mappings; never adopt old captures implicitly.
ALTER TABLE padova.settings ADD COLUMN historical_financial_posting_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE padova.settings ADD COLUMN historical_approved_batch_id uuid REFERENCES padova_staging.import_batches(id);
ALTER TABLE padova.settings ADD COLUMN historical_cutover_review text;
ALTER TABLE padova_staging.migration_mappings ADD COLUMN app_financial_event_key text;
ALTER TABLE padova_staging.migration_mappings ADD COLUMN app_command_id uuid REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE padova_staging.migration_mappings ADD COLUMN app_source_fingerprint text;
CREATE UNIQUE INDEX financial_import_event_identity ON padova_staging.migration_mappings(app_financial_event_key) WHERE app_financial_event_key IS NOT NULL;
CREATE UNIQUE INDEX financial_import_evidence_command ON padova_staging.migration_mappings(evidence_record_id,app_command_id) WHERE app_command_id IS NOT NULL;

-- Narrow private definer functions are needed because runtime retains NO staging grants.
-- They cannot change evidence, old mappings, settings, or authorize a cutover.
CREATE FUNCTION padova.check_financial_import_source(p_event_key text,p_evidence_id uuid,p_batch_id uuid,p_command_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fingerprint text; prior padova_staging.migration_mappings%ROWTYPE;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(71280428);
 IF NOT EXISTS(SELECT 1 FROM padova.staff WHERE user_id=auth.uid() AND active AND role='owner') THEN RAISE EXCEPTION 'Individual active Owner required for financial import'; END IF;
 IF NOT EXISTS(SELECT 1 FROM padova.settings s JOIN padova_staging.import_batches b ON b.id=s.historical_approved_batch_id
   WHERE s.id=true AND s.historical_financial_posting_authorized AND s.operational_entry_enabled AND s.backup_verified_at IS NOT NULL
   AND s.historical_approved_batch_id=p_batch_id AND length(trim(s.historical_cutover_review))>0
   AND b.extracted_at<=now() AND b.extracted_at>=now()-interval '24 hours') THEN RAISE EXCEPTION 'Historical production financial cutover is not authorized for this fresh capture'; END IF;
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(e.raw::text,'UTF8')),'hex') INTO fingerprint
 FROM padova_staging.evidence_records e JOIN padova_staging.evidence_files f ON f.id=e.file_id
 WHERE e.id=p_evidence_id AND f.batch_id=p_batch_id;
 IF fingerprint IS NULL THEN RAISE EXCEPTION 'Financial event evidence does not belong to the approved capture'; END IF;
 SELECT * INTO prior FROM padova_staging.migration_mappings m WHERE m.app_financial_event_key=p_event_key;
 IF FOUND AND (prior.app_command_id IS DISTINCT FROM p_command_id OR prior.app_source_fingerprint IS DISTINCT FROM fingerprint) THEN
   RAISE EXCEPTION 'Accepted financial source event changed; use a reviewed dated correction';
 END IF;
 RETURN fingerprint;
END $$;

CREATE FUNCTION padova.bind_financial_import_event(p_event_key text,p_evidence_id uuid,p_batch_id uuid,p_command_id uuid,p_reviewer_decision text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fingerprint text; binding_id uuid; has_primary boolean;
BEGIN
 fingerprint:=padova.check_financial_import_source(p_event_key,p_evidence_id,p_batch_id,p_command_id);
 IF p_reviewer_decision IS NULL OR length(trim(p_reviewer_decision))=0 THEN RAISE EXCEPTION 'Reviewed source-event decision required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM padova.requests r JOIN padova.command_context c ON c.id=r.key WHERE r.key=p_command_id AND c.actor=auth.uid() AND r.actor=auth.uid()) THEN RAISE EXCEPTION 'Completed financial command by actual Owner required before binding'; END IF;
 SELECT m.id INTO binding_id FROM padova_staging.migration_mappings m WHERE m.evidence_record_id=p_evidence_id AND m.app_command_id=p_command_id;
 IF FOUND THEN RETURN binding_id; END IF;
 SELECT EXISTS(SELECT 1 FROM padova_staging.migration_mappings m WHERE m.app_financial_event_key=p_event_key) INTO has_primary;
 INSERT INTO padova_staging.migration_mappings(evidence_record_id,target_table,target_id,decision,rationale,actor,app_financial_event_key,app_command_id,app_source_fingerprint)
 VALUES(p_evidence_id,'padova.requests',p_command_id,'reviewed_financial_event',p_reviewer_decision,auth.uid(),CASE WHEN has_primary THEN NULL ELSE p_event_key END,p_command_id,fingerprint)
 RETURNING id INTO binding_id;
 RETURN binding_id;
END $$;
REVOKE ALL ON FUNCTION padova.check_financial_import_source(text,uuid,uuid,uuid),padova.bind_financial_import_event(text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION padova.check_financial_import_source(text,uuid,uuid,uuid),padova.bind_financial_import_event(text,uuid,uuid,uuid,text) TO padova_app_server;
