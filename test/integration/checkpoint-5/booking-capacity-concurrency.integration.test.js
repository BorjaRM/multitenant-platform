const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-5-capacity-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-5-capacity',
};

test('TEN-REQ-016: confirmed bookings never exceed session capacity under concurrent inserts', async () => {
  const adminClient = new Client(adminConfig);

  try {
    await adminClient.connect();

    const orgA = (
      await adminClient.query("INSERT INTO organizations (name) VALUES ('Org-A5') RETURNING id;")
    ).rows[0].id;
    const locationId = (
      await adminClient.query(
        `INSERT INTO locations (organization_id, name) VALUES ('${orgA}', 'Location C') RETURNING id;`,
      )
    ).rows[0].id;
    const sessionId = (
      await adminClient.query(
        `INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ('${orgA}', '${locationId}', 'Capacity test session', 2, NOW() + interval '1 hour', NOW() + interval '2 hours') RETURNING id;`,
      )
    ).rows[0].id;

    const customers = [];
    for (let i = 0; i < 5; i += 1) {
      const email = `capacity.${Date.now()}.${i}@a.test`;
      const customer = (
        await adminClient.query(
          `INSERT INTO customers (organization_id, full_name, email) VALUES ('${orgA}', 'Capacity User ${i}', '${email}') RETURNING id;`,
        )
      ).rows[0].id;
      customers.push(customer);
    }

    const workers = customers.map(async (customerId) => {
      const client = new Client(appConfig);
      await client.connect();

      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_organization_id', $1, true)", [orgA]);
        await client.query(
          `INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'confirmed');`,
          [orgA, customerId, sessionId],
        );
        await client.query('COMMIT');
        return { ok: true };
      } catch (error) {
        await client.query('ROLLBACK');
        assert.equal(error.code, 'P0001');
        assert.match(error.message, /Session capacity exceeded/);
        return { ok: false, error: error.message };
      } finally {
        await client.end();
      }
    });

    const results = await Promise.all(workers);
    const accepted = results.filter((r) => r.ok).length;

    const count = (
      await adminClient.query(
        `SELECT COUNT(*)::int AS count FROM bookings WHERE organization_id = '${orgA}' AND session_id = '${sessionId}' AND status = 'confirmed';`,
      )
    ).rows[0].count;

    assert.ok(
      count <= 2,
      `Capacity must not be exceeded; observed ${count} confirmed bookings for capacity 2`,
    );
    assert.equal(count, 2, `Expected exactly 2 confirmed bookings, got ${count}`);
    assert.ok(
      accepted <= 2,
      `No more than capacity can succeed; got ${accepted} accepted insertions`,
    );
  } finally {
    await adminClient.end();
  }
});
