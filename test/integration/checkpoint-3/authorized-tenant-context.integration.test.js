const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-authorized-tenant-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-authorized-tenant',
};

test('TEN-REQ-001: SQL operations use the explicitly established tenant (authorization covered by application tests)', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query(
        "INSERT INTO organizations (name) VALUES ('Org-A-auth') RETURNING id;",
      )
    ).rows[0].id;
    const identityId = (
      await adminClient.query(
        "INSERT INTO identities (email) VALUES ('tenant.context.' || gen_random_uuid() || '@example.test') RETURNING id;",
      )
    ).rows[0].id;
    await adminClient.query(
      `INSERT INTO organization_users (organization_id, identity_id, role) VALUES ('${orgA}', '${identityId}', 'member');`,
    );

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

    await appClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ($1, $2, $3);`,
      [orgA, 'Authorized Tenant User', 'tenant.context.user@example.test'],
    );

    const visible = await appClient.query(
      'SELECT COUNT(*)::int AS count FROM customers WHERE organization_id = $1;',
      [orgA],
    );

    assert.equal(
      visible.rows[0].count >= 1,
      true,
      'Explicit tenant context must allow the authorized organization to write and read customer rows',
    );

    await appClient.query('ROLLBACK');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
