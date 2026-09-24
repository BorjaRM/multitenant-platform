---
name: Tenant database implementation
description: Tenant isolation and persistence rules for PostgreSQL and Drizzle
applyTo: "packages/database/**,migrations/**,infrastructure/postgres/**"
---

# Database rules

- All tenant-owned tables must include a non-null `organization_id`.
- Use tenant-aware unique constraints and indexes.
- Use composite foreign keys between tenant-owned entities.
- Keep tenant context limited to the active transaction.
- Pass the active transaction explicitly to repositories.
- Do not expose the unrestricted pool to application use cases.
- Separate migration and application runtime roles.
- The runtime role must not own tenant tables.
- The runtime role must not have `BYPASSRLS`.
- Enable and force RLS on tenant-owned tables.
- Test migrations from an empty database.
- Do not silently disable RLS during data migrations.