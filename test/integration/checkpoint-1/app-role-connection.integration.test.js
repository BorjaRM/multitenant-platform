const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-1-harness',
};

test('TEN-REQ-012: app role can connect and cannot bypass RLS', async () => {
  const client = new Client(appConfig);

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        current_user AS current_user,
        current_database() AS current_database,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls,
        (SELECT rolname FROM pg_roles WHERE rolname = current_user) AS role_name;
    `);

    assert.equal(result.rows[0].current_user, 'fitness_app');
    assert.equal(result.rows[0].current_database, process.env.SPIKE_DATABASE || 'fitness_ops');
    assert.equal(result.rows[0].bypass_rls, false);
    assert.equal(result.rows[0].role_name, 'fitness_app');
  } finally {
    await client.end();
  }
});

test('TEN-REQ-012: application cannot mutate global control tables', async () => {
  const client = new Client(appConfig);
  try {
    await client.connect();
    for (const table of ['organizations', 'identities']) {
      const result = await client.query(
        "SELECT has_table_privilege(current_user, $1, 'DELETE') AS can_delete, has_table_privilege(current_user, $1, 'UPDATE') AS can_update",
        [table],
      );
      assert.equal(
        result.rows[0].can_delete,
        false,
        `${table} must not allow cascading tenant deletion`,
      );
      assert.equal(result.rows[0].can_update, false);
    }
  } finally {
    await client.end();
  }
});
