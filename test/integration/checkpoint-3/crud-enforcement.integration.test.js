const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../../support/database.cjs');

test('TEN-REQ-003, TEN-REQ-004, TEN-REQ-005, TEN-REQ-006: CRUD, IDs and aggregates are isolated on every business table', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const inserts = (tenant) => [
    ['locations', "(organization_id, name) VALUES ($1, 'Extra')", [tenant.organizationId]],
    [
      'customers',
      "(organization_id, full_name, email) VALUES ($1, 'Extra', 'extra@example.test')",
      [tenant.organizationId],
    ],
    [
      'sessions',
      "(organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ($1, $2, 'Extra', 10, NOW(), NOW() + INTERVAL '1 hour')",
      [tenant.organizationId, tenant.locationId],
    ],
    [
      'bookings',
      "(organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'pending')",
      [tenant.organizationId, tenant.customerId, tenant.sessionId],
    ],
    [
      'audit_events',
      "(organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2)",
      [tenant.organizationId, tenant.customerId],
    ],
    [
      'outbox_events',
      "(organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2)",
      [tenant.organizationId, tenant.customerId],
    ],
  ];
  for (const tenant of [tenantA, tenantB]) {
    for (const [table, fragment, values] of inserts(tenant)) {
      if (['bookings', 'audit_events', 'outbox_events'].includes(table))
        await database.migration.query(`INSERT INTO ${table} ${fragment}`, values);
    }
  }
  for (const [table, fragment, values] of inserts(tenantB)) {
    const before = (
      await database.migration.query(
        `SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id`,
        [tenantB.organizationId],
      )
    ).rows;
    assert.ok(before.length > 0);
    for (const organizationId of [undefined, tenantA.organizationId]) {
      await database.transaction(organizationId, async (client) => {
        const visible = await client.query(`SELECT id, organization_id FROM ${table}`);
        assert.equal(visible.rowCount, organizationId ? 1 : 0);
        assert.ok(visible.rows.every((row) => row.organization_id === organizationId));
        const byId = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [before[0].id]);
        assert.equal(byId.rowCount, 0);
        const count = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
        assert.equal(count.rows[0].count, organizationId ? 1 : 0);
        assert.equal(
          (
            await client.query(
              `UPDATE ${table} SET organization_id = organization_id WHERE id = $1`,
              [before[0].id],
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (await client.query(`DELETE FROM ${table} WHERE id = $1`, [before[0].id])).rowCount,
          0,
        );
      });
      await assert.rejects(
        database.transaction(organizationId, (client) =>
          client.query(`INSERT INTO ${table} ${fragment}`, values),
        ),
        { code: '42501' },
      );
    }
    await assert.rejects(
      database.transaction(tenantA.organizationId, (client) =>
        client.query(`UPDATE ${table} SET organization_id = $1 WHERE organization_id = $2`, [
          tenantB.organizationId,
          tenantA.organizationId,
        ]),
      ),
      { code: '42501' },
    );
    assert.deepEqual(
      (
        await database.migration.query(
          `SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id`,
          [tenantB.organizationId],
        )
      ).rows,
      before,
    );
  }
});

test('TEN-REQ-007, TEN-REQ-008: same physical connection is empty after commit, SQL error and rollback', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const pool = database.pool();
  context.after(() => pool.end());
  let backend;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const client = await pool.connect();
    try {
      const state = (
        await client.query(
          "SELECT pg_backend_pid() AS pid, NULLIF(current_setting('app.current_organization_id', true), '') AS tenant",
        )
      ).rows[0];
      backend ??= state.pid;
      assert.equal(state.pid, backend);
      assert.equal(state.tenant, null);
      assert.equal((await client.query('SELECT * FROM customers')).rowCount, 0);
      const tenant = iteration % 2 ? tenantB : tenantA;
      await database.transaction(
        tenant.organizationId,
        async (transaction) => {
          const rows = await transaction.query('SELECT organization_id FROM customers');
          assert.equal(rows.rowCount, 1);
          assert.equal(rows.rows[0].organization_id, tenant.organizationId);
        },
        client,
      );
      await assert.rejects(
        database.transaction(
          tenant.organizationId,
          (transaction) => transaction.query('SELECT 1 / 0'),
          client,
        ),
        { code: '22012' },
      );
    } finally {
      client.release();
    }
  }
});

test('TEN-REQ-003, TEN-REQ-005, TEN-REQ-006, TEN-REQ-015: idempotency and consumer state cannot cross tenants', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2) RETURNING id",
      [tenantB.organizationId, tenantB.customerId],
    )
  ).rows[0];
  const cases = [
    [
      'idempotency_keys',
      "(organization_id, key, fingerprint, result) VALUES ($1, 'key', 'fingerprint', '{}'::jsonb)",
      [tenantB.organizationId],
    ],
    [
      'consumer_receipts',
      "(organization_id, event_id, consumer) VALUES ($1, $2, 'consumer')",
      [tenantB.organizationId, event.id],
    ],
  ];
  for (const [table, fragment, values] of cases) {
    await database.migration.query(`INSERT INTO ${table} ${fragment}`, values);
    for (const organizationId of [undefined, tenantA.organizationId]) {
      await database.transaction(organizationId, async (client) => {
        assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount, 0);
        assert.equal(
          (await client.query(`UPDATE ${table} SET organization_id = organization_id`)).rowCount,
          0,
        );
        assert.equal((await client.query(`DELETE FROM ${table}`)).rowCount, 0);
      });
      await assert.rejects(
        database.transaction(organizationId, (client) =>
          client.query(`INSERT INTO ${table} ${fragment}`, values),
        ),
        { code: '42501' },
      );
    }
    assert.equal(
      (
        await database.transaction(tenantB.organizationId, (client) =>
          client.query(`SELECT * FROM ${table}`),
        )
      ).rowCount,
      1,
    );
  }
});
