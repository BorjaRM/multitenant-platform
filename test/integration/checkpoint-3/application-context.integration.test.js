const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config } = require('../../support/database.cjs');

test('TEN-REQ-001, TEN-REQ-002, TEN-REQ-011: real UoW rejects missing, forged, revoked and payload tenant contexts', async (context) => {
  const { TenantDatabase } = require('../../../packages/database/src/runtime.ts');
  const { createCustomer } = require('../../../packages/application/src/use-cases.ts');
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const runtime = new TenantDatabase({ ...config('fitness_app'), max: 1 });
  context.after(() => runtime.close());
  let called = false;
  for (const candidate of [
    undefined,
    { identityId: tenantA.identityId, organizationId: tenantB.organizationId },
  ]) {
    await assert.rejects(
      runtime.execute(candidate, async () => {
        called = true;
      }),
      /authorized/i,
    );
  }
  assert.equal(called, false);
  await assert.rejects(
    runtime.authorize(tenantA.identityId, tenantB.organizationId),
    /access denied/i,
  );
  const authorized = await runtime.authorize(tenantA.identityId, tenantA.organizationId);
  await assert.rejects(
    createCustomer(
      runtime,
      authorized,
      { fullName: 'Forged', email: 'forged@example.test', organizationId: tenantB.organizationId },
      'forged',
    ),
    /tenant/i,
  );
  const created = await createCustomer(
    runtime,
    authorized,
    { fullName: 'Valid', email: 'valid@example.test' },
    'valid',
  );
  assert.equal(created.organizationId, tenantA.organizationId);
  let escaped;
  await runtime.execute(authorized, async (repositories) => {
    escaped = repositories;
  });
  await assert.rejects(
    escaped.createCustomer({ fullName: 'Late', email: 'late@example.test' }),
    /transaction/i,
  );
  await database.migration.query(
    'DELETE FROM organization_users WHERE organization_id = $1 AND identity_id = $2',
    [tenantA.organizationId, tenantA.identityId],
  );
  await assert.rejects(
    createCustomer(
      runtime,
      authorized,
      { fullName: 'Revoked', email: 'revoked@example.test' },
      'revoked',
    ),
    /access denied/i,
  );
});

test('TEN-REQ-007, TEN-REQ-008, TEN-REQ-011: real pooled UoW recovers from rollback and never exposes the preceding tenant', async (context) => {
  const { TenantDatabase } = require('../../../packages/database/src/runtime.ts');
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const runtime = new TenantDatabase({ ...config('fitness_app'), max: 1 });
  context.after(() => runtime.close());
  const authorizedA = await runtime.authorize(tenantA.identityId, tenantA.organizationId);
  const authorizedB = await runtime.authorize(tenantB.identityId, tenantB.organizationId);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    await assert.rejects(
      runtime.execute(authorizedA, async (repositories) => {
        await repositories.createCustomer({
          fullName: 'Rolled back',
          email: `rollback-${iteration}@example.test`,
        });
        throw new Error('Injected operation error');
      }),
      /Injected operation error/,
    );
    await assert.rejects(
      runtime.execute(undefined, async (repositories) => repositories.listCustomers()),
      /authorized/i,
    );
    const visible = await runtime.execute(authorizedB, (repositories) =>
      repositories.listCustomers(),
    );
    assert.equal(visible.length, 1);
    assert.equal(visible[0].organizationId, tenantB.organizationId);
    const own = await runtime.execute(authorizedA, (repositories) => repositories.listCustomers());
    assert.equal(own.length, 1);
    assert.equal(own[0].organizationId, tenantA.organizationId);
  }
});
