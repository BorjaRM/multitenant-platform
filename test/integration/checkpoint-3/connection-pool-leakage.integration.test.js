const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool, Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-pool-leakage-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  max: 1,
  idleTimeoutMillis: 5000,
  application_name: 'checkpoint-3-pool-leakage',
};

test('TEN-REQ-008: tenant context does not leak across pooled connections', async () => {
  const adminClient = new Client(adminConfig);
  const pool = new Pool(appConfig);

  try {
    await adminClient.connect();
    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A4') RETURNING id;")
    ).rows[0].id;
    const orgB = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-B4') RETURNING id;")
    ).rows[0].id;

    await adminClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Alice A2', 'alice2@a.test');`,
    );
    await adminClient.query(
      `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgB}', 'Bob B2', 'bob2@b.test');`,
    );

    for (let i = 0; i < 12; i += 1) {
      const org = i % 2 === 0 ? orgA : orgB;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_organization_id', $1, true)", [org]);
        const rows = await client.query(
          'SELECT organization_id FROM customers ORDER BY organization_id;',
        );
        assert.ok(
          rows.rows.every((row) => row.organization_id === org),
          'Pooled connection must not leak the previous tenant',
        );
        assert.equal(rows.rows.length, 1);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
    await adminClient.end();
  }
});
