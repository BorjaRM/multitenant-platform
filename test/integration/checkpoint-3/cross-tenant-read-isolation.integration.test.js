const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-read-isolation-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-read-isolation',
};

test('TEN-REQ-004: application role sees only its own tenant data', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A') RETURNING id;")
    ).rows[0].id;
    const orgB = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-B') RETURNING id;")
    ).rows[0].id;

    await adminClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Alice A', 'alice@a.test');`,
    );
    await adminClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgB}', 'Bob B', 'bob@b.test');`,
    );

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

    const allRows = await appClient.query(
      'SELECT organization_id, full_name FROM customers ORDER BY organization_id, full_name;',
    );
    assert.equal(allRows.rows.length, 1, 'A tenant must not see rows from another organization');
    assert.equal(allRows.rows[0].organization_id, orgA);

    const rowFromOtherOrg = await appClient.query(
      `SELECT id FROM customers WHERE organization_id = '${orgB}'`,
    );
    assert.equal(rowFromOtherOrg.rows.length, 0, 'Cross-tenant reads must be filtered out');

    await appClient.query('COMMIT');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
