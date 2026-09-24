---
id: SPIKE-001-RESULTS
title: Resultados de SPIKE-001
status: implemented
verified-requirements: 20
version: 0.3.0
related-spike: SPIKE-001
---

# Resultados de SPIKE-001

## Resumen ejecutivo

La implementacion tecnica y sus regresiones se han ejecutado contra PostgreSQL 18.6 real con `fitness_app`. El cierre no esta aprobado: falta el PR y la revision humana. TEN-REQ-020 permanece Implemented, no Verified.

## Evidencia vigente (2026-09-11)

- Rama: `spike/tenancy-persistence`; evidencia del arbol de trabajo, sin commit de estos cambios.
- Node.js 22.13.0, PostgreSQL 18.6 local, node-postgres 8.23.0, Drizzle 0.45.2.
- `SPIKE_DB_PORT=55433 npm test`: 44/44 aprobadas, repetido dos veces (6.04 s y 5.97 s), cero omitidas o canceladas. PostgreSQL nuevo, iniciado con los scripts del repositorio, no con un volumen preexistente.
- Conteos por checkpoint: 1 = 4, 2 = 4, 3 = 14, 4 = 12, 5 = 6, 6 = 4.
- `npm run typecheck`: aprobado.
- `SPIKE_DB_PORT=55433 npm run test:mutations`: tres mutaciones detectadas, RLS, NOT NULL y FK compuesta; cada test se comprueba primero sin mutacion y debe fallar por asercion al retirar la proteccion.
- `npm run test:traceability`: 21 requisitos, 20 Verified, cierre false; se comprueban tambien casos negativos de rutas inexistentes, duplicados, checkpoint incorrecto y cierre falso.
- `SPIKE_DB_PORT=55433 node scripts/database.cjs`: migracion completa aprobada sobre la base inicializada por Docker. Compose y enlaces del indice de IA validos; editor sin diagnosticos y `git diff --check` sin errores.
- Bases `spike_test_*` y `spike_mutation_*` desechables. Migraciones ejecutadas dos veces con `fitness_migration`; consultas de negocio con `fitness_app`.
- Aforo: cinco rondas de 50 solicitudes para 10 plazas. Diez confirmaciones, cuarenta rechazos por aforo y diez eventos por ronda.
- Pools de una conexion para contexto y hasta cincuenta para carga. Los archivos se ejecutan en serie porque los tests de atomicidad inyectan triggers; la concurrencia interna de reservas y workers sigue siendo real.

## Correcciones verificadas

- Permisos globales restringidos, sin borrado de organizaciones ajenas ni escalada al rol de migracion.
- Autorizacion previa a la UoW y comprobada de nuevo al ejecutar; contexto no falsificable y repositorios inutilizables tras cerrar la transaccion.
- CRUD RLS, consulta por ID, conteos, integridad de filas ajenas, rollback y reutilizacion de la misma conexion fisica.
- FKs compuestas, columnas no nulas y modelo Drizzle equivalente. Outbox y auditoria referencian agregados del mismo tenant.
- CreateCustomer confirma o revierte negocio, auditoria, outbox e idempotencia juntos. Fallos SQL inyectados en ambos pasos intermedios.
- Reintentos concurrentes, claves por tenant, conflicto de payload, timeout SQL real y respuesta perdida tras commit.
- Workers con tenant explicito, dos consumidores concurrentes, recepcion duradera idempotente, caida real de conexion tras entrega, reintentos acotados y errores estructurados sin payload sensible.

## Bloqueadores y limites actuales

