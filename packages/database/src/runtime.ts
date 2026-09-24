import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { customers } from './schema';
import type {
  AuthorizedTenantContext,
  Entity,
  Repositories,
  TenantUnitOfWork,
} from '../../application/src/use-cases';

import { inTransaction } from './transaction';
type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class TenantDatabase implements TenantUnitOfWork {
  readonly #pool: Pool;
  readonly #database: Database;
  readonly #contexts = new WeakSet<AuthorizedTenantContext>();

  constructor(config: PoolConfig) {
    if (config.user !== 'fitness_app') throw new Error('Restricted application role required');
    this.#pool = new Pool(config);
    this.#database = drizzle(this.#pool);
  }
  async close() {
    await this.#pool.end();
  }
  async authorize(identityId: string, organizationId: string): Promise<AuthorizedTenantContext> {
    const result = await this.#database.execute(
      sql`SELECT resolve_tenant_access(${identityId}::uuid, ${organizationId}::uuid) AS allowed`,
    );
    if (!result.rows[0]?.allowed) throw new Error('Access denied');
    const context = Object.freeze({ identityId, organizationId });
    this.#contexts.add(context);
    return context;
  }
  async execute<Result>(
    context: AuthorizedTenantContext,
    operation: (repositories: Repositories) => Promise<Result>,
  ): Promise<Result> {
    if (!context || !this.#contexts.has(context))
      throw new Error('Authorized tenant context required');
    return inTransaction(this.#pool, async (transaction) => {
      const allowed = await transaction.execute(
        sql`SELECT resolve_tenant_access(${context.identityId}::uuid, ${context.organizationId}::uuid) AS allowed`,
      );
      if (!allowed.rows[0]?.allowed) throw new Error('Access denied');
      await transaction.execute(
        sql`SELECT set_config('app.current_organization_id', ${context.organizationId}, true)`,
      );
      let active = true;
      const ensureActive = () => {
        if (!active) throw new Error('Transaction is no longer active');
      };
      const repositories = this.#repositories(transaction, context.organizationId, ensureActive);
      try {
        return await operation(repositories);
      } finally {
        active = false;
      }
    });
  }
  #repositories(
    transaction: Transaction,
    organizationId: string,
    ensureActive: () => void,
  ): Repositories {
    return {
      createCustomer: async (input) => {
        ensureActive();
        const rows = await transaction
          .insert(customers)
          .values({ organizationId, fullName: input.fullName, email: input.email })
          .returning();
        return { id: rows[0].id, organizationId: rows[0].organizationId };
      },
      listCustomers: async () => {
        ensureActive();
        return transaction
          .select({ id: customers.id, organizationId: customers.organizationId })
          .from(customers)
          .where(eq(customers.organizationId, organizationId));
      },
      book: async (input) => {
        ensureActive();
        const session = await transaction.execute(
          sql`SELECT id FROM sessions WHERE organization_id = ${organizationId}::uuid AND id = ${input.sessionId}::uuid FOR UPDATE`,
        );
        if (!session.rowCount) throw new Error('Session unavailable');
        const existing = await transaction.execute(
          sql`SELECT id FROM bookings WHERE organization_id = ${organizationId}::uuid AND customer_id = ${input.customerId}::uuid AND session_id = ${input.sessionId}::uuid AND status IN ('pending', 'confirmed')`,
        );
        if (existing.rows[0])
          return { entity: { id: String(existing.rows[0].id), organizationId }, created: false };
        const inserted = await transaction.execute(
          sql`INSERT INTO bookings (organization_id, customer_id, session_id, status) VALUES (${organizationId}::uuid, ${input.customerId}::uuid, ${input.sessionId}::uuid, 'confirmed') RETURNING id`,
        );
        return { entity: { id: String(inserted.rows[0].id), organizationId }, created: true };
      },
      appendAudit: async (type, entity) => {
        ensureActive();
        await transaction.execute(
          sql`INSERT INTO audit_events (organization_id, event_type, aggregate_type, aggregate_id) VALUES (${organizationId}::uuid, ${type + '.created'}, ${type}, ${entity.id}::uuid)`,
        );
      },
      appendOutbox: async (type, entity) => {
        ensureActive();
        await transaction.execute(
          sql`INSERT INTO outbox_events (organization_id, event_type, aggregate_type, aggregate_id, correlation_id) VALUES (${organizationId}::uuid, ${type + '.created'}, ${type}, ${entity.id}::uuid, ${randomUUID()}::uuid)`,
        );
      },
      idempotent: async (key, fingerprint, operation) => {
        ensureActive();
        if (!key || key.length > 200) throw new Error('Invalid idempotency key');
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ':' + key}, 0))`,
        );
        const existing = await transaction.execute(
          sql`SELECT fingerprint, result FROM idempotency_keys WHERE organization_id = ${organizationId}::uuid AND key = ${key}`,
        );
        if (existing.rows[0]) {
          if (existing.rows[0].fingerprint !== fingerprint)
            throw new Error('Idempotency key conflict');
          return existing.rows[0].result as Entity;
        }
        const result = await operation();
        await transaction.execute(
          sql`INSERT INTO idempotency_keys (organization_id, key, fingerprint, result) VALUES (${organizationId}::uuid, ${key}, ${fingerprint}, ${JSON.stringify(result)}::jsonb)`,
        );
        return result;
      },
    };
  }
}
