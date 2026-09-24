SET ROLE fitness_migration;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, identity_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_org_id_email_unique ON customers (organization_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_org_id_pk_unique ON customers (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_org_id_pk_unique ON sessions (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_org_customer_session_unique ON bookings (organization_id, customer_id, session_id) WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id ON organization_users (organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_organization_id ON locations (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_organization_id ON sessions (organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_organization_id ON bookings (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_organization_id ON audit_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_organization_id ON outbox_events (organization_id);

CREATE OR REPLACE FUNCTION enforce_booking_capacity()
RETURNS trigger AS $$
DECLARE
  v_capacity integer;
  v_confirmed_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT s.capacity
    INTO v_capacity
    FROM sessions s
   WHERE s.id = NEW.session_id
     AND s.organization_id = NEW.organization_id
   FOR UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'Session % does not belong to organization %', NEW.session_id, NEW.organization_id;
  END IF;

  SELECT COUNT(*)::int
    INTO v_confirmed_count
    FROM bookings b
   WHERE b.organization_id = NEW.organization_id
     AND b.session_id = NEW.session_id
     AND b.status = 'confirmed'
     AND b.id IS DISTINCT FROM NEW.id;

  IF v_confirmed_count >= v_capacity THEN
    RAISE EXCEPTION 'Session capacity exceeded for organization %', NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_customer_tenant_match'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_customer_tenant_match
      FOREIGN KEY (organization_id, customer_id)
      REFERENCES customers (organization_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_session_tenant_match'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_session_tenant_match
      FOREIGN KEY (organization_id, session_id)
      REFERENCES sessions (organization_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

DROP TRIGGER IF EXISTS bookings_capacity_guard ON bookings;
CREATE TRIGGER bookings_capacity_guard
BEFORE INSERT OR UPDATE OF session_id, status
ON bookings
FOR EACH ROW
EXECUTE FUNCTION enforce_booking_capacity();

GRANT USAGE ON SCHEMA public TO fitness_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON locations, customers, sessions, bookings, audit_events, outbox_events TO fitness_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fitness_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM fitness_app;
