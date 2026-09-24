const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-2-cross-tenant-fks-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-2-cross-tenant-fks',
};

test('TEN-REQ-010: PostgreSQL rejects tenant mismatches in bookings', async () => {
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

    const locationA = (
      await adminClient.query(
        `INSERT INTO locations (organization_id, name) VALUES ('${orgA}', 'Location A') RETURNING id;`,
      )
    ).rows[0].id;
    const locationB = (
      await adminClient.query(
        `INSERT INTO locations (organization_id, name) VALUES ('${orgB}', 'Location B') RETURNING id;`,
      )
    ).rows[0].id;
    const customerA = (
      await adminClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Customer A', 'a@example.com') RETURNING id;`,
      )
    ).rows[0].id;
    const customerB = (
      await adminClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgB}', 'Customer B', 'b@example.com') RETURNING id;`,
      )
    ).rows[0].id;
    const sessionA = (
      await adminClient.query(
        `INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ('${orgA}', '${locationA}', 'Session A', 10, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours') RETURNING id;`,
      )
    ).rows[0].id;
    const sessionB = (
      await adminClient.query(
        `INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ('${orgB}', '${locationB}', 'Session B', 10, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours') RETURNING id;`,
      )
    ).rows[0].id;

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

    await assert.rejects(
      async () => {
        await appClient.query(`
          INSERT INTO bookings (organization_id, customer_id, session_id, status)
          VALUES ('${orgA}', '${customerB}', '${sessionA}', 'pending');
        `);
      },
      { code: '23503', constraint: 'bookings_customer_tenant_match' },
    );

    await appClient.query('ROLLBACK');

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);

    await assert.rejects(
      async () => {
        await appClient.query(`
          INSERT INTO bookings (organization_id, customer_id, session_id, status)
          VALUES ('${orgA}', '${customerA}', '${sessionB}', 'pending');
        `);
      },
      { code: '23503', constraint: 'bookings_session_tenant_match' },
    );

    await appClient.query('ROLLBACK');
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
