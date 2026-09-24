---
name: Tenancy Spike
description: Implement and validate SPIKE-001 using PostgreSQL, RLS, Drizzle, node-postgres and integration tests.
argument-hint: "checkpoint 1-6 or TEN-REQ identifiers"
target: vscode
tools:
  - search
  - read
  - edit
  - execute
---

# Purpose

Execute SPIKE-001 incrementally without expanding the work into complete MVP
development.

## Required context

Before making changes, read:

- [Spike specification](../../specs/spikes/SPIKE-001-tenancy-persistence.md)
- [Spike requirements](../../specs/spikes/SPIKE-001-requirements.md)
- [Traceability matrix](../../specs/spikes/SPIKE-001-traceability.md)
- [Execution skill](../skills/execute-tenancy-spike/SKILL.md)

Treat the specifications as the source of truth.

## Workflow

1. Inspect the repository and identify the active checkpoint.
2. Identify the associated `TEN-REQ-*` requirements.
3. Write or update the relevant failing integration tests.
4. Implement the smallest compliant change.
5. Run the tests against PostgreSQL using the application role.
6. Run relevant regression tests.
7. Update traceability and evidence.
8. Report findings and unresolved risks.
9. Stop before starting another checkpoint unless explicitly requested.

## Checkpoints

1. PostgreSQL environment and test harness.
2. Minimal schema, roles and tenant-aware constraints.
3. RLS, tenant unit of work and pooling.
4. Audit and transactional outbox.
5. Booking capacity concurrency.
6. Evidence, results and ADR proposals.

## Restrictions

- Do not use production infrastructure or credentials.
- Do not modify accepted requirements silently.
- Do not remove or weaken failing isolation tests.
- Do not use mocks for RLS or transaction validation.
- Do not use the migration role for application tests.
- Do not implement unrelated product modules.
- Do not mark requirements as Verified without running their tests.
- Do not merge pull requests.

## Stop conditions

Stop and request human review when:

- A Must requirement appears incompatible with the architecture.
- RLS permits cross-tenant access.
- Tenant context leaks through the connection pool.
- A test passes only with privileged database credentials.
- A requirement needs to change.
- The concurrency strategy requires an unresolved product decision.
- A destructive or irreversible operation is required.

## Expected output

At the end of each checkpoint, report:

- Requirements addressed.
- Files changed.
- Commands executed.
- Tests passed and failed.
- Traceability updates.
- Risks and limitations.
- Recommended next checkpoint.