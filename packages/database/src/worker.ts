import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { inTransaction } from './transaction';

export type Envelope = { id: string; organizationId: string };
export type Message = Envelope & { correlationId: string; payload: unknown; eventType: string };
export type Failure = {
  code: 'DELIVERY_FAILED' | 'TRANSACTION_FAILED';
  eventId: string;
  organizationId: string;
  correlationId: string;
  attempt: number;
};
type Delivery = (message: Message) => Promise<void>;
function requireEnvelope(envelope: Envelope) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!envelope || !uuid.test(envelope.organizationId) || !uuid.test(envelope.id))
    throw new Error('Explicit valid tenant event required');
}
export class OutboxWorker {
  readonly #pool: Pool;
  readonly #database: ReturnType<typeof drizzle>;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: number;
  constructor(
    config: PoolConfig,
    private readonly log: (failure: Failure) => void,
    options: { maxAttempts?: number; retryDelayMs?: number } = {},
  ) {
    if (config.user !== 'fitness_app') throw new Error('Restricted application role required');
    this.#pool = new Pool(config);
    this.#database = drizzle(this.#pool);
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? 1000;
    if (!Number.isInteger(this.#maxAttempts) || this.#maxAttempts < 1 || this.#retryDelayMs < 0)
      throw new Error('Invalid retry policy');
  }
  async close() {
    await this.#pool.end();
  }
  async process(
    envelope: Envelope,
    deliver: Delivery,
  ): Promise<'unavailable' | 'published' | 'retry' | 'failed'> {
    requireEnvelope(envelope);
    let failure: Failure | undefined;
    let transactionFailure: Failure | undefined;
    const result = await inTransaction(this.#pool, async (transaction) => {
      await transaction.execute(
        sql`SELECT set_config('app.current_organization_id', ${envelope.organizationId}, true)`,
      );
      const selected = await transaction.execute(
        sql`SELECT *, available_at <= now() AS ready FROM outbox_events WHERE id = ${envelope.id}::uuid AND organization_id = ${envelope.organizationId}::uuid FOR NO KEY UPDATE`,
      );
      const event = selected.rows[0];
      if (!event) return 'unavailable' as const;
      if (event.published_at) return 'published' as const;
      if (event.failed_at) return 'failed' as const;
      if (!event.ready) return 'retry' as const;
      const attempt = Number(event.attempts) + 1;
      transactionFailure = {
        code: 'TRANSACTION_FAILED',
        eventId: envelope.id,
        organizationId: envelope.organizationId,
        correlationId: String(event.correlation_id),
        attempt,
      };
      try {
        await deliver({
          ...envelope,
          correlationId: String(event.correlation_id),
          eventType: String(event.event_type),
          payload: event.payload,
        });
      } catch {
        failure = {
          code: 'DELIVERY_FAILED',
          eventId: envelope.id,
          organizationId: envelope.organizationId,
          correlationId: String(event.correlation_id),
          attempt,
        };
        const terminal = attempt >= this.#maxAttempts;
        await transaction.execute(
          sql`UPDATE outbox_events SET attempts = ${attempt}, last_error = 'DELIVERY_FAILED', failed_at = CASE WHEN ${terminal} THEN now() ELSE NULL END, available_at = now() + ${this.#retryDelayMs} * interval '1 millisecond' WHERE id = ${envelope.id}::uuid`,
        );
        return terminal ? ('failed' as const) : ('retry' as const);
      }
      await transaction.execute(
        sql`UPDATE outbox_events SET attempts = ${attempt}, published_at = now(), last_error = NULL WHERE id = ${envelope.id}::uuid`,
      );
      return 'published' as const;
    }).catch((error) => {
      if (transactionFailure) this.log(transactionFailure);
      throw error;
    });
    if (failure) this.log(failure);
    return result;
  }
}

export class ReceiptConsumer {
  readonly #pool: Pool;
  readonly #database: ReturnType<typeof drizzle>;
  constructor(config: PoolConfig) {
    if (config.user !== 'fitness_app') throw new Error('Restricted application role required');
    this.#pool = new Pool(config);
    this.#database = drizzle(this.#pool);
  }
  async close() {
    await this.#pool.end();
  }
  readonly deliver: Delivery = async (message) => {
    requireEnvelope(message);
    await inTransaction(this.#pool, async (transaction) => {
      await transaction.execute(
        sql`SELECT set_config('app.current_organization_id', ${message.organizationId}, true)`,
      );
      await transaction.execute(
        sql`INSERT INTO consumer_receipts (organization_id, event_id, consumer) VALUES (${message.organizationId}::uuid, ${message.id}::uuid, 'spike-consumer') ON CONFLICT DO NOTHING`,
      );
    });
  };
}
