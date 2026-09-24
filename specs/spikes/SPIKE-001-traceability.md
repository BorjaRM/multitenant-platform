---
id: SPIKE-001-TRACE
title: Trazabilidad de SPIKE-001
status: implemented
pull-request: pending
human-review: pending
version: 0.4.0
related-spike: SPIKE-001
---

## Evidencia vigente

2026-09-11, rama `spike/tenancy-persistence`, arbol de trabajo sin commit de estos cambios. PostgreSQL 18.6 nuevo en `127.0.0.1:55433`, rol de aplicacion `fitness_app`, migraciones `fitness_migration`.

- `SPIKE_DB_PORT=55433 npm test`, dos ejecuciones: 44/44 aprobadas en ambas; 0 fallidas, canceladas u omitidas.
- `SPIKE_DB_PORT=55433 npm run test:mutations`: RLS, NOT NULL y FK compuesta retiradas de forma aislada; las tres regresiones detectan la mutacion.
- `npm run typecheck` y `npm run test:traceability`: aprobados.
- Cada comando por checkpoint de la matriz usa la misma preparacion desechable y el mismo rol. El prefijo `SPIKE_DB_PORT=55433` selecciona el contenedor independiente; sin prefijo se utiliza PostgreSQL local en 5432.


# Trazabilidad de SPIKE-001

## Reglas

- Un requisito solo puede marcarse `Verified` después de ejecutar su prueba contra PostgreSQL real.
- Registrar rutas relativas del repositorio.
- Registrar el comando exacto, rol de base de datos y entorno utilizado.
- No borrar resultados fallidos; documentar su resolución.
- Cada `TEN-REQ-*` debe tener un checkpoint propietario.
- Un checkpoint no puede darse por completo si deja requisitos sin cobertura.
- El Checkpoint 6 solo puede cerrar el spike cuando los 21 requisitos están cubiertos y no existen bloqueadores sin excepción humana aprobada.
- `Draft`, `Pending` o `Failed` son estados de bloqueo para cualquier requisito `Must`.

## Matriz

| Requisito | Checkpoint | Implementación | Prueba | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- |
| TEN-REQ-001 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/application-context.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-002 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/application-context.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-003 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/crud-enforcement.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-004 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/crud-enforcement.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-005 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/crud-enforcement.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-006 | Checkpoint 3 | `infrastructure/postgres/init/03-rls-policies.sql` | `test/integration/checkpoint-3/rls-configuration.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-007 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/crud-enforcement.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-008 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/crud-enforcement.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-009 | Checkpoint 2 | `infrastructure/postgres/init/04-runtime-invariants.sql` | `test/integration/checkpoint-2/tenant-schema.integration.test.js` | `npm run test:integration:checkpoint-2` | Verified |
| TEN-REQ-010 | Checkpoint 2 | `infrastructure/postgres/init/04-runtime-invariants.sql` | `test/integration/checkpoint-2/tenant-invariants.integration.test.js` | `npm run test:integration:checkpoint-2` | Verified |
| TEN-REQ-011 | Checkpoint 3 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-3/application-context.integration.test.js` | `npm run test:integration:checkpoint-3` | Verified |
| TEN-REQ-012 | Checkpoint 1 | `infrastructure/postgres/init/01-roles.sql`, `infrastructure/postgres/init/03-rls-policies.sql`, `infrastructure/postgres/init/04-runtime-invariants.sql` | `test/integration/checkpoint-1/app-role-restrictions.integration.test.js` | `npm run test:integration:checkpoint-1` | Verified |
| TEN-REQ-013 | Checkpoint 4 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-4/customer-workflow.integration.test.js` | `npm run test:integration:checkpoint-4` | Verified |
| TEN-REQ-014 | Checkpoint 4 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-4/customer-workflow.integration.test.js` | `npm run test:integration:checkpoint-4` | Verified |
| TEN-REQ-015 | Checkpoint 4 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-4/customer-workflow.integration.test.js` | `npm run test:integration:checkpoint-4` | Verified |
| TEN-REQ-016 | Checkpoint 5 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-5/booking-workflow.integration.test.js` | `npm run test:integration:checkpoint-5` | Verified |
| TEN-REQ-017 | Checkpoint 5 | `packages/database/src/runtime.ts` | `test/integration/checkpoint-5/booking-workflow.integration.test.js` | `npm run test:integration:checkpoint-5` | Verified |
| TEN-REQ-018 | Checkpoint 4 | `packages/database/src/worker.ts` | `test/integration/checkpoint-4/worker-processing.integration.test.js` | `npm run test:integration:checkpoint-4` | Verified |
| TEN-REQ-019 | Checkpoint 4 | `packages/database/src/worker.ts` | `test/integration/checkpoint-4/worker-processing.integration.test.js` | `npm run test:integration:checkpoint-4` | Verified |
| TEN-REQ-020 | Checkpoint 6 | `.github/skills/execute-tenancy-spike/scripts/verify-traceability.ts` | `test/integration/checkpoint-6/traceability-documentation.integration.test.js` | `npm run test:integration:checkpoint-6` | Implemented |
| TEN-REQ-021 | Checkpoint 6 | `specs/architecture/adrs/ADR-002-postgresql-rls-tenant-context.md`, `specs/architecture/adrs/ADR-006-transactional-outbox-worker.md`, `specs/architecture/adrs/ADR-007-drizzle-tenant-aware-repositories.md` | `test/integration/checkpoint-6/decision-records.integration.test.js` | `npm run test:integration:checkpoint-6` | Verified |

