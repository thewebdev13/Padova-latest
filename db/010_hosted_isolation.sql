-- Only current-build objects; preserve all legacy schemas and public RPCs.
DO $$ DECLARE obj text; role_name text; BEGIN
 FOREACH obj IN ARRAY ARRAY['schema_migrations','staff','sessions','parties','party_relationships','traveler_private','payment_accounts','bookings','booking_travelers','confirmations','itinerary_revisions','commands','charges','payments','payment_adjustments','payment_allocations','supplier_obligations','assets','asset_lots','asset_movements','funding_components','asset_sales','commissions','commission_allocations','referrals','referral_payments','refunds','refund_movements','profit_movements','journal_lines','tasks','attention_resolutions','notes','attachments','migration_staging','audit_events','payment_balances','asset_balances','booking_balances','booking_payers','asset_transfers','asset_sale_receipts','asset_acquisition_payments','payment_allocation_reversals','net_allocations','recovery_requests','password_reset_tokens','auth_throttles','security_audit','personal_recovery_codes'] LOOP
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=obj) THEN
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',obj);
  END IF;
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',obj);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',obj,role_name);
   END IF;
  END LOOP;
 END LOOP;
 FOREACH obj IN ARRAY ARRAY['prevent_history_change','verify_journal_balance','verify_inventory_balance','guard_command'] LOOP
  EXECUTE format('ALTER FUNCTION public.%I() SET search_path=public,pg_catalog',obj);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC',obj);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM %I',obj,role_name);
   END IF;
  END LOOP;
 END LOOP;
 REVOKE ALL ON SEQUENCE public.booking_number FROM PUBLIC;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SEQUENCE public.booking_number FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('010_hosted_isolation');
