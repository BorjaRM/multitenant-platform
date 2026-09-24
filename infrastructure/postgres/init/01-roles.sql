DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_migration') THEN
    CREATE ROLE fitness_migration LOGIN PASSWORD 'local-only-password' NOREPLICATION NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app') THEN
    CREATE ROLE fitness_app LOGIN PASSWORD 'local-only-password' NOREPLICATION NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;

GRANT CONNECT ON DATABASE fitness_ops TO fitness_migration;
GRANT CREATE ON DATABASE fitness_ops TO fitness_migration;
GRANT CONNECT ON DATABASE fitness_ops TO fitness_app;

ALTER ROLE fitness_migration SET search_path = public;
ALTER ROLE fitness_app SET search_path = public;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM fitness_app;
ALTER ROLE fitness_app NOBYPASSRLS NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION;
ALTER ROLE fitness_migration NOBYPASSRLS NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE, CREATE ON SCHEMA public TO fitness_migration;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$
DECLARE object_name text;
BEGIN
  FOR object_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('organizations', 'identities', 'organization_users', 'locations', 'customers', 'sessions', 'bookings', 'audit_events', 'outbox_events')
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO fitness_migration', object_name);
  END LOOP;
  IF to_regprocedure('public.enforce_booking_capacity()') IS NOT NULL THEN
    ALTER FUNCTION public.enforce_booking_capacity() OWNER TO fitness_migration;
  END IF;
END $$;
