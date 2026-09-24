const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-transaction-local-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-transaction-local',
};

test('TEN-REQ-007: tenant context is transaction-local', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A3') RETURNING id;")
    ).rows[0].id;

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    const inTx = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(
      inTx.rows[0].tenant_id,
      orgA,
      'Tenant context must be available within the transaction',
    );
    await appClient.query('COMMIT');

    const afterCommit = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(afterCommit.rows[0].tenant_id, '', 'Tenant context must be cleared after commit');

    await appClient.query('BEGIN');
    const beforeSet = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant_id;",
    );
    assert.equal(
      beforeSet.rows[0].tenant_id,
      '',
      'No prior tenant context may survive into a new transaction',
    );
    await appClient.query('ROLLBACK');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
