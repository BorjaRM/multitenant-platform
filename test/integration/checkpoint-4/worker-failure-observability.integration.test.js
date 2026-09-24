const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-6-observability-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-6-observability',
};

test('TEN-REQ-019: outbox schema persists supplied retry metadata', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A-obs') RETURNING id;")
    ).rows[0].id;
    const aggregateId = (
      await adminClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Observer User', 'observer.${Date.now()}@example.test') RETURNING id;`,
      )
    ).rows[0].id;

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    await appClient.query(
      `INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload, attempts, last_error) VALUES ($1, 'customer.created', 'customer', $2, $3::jsonb, 2, 'transient timeout');`,
      [orgA, aggregateId, JSON.stringify({ source: 'observability-test', tenant: orgA })],
    );
    await appClient.query('COMMIT');

    const metadata = await adminClient.query(
      'SELECT organization_id, attempts, last_error, payload FROM outbox_events WHERE aggregate_id = $1 AND organization_id = $2;',
      [aggregateId, orgA],
    );

    assert.equal(
      metadata.rows.length >= 1,
      true,
      'Outbox failures must leave observable metadata for diagnosis',
    );
    assert.equal(
      metadata.rows[0].organization_id,
      orgA,
      'The error record must keep the tenant context',
    );
    assert.equal(metadata.rows[0].attempts, 2, 'The attempt counter must be recorded');
    assert.equal(
      metadata.rows[0].last_error,
      'transient timeout',
      'The failure message must be persisted for diagnosis',
    );
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
