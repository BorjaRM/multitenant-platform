const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-write-isolation-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-write-isolation',
};

test('TEN-REQ-005: writes cannot cross tenant boundaries', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A2') RETURNING id;")
    ).rows[0].id;
    const orgB = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-B2') RETURNING id;")
    ).rows[0].id;

    const customerB = (
      await adminClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgB}', 'Outside User', 'outside@b.test') RETURNING id;`,
      )
    ).rows[0].id;

    await appClient.query('BEGIN');
    await appClient.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
    await appClient.query('SAVEPOINT denied_insert');

    await assert.rejects(async () => {
      await appClient.query(
        `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgB}', 'Attacker', 'attacker@b.test');`,
      );
    }, /row-level security|permission denied|violates/i);
    await appClient.query('ROLLBACK TO SAVEPOINT denied_insert');

    const beforeUpdate = await appClient.query(
      `SELECT full_name FROM customers WHERE organization_id = '${orgB}' AND email = 'outside@b.test';`,
    );
    await appClient.query(
      `UPDATE customers SET full_name = 'tampered' WHERE organization_id = '${orgB}' AND email = 'outside@b.test';`,
    );
    const afterUpdate = await appClient.query(
      `SELECT full_name FROM customers WHERE organization_id = '${orgB}' AND email = 'outside@b.test';`,
    );
    assert.equal(beforeUpdate.rows.length, 0, 'Tenant A must not access rows from tenant B');
    assert.equal(
      afterUpdate.rows.length,
      0,
      'Tenant A must not be able to update rows from tenant B',
    );

    const beforeDelete = await appClient.query(
      `SELECT count(*)::int AS count FROM customers WHERE organization_id = '${orgB}'`,
    );
    await appClient.query(`DELETE FROM customers WHERE organization_id = '${orgB}'`);
    const afterDelete = await appClient.query(
      `SELECT count(*)::int AS count FROM customers WHERE organization_id = '${orgB}'`,
    );
    assert.equal(beforeDelete.rows[0].count, 0, 'Tenant A must not see tenant B rows to delete');
    assert.equal(afterDelete.rows[0].count, 0, 'Tenant A must not delete tenant B rows');

    const unchanged = await adminClient.query('SELECT full_name FROM customers WHERE id = $1', [
      customerB,
    ]);
    assert.equal(unchanged.rows[0].full_name, 'Outside User');
    await appClient.query('ROLLBACK');
    await adminClient.query(`DELETE FROM customers WHERE id = '${customerB}'`);
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
