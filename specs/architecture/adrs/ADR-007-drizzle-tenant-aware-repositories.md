---
id: ADR-007
title: Drizzle y repositorios tenant-aware
type: architecture-decision
status: proposed
created: 2026-09-11
related-spike: SPIKE-001
---

# ADR-007 — Drizzle y repositorios tenant-aware

## Status

Proposed

## Context

La solución debe mantener la lógica de negocio y la infraestructura de persistencia separadas. El diseño no debe depender directamente de SQL ad hoc ni mezclar el controlador del tenant con las consultas de datos. Se necesita una capa de repositorios que reciba la transacción y el contexto autorizado.

## Decision

Se propone una capa de repositorios con estas reglas:

1. La capa de dominio y aplicación no depende directamente de Drizzle.
2. Los repositorios reciben `tx` y contexto tenant explícito.
3. Las consultas se construyen con SQL parametrizado y filtros por `organization_id`.
4. La entidad de negocio nunca toma el tenant de un campo externo.
5. La lógica de acceso se resuelve antes del inicio de la operación.

## Consequences

### Positives

- Menor acoplamiento entre aplicación y infraestructura.
- Más fácil revisar los queries SQL y auditorizar los accesos por tenant.
- Mejor trazabilidad en pruebas de integración.

### Trade-offs

- Requiere más estructura en repositorios y transacciones.
- El código necesita mantener convenciones de `organization_id` y contexto transaccional.
- Las pruebas deben cubrir no solo SQL, sino también el flujo completo de autorización.

## Evidence

- El spike valida que el tenant se establece dentro de la transacción.
- Los tests de aislamiento, outbox y aforo comprueban que la capa de SQL no puede contravenir la política de organización.

## Follow-up

Pendiente de PR y revision humana. La integracion minima Drizzle, CreateCustomer, BookSession y workers existe en este spike; no se aplaza al MVP. La adopcion productiva requiere revisar RBAC, entrada autenticada y proveedor externo.

## Implementation

`packages/application/src/use-cases.ts` define puertos sin dependencias de Drizzle. `packages/database/src/runtime.ts` implementa autorizacion, UoW y repositorios transaccionales; `transaction.ts` administra conexiones prestadas y fallidas. `schema.ts` describe las once tablas y sus FKs; las migraciones SQL son la autoridad para RLS, funciones y triggers, no se usa schema push para omitir esos controles.

La idempotencia bloquea la clave `(organization_id, key)` mediante advisory lock transaccional. Misma clave y payload normalizado devuelve el resultado almacenado; otro payload se rechaza. Negocio, auditoria, outbox y resultado idempotente son atomicos. La unicidad de reservas activas sirve como segunda defensa y no se confunde con el contrato de replay.

## Validation

Se comparan columnas, nulabilidad y FKs Drizzle con PostgreSQL, se ejecuta el caso de uso real y se inyectan fallos SQL durante auditoria y outbox. Los repositorios escapados rechazan uso despues de la transaccion. Pruebas de claves concurrentes, tenant manipulado y membresia revocada cubren la frontera de aplicacion.
