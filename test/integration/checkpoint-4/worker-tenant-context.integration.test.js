const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-6-worker-context-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-6-worker-context',
};

test('TEN-REQ-018: workers cannot access outbox rows without explicit tenant context', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query(
        "INSERT INTO organizations (name) VALUES ('Org-A-worker') RETURNING id;",
      )
    ).rows[0].id;
    const customerId = (
      await adminClient.query(
        "INSERT INTO customers (organization_id, full_name, email) VALUES ($1, 'Worker customer', 'worker@example.test') RETURNING id",
        [orgA],
      )
    ).rows[0].id;
    const eventId = (
      await adminClient.query(
        `INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ('${orgA}', 'customer.created', 'customer', '${customerId}', '{"source":"worker-test"}'::jsonb) RETURNING id;`,
      )
    ).rows[0].id;

    await appClient.query('BEGIN');
    const before = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(
      before.rows[0].tenant_id,
      null,
      'A worker without explicit tenant context must have no tenant setting',
    );

    const workerView = await appClient.query(
      `SELECT * FROM outbox_events WHERE id = '${eventId}';`,
    );
    assert.equal(
      workerView.rows.length,
      0,
      'A worker without tenant context must not read the outbox row',
    );

    await appClient.query('ROLLBACK');

    const exists = await adminClient.query(
      `SELECT COUNT(*)::int AS count FROM outbox_events WHERE id = '${eventId}';`,
    );
    assert.equal(
      exists.rows[0].count,
      1,
      'The original outbox row must remain available for tenant-bound processing',
    );
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
