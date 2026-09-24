const { Client, Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { config } = require('../../scripts/database.cjs');

async function fixture(context) {
  const migration = new Client(config('fitness_migration'));
  const app = new Client(config('fitness_app'));
  await migration.connect();
  await app.connect();
  const organizations = [];
  const identities = [];
  context.after(async () => {
    await app.query('ROLLBACK');
    await app.end();
    try {
      for (const organizationId of organizations) {
        for (const table of [
          'consumer_receipts',
          'idempotency_keys',
          'outbox_events',
          'audit_events',
          'bookings',
          'sessions',
          'customers',
          'locations',
          'organization_users',
        ]) {
          const exists = await migration.query('SELECT to_regclass($1) AS name', [table]);
          if (exists.rows[0].name)
            await migration.query(`DELETE FROM ${table} WHERE organization_id = $1`, [
              organizationId,
            ]);
        }
        await migration.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
      }
      for (const identityId of identities)
        await migration.query('DELETE FROM identities WHERE id = $1', [identityId]);
    } finally {
      await migration.end();
    }
  });
  async function tenant() {
    const organizationId = (
      await migration.query(
        "INSERT INTO organizations (name) VALUES ('Integration tenant') RETURNING id",
      )
    ).rows[0].id;
    organizations.push(organizationId);
    const identityId = (
      await migration.query('INSERT INTO identities (email) VALUES ($1) RETURNING id', [
        `${randomUUID()}@example.test`,
      ])
    ).rows[0].id;
    identities.push(identityId);
    await migration.query(
      'INSERT INTO organization_users (organization_id, identity_id) VALUES ($1, $2)',
      [organizationId, identityId],
    );
    const locationId = (
      await migration.query(
        "INSERT INTO locations (organization_id, name) VALUES ($1, 'Location') RETURNING id",
        [organizationId],
      )
    ).rows[0].id;
    const customerId = (
      await migration.query(
        "INSERT INTO customers (organization_id, full_name, email) VALUES ($1, 'Customer', $2) RETURNING id",
        [organizationId, `${randomUUID()}@example.test`],
      )
    ).rows[0].id;
    const sessionId = (
      await migration.query(
        "INSERT INTO sessions (organization_id, location_id, name, capacity, starts_at, ends_at) VALUES ($1, $2, 'Session', 10, NOW(), NOW() + INTERVAL '1 hour') RETURNING id",
        [organizationId, locationId],
      )
    ).rows[0].id;
    return { organizationId, identityId, locationId, customerId, sessionId };
  }
  async function transaction(organizationId, operation, client = app) {
    await client.query('BEGIN');
    try {
      if (organizationId)
        await client.query("SELECT set_config('app.current_organization_id', $1, true)", [
          organizationId,
        ]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return {
    migration,
    app,
    tenant,
    transaction,
    pool: () => new Pool({ ...config('fitness_app'), max: 1 }),
  };
}
module.exports = { fixture, config };
