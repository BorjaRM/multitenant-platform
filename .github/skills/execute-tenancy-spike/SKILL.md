---
name: execute-tenancy-spike
description: Execute and validate SPIKE-001. Use when implementing or reviewing PostgreSQL tenant isolation, RLS, transaction-local tenant context, connection pooling, tenant-aware constraints, transactional outbox or booking concurrency.
argument-hint: "[checkpoint 1-6 | TEN-REQ identifiers]"
user-invocable: true
disable-model-invocation: false
---

# Execute tenancy spike

## Required sources

Read before starting:

- `specs/spikes/SPIKE-001-tenancy-persistence.md`
- `specs/spikes/SPIKE-001-requirements.md`
- `specs/spikes/SPIKE-001-traceability.md`
- Relevant ADRs under `specs/architecture/adrs/`

Do not duplicate or reinterpret requirements inside this skill.

## Execution

1. Identify the requested checkpoint or requirement IDs.
2. Read the relevant specification sections.
3. Inspect the current repository state.
4. Write the required integration tests.
5. Confirm that new tests fail for the expected reason.
6. Implement the smallest compliant change.
7. Execute tests against PostgreSQL using the application role.
8. Run relevant regression tests.
9. Update traceability and evidence.
10. Report results without automatically starting another checkpoint.

## References

- Read [execution checkpoints](references/execution-checkpoints.md) to determine scope and exit criteria.
- Read [testing strategy](references/testing-strategy.md) before implementing RLS, pooling, atomicity or concurrency tests.

## Completion

A checkpoint is complete only when:

- Its Must requirements have automated tests.
- Tests have run against PostgreSQL.
- Tests pass using the restricted application role.
- Traceability has been updated.
- Limitations and risks have been recorded.