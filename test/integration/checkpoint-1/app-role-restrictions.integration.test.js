const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../../support/database.cjs');

test('TEN-REQ-012: app cannot delete control data, alter policies, disable RLS or assume migration role', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  for (const query of [
    `DELETE FROM organizations WHERE id = '${tenantB.organizationId}'`,
    `DELETE FROM identities WHERE id = '${tenantB.identityId}'`,
    `INSERT INTO organization_users (organization_id, identity_id) VALUES ('${tenantB.organizationId}', '${tenantA.identityId}')`,
    'ALTER TABLE customers DISABLE ROW LEVEL SECURITY',
    'DROP POLICY customers_tenant_isolation_select ON customers',
    'SET ROLE fitness_migration',
    'CREATE TABLE forbidden_migration (id integer)',
    'TRUNCATE customers',
  ])
    await assert.rejects(
      database.transaction(tenantA.organizationId, (client) => client.query(query)),
      { code: '42501' },
    );
  assert.equal(
    (await database.migration.query('SELECT * FROM customers WHERE id = $1', [tenantB.customerId]))
      .rowCount,
    1,
  );
  const role = (
    await database.app.query(
      'SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    )
  ).rows[0];
  assert.deepEqual(role, {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
  assert.equal(
    (
      await database.app.query(
        "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user",
      )
    ).rows[0].count,
    0,
  );
});

test('TEN-REQ-012: migrations reapply as migration role without losing tenant data', async (context) => {
  const { migrate } = require('../../../scripts/database.cjs');
  assert.match(process.env.SPIKE_DATABASE || '', /^spike_test_/);
  const database = await fixture(context);
  const tenant = await database.tenant();
  await database.transaction(tenant.organizationId, (client) =>
    client.query(
      "INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES ($1, $2, $3, 'cancelled'), ($1, $2, $3, 'confirmed')",
      [tenant.organizationId, tenant.customerId, tenant.sessionId],
    ),
  );
  const before = (
    await database.migration.query(
      'SELECT * FROM bookings WHERE organization_id = $1 ORDER BY id',
      [tenant.organizationId],
    )
  ).rows;
  await migrate(process.env.SPIKE_DATABASE);
  assert.deepEqual(
    (
      await database.migration.query(
        'SELECT * FROM bookings WHERE organization_id = $1 ORDER BY id',
        [tenant.organizationId],
      )
    ).rows,
    before,
  );
  const owners = await database.app.query(
    "SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'",
  );
  assert.deepEqual(owners.rows, [{ tableowner: 'fitness_migration' }]);
});
