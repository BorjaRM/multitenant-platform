SET ROLE fitness_migration;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'organization_users' AND n.nspname = 'public') THEN
    ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE organization_users FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'locations' AND n.nspname = 'public') THEN
    ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE locations FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'customers' AND n.nspname = 'public') THEN
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customers FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'sessions' AND n.nspname = 'public') THEN
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'bookings' AND n.nspname = 'public') THEN
    ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'audit_events' AND n.nspname = 'public') THEN
    ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'outbox_events' AND n.nspname = 'public') THEN
    ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS organization_users_tenant_isolation_select ON organization_users;
  DROP POLICY IF EXISTS organization_users_tenant_isolation_insert ON organization_users;
  DROP POLICY IF EXISTS organization_users_tenant_isolation_update ON organization_users;
  DROP POLICY IF EXISTS organization_users_tenant_isolation_delete ON organization_users;
  DROP POLICY IF EXISTS locations_tenant_isolation_select ON locations;
  DROP POLICY IF EXISTS locations_tenant_isolation_insert ON locations;
  DROP POLICY IF EXISTS locations_tenant_isolation_update ON locations;
  DROP POLICY IF EXISTS locations_tenant_isolation_delete ON locations;
  DROP POLICY IF EXISTS customers_tenant_isolation_select ON customers;
  DROP POLICY IF EXISTS customers_tenant_isolation_insert ON customers;
  DROP POLICY IF EXISTS customers_tenant_isolation_update ON customers;
  DROP POLICY IF EXISTS customers_tenant_isolation_delete ON customers;
  DROP POLICY IF EXISTS sessions_tenant_isolation_select ON sessions;
  DROP POLICY IF EXISTS sessions_tenant_isolation_insert ON sessions;
  DROP POLICY IF EXISTS sessions_tenant_isolation_update ON sessions;
  DROP POLICY IF EXISTS sessions_tenant_isolation_delete ON sessions;
  DROP POLICY IF EXISTS bookings_tenant_isolation_select ON bookings;
  DROP POLICY IF EXISTS bookings_tenant_isolation_insert ON bookings;
  DROP POLICY IF EXISTS bookings_tenant_isolation_update ON bookings;
  DROP POLICY IF EXISTS bookings_tenant_isolation_delete ON bookings;
  DROP POLICY IF EXISTS audit_events_tenant_isolation_select ON audit_events;
  DROP POLICY IF EXISTS audit_events_tenant_isolation_insert ON audit_events;
  DROP POLICY IF EXISTS audit_events_tenant_isolation_update ON audit_events;
  DROP POLICY IF EXISTS audit_events_tenant_isolation_delete ON audit_events;
  DROP POLICY IF EXISTS outbox_events_tenant_isolation_select ON outbox_events;
  DROP POLICY IF EXISTS outbox_events_tenant_isolation_insert ON outbox_events;
  DROP POLICY IF EXISTS outbox_events_tenant_isolation_update ON outbox_events;
  DROP POLICY IF EXISTS outbox_events_tenant_isolation_delete ON outbox_events;
END $$;

CREATE POLICY organization_users_tenant_isolation_select
ON organization_users
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY organization_users_tenant_isolation_insert
ON organization_users
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY organization_users_tenant_isolation_update
ON organization_users
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY organization_users_tenant_isolation_delete
ON organization_users
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY locations_tenant_isolation_select
ON locations
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY locations_tenant_isolation_insert
ON locations
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY locations_tenant_isolation_update
ON locations
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY locations_tenant_isolation_delete
ON locations
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY customers_tenant_isolation_select
ON customers
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY customers_tenant_isolation_insert
ON customers
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY customers_tenant_isolation_update
ON customers
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY customers_tenant_isolation_delete
ON customers
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_isolation_select
ON sessions
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_isolation_insert
ON sessions
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_isolation_update
ON sessions
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_isolation_delete
ON sessions
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY bookings_tenant_isolation_select
ON bookings
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY bookings_tenant_isolation_insert
ON bookings
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY bookings_tenant_isolation_update
ON bookings
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY bookings_tenant_isolation_delete
ON bookings
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY audit_events_tenant_isolation_select
ON audit_events
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY audit_events_tenant_isolation_insert
ON audit_events
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY audit_events_tenant_isolation_update
ON audit_events
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY audit_events_tenant_isolation_delete
ON audit_events
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY outbox_events_tenant_isolation_select
ON outbox_events
FOR SELECT
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY outbox_events_tenant_isolation_insert
ON outbox_events
FOR INSERT
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY outbox_events_tenant_isolation_update
ON outbox_events
FOR UPDATE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY outbox_events_tenant_isolation_delete
ON outbox_events
FOR DELETE
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON locations, customers, sessions, bookings, audit_events, outbox_events TO fitness_app;
GRANT SELECT ON organization_users TO fitness_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON organizations, identities, organization_users FROM fitness_app;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organization_users', 'locations', 'customers', 'sessions', 'bookings', 'audit_events', 'outbox_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS migration_access ON %I', table_name);
    EXECUTE format('CREATE POLICY migration_access ON %I TO fitness_migration USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
