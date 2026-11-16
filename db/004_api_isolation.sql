-- Server-only access. No browser Data API grants or permissive policies.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t.tablename);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',t.tablename); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',t.tablename); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION prevent_history_change() FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('004_api_isolation');
