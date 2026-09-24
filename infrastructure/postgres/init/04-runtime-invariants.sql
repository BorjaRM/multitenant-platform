SET ROLE fitness_migration;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_org_id_pk_unique ON locations (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_org_id_pk_unique ON bookings (organization_id, id);
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_location_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND conname = 'sessions_location_tenant_match') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_location_tenant_match FOREIGN KEY (organization_id, location_id) REFERENCES locations (organization_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_bookings_org_customer_session_unique;
CREATE UNIQUE INDEX idx_bookings_org_customer_session_unique ON bookings (organization_id, customer_id, session_id) WHERE status IN ('pending', 'confirmed');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_valid_status') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_valid_status CHECK (status IN ('pending', 'confirmed', 'cancelled'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_session_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.capacity < (SELECT count(*) FROM bookings WHERE organization_id = NEW.organization_id AND session_id = NEW.id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'Capacity below confirmed bookings' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS session_capacity_guard ON sessions;
CREATE TRIGGER session_capacity_guard BEFORE UPDATE OF capacity ON sessions FOR EACH ROW EXECUTE FUNCTION enforce_session_capacity();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['audit_events', 'outbox_events'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS customer_ref uuid GENERATED ALWAYS AS (CASE WHEN aggregate_type = ''customer'' THEN aggregate_id END) STORED', table_name);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS booking_ref uuid GENERATED ALWAYS AS (CASE WHEN aggregate_type = ''booking'' THEN aggregate_id END) STORED', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = table_name::regclass AND conname = table_name || '_customer_tenant_match') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id, customer_ref) REFERENCES customers (organization_id, id)', table_name, table_name || '_customer_tenant_match');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id, booking_ref) REFERENCES bookings (organization_id, id)', table_name, table_name || '_booking_tenant_match');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (aggregate_type IN (''customer'', ''booking''))', table_name, table_name || '_aggregate_type');
    END IF;
  END LOOP;
END $$;

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS idempotency_keys (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (organization_id, key)
);
CREATE TABLE IF NOT EXISTS consumer_receipts (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  event_id uuid NOT NULL,
  consumer text NOT NULL,
  PRIMARY KEY (organization_id, event_id, consumer)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_org_id_unique ON outbox_events (organization_id, id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consumer_receipts'::regclass AND conname = 'consumer_receipt_event') THEN
    ALTER TABLE consumer_receipts ADD CONSTRAINT consumer_receipt_event FOREIGN KEY (organization_id, event_id) REFERENCES outbox_events (organization_id, id);
  END IF;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['idempotency_keys', 'consumer_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO fitness_app USING (organization_id = NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid)', table_name);
    EXECUTE format('DROP POLICY IF EXISTS migration_access ON %I', table_name);
    EXECUTE format('CREATE POLICY migration_access ON %I TO fitness_migration USING (true) WITH CHECK (true)', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO fitness_app', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION resolve_tenant_access(requested_identity uuid, requested_organization uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_users WHERE identity_id = requested_identity AND organization_id = requested_organization);
$$;
REVOKE ALL ON FUNCTION resolve_tenant_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_access(uuid, uuid) TO fitness_app;
REVOKE ALL ON organizations, identities FROM fitness_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON organization_users FROM fitness_app;
