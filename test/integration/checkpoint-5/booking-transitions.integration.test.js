const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../../support/database.cjs');

test('TEN-REQ-016: booking transitions, cancellation, relocation and capacity reduction preserve invariants', async (context) => {
  const database = await fixture(context);
  const tenant = await database.tenant();
  await database.migration.query('UPDATE sessions SET capacity = 1 WHERE id = $1', [
    tenant.sessionId,
  ]);
  const booking = await database.transaction(tenant.organizationId, (client) =>
    client.query(
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'pending') RETURNING id",
      [tenant.organizationId, tenant.customerId, tenant.sessionId],
    ),
  );
  await database.transaction(tenant.organizationId, (client) =>
    client.query("UPDATE bookings SET status = 'confirmed' WHERE id = $1", [booking.rows[0].id]),
  );
  await database.transaction(tenant.organizationId, (client) =>
    client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.rows[0].id]),
  );
  const replacement = await database.transaction(tenant.organizationId, (client) =>
    client.query(
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'confirmed') RETURNING id",
      [tenant.organizationId, tenant.customerId, tenant.sessionId],
    ),
  );
  assert.equal(replacement.rowCount, 1);
  const otherSession = (
    await database.migration.query(
      "INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ($1, $2, 'Other', 1, NOW(), NOW() + INTERVAL '1 hour') RETURNING id",
      [tenant.organizationId, tenant.locationId],
    )
  ).rows[0].id;
  await database.transaction(tenant.organizationId, (client) =>
    client.query('UPDATE bookings SET session_id = $1 WHERE id = $2', [
      otherSession,
      replacement.rows[0].id,
    ]),
  );
  await database.transaction(tenant.organizationId, (client) =>
    client.query("UPDATE bookings SET status = 'confirmed' WHERE id = $1", [booking.rows[0].id]),
  );
  await assert.rejects(
    database.transaction(tenant.organizationId, (client) =>
      client.query('UPDATE bookings SET session_id = $1 WHERE id = $2', [
        otherSession,
        booking.rows[0].id,
      ]),
    ),
    { code: 'P0001' },
  );
  await database.transaction(tenant.organizationId, (client) =>
    client.query('UPDATE sessions SET capacity = 2 WHERE id = $1', [tenant.sessionId]),
  );
  const secondCustomer = (
    await database.migration.query(
      "INSERT INTO customers (organization_id, full_name, email) VALUES ($1, 'Second', 'second@example.test') RETURNING id",
      [tenant.organizationId],
    )
  ).rows[0].id;
  await database.transaction(tenant.organizationId, (client) =>
    client.query(
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'confirmed')",
      [tenant.organizationId, secondCustomer, tenant.sessionId],
    ),
  );
  await assert.rejects(
    database.transaction(tenant.organizationId, (client) =>
      client.query('UPDATE sessions SET capacity = 1 WHERE id = $1', [tenant.sessionId]),
    ),
    { code: '23514' },
  );
});
