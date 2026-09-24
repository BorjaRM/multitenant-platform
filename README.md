# fitness-ops-platform

## SPIKE-001

Requirements and architectural decisions live under [specs](specs/spikes/SPIKE-001-tenancy-persistence.md).

Prerequisites: Node.js 22, npm and Docker Compose. Only local PostgreSQL is supported by this spike harness.

```sh
npm ci
npm run db:up
npm test
npm run typecheck
npm run test:traceability
npm run test:mutations
```

`npm test` creates a disposable database, applies every schema migration twice as `fitness_migration`, runs business queries as `fitness_app`, then drops only that database. Existing local data and Docker volumes are not reset. Test files run serially because fault injection changes schema; booking and worker concurrency within tests remains real.

Run one checkpoint with `npm run test:integration:checkpoint-3` (1 through 6 supported). Host, port and local credentials can be overridden with `SPIKE_DB_HOST`, `SPIKE_DB_PORT`, and `SPIKE_DB_PASSWORD`; the host must be localhost or 127.0.0.1.

`npm run db:migrate` bootstraps local roles and ownership, then applies schema, RLS and invariants in one transaction to `fitness_ops`. Historical spike fixtures may contain orphan events or cross-tenant references. These must be reviewed before migrating that database: the migration fails rather than deleting or silently repairing data. Use disposable tests for verification without modifying those fixtures.

The migration account prepares fixtures and schema. It must never be passed to application use cases. Global table mutations, policy changes and tenant cascades are denied to the application role.

Checkpoint ownership: environment/roles (1), schema/FKs (2), authorization/RLS/UoW/pool (3), CreateCustomer/idempotency/outbox/workers (4), bookings/concurrency/retries (5), documentation/conformance (6).

The reference consumer models a durable idempotent effect in PostgreSQL, not a production queue or external provider. See [results and limitations](specs/spikes/SPIKE-001-results.md) and [traceability](specs/spikes/SPIKE-001-traceability.md). PR linkage and human approval are explicit closure gates; passing local tests does not approve the spike.
