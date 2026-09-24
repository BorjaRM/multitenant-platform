const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config } = require('../../support/database.cjs');

test('TEN-REQ-014, TEN-REQ-018, TEN-REQ-019: worker rejects missing/wrong tenant and concurrent delivery has one durable receipt', async (context) => {
  const { OutboxWorker, ReceiptConsumer } = require('../../../packages/database/src/worker.ts');
  const database = await fixture(context);
  const tenantA = await database.tenant();
  const tenantB = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2) RETURNING id",
      [tenantA.organizationId, tenantA.customerId],
    )
  ).rows[0];
  const logs = [];
  const worker = new OutboxWorker(
    { ...config('fitness_app'), max: 1 },
    (entry) => logs.push(entry),
    { retryDelayMs: 0 },
  );
  const secondWorker = new OutboxWorker(
    { ...config('fitness_app'), max: 1 },
    (entry) => logs.push(entry),
    { retryDelayMs: 0 },
  );
  const consumer = new ReceiptConsumer(config('fitness_app'));
  context.after(async () => {
    await worker.close();
    await secondWorker.close();
    await consumer.close();
  });
  await assert.rejects(worker.process({ id: event.id }, consumer.deliver), /tenant/i);
  assert.equal(
    await worker.process(
      { id: event.id, organizationId: tenantB.organizationId },
      consumer.deliver,
    ),
    'unavailable',
  );
  const envelope = { id: event.id, organizationId: tenantA.organizationId };
  const results = await Promise.all([
    worker.process(envelope, consumer.deliver),
    secondWorker.process(envelope, consumer.deliver),
  ]);
  assert.deepEqual(results.sort(), ['published', 'published']);
  assert.equal(
    (
      await database.migration.query('SELECT * FROM consumer_receipts WHERE event_id = $1', [
        event.id,
      ])
    ).rowCount,
    1,
  );
  assert.equal(logs.length, 0);
  const published = (
    await database.migration.query('SELECT * FROM outbox_events WHERE id = $1', [event.id])
  ).rows[0];
  assert.ok(published.published_at);
  assert.equal(published.attempts, 1);
  assert.equal(
    await worker.process(
      { id: event.id, organizationId: tenantB.organizationId },
      consumer.deliver,
    ),
    'unavailable',
  );
});

test('TEN-REQ-017, TEN-REQ-018, TEN-REQ-019: retry after durable delivery preserves tenant and deduplicates the effect', async (context) => {
  const { OutboxWorker, ReceiptConsumer } = require('../../../packages/database/src/worker.ts');
  const database = await fixture(context);
  const tenant = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'customer.created', 'customer', $2, $3::jsonb) RETURNING id, correlation_id",
      [
        tenant.organizationId,
        tenant.customerId,
        JSON.stringify({ email: 'sensitive@example.test', token: 'do-not-log' }),
      ],
    )
  ).rows[0];
  const logs = [];
  const worker = new OutboxWorker(config('fitness_app'), (entry) => logs.push(entry), {
    retryDelayMs: 0,
    maxAttempts: 3,
  });
  const consumer = new ReceiptConsumer(config('fitness_app'));
  context.after(async () => {
    await worker.close();
    await consumer.close();
  });
  const envelope = { id: event.id, organizationId: tenant.organizationId };
  assert.equal(
    await worker.process(envelope, async (message) => {
      await consumer.deliver(message);
      throw new Error('Lost acknowledgement sensitive@example.test do-not-log');
    }),
    'retry',
  );
  assert.equal(await worker.process(envelope, consumer.deliver), 'published');
  assert.equal(
    (
      await database.migration.query('SELECT * FROM consumer_receipts WHERE event_id = $1', [
        event.id,
      ])
    ).rowCount,
    1,
  );
  const saved = (
    await database.migration.query('SELECT * FROM outbox_events WHERE id = $1', [event.id])
  ).rows[0];
  assert.equal(saved.attempts, 2);
  assert.ok(saved.published_at);
  assert.equal(logs[0].organizationId, tenant.organizationId);
  assert.equal(logs[0].correlationId, event.correlation_id);
  assert.equal(logs[0].attempt, 1);
  assert.equal(logs[0].code, 'DELIVERY_FAILED');
  assert.doesNotMatch(JSON.stringify(logs), /sensitive|do-not-log|payload|Lost acknowledgement/);
});

