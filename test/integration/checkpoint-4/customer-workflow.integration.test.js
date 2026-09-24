const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture, config } = require('../../support/database.cjs');
const { TenantDatabase } = require('../../../packages/database/src/runtime.ts');
const { createCustomer } = require('../../../packages/application/src/use-cases.ts');

test('TEN-REQ-013, TEN-REQ-014, TEN-REQ-015: CreateCustomer commits exactly one customer, audit and outbox across concurrent retries', async (context) => {
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const runtime = new TenantDatabase({ ...config('fitness_app'), max: 6 });
  context.after(() => runtime.close());
  const authorizedA = await runtime.authorize(tenantA.identityId, tenantA.organizationId);
  const authorizedB = await runtime.authorize(tenantB.identityId, tenantB.organizationId);
  const input = { fullName: 'Idempotent Customer', email: 'idempotent@example.test' };
  const results = await Promise.all(
    Array.from({ length: 12 }, () => createCustomer(runtime, authorizedA, input, 'shared-key')),
  );
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  const replay = await createCustomer(runtime, authorizedA, input, 'shared-key');
  assert.deepEqual(replay, results[0]);
  await assert.rejects(
    createCustomer(runtime, authorizedA, { ...input, fullName: 'Changed' }, 'shared-key'),
    /Idempotency key conflict/,
  );
  const otherTenant = await createCustomer(runtime, authorizedB, input, 'shared-key');
  assert.notEqual(otherTenant.id, replay.id);
  for (const [tenant, entity] of [
    [tenantA, replay],
    [tenantB, otherTenant],
  ]) {
    for (const table of ['customers', 'audit_events', 'outbox_events']) {
      const column = table === 'customers' ? 'id' : 'aggregate_id';
      const rows = await database.transaction(tenant.organizationId, (client) =>
        client.query(`SELECT * FROM ${table} WHERE ${column} = $1`, [entity.id]),
      );
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].organization_id, tenant.organizationId);
    }
  }
  await assert.rejects(
    createCustomer(runtime, authorizedA, { fullName: '', email: 'invalid' }, 'invalid'),
    /Invalid customer input/,
  );
});

test('TEN-REQ-013: real audit/outbox SQL failures roll back all CreateCustomer effects and permit retry', async (context) => {
  const database = await fixture(context);
  const tenant = await database.tenant();
  const runtime = new TenantDatabase(config('fitness_app'));
  context.after(() => runtime.close());
  const authorized = await runtime.authorize(tenant.identityId, tenant.organizationId);
  for (const table of ['audit_events', 'outbox_events']) {
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `inject_${suffix}`;
    await database.migration.query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.organization_id = '${tenant.organizationId}'::uuid THEN RAISE EXCEPTION 'Injected persistence failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$`,
    );
    await database.migration.query(
      `CREATE TRIGGER ${functionName} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    const email = `${table}@example.test`;
    try {
      await assert.rejects(
        createCustomer(runtime, authorized, { fullName: 'Rollback', email }, table),
        (error) => error.cause?.code === '23514',
      );
      assert.equal(
        (
          await database.migration.query(
            'SELECT * FROM customers WHERE organization_id = $1 AND email = $2',
            [tenant.organizationId, email],
          )
        ).rowCount,
        0,
      );
      for (const name of ['audit_events', 'outbox_events', 'idempotency_keys']) {
        assert.equal(
          (
            await database.migration.query(`SELECT * FROM ${name} WHERE organization_id = $1`, [
              tenant.organizationId,
            ])
          ).rowCount,
          table === 'outbox_events' ? 1 : 0,
        );
      }
    } finally {
      await database.migration.query(`DROP TRIGGER ${functionName} ON ${table}`);
      await database.migration.query(`DROP FUNCTION ${functionName}()`);
    }
    const retried = await createCustomer(
      runtime,
      authorized,
      { fullName: 'Rollback', email },
      table,
    );
    assert.ok(retried.id);
  }
});
