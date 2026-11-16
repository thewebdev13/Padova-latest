-- Match the existing US migration_mappings decision constraint without widening it.
-- Preserve original functions/migrations and all prior evidence/history; only newly accepted bindings use the native status.
CREATE OR REPLACE FUNCTION padova.bind_financial_import_event(p_event_key text,p_evidence_id uuid,p_batch_id uuid,p_command_id uuid,p_reviewer_decision text) RETURNS uuid
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
 VALUES(p_evidence_id,'padova.requests',p_command_id,'accepted',p_reviewer_decision,auth.uid(),CASE WHEN has_primary THEN NULL ELSE p_event_key END,p_command_id,fingerprint)
 RETURNING id INTO binding_id;
 RETURN binding_id;
END $$;

