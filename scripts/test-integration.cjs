const { Client } = require('pg');
const { spawn } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { config, migrate } = require('./database.cjs');
async function main() {
  const admin = new Client(config('postgres', 'postgres'));
  const database = `spike_test_${process.pid}_${Date.now()}`;
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database} OWNER fitness_migration`);
    created = true;
    await migrate(database);
    await migrate(database);
    const checkpoints = process.argv.slice(2);
    const directories = checkpoints.length
      ? checkpoints.map((value) => `checkpoint-${Number(value)}`)
      : readdirSync('test/integration');
    const files = directories.flatMap((directory) =>
      readdirSync(`test/integration/${directory}`)
        .filter((file) => file.endsWith('.test.js'))
        .map((file) => `test/integration/${directory}/${file}`),
    );
    const child = spawn(
      process.execPath,
      ['--require', 'tsx/cjs', '--test', '--test-concurrency=1', ...files],
      {
        stdio: 'inherit',
        env: { ...process.env, SPIKE_DATABASE: database },
      },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
