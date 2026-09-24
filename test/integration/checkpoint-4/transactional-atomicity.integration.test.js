const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-4-atomicity-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-4-atomicity',
};

test('TEN-REQ-013: business change, audit and outbox are atomic in the same transaction', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A4') RETURNING id;")
    ).rows[0].id;
    const email = `alice.atomic.${Date.now()}@a.test`;
    const customerId = randomUUID();

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

    await appClient.query(
      `INSERT INTO customers (id, organization_id, full_name, email) VALUES ($1, $2, $3, $4);`,
      [customerId, orgA, 'Alice Atomic', email],
    );

    await appClient.query(
      `INSERT INTO audit_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'customer.created', 'customer', $2, $3::jsonb);`,
      [orgA, customerId, JSON.stringify({ source: 'checkpoint-4', testId: customerId })],
    );

    await appClient.query(
      `INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'customer.created', 'customer', $2, $3::jsonb);`,
      [orgA, customerId, JSON.stringify({ source: 'checkpoint-4', testId: customerId })],
    );

    await assert.rejects(
      () =>
        appClient.query(
          `INSERT INTO customers (organization_id, full_name, email) VALUES ('not-a-uuid', 'Broken', 'broken@a.test');`,
        ),
      /invalid input syntax|uuid/i,
    );

    await appClient.query('ROLLBACK');

    const customerCount = await adminClient.query(
      `SELECT COUNT(*)::int AS count FROM customers WHERE id = '${customerId}';`,
    );
    const auditCount = await adminClient.query(
      `SELECT COUNT(*)::int AS count FROM audit_events WHERE aggregate_id = '${customerId}';`,
    );
    const outboxCount = await adminClient.query(
      `SELECT COUNT(*)::int AS count FROM outbox_events WHERE aggregate_id = '${customerId}';`,
    );

    assert.equal(
      customerCount.rows[0].count,
      0,
      'A failed transaction must roll back customer creation',
    );
    assert.equal(auditCount.rows[0].count, 0, 'A failed transaction must roll back audit events');
    assert.equal(outboxCount.rows[0].count, 0, 'A failed transaction must roll back outbox events');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
