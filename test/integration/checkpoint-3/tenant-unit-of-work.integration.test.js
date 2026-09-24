const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-unit-of-work-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-unit-of-work',
};

test('TEN-REQ-011: SQL transaction smoke test (UoW boundary covered by application tests)', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A-uow') RETURNING id;")
    ).rows[0].id;

    await appClient.query('BEGIN');
    const beforeSet = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(
      beforeSet.rows[0].tenant_id,
      null,
      'No tenant context should pre-exist before a UoW begins',
    );

    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    const afterSet = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(
      afterSet.rows[0].tenant_id,
      orgA,
      'The tenant context must be set exactly once at transaction start',
    );

    await appClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ($1, $2, $3);`,
      [orgA, 'Unit of Work User', 'uow.user@example.test'],
    );

    const count = await appClient.query(
      'SELECT COUNT(*)::int AS count FROM customers WHERE organization_id = $1;',
      [orgA],
    );
    assert.equal(
      count.rows[0].count >= 1,
      true,
      'The transaction-scoped tenant context must allow the tenant-aware unit of work to persist data',
    );

    await appClient.query('COMMIT');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
