# SPIKE-001 testing strategy

## General rules

- Run isolation, transaction and concurrency tests against PostgreSQL.
- Use the restricted application role for business operations.
- Use the migration role only to prepare the database.
- Create at least two organizations in isolation tests.
- Reset or isolate data between test cases.
- Record the associated `TEN-REQ-*` identifiers in each suite.

## RLS tests

Verify:

- Reads without tenant context return no tenant data.
- Inserts without tenant context are rejected.
- Organization A cannot read or modify rows belonging to B.
- A supplied `organization_id` cannot override the authorized context.
- Tests pass because of database enforcement, not only repository filters.

## Pool leakage test

- Configure a small pool, preferably one connection.
- Alternate operations for organizations A and B.
- Finish every transaction before starting the next operation.
- Execute enough iterations to force connection reuse.
- Assert that no result contains a row from the wrong organization.

## Constraint tests

Attempt to create a tenant-owned relation where:

- The booking belongs to organization A.
- The customer or session belongs to organization B.

PostgreSQL must reject the operation through a tenant-aware foreign key.

## Atomicity tests

Force a failure after creating business data but before completing audit or
outbox. Verify that no partial row remains after rollback.

## Concurrency tests

- Create one session with capacity 10.
- Send 50 concurrent booking attempts from different customers.
- Assert that confirmed bookings never exceed 10.
- Assert that one customer cannot obtain duplicate active bookings.
- Repeat the test to detect nondeterministic failures.

## Evidence

For every Verified requirement record:

- Test file.
- Command executed.
- Database role used.
- Relevant configuration, such as pool size.
- Result.
- Limitations.