## Cobertura ampliada

La matriz conserva una prueba principal por requisito. La suite añade pruebas complementarias para evitar que una sola causa de error haga pasar un criterio incorrectamente.

| Checkpoint | Archivos | Tests | Cobertura añadida |
| --- | ---: | ---: | --- |
| 1 | 2 | 4 | DML global, ownership, escalada de rol y reaplicación de migraciones |
| 2 | 3 | 4 | Equivalencia Drizzle/PostgreSQL, nulabilidad, índices y FKs precisas |
| 3 | 11 | 14 | CRUD completo, agregados, autorización, revocación, rollback y pool físico |
| 4 | 7 | 12 | Fallos SQL, idempotencia concurrente, consumidor duradero, reintentos y desconexión |
| 5 | 4 | 6 | Carga 50/10 por cinco rondas, duplicados, transiciones, traslado y timeout |
| 6 | 2 | 4 | Integridad de ADR y casos negativos de conformidad documental |

Evidencia adicional fuera de los 44 tests de integración:

- `scripts/test-mutations.cjs` demuestra sensibilidad ante la retirada de RLS, `NOT NULL` y la FK compuesta de sesión.
- `scripts/test-integration.cjs` crea una base desechable, aplica las migraciones dos veces y serializa archivos que alteran el esquema.
- `.github/workflows/spike-validation.yml` configura typecheck, trazabilidad, dos regresiones completas y mutation tests; su ejecución remota continúa pendiente del PR.

## Resumen de cobertura

| Métrica | Valor |
| --- | ---: |
| Requisitos totales | 21 |
| Requisitos con evidencia verificada | 20 |
| Requisitos pendientes | 1 |
| Requisitos sin checkpoint propietario | 0 |
| Excepciones humanas aprobadas | 0 |
| Estado global | Implemented |

## Cierre del spike

Los tests tecnicos pasan. El cierre permanece bloqueado por `PR_PENDING` y `HUMAN_REVIEW_PENDING`. TEN-REQ-020 queda Implemented hasta enlazar el PR real. No se ha aprobado automaticamente ningun ADR ni el spike.

## Historial de evidencia sustituida

Los comandos manuales originales no son evidencia vigente. La revisión reprodujo 19/21 tests, encontró setups no repetibles y demostró falsos positivos retirando controles. Se conservan solo como origen de las correcciones; los detalles están en `specs/spikes/SPIKE-001-results.md`.

| Fecha | Resultado observado | Validez actual |
| --- | --- | --- |
| 2026-09-11, suite original | 19/21; colisiones de fixtures y falsos positivos | Sustituida |
| 2026-09-11, suite corregida | 44/44 dos veces y 3/3 mutaciones detectadas | Vigente |

## Puerta de cierre

```text
El spike solo puede cambiar a Accepted o Verified cuando:

- los 21 TEN-REQ tienen checkpoint propietario;
- los 21 TEN-REQ tienen implementación, prueba y evidencia;
- todas las pruebas Must pasan contra PostgreSQL real con el rol restringido;
- la matriz y el informe de resultados coinciden;
- no quedan requisitos Pending, Draft o Failed sin excepción aprobada;
- existe revisión humana del resultado final.
```
