const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { config, migrate } = require('./database.cjs');
const mutations = [
  [
    'RLS removed',
    'ALTER TABLE customers DISABLE ROW LEVEL SECURITY',
    'checkpoint-3/missing-tenant-context.integration.test.js',
    'ALTER TABLE customers ENABLE ROW LEVEL SECURITY',
  ],
  [
    'NOT NULL removed',
    'ALTER TABLE customers ALTER COLUMN organization_id DROP NOT NULL',
    'checkpoint-2/tenant-schema.integration.test.js',
    'ALTER TABLE customers ALTER COLUMN organization_id SET NOT NULL',
  ],
  [
    'Composite FK removed',
    'ALTER TABLE bookings DROP CONSTRAINT bookings_session_tenant_match',
    'checkpoint-2/cross-tenant-foreign-keys.integration.test.js',
    'ALTER TABLE bookings ADD CONSTRAINT bookings_session_tenant_match FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id) ON DELETE RESTRICT',
  ],
];
async function main() {
  const admin = new Client(config('postgres', 'postgres'));
  const database = `spike_mutation_${process.pid}_${Date.now()}`;
  let created = false;
  let migration;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database} OWNER fitness_migration`);
    created = true;
    await migrate(database);
    migration = new Client(config('fitness_migration', database));
    await migration.connect();
    for (const [name, mutation, file, restore] of mutations) {
      const args = [
        '--require',
        'tsx/cjs',
        '--test',
        '--test-reporter=tap',
        `test/integration/${file}`,
      ];
      const options = {
        encoding: 'utf8',
        env: { ...process.env, SPIKE_DATABASE: database },
        timeout: 30000,
      };
      const baseline = spawnSync(process.execPath, args, options);
      assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
      await migration.query(mutation);
      try {
        const result = spawnSync(process.execPath, args, options);
        assert.equal(result.status, 1, `${name}: mutant survived or execution failed unexpectedly`);
        assert.match(result.stdout, /ERR_ASSERTION/);
        console.log(`${name}: detected by ${file}`);
      } finally {
        if (name === 'Composite FK removed')
          await migration.query(
            'DELETE FROM bookings WHERE organization_id <> (SELECT organization_id FROM sessions WHERE sessions.id = bookings.session_id)',
          );
        await migration.query(restore);
      }
    }
  } finally {
    if (migration) await migration.end();
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
