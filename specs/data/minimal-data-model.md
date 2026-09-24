# Minimal data model

## Core model

- organizations
- organization_users
- identities
- locations
- customers
- sessions
- bookings
- audit_events
- outbox_events
- idempotency_keys
- consumer_receipts

## Key rules

- Every tenant-scoped table includes `organization_id`.
- Relationships across tenant-scoped records must include organization matching.
- Global tables are limited to identity, configuration, and platform metadata.

## Spike invariants

- Session location references include `(organization_id, location_id)`.
- Audit and outbox support customer and booking aggregates, using generated references and composite foreign keys.
- Idempotency results are unique by `(organization_id, key)`; consumer effects by `(organization_id, event_id, consumer)`.
- Active bookings are pending or confirmed. Cancelled bookings retain history but allow a new active booking.
- Session capacity cannot be reduced below confirmed bookings; a moved booking must fit the destination capacity.
- RLS, trigger behavior and migration ownership remain defined by SQL migrations; Drizzle describes equivalent tables and constraints.
