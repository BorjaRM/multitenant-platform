# Execution checkpoints

## Regla de cobertura

Los checkpoints son una división de ejecución, no una definición automática de terminado. Antes de cerrar un checkpoint debe existir una relación explícita entre cada `TEN-REQ-*`, su checkpoint propietario, su prueba y su evidencia.

- Cada requisito debe aparecer en la matriz de trazabilidad.
- Ningún requisito puede quedar sin checkpoint propietario.
- Un requisito solo puede pasar a `Verified` después de ejecutar su prueba contra PostgreSQL real.
- Una prueba verde no verifica requisitos que no estén cubiertos por esa prueba.
- El Checkpoint 6 no implementa requisitos: bloquea el cierre si existe cualquier requisito `Must` pendiente, fallido o sin evidencia.

## Checkpoint 1 — Environment

Deliver:

- Reproducible PostgreSQL 18.6 environment.
- Migration and application roles.
- Migration command.
- Integration test command.
- Evidence for every environment-related `TEN-REQ-*` assigned to this checkpoint.

Exit criteria:

- PostgreSQL is healthy.
- Both database roles exist.
- An empty database can be migrated.
- An integration test connects using the application role.
- All requirements assigned to Checkpoint 1 have a passing automated test and a traceability entry.

## Checkpoint 2 — Tenant schema

Deliver:

- Minimal global and tenant tables.
- Tenant-aware indexes.
- Composite foreign keys.
- Schema integration tests.
- Evidence for every schema-related `TEN-REQ-*` assigned to this checkpoint.

Exit criteria:

- Tenant tables require `organization_id`.
- PostgreSQL rejects cross-tenant relationships.
- All requirements assigned to Checkpoint 2 have a passing automated test and a traceability entry.

## Checkpoint 3 — RLS and pooling

Deliver:

- RLS policies.
- Tenant unit of work.
- Missing-context tests.
- Cross-tenant read and write tests.
- Pool leakage tests.
- Evidence for every isolation-related `TEN-REQ-*` assigned to this checkpoint.

Exit criteria:

- No cross-tenant access is observed.
- Tenant context does not survive the transaction.
- Tests pass using the application role.
- All requirements assigned to Checkpoint 3 have a passing automated test and a traceability entry.

## Checkpoint 4 — Atomicity

Deliver:

- Minimal CreateCustomer use case.
- AuditEvent.
- OutboxEvent.
- Rollback and idempotency tests.
- Tenant-bound worker, durable idempotent consumer, structured failures and bounded retries (TEN-REQ-018 and TEN-REQ-019).
- Evidence for every atomicity-related `TEN-REQ-*` assigned to this checkpoint.

Exit criteria:

- Business data, audit and outbox commit or roll back together.
- All requirements assigned to Checkpoint 4 have a passing automated test and a traceability entry.

## Checkpoint 5 — Concurrency

Deliver:

- Minimal Session and Booking model.
- Capacity-control strategy.
- Concurrent integration test.
- Evidence for every concurrency-related `TEN-REQ-*` assigned to this checkpoint.

Exit criteria:

- Confirmed bookings never exceed capacity.
- Duplicate bookings are prevented.
- All requirements assigned to Checkpoint 5 have a passing automated test and a traceability entry.

## Checkpoint 6 — Closure and conformance

Deliver:

- Complete requirement-to-checkpoint coverage matrix.
- Updated traceability.
- Results report.
- ADR proposals or updates.
- Pull request ready for human review.
- Explicit list of failed, deferred or excepted requirements.

Exit criteria:

- All 21 `TEN-REQ-*` requirements appear in the traceability matrix.
- Every requirement has a checkpoint owner, implementation path, test, command and evidence.
- Every `Must` requirement is `Verified`, or has an explicit human-approved exception with risk and corrective action.
- No requirement is `Draft`, `Pending` or `Failed` without being listed as a blocker.
- The final result is not `Accepted` or `Verified` while any blocker remains.
- The pull request is not merged automatically.

## Global completion gate

The spike is complete only when all of the following are true:

```text
count(all TEN-REQ rows) = 21
count(Verified rows) = 21 - count(approved exceptions)
count(unassigned rows) = 0
count(Must rows with no evidence) = 0
count(unresolved blockers) = 0