- `PR_PENDING`: TEN-REQ-020 necesita URL de PR que relacione esta spec, implementacion y evidencia. No se ha creado ni inventado un PR.
- `HUMAN_REVIEW_PENDING`: la decision final y los ADR siguen propuestos para revision humana.
- CI esta configurado y sus comandos se verifican localmente; no se afirma una ejecucion remota de GitHub Actions.
- Identidad autenticada y origen del evento son entradas confiables simuladas del spike. No se implementa Clerk ni una cola externa.
- El consumidor de referencia tiene como efecto una recepcion duradera PostgreSQL. Un proveedor externo debe aceptar la misma clave idempotente; no se promete exactly-once distribuido.
- Migraciones sobre fixtures historicos invalidos fallan explicitamente por integridad. No se borran ni reasignan filas ajenas para hacerlas pasar.
- Cambios de esquema durante pruebas requieren aislamiento entre archivos. La primera ejecucion concurrente encontro una espera DDL y fue cancelada; se resolvio serializando archivos, no reservas ni workers.
- La regresion de caida real detecto inicialmente un error de conexion no capturado durante la entrega; se resolvio gestionando la conexion prestada y descartandola al fallar. La regresion ahora pasa y registra `TRANSACTION_FAILED` sin datos sensibles.
- El contenedor temporal de validacion y las bases desechables se eliminan al terminar; no se resetea el volumen historico local.

## Resultado por checkpoint

| Checkpoint | Alcance validado | Tests | Estado técnico |
| --- | --- | ---: | --- |
| 1 | PostgreSQL, roles, permisos globales y migraciones repetibles | 4/4 | Verified |
| 2 | Esquema tenant, Drizzle, nulabilidad, índices y FKs compuestas | 4/4 | Verified |
| 3 | Autorización, RLS, CRUD, UoW, rollback y pool | 14/14 | Verified |
| 4 | `CreateCustomer`, atomicidad, idempotencia, outbox y workers | 12/12 | Verified |
| 5 | `BookSession`, aforo, transiciones y reintentos | 6/6 | Verified |
| 6 | ADR y conformidad documental | 4/4 | Implemented |

Checkpoint 6 permanece `Implemented` porque TEN-REQ-020 exige enlazar un pull request y registrar revisión humana. Sus cuatro tests automatizados pasan, pero no sustituyen esas acciones.

## Historial de hallazgos corregidos

| Hallazgo inicial | Riesgo | Corrección y regresión |
| --- | --- | --- |
| Fixtures fijos dejaban 19/21 tests verdes | Suite no repetible | Bases desechables, limpieza y dos ejecuciones 44/44 |
| Un `NOT NULL` hacía pasar el test sin tenant aunque RLS faltara | Falso positivo de aislamiento | Pruebas CRUD y mutation test retirando RLS |
| Otra validación ocultaba la ausencia de una FK | Falso positivo de integridad | Verificación estructural y mutation test de FK compuesta |
| `set_config(..., true)` se usaba fuera de transacción | Escritura cruzada no ejercitada | UoW real, transacción explícita y reuse del mismo backend |
| `fitness_app` podía borrar otra organización por cascada | Pérdida de datos cross-tenant | Revocación de DML global y tests de privilegios efectivos |
| Sesión, ubicación y agregados outbox admitían referencias cruzadas | Integridad tenant incompleta | FKs compuestas y agregados generados por tenant |
| Workers e idempotencia eran stubs o datos autoafirmados | Evidencia no ejecutable | Worker, consumidor, receipts, fallos y replays reales |
| La ejecución paralela de archivos bloqueaba el DDL de fault injection | Suite inestable | Archivos seriales; concurrencia real dentro de cada escenario |
| Una desconexión escapaba del pool durante la entrega | Error no controlado | Gestión y descarte explícitos de la conexión prestada |

## Decisión propuesta

- Estado técnico: `Implemented`.
- Requisitos: 20 `Verified`, TEN-REQ-020 `Implemented`.
- Decisión propuesta: `Accepted with conditions`.
- Condiciones: crear y enlazar el PR, ejecutar el workflow remoto y obtener revisión humana.
- Alcance aprobado: validación técnica local de las decisiones de persistencia.
- Alcance no aprobado: despliegue productivo, seguridad extremo a extremo o garantía exactly-once distribuida.
