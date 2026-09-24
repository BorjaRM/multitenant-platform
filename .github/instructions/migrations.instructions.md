# Migrations instructions

## Migration rules

- Migrations must be idempotent and reviewable.
- Every business table with tenant scope requires `organization_id`.
- RLS policies should be part of the migration or a subsequent schema change.
- Record migration assumptions and risks in the spike documentation.
- Do not hide cross-tenant behavior behind application logic alone.
