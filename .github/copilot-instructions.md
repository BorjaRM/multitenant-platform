# Fitness Ops Platform

## Source of truth

Specifications under `specs/` are the source of truth for product and
technical behavior.

For SPIKE-001, read:

- `specs/spikes/SPIKE-001-tenancy-persistence.md`
- `specs/spikes/SPIKE-001-requirements.md`
- `specs/spikes/SPIKE-001-traceability.md`

Do not change an accepted requirement to make an implementation or test pass.

## Technology

- TypeScript
- NestJS
- PostgreSQL
- Drizzle ORM
- node-postgres
- Docker Compose for local infrastructure
- PostgreSQL integration tests

## Architecture

- The organization is the tenant.
- A location is an operational scope, not a tenant.
- Tenant-owned tables must include `organization_id`.
- Tenant context must be explicit and transaction-local.
- Domain and application layers must not depend directly on Drizzle.
- Business use cases must not receive an unrestricted global connection.
- Business data, audit and outbox changes must be atomic.

## Security

- Never use production credentials or infrastructure.
- Never commit secrets or local environment files.
- Never use the migration role as the application role.
- The application role must not have `BYPASSRLS`.
- Do not replace PostgreSQL RLS tests with mocks.
- Never weaken or remove a failing security test without human approval.

## Workflow

- Work on a dedicated branch.
- Keep changes small and scoped to the active requirement.
- Reference requirement IDs in tests, commits and pull requests.
- Run the relevant tests after every implementation step.
- Mark a requirement as Verified only after its automated test passes.
- Do not merge pull requests automatically.