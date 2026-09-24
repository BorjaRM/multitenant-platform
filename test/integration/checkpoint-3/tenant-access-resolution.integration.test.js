const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const adminConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_migration',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-access-resolution-admin',
};

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-access-resolution',
};

test('TEN-REQ-002: backend resolves organization membership before tenant work', async () => {
  const adminClient = new Client(adminConfig);
  const appClient = new Client(appConfig);

  try {
    await adminClient.connect();
    await appClient.connect();

    const orgA = (
      await adminClient.query(
        "INSERT INTO organizations (name) VALUES ('Org-A-access') RETURNING id;",
      )
    ).rows[0].id;
    const orgB = (
      await adminClient.query(
        "INSERT INTO organizations (name) VALUES ('Org-B-access') RETURNING id;",
      )
    ).rows[0].id;

    const identityId = (
      await adminClient.query(
        "INSERT INTO identities (email) VALUES ('access.member.' || gen_random_uuid() || '@example.test') RETURNING id;",
      )
    ).rows[0].id;
    await adminClient.query(
      `INSERT INTO organization_users (organization_id, identity_id, role) VALUES ('${orgA}', '${identityId}', 'member');`,
    );

    const ownMembership = await appClient.query(
      'SELECT resolve_tenant_access($1::uuid, $2::uuid) AS is_member',
      [identityId, orgA],
    );
    assert.equal(ownMembership.rows[0].is_member, true);

    const membership = await appClient.query(
      'SELECT resolve_tenant_access($1::uuid, $2::uuid) AS is_member',
      [identityId, orgB],
    );

    assert.equal(
      membership.rows[0].is_member,
      false,
      'The current identity must not be authorized for another organization',
    );

    const tenant = await appClient.query(
      "SELECT current_setting('app.current_organization_id', true) AS tenant",
    );
    assert.equal(tenant.rows[0].tenant, null);
  } finally {
    await appClient.end();
    await adminClient.end();
  }
});
