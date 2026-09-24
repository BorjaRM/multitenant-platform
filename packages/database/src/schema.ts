import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
const dates = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ...dates(),
});
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  ...dates(),
});
export const organizationUsers = pgTable(
  'organization_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    ...dates(),
  },
  (table) => [
    uniqueIndex('organization_users_organization_id_identity_id_key').on(
      table.organizationId,
      table.identityId,
    ),
    index('idx_organization_users_organization_id').on(table.organizationId),
  ],
);
export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...dates(),
  },
  (table) => [
    uniqueIndex('idx_locations_org_id_pk_unique').on(table.organizationId, table.id),
    index('idx_locations_organization_id').on(table.organizationId),
  ],
);
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_customers_org_id_email_unique').on(table.organizationId, table.email),
    uniqueIndex('idx_customers_org_id_pk_unique').on(table.organizationId, table.id),
    index('idx_customers_organization_id').on(table.organizationId),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').notNull(),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    ...dates(),
  },
  (table) => [
    uniqueIndex('idx_sessions_org_id_pk_unique').on(table.organizationId, table.id),
    index('idx_sessions_organization_id').on(table.organizationId),
    foreignKey({
      name: 'sessions_location_tenant_match',
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete('restrict'),
    check('sessions_capacity_check', sql`${table.capacity} > 0`),
    check('sessions_check', sql`${table.endsAt} > ${table.startsAt}`),
  ],
);
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    status: text('status').notNull().default('pending'),
    ...dates(),
  },
  (table) => [
    uniqueIndex('idx_bookings_org_id_pk_unique').on(table.organizationId, table.id),
    index('idx_bookings_organization_id').on(table.organizationId),
    uniqueIndex('idx_bookings_org_customer_session_unique')
      .on(table.organizationId, table.customerId, table.sessionId)
      .where(sql`${table.status} IN ('pending', 'confirmed')`),
    foreignKey({
      name: 'bookings_customer_tenant_match',
      columns: [table.organizationId, table.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'bookings_session_tenant_match',
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }).onDelete('restrict'),
    check('bookings_valid_status', sql`${table.status} IN ('pending', 'confirmed', 'cancelled')`),
  ],
);
const eventColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  customerRef: uuid('customer_ref').generatedAlwaysAs(
    sql`CASE WHEN aggregate_type = 'customer' THEN aggregate_id END`,
  ),
  bookingRef: uuid('booking_ref').generatedAlwaysAs(
    sql`CASE WHEN aggregate_type = 'booking' THEN aggregate_id END`,
  ),
});
export const auditEvents = pgTable('audit_events', eventColumns(), (table) => [
  index('idx_audit_events_organization_id').on(table.organizationId),
  check('audit_events_aggregate_type', sql`${table.aggregateType} IN ('customer', 'booking')`),
  foreignKey({
    name: 'audit_events_customer_tenant_match',
    columns: [table.organizationId, table.customerRef],
    foreignColumns: [customers.organizationId, customers.id],
  }),
  foreignKey({
    name: 'audit_events_booking_tenant_match',
    columns: [table.organizationId, table.bookingRef],
    foreignColumns: [bookings.organizationId, bookings.id],
  }),
]);
export const outboxEvents = pgTable(
  'outbox_events',
  {
    ...eventColumns(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    correlationId: uuid('correlation_id').notNull().defaultRandom(),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_outbox_org_id_unique').on(table.organizationId, table.id),
    index('idx_outbox_events_organization_id').on(table.organizationId),
    check('outbox_events_aggregate_type', sql`${table.aggregateType} IN ('customer', 'booking')`),
    foreignKey({
      name: 'outbox_events_customer_tenant_match',
      columns: [table.organizationId, table.customerRef],
      foreignColumns: [customers.organizationId, customers.id],
    }),
    foreignKey({
      name: 'outbox_events_booking_tenant_match',
      columns: [table.organizationId, table.bookingRef],
      foreignColumns: [bookings.organizationId, bookings.id],
    }),
  ],
);
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.key] })],
);
export const consumerReceipts = pgTable(
  'consumer_receipts',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    eventId: uuid('event_id').notNull(),
    consumer: text('consumer').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId, table.consumer] }),
    foreignKey({
      name: 'consumer_receipt_event',
      columns: [table.organizationId, table.eventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
    }),
  ],
);
