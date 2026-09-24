const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-4-outbox-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-4-outbox',
};

test('TEN-REQ-014: outbox events carry tenant context and reject cross-tenant writes', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A5') RETURNING id;")
    ).rows[0].id;
    const orgB = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-B5') RETURNING id;")
    ).rows[0].id;

    const customer = await adminClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Alice Outbox', 'alice.outbox@a.test') RETURNING id;`,
    );
    const customerId = customer.rows[0].id;

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    await appClient.query(
      `INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'customer.created', 'customer', $2, $3::jsonb);`,
      [orgA, customerId, JSON.stringify({ source: 'checkpoint-4' })],
    );
    await appClient.query('COMMIT');

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    const visibleRows = await appClient.query(
      `SELECT organization_id, aggregate_id, event_type FROM outbox_events WHERE aggregate_id = '${customerId}' ORDER BY occurred_at;`,
    );

    assert.equal(visibleRows.rows.length, 1, 'Tenant A must see its own outbox rows');
    assert.equal(
      visibleRows.rows[0].organization_id,
      orgA,
      'Outbox events must keep organization_id',
    );

    await assert.rejects(
      () =>
        appClient.query(
          `INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ('${orgB}', 'customer.created', 'customer', '${customerId}', '{}'::jsonb);`,
        ),
      /row-level security|permission denied|violates/i,
    );
    await appClient.query('ROLLBACK');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
