const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-rls-config',
};

const tenantTables = [
  'organization_users',
  'locations',
  'customers',
  'sessions',
  'bookings',
  'audit_events',
  'outbox_events',
  'idempotency_keys',
  'consumer_receipts',
];

test('TEN-REQ-006: tenant tables have enforced RLS and policies', async () => {
  const client = new Client(appConfig);

  try {
    await client.connect();

    const relResult = await client.query(
      `
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = ANY($1)
      ORDER BY relname;
    `,
      [tenantTables],
    );

    assert.equal(relResult.rows.length, tenantTables.length, 'All tenant tables must exist');
    for (const row of relResult.rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS enabled`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname} must force RLS`);
    }

    const policyResult = await client.query(
      `
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY($1)
      ORDER BY tablename, policyname, cmd;
    `,
      [tenantTables],
    );

    const policyMap = new Map();
    for (const row of policyResult.rows) {
      const key = `${row.tablename}:${row.cmd}`;
      policyMap.set(key, row.policyname);
    }

    for (const tableName of tenantTables) {
      for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const policies = await client.query(
          "SELECT cmd, qual, with_check FROM pg_policies WHERE schemaname = $1 AND tablename = $2 AND (roles @> ARRAY[current_user]::name[] OR roles @> ARRAY['public']::name[])",
          ['public', tableName],
        );
        assert.ok(
          policies.rows.some(
            (row) =>
              (row.cmd === command || row.cmd === 'ALL') &&
              (command === 'INSERT' ? row.with_check : row.qual),
          ),
          `${tableName}: ${command}`,
        );
      }
    }

    const bypassResult = await client.query(`
      SELECT rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user;
    `);
    assert.equal(bypassResult.rows[0].rolbypassrls, false, 'Application role must not bypass RLS');
  } finally {
    await client.end();
  }
});
