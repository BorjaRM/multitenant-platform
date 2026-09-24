## Specification

- Spike: SPIKE-001
- Requirements:
- Active checkpoint:

## Summary

Describe the smallest change implemented by this pull request.

## Checkpoint

- [ ] Environment
- [ ] Tenant schema
- [ ] RLS and pooling
- [ ] Atomicity and outbox
- [ ] Booking concurrency
- [ ] Closure

## Verification

- [ ] PostgreSQL integration tests pass
- [ ] Tests use the restricted application role
- [ ] Application role has no BYPASSRLS
- [ ] Cross-tenant read and write tests pass
- [ ] Pool leakage test passes
- [ ] Tenant-aware constraints pass
- [ ] Rollback and outbox tests pass
- [ ] Traceability is updated
- [ ] Results and limitations are documented

## Commands executed

Add the exact commands used for validation.

## Evidence

Add test results, relevant logs or workflow links. Do not include secrets or personal data.

## Architectural findings

## Risks and limitations

## ADR changes

## Human decisions required