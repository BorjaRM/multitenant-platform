const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../../support/database.cjs');

test('TEN-REQ-009, TEN-REQ-010, TEN-REQ-014: non-null columns, tenant indexes and precise composite foreign keys', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const tables = [
    'locations',
    'customers',
    'sessions',
    'bookings',
    'audit_events',
    'outbox_events',
  ];
  for (const table of tables) {
    const column = await database.app.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'organization_id'",
      [table],
    );
    assert.equal(column.rows[0].is_nullable, 'NO');
    const indexes = await database.app.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1",
      [table],
    );
    assert.ok(
      indexes.rows.some((row) => /\(organization_id[,)]/.test(row.indexdef)),
      table,
    );
  }
  const invalid = [
    [
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'pending')",
      [tenantA.organizationId, tenantB.customerId, tenantA.sessionId],
      'bookings_customer_tenant_match',
    ],
    [
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'pending')",
      [tenantA.organizationId, tenantA.customerId, tenantB.sessionId],
      'bookings_session_tenant_match',
    ],
    [
      "INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ($1, $2, 'Invalid', 10, NOW(), NOW() + INTERVAL '1 hour')",
      [tenantA.organizationId, tenantB.locationId],
      'sessions_location_tenant_match',
    ],
  ];
  for (const [query, values, constraint] of invalid) {
    await assert.rejects(
      database.transaction(tenantA.organizationId, (client) => client.query(query, values)),
      { code: '23503', constraint },
    );
  }
  for (const table of ['audit_events', 'outbox_events']) {
    await assert.rejects(
      database.transaction(tenantA.organizationId, (client) =>
        client.query(
          `INSERT INTO ${table} (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2)`,
          [tenantA.organizationId, tenantB.customerId],
        ),
      ),
      { code: '23503' },
    );
  }
});
