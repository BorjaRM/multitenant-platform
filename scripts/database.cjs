const { Client } = require('pg');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
function config(user, database = process.env.SPIKE_DATABASE || 'fitness_ops') {
  const host = process.env.SPIKE_DB_HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost'].includes(host))
    throw new Error('Only local spike databases are allowed');
  return {
    host,
    port: Number(process.env.SPIKE_DB_PORT || 5432),
    database,
    user,
    password: process.env.SPIKE_DB_PASSWORD || 'local-only-password',
    connectionTimeoutMillis: 5000,
  };
}
async function migrate(database) {
  const client = new Client(config('fitness_migration', database));
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const file of readdirSync(
      path.join(__dirname, '../infrastructure/postgres/init'),
    ).sort()) {
      if (file.endsWith('.sql') && !file.startsWith('01-'))
        await client.query(
          readFileSync(path.join(__dirname, '../infrastructure/postgres/init', file), 'utf8'),
        );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
module.exports = { config, migrate };
if (require.main === module)
  migrate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
