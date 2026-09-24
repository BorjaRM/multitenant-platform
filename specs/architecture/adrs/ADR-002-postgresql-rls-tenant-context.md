---
id: ADR-002
title: PostgreSQL RLS, contexto tenant y pooling
type: architecture-decision
status: proposed
created: 2026-09-11
related-spike: SPIKE-001
---

# ADR-002 — PostgreSQL RLS, contexto tenant y pooling

## Status

Proposed

## Context

El spike valida una base compartida de PostgreSQL sobre la que deben convivir varias organizaciones sin filtrar datos entre tenants. La solución debe soportar:

- RLS por fila
- contexto tenant por transacción
- conexión compartida con pool
- acceso explícito y autorizado
- una separación clara entre la capa de negocio y la infraestructura de datos

La decisión técnica no puede depender de la confianza del cliente ni de un `organization_id` no autorizado.

## Decision

Se adopta un modelo en el que:

1. La organización es el tenant.
2. El contexto tenant se establece de forma explícita con `set_config('app.current_organization_id', ..., true)` dentro de cada transacción.
3. Las tablas tenant tienen `organization_id` y RLS habilitado y forzado.
4. El rol de aplicación no tiene `BYPASSRLS` y solo tiene permisos mínimos.
5. Las operaciones de negocio se ejecutan en una unidad de trabajo con `tx` y no viajan con una conexión global.
6. Los repositorios y los casos de uso reciben el contexto y la transacción explícitos.

## Consequences

### Positives

- Aislamiento efectivo entre organizaciones en una base compartida.
- El patrón es verificable mediante pruebas de integración reales contra PostgreSQL.
- La fuga de tenant entre conexiones reutilizadas queda detectada por tests de pool.
- Se mantiene la lógica de autorización separada de la capa de almacenamiento.

### Trade-offs

- Requiere disciplina al iniciar cada transacción con el tenant autorizado.
- Las consultas deben respetar el contexto y evitar accesos fuera de la unidad de trabajo.
- El código de negocio necesita una capa explícita de contexto y repositorios tenant-aware.

## Evidence

- Checkpoint 1: local PostgreSQL + app role validado
- Checkpoint 2: schema con `organization_id` y restricciones compuestas validado
- Checkpoint 3: RLS y pool validado
- Checkpoint 4: atomicidad y outbox validado
- Checkpoint 5: aforo y concurrencia validado

## Follow-up

Pendiente de PR y revision humana. Los comandos actuales y los fallos anteriores estan registrados en SPIKE-001-results.md; no se considera aprobado el cierre.

## Pooling

node-postgres presta una conexion a Drizzle por transaccion. `set_config(..., true)` limita el tenant al commit o rollback. Los errores de conexion se capturan mientras la conexion esta prestada y la conexion fallida se descarta. Se prueba el mismo backend fisico con pool de uno, alternando tenants y errores SQL.

## Unit of work

`TenantDatabase.authorize` recibe una identidad autenticada simulada y consulta `resolve_tenant_access` antes de establecer el tenant. La funcion SECURITY DEFINER solo devuelve existencia de membresia; su propietario es el rol de migracion y su search_path es fijo. El contexto inmutable emitido pertenece a esa UoW y se vuelve a comprobar la membresia al ejecutar. Una revocacion completada antes de iniciar la operacion la bloquea; no cancela retroactivamente una transaccion ya autorizada.

Los casos de uso reciben interfaces de repositorio, no Drizzle ni el pool. Todos los repositorios se vinculan al mismo `tx` y dejan de ser utilizables al terminar la operacion. Las tablas globales no permiten escritura por `fitness_app`; esto impide borrados cruzados por cascada.

## Concurrency

Se utiliza READ COMMITTED y bloqueo pesimista `FOR UPDATE` sobre la sesion antes de contar o crear reservas. El trigger SQL mantiene la misma defensa para escrituras directas. Una restriccion unica parcial impide duplicados activos (`pending`, `confirmed`); `cancelled` permite una nueva reserva. Un traslado respeta el aforo de destino y reducir capacidad por debajo de confirmadas produce `23514`.

La alternativa de solo unicidad no limita aforo entre clientes diferentes. Un contador condicional exige mantener el contador en todas las transiciones; el bloqueo con conteo evita ese estado derivado en este spike. SERIALIZABLE exige politica adicional de reintentos y no se declara validado.

Prueba: cinco rondas 50/10, exactamente diez confirmaciones y cuarenta rechazos `P0001` por ronda, mas duplicados concurrentes, cancelacion, traslado y timeout de bloqueo. Negocio, auditoria, outbox e idempotencia se confirman juntos.

## Limitations

El rol SQL de aplicacion es una frontera de confianza: RLS recibe un tenant ya autorizado por el backend, no autentica usuarios a partir de un UUID. Las identidades y el origen de eventos son simulados; Clerk y RBAC completo siguen fuera de alcance. No se demuestra aislamiento ante robo de credenciales SQL ni ante codigo arbitrario ejecutado con ellas.

La instancia local existente puede contener fixtures huerfanos anteriores. Las migraciones correctivas rechazan esos datos, no los eliminan ni desactivan RLS. `npm test` crea una base desechable, migra dos veces con `fitness_migration` y la elimina al finalizar.
