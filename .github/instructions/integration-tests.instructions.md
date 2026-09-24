---
name: PostgreSQL integration tests
description: Requirements for tenant isolation, transaction and concurrency tests
applyTo: "test/integration/**"
---

# Integration test rules

- Run tests against a real PostgreSQL instance.
- Use the restricted application database role.
- Create at least two organizations in isolation tests.
- Test reads, inserts, updates and deletes across organizations.
- Test behavior without tenant context.
- Test connection reuse using a small pool.
- Test rollback of business data, audit and outbox together.
- Do not replace RLS, transaction or concurrency behavior with mocks.
- Record the associated `TEN-REQ-*` identifier in each test suite.