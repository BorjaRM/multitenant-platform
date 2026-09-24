const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-5-retry-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-5-retry',
};

test('TEN-REQ-017: repeated booking attempts remain consistent under retry semantics', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query(
        "INSERT INTO organizations (name) VALUES ('Org-A-retry') RETURNING id;",
      )
    ).rows[0].id;
    const locationId = (
      await adminClient.query(
        `INSERT INTO locations (organization_id, name) VALUES ('${orgA}', 'Location Retry') RETURNING id;`,
      )
    ).rows[0].id;
    const sessionId = (
      await adminClient.query(
        `INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ('${orgA}', '${locationId}', 'Session Retry', 4, NOW() + interval '1 hour', NOW() + interval '2 hours') RETURNING id;`,
      )
    ).rows[0].id;
    const customerId = (
      await adminClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Retry User', 'retry.${Date.now()}@example.test') RETURNING id;`,
      )
    ).rows[0].id;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await appClient.query('BEGIN');
      await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

      try {
        await appClient.query(
          `INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'confirmed');`,
          [orgA, customerId, sessionId],
        );
        await appClient.query('COMMIT');
      } catch (error) {
        await appClient.query('ROLLBACK');
        assert.equal(error.code, '23505');
        assert.equal(error.constraint, 'idx_bookings_org_customer_session_unique');
      }
    }

    const count = (
      await adminClient.query(
        `SELECT COUNT(*)::int AS count FROM bookings WHERE organization_id = '${orgA}' AND customer_id = '${customerId}' AND session_id = '${sessionId}';`,
      )
    ).rows[0].count;
    assert.equal(count, 1, 'Retries must not create duplicate booking rows');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
