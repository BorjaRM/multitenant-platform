const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-3-missing-tenant',
};

test('TEN-REQ-003: operations without tenant context are rejected', async () => {
  const appClient = new Client(appConfig);

  try {
    await appClient.connect();

    await appClient.query('BEGIN');

    await assert.rejects(
      async () => {
        await appClient.query(
          "INSERT INTO customers (organization_id, full_name, email) VALUES (gen_random_uuid(), 'No Tenant User', 'missing.context@example.test');",
        );
      },
      { code: '42501' },
    );

    await appClient.query('ROLLBACK');
  } finally {
    await appClient.end();
  }
});
