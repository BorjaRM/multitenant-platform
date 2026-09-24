const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config } = require('../../support/database.cjs');
const { TenantDatabase } = require('../../../packages/database/src/runtime.ts');
const { bookSession } = require('../../../packages/application/src/use-cases.ts');
const { OutboxWorker, ReceiptConsumer } = require('../../../packages/database/src/worker.ts');

test('TEN-REQ-016, TEN-REQ-017: 50 concurrent bookings for 10 places, repeated five times with atomic events', async (context) => {
  const database = await fixture(context);
  const runtime = new TenantDatabase({ ...config('fitness_app'), max: 50 });
  context.after(() => runtime.close());
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const tenant = await database.tenant();
    const authorized = await runtime.authorize(tenant.identityId, tenant.organizationId);
    const customers = (
      await database.migration.query(
        "INSERT INTO customers (organization_id, full_name, email) SELECT $1, 'Concurrent', 'load-' || number || '@example.test' FROM generate_series(1, 50) number RETURNING id",
        [tenant.organizationId],
      )
    ).rows;
    const results = await Promise.allSettled(
      customers.map((customer) =>
        bookSession(
          runtime,
          authorized,
          { customerId: customer.id, sessionId: tenant.sessionId },
          customer.id,
        ),
      ),
    );
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(successes.length, 10);
    assert.equal(failures.length, 40);
    for (const failure of failures) {
      assert.equal(failure.reason.cause?.code, 'P0001');
      assert.match(failure.reason.cause.message, /Session capacity exceeded/);
    }
    for (const table of ['bookings', 'audit_events', 'outbox_events', 'idempotency_keys']) {
      assert.equal(
        (
          await database.transaction(tenant.organizationId, (client) =>
            client.query(`SELECT count(*)::int AS count FROM ${table}`),
          )
        ).rows[0].count,
        10,
      );
    }
    const duplicate = await database.transaction(tenant.organizationId, (client) =>
      client.query(
        'SELECT customer_id FROM bookings GROUP BY customer_id, session_id HAVING count(*) > 1',
      ),
    );
    assert.equal(duplicate.rowCount, 0);
  }
});

test('TEN-REQ-015, TEN-REQ-016, TEN-REQ-017: concurrent duplicate booking and lost response replay return one result and one event', async (context) => {
  const database = await fixture(context);
  const tenant = await database.tenant();
  const runtime = new TenantDatabase({ ...config('fitness_app'), max: 8 });
  const worker = new OutboxWorker(config('fitness_app'), () => {});
  const consumer = new ReceiptConsumer(config('fitness_app'));
  context.after(async () => {
    await runtime.close();
    await worker.close();
    await consumer.close();
  });
  const authorized = await runtime.authorize(tenant.identityId, tenant.organizationId);
  const input = { customerId: tenant.customerId, sessionId: tenant.sessionId };
  const attempts = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      bookSession(runtime, authorized, input, `attempt-${index}`),
    ),
  );
  assert.equal(new Set(attempts.map((result) => result.id)).size, 1);
  await assert.rejects(
    (async () => {
      await bookSession(runtime, authorized, input, 'lost-response');
      throw new Error('Simulated response timeout after commit');
    })(),
    /timeout after commit/,
  );
  const replay = await bookSession(runtime, authorized, input, 'lost-response');
  assert.deepEqual(replay, attempts[0]);
  const events = await database.transaction(tenant.organizationId, (client) =>
    client.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', [replay.id]),
  );
  assert.equal(events.rowCount, 1);
  const envelope = { id: events.rows[0].id, organizationId: tenant.organizationId };
  assert.equal(await worker.process(envelope, consumer.deliver), 'published');
  assert.equal(await worker.process(envelope, consumer.deliver), 'published');
  assert.equal(
    (
      await database.migration.query('SELECT * FROM consumer_receipts WHERE event_id = $1', [
        envelope.id,
      ])
    ).rowCount,
    1,
  );
});

test('TEN-REQ-017: a database lock timeout before commit leaves no partial reservation and retry succeeds', async (context) => {
  const database = await fixture(context);
  const tenant = await database.tenant();
  const runtime = new TenantDatabase({ ...config('fitness_app'), options: '-c lock_timeout=50ms' });
  context.after(() => runtime.close());
  const authorized = await runtime.authorize(tenant.identityId, tenant.organizationId);
  const input = { customerId: tenant.customerId, sessionId: tenant.sessionId };
  await database.migration.query('BEGIN');
  try {
    await database.migration.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [
      tenant.sessionId,
    ]);
    await assert.rejects(
      bookSession(runtime, authorized, input, 'lock-retry'),
      (error) => error.cause?.code === '55P03',
    );
  } finally {
    await database.migration.query('ROLLBACK');
  }
  const before = await database.transaction(tenant.organizationId, (client) =>
    client.query('SELECT * FROM bookings'),
  );
  assert.equal(before.rowCount, 0);
  const result = await bookSession(runtime, authorized, input, 'lock-retry');
  assert.ok(result.id);
  assert.deepEqual(await bookSession(runtime, authorized, input, 'lock-retry'), result);
});