test('TEN-REQ-019: permanent delivery failure is bounded, observable and quarantined', async (context) => {
  const { OutboxWorker } = require('../../../packages/database/src/worker.ts');
  const database = await fixture(context);
  const tenant = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2) RETURNING id",
      [tenant.organizationId, tenant.customerId],
    )
  ).rows[0];
  const logs = [];
  const worker = new OutboxWorker(config('fitness_app'), (entry) => logs.push(entry), {
    retryDelayMs: 0,
    maxAttempts: 3,
  });
  context.after(() => worker.close());
  const envelope = { id: event.id, organizationId: tenant.organizationId };
  const failedDelivery = async () => {
    throw new Error('Sensitive payload');
  };
  assert.equal(await worker.process(envelope, failedDelivery), 'retry');
  assert.equal(await worker.process(envelope, failedDelivery), 'retry');
  assert.equal(await worker.process(envelope, failedDelivery), 'failed');
  assert.equal(await worker.process(envelope, failedDelivery), 'failed');
  const saved = (
    await database.migration.query('SELECT * FROM outbox_events WHERE id = $1', [event.id])
  ).rows[0];
  assert.equal(saved.attempts, 3);
  assert.equal(saved.last_error, 'DELIVERY_FAILED');
  assert.ok(saved.failed_at);
  assert.equal(saved.published_at, null);
  assert.deepEqual(
    logs.map((entry) => entry.attempt),
    [1, 2, 3],
  );
});

test('TEN-REQ-017, TEN-REQ-018, TEN-REQ-019: connection loss after durable consumer effect is replayable', async (context) => {
  const { OutboxWorker, ReceiptConsumer } = require('../../../packages/database/src/worker.ts');
  const database = await fixture(context);
  const tenant = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2) RETURNING id",
      [tenant.organizationId, tenant.customerId],
    )
  ).rows[0];
  const workerName = `worker-crash-${event.id}`;
  const logs = [];
  const worker = new OutboxWorker(
    { ...config('fitness_app'), application_name: workerName },
    (entry) => logs.push(entry),
  );
  const consumer = new ReceiptConsumer(config('fitness_app'));
  context.after(async () => {
    await worker.close();
    await consumer.close();
  });
  const envelope = { id: event.id, organizationId: tenant.organizationId };
  await assert.rejects(
    worker.process(envelope, async (message) => {
      await consumer.deliver(message);
      const backend = await database.app.query(
        'SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1',
        [workerName],
      );
      assert.equal(backend.rowCount, 1);
      await database.app.query('SELECT pg_terminate_backend($1)', [backend.rows[0].pid]);
    }),
    /connection|terminat|query|client/i,
  );
  const before = (
    await database.migration.query('SELECT published_at FROM outbox_events WHERE id = $1', [
      event.id,
    ])
  ).rows[0];
  assert.equal(before.published_at, null);
  assert.equal(await worker.process(envelope, consumer.deliver), 'published');
  assert.equal(
    (
      await database.migration.query('SELECT * FROM consumer_receipts WHERE event_id = $1', [
        event.id,
      ])
    ).rowCount,
    1,
  );
  assert.equal(logs[0].code, 'TRANSACTION_FAILED');
  assert.equal(logs[0].organizationId, tenant.organizationId);
  assert.equal(logs[0].attempt, 1);
});

test('TEN-REQ-019: scheduled retries do not deliver or increment attempts before available_at', async (context) => {
  const { OutboxWorker } = require('../../../packages/database/src/worker.ts');
  const database = await fixture(context);
  const tenant = await database.tenant();
  const event = (
    await database.migration.query(
      "INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'customer.created', 'customer', $2) RETURNING id",
      [tenant.organizationId, tenant.customerId],
    )
  ).rows[0];
  const worker = new OutboxWorker(config('fitness_app'), () => {}, { retryDelayMs: 60000 });
  context.after(() => worker.close());
  const envelope = { id: event.id, organizationId: tenant.organizationId };
  assert.equal(
    await worker.process(envelope, async () => {
      throw new Error('retry');
    }),
    'retry',
  );
  let delivered = false;
  const delivery = async () => {
    delivered = true;
  };
  assert.equal(await worker.process(envelope, delivery), 'retry');
  assert.equal(delivered, false);
  assert.equal(
    (await database.migration.query('SELECT attempts FROM outbox_events WHERE id = $1', [event.id]))
      .rows[0].attempts,
    1,
  );
  await database.migration.query(
    "UPDATE outbox_events SET available_at = now() - INTERVAL '1 second' WHERE id = $1",
    [event.id],
  );
  assert.equal(await worker.process(envelope, delivery), 'published');
  assert.equal(delivered, true);
});
