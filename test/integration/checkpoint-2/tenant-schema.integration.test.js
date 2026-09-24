const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const appConfig = {
  host: process.env.SPIKE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SPIKE_DB_PORT || 5432),
  database: process.env.SPIKE_DATABASE || 'fitness_ops',
  user: 'fitness_app',
  password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
  application_name: 'checkpoint-2-tenant-schema',
};

const expectedTables = [
  'organization_users',
  'locations',
  'customers',
  'sessions',
  'bookings',
  'audit_events',
  'outbox_events',
];

test('TEN-REQ-009: tenant tables include organization_id and required schema exists', async () => {
  const client = new Client(appConfig);

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
        AND column_name = 'organization_id'
      ORDER BY table_name;
    `,
      [expectedTables],
    );

    const tablesWithOrganizationId = new Set(result.rows.map((row) => row.table_name));
    for (const row of result.rows) assert.equal(row.is_nullable, 'NO', row.table_name);
    assert.deepEqual(
      Array.from(tablesWithOrganizationId).sort(),
      expectedTables.slice().sort(),
      'All tenant-scoped tables must include organization_id',
    );
  } finally {
    await client.end();
  }
});

test('TEN-REQ-009, TEN-REQ-010: Drizzle table and column definitions match PostgreSQL migrations', async () => {
  const { getTableConfig } = require('drizzle-orm/pg-core');
  const schema = require('../../../packages/database/src/schema.ts');
  const client = new Client(appConfig);
  try {
    await client.connect();
    for (const table of Object.values(schema)) {
      const definition = getTableConfig(table);
      const actual = await client.query(
        'SELECT attname AS name, attnotnull AS not_null FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attname',
        [definition.name],
      );
      assert.deepEqual(
        actual.rows,
        definition.columns
          .map((column) => ({ name: column.name, not_null: column.notNull }))
          .sort((left, right) => left.name.localeCompare(right.name)),
        definition.name,
      );
      const constraints = await client.query(
        `SELECT confrelid::regclass::text AS target, confdeltype AS on_delete,
        ARRAY(SELECT attname::text FROM unnest(conkey) WITH ORDINALITY AS keys(attnum, position) JOIN pg_attribute USING (attnum) WHERE attrelid = conrelid ORDER BY position) AS columns,
        ARRAY(SELECT attname::text FROM unnest(confkey) WITH ORDINALITY AS keys(attnum, position) JOIN pg_attribute USING (attnum) WHERE attrelid = confrelid ORDER BY position) AS foreign_columns
        FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'f'`,
        [definition.name],
      );
      assert.equal(constraints.rowCount, definition.foreignKeys.length, definition.name);
      for (const foreignKey of definition.foreignKeys) {
        const reference = foreignKey.reference();
        const expected = {
          target: getTableConfig(reference.foreignTable).name,
          columns: reference.columns.map((column) => column.name),
          foreign_columns: reference.foreignColumns.map((column) => column.name),
          on_delete: {
            'no action': 'a',
            restrict: 'r',
            cascade: 'c',
            'set null': 'n',
            'set default': 'd',
          }[foreignKey.onDelete],
        };
        assert.ok(
          constraints.rows.some(
            (row) =>
              JSON.stringify(row) ===
              JSON.stringify({
                target: expected.target,
                on_delete: expected.on_delete,
                columns: expected.columns,
                foreign_columns: expected.foreign_columns,
              }),
          ),
          foreignKey.getName(),
        );
      }
    }
  } finally {
    await client.end();
  }
});
