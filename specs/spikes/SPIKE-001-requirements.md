---
id: SPIKE-001-REQ
title: Requisitos del spike de tenancy y persistencia
type: technical-requirements
status: implemented
version: 0.2.0
related-spike: SPIKE-001
owner: TBD
created: 2026-09-11
---

# Requisitos del spike de tenancy y persistencia

## 1. Convenciones

Cada requisito tiene:

- Un identificador estable.
- Una descripción verificable.
- Un criterio de aceptación.
- Una prioridad.
- Una referencia a la prueba que lo demuestra.

Prioridades:

- **Must:** obligatorio para validar el spike.
- **Should:** importante, pero puede quedar condicionado.
- **Could:** recomendable si no aumenta significativamente el alcance.

Estados:

- `Draft`
- `Implemented`
- `Verified`
- `Failed`
- `Deferred`

## 2. Requisitos de contexto tenant

### TEN-REQ-001 — Contexto tenant explícito

**Prioridad:** Must  
**Estado:** Verified

Toda operación sobre datos de negocio tenant debe ejecutarse con un `organizationId` explícito y previamente autorizado.

**Criterios de aceptación:**

- El caso de uso recibe un `AuthorizedTenantContext`.
- El contexto incluye `organizationId`.
- La operación no puede continuar si el contexto está ausente.
- El `organizationId` enviado por el cliente no se considera autorizado por sí mismo.

**Prueba:**

```text
test/integration/checkpoint-3/application-context.integration.test.js
test/integration/checkpoint-3/authorized-tenant-context.integration.test.js
```

---

### TEN-REQ-002 — Resolución de acceso

**Prioridad:** Must  
**Estado:** Verified

El backend debe comprobar que la identidad tiene acceso a la organización antes de iniciar una operación tenant.

**Criterios de aceptación:**

- Una identidad autorizada puede operar en su organización.
- Una identidad no autorizada no puede establecer el contexto.
- El acceso se resuelve desde `organization_users` o una estructura equivalente.
- La relación de acceso no depende de datos enviados por el cliente.

**Prueba:**

```text
test/integration/checkpoint-3/tenant-access-resolution.integration.test.js
test/integration/checkpoint-3/application-context.integration.test.js
```

---

### TEN-REQ-003 — Prohibición de operaciones sin tenant

**Prioridad:** Must  
**Estado:** Verified

Una operación sin contexto tenant no debe leer, insertar, modificar ni borrar datos tenant.

**Criterios de aceptación:**

- Una consulta sin contexto devuelve cero filas o falla de forma segura.
- Una inserción sin contexto es rechazada.
- Una actualización sin contexto no modifica filas.
- Un borrado sin contexto no modifica filas.

**Prueba:**

```text
test/integration/checkpoint-3/missing-tenant-context.integration.test.js
test/integration/checkpoint-3/crud-enforcement.integration.test.js
```

## 3. Requisitos de aislamiento

### TEN-REQ-004 — Aislamiento de lectura

**Prioridad:** Must  
**Estado:** Verified

Una identidad con acceso a la organización A no puede leer datos de la organización B.

**Criterios de aceptación:**

- Las consultas directas no devuelven datos de B.
- Consultar un identificador perteneciente a B no revela el registro.
- Los listados no mezclan resultados de organizaciones.
- Los agregados y conteos tampoco mezclan organizaciones.

**Prueba:**

```text
test/integration/checkpoint-3/cross-tenant-read-isolation.integration.test.js
test/integration/checkpoint-3/crud-enforcement.integration.test.js
```

---

### TEN-REQ-005 — Aislamiento de escritura

**Prioridad:** Must  
**Estado:** Verified

Una identidad con acceso a la organización A no puede crear ni modificar datos de la organización B.

**Criterios de aceptación:**

- Una inserción con `organization_id = B` es rechazada.
- Una actualización de una fila de B no produce cambios.
- Un borrado de una fila de B no produce cambios.
- No es posible sobrescribir el tenant mediante un campo de entrada.

**Prueba:**

```text
test/integration/checkpoint-3/cross-tenant-write-isolation.integration.test.js
test/integration/checkpoint-3/crud-enforcement.integration.test.js
```

---

### TEN-REQ-006 — RLS obligatorio

**Prioridad:** Must  
**Estado:** Verified

Todas las tablas tenant deben tener Row Level Security activado y forzado.

**Criterios de aceptación:**

- RLS está habilitado en cada tabla tenant.
- RLS está forzado para el rol de aplicación.
- Existe política de lectura.
- Existe política de inserción o `WITH CHECK`.
- Existe política de actualización.
- Existe política de borrado cuando aplique.
- El rol de aplicación no tiene `BYPASSRLS`.

**Prueba:**

```text
test/integration/checkpoint-3/rls-configuration.integration.test.js
scripts/test-mutations.cjs
```

---

### TEN-REQ-007 — Contexto limitado a transacción

**Prioridad:** Must  
**Estado:** Verified

El contexto tenant debe establecerse dentro de una transacción y no debe sobrevivir cuando la conexión vuelva al pool.

**Criterios de aceptación:**

- Se utiliza `set_config(..., true)` o mecanismo equivalente.
- El contexto se establece antes de consultar datos tenant.
- El contexto desaparece al finalizar la transacción.
- Las conexiones no conservan el tenant de una solicitud anterior.

**Prueba:**

```text
test/integration/checkpoint-3/transaction-local-tenant.integration.test.js
test/integration/checkpoint-3/application-context.integration.test.js
```

---

### TEN-REQ-008 — No fuga entre conexiones del pool

**Prioridad:** Must  
**Estado:** Verified

El sistema no debe filtrar el contexto tenant entre solicitudes que reutilizan conexiones del pool.

**Criterios de aceptación:**

- El test alterna operaciones de A y B.
- El test utiliza un pool pequeño.
- El test ejecuta múltiples iteraciones.
- Nunca se devuelve una fila del tenant equivocado.
- El resultado es reproducible.

**Prueba:**

```text
test/integration/checkpoint-3/connection-pool-leakage.integration.test.js
test/integration/checkpoint-3/crud-enforcement.integration.test.js
```

## 4. Requisitos de persistencia

### TEN-REQ-009 — `organization_id` obligatorio

**Prioridad:** Must  
**Estado:** Verified

Todas las tablas de negocio tenant deben incluir un `organization_id` obligatorio.

**Criterios de aceptación:**

- La columna no admite `NULL`.
- El campo forma parte de los índices relevantes.
- El campo aparece en eventos y auditoría.
- El campo no se puede inferir únicamente desde una relación secundaria.

**Prueba:**

```text
test/integration/checkpoint-2/tenant-schema.integration.test.js
test/integration/checkpoint-2/tenant-invariants.integration.test.js
scripts/test-mutations.cjs
```

---

### TEN-REQ-010 — Restricciones compuestas

**Prioridad:** Must  
**Estado:** Verified

Las relaciones entre entidades tenant deben incluir `organization_id`.

**Criterios de aceptación:**

- Las claves foráneas relevantes incluyen organización.
- Una reserva de A no puede apuntar a un cliente de B.
- Una reserva de A no puede apuntar a una sesión de B.
- PostgreSQL rechaza las relaciones cruzadas incluso si falla una validación de aplicación.

**Prueba:**

```text
test/integration/checkpoint-2/cross-tenant-foreign-keys.integration.test.js
scripts/test-mutations.cjs
```

---

### TEN-REQ-011 — Unidad de trabajo tenant-aware

**Prioridad:** Must  
**Estado:** Verified

Los casos de uso tenant deben ejecutarse mediante una unidad de trabajo que establezca el contexto y proporcione la transacción.

**Criterios de aceptación:**

- Los casos de uso no reciben una conexión global.
- La unidad de trabajo recibe un contexto autorizado.
- Las operaciones internas reciben `tx`.
- Se rechaza operar fuera de una unidad de trabajo.
- El contexto se establece una sola vez al comenzar la transacción.

**Prueba:**

```text
test/integration/checkpoint-3/application-context.integration.test.js
test/integration/checkpoint-3/tenant-unit-of-work.integration.test.js
```

---

### TEN-REQ-012 — Rol de aplicación restringido

**Prioridad:** Must  
**Estado:** Verified

El rol de aplicación no debe poder desactivar los controles de aislamiento.

**Criterios de aceptación:**

- No tiene `BYPASSRLS`.
- No puede desactivar RLS.
- No puede modificar políticas.
- No es utilizado para ejecutar migraciones.
- Solo tiene permisos de aplicación necesarios.

**Prueba:**

```text
test/integration/checkpoint-1/app-role-connection.integration.test.js
test/integration/checkpoint-1/app-role-restrictions.integration.test.js
```

## 5. Requisitos de atomicidad

### TEN-REQ-013 — Atomicidad de la operación de negocio

**Prioridad:** Must  
**Estado:** Verified

El cambio de negocio, la auditoría y el evento outbox deben confirmarse o revertirse juntos.

**Criterios de aceptación:**

- El cliente se crea dentro de una transacción.
- La auditoría se crea dentro de la misma transacción.
- El evento outbox se crea dentro de la misma transacción.
- Un error antes del commit revierte las tres operaciones.
- No existen eventos outbox huérfanos.

**Prueba:**

```text
test/integration/checkpoint-4/transactional-atomicity.integration.test.js
test/integration/checkpoint-4/customer-workflow.integration.test.js
```

---

### TEN-REQ-014 — Outbox con contexto tenant

**Prioridad:** Must  
**Estado:** Verified

Todo evento outbox asociado a datos tenant debe incluir `organization_id`.

**Criterios de aceptación:**

- El campo es obligatorio.
- El evento no se puede crear sin tenant.
- El aggregate pertenece a la misma organización.
- El worker puede reconstruir el contexto tenant desde el evento.

**Prueba:**

```text
test/integration/checkpoint-4/outbox-tenant-context.integration.test.js
test/integration/checkpoint-4/worker-processing.integration.test.js
```

---

### TEN-REQ-015 — Idempotencia

**Prioridad:** Must  
**Estado:** Verified

Repetir una operación con la misma clave de idempotencia no debe producir duplicados.

**Criterios de aceptación:**

- La segunda solicitud devuelve el resultado existente o un resultado equivalente.
- No se crean dos clientes o reservas para la misma operación.
- No se crean eventos duplicados no controlados.
- La clave de idempotencia está vinculada al tenant.

**Prueba:**

```text
test/integration/checkpoint-4/customer-workflow.integration.test.js
test/integration/checkpoint-5/booking-workflow.integration.test.js
test/integration/checkpoint-3/crud-enforcement.integration.test.js
```

## 6. Requisitos de concurrencia

### TEN-REQ-016 — Integridad de aforo

**Prioridad:** Must  
**Estado:** Verified

Las reservas confirmadas nunca pueden superar el aforo de una sesión.

**Criterios de aceptación:**

- Se crea una sesión con aforo conocido.
- Se ejecutan solicitudes concurrentes.
- El número de reservas confirmadas nunca supera el aforo.
- Las solicitudes excedentes tienen un resultado controlado.
- No existen reservas duplicadas para el mismo cliente y sesión.
- La prueba de carga ejecuta cinco rondas de 50 solicitudes para un aforo de 10.
- Las transiciones, traslados y reducciones de aforo conservan la misma invariante.
- Un timeout antes del commit no deja una reserva parcial.
- La defensa se verifica tanto por el caso de uso como por las restricciones PostgreSQL.

**Prueba:**

```text
test/integration/checkpoint-5/booking-workflow.integration.test.js
test/integration/checkpoint-5/booking-capacity-concurrency.integration.test.js
test/integration/checkpoint-5/booking-transitions.integration.test.js
```

---

### TEN-REQ-017 — Consistencia bajo reintentos

**Prioridad:** Should  
**Estado:** Verified

Los reintentos producidos por errores de red o timeouts no deben romper la integridad de reservas.

**Criterios de aceptación:**

- Una solicitud repetida no duplica reservas.
- El estado final es consistente.
- Los eventos generados pueden procesarse de forma idempotente.
- Los fallos quedan observables.
- Una respuesta perdida después de persistir devuelve el resultado idempotente en el replay.
- Un corte real de conexión no duplica el efecto confirmado del consumidor.
- La clave reutilizada con otro payload es rechazada.

**Prueba:**

```text
test/integration/checkpoint-5/booking-workflow.integration.test.js
test/integration/checkpoint-5/booking-retry-consistency.integration.test.js
test/integration/checkpoint-4/worker-processing.integration.test.js
```

## 7. Requisitos de procesos asíncronos

### TEN-REQ-018 — Contexto explícito en workers

**Prioridad:** Must  
**Estado:** Verified

Los workers y tareas asíncronas deben recibir un contexto tenant explícito cuando procesen datos de cliente.

**Criterios de aceptación:**

- El evento incluye `organization_id`.
- El worker rechaza eventos sin tenant.
- El worker establece contexto antes de acceder a datos.
- El worker no obtiene el tenant de una conexión previa.
- Los reintentos mantienen el mismo contexto.
- Dos workers concurrentes producen un único efecto duradero.
- La entrega es al menos una vez y el consumidor de referencia deduplica por tenant, evento y consumidor.

**Prueba:**

```text
test/integration/checkpoint-4/worker-tenant-context.integration.test.js
test/integration/checkpoint-4/worker-processing.integration.test.js
```

---

### TEN-REQ-019 — Fallos observables

**Prioridad:** Should  
**Estado:** Verified

Los fallos de outbox y workers deben ser detectables y diagnosticables sin exponer datos personales innecesarios.

**Criterios de aceptación:**

- Se registra un error estructurado.
- Se incluye correlation ID.
- Se incluye `organization_id` cuando sea seguro.
- Se registra el número de intento.
- Se evita registrar payloads sensibles completos.
- Existe una estrategia para reintento o cola de fallos.
- `available_at` impide entregar antes del siguiente intento.
- Los intentos están acotados y `failed_at` registra la cuarentena.
- Los errores no incluyen el payload ni mensajes arbitrarios del proveedor.

**Prueba:**

```text
test/integration/checkpoint-4/worker-processing.integration.test.js
test/integration/checkpoint-4/worker-failure-observability.integration.test.js
```

## 8. Requisitos de documentación

### TEN-REQ-020 — Trazabilidad

**Prioridad:** Must  
**Estado:** Implemented

Cada requisito debe poder relacionarse con una prueba, una implementación y un pull request.

**Criterios de aceptación:**

- Existe una matriz de trazabilidad.
- Cada requisito tiene al menos una prueba.
- El pull request referencia la spec.
- Los resultados del spike están documentados.
- Los ADR se actualizan con la decisión final.
- La matriz enumera exactamente los 21 identificadores una sola vez.
- Todos los paths de implementación y pruebas existen en el repositorio.
- El verificador rechaza duplicados, requisitos no asignados y cierres falsos.
- El estado permanece `Implemented` hasta enlazar un PR real y registrar revisión humana.

**Artefacto:**

```text
specs/spikes/SPIKE-001-traceability.md
test/integration/checkpoint-6/traceability-documentation.integration.test.js
```

---

### TEN-REQ-021 — Registro de decisiones

**Prioridad:** Must  
**Estado:** Verified

Las decisiones surgidas del spike deben quedar registradas en los ADR correspondientes.

**Criterios de aceptación:**

- Se documenta la estrategia RLS.
- Se documenta la estrategia de pooling.
- Se documenta la unidad de trabajo.
- Se documenta la estrategia de concurrencia.
- Se documentan las limitaciones.
- Se documentan las consecuencias técnicas.

**ADRs y prueba relacionados:**

```text
specs/architecture/adrs/ADR-002-postgresql-rls-tenant-context.md
specs/architecture/adrs/ADR-006-transactional-outbox-worker.md
specs/architecture/adrs/ADR-007-drizzle-tenant-aware-repositories.md
test/integration/checkpoint-6/decision-records.integration.test.js
```

## 9. Evidencia de ejecución

Las rutas anteriores son pruebas primarias o complementarias. La matriz autoritativa con checkpoint, implementación, comando y estado está en `specs/spikes/SPIKE-001-traceability.md`.

Comandos ejecutados sobre PostgreSQL 18.6 limpio:

- `npm run typecheck`: PASS.
- `npm test`: 44/44 PASS en dos ejecuciones completas.
- `npm run test:mutations`: 3/3 mutaciones detectadas.
- `npm run test:traceability`: 21 requisitos, 20 `Verified`, cierre `false`.

## 10. Resumen de trazabilidad

| Requisito | Prueba principal | Resultado |
| --- | --- | --- |
| TEN-REQ-001 | `application-context` | Verified |
| TEN-REQ-002 | `application-context` | Verified |
| TEN-REQ-003 | `crud-enforcement` | Verified |
| TEN-REQ-004 | `crud-enforcement` | Verified |
| TEN-REQ-005 | `crud-enforcement` | Verified |
| TEN-REQ-006 | `rls-configuration` | Verified |
| TEN-REQ-007 | `crud-enforcement` | Verified |
| TEN-REQ-008 | `crud-enforcement` | Verified |
| TEN-REQ-009 | `tenant-schema` | Verified |
| TEN-REQ-010 | `tenant-invariants` | Verified |
| TEN-REQ-011 | `application-context` | Verified |
| TEN-REQ-012 | `app-role-restrictions` | Verified |
| TEN-REQ-013 | `customer-workflow` | Verified |
| TEN-REQ-014 | `customer-workflow` | Verified |
| TEN-REQ-015 | `customer-workflow` | Verified |
| TEN-REQ-016 | `booking-workflow` | Verified |
| TEN-REQ-017 | `booking-workflow` | Verified |
| TEN-REQ-018 | `worker-processing` | Verified |
| TEN-REQ-019 | `worker-processing` | Verified |
| TEN-REQ-020 | `traceability-documentation` | Implemented |
| TEN-REQ-021 | `decision-records` | Verified |

## 11. Criterio global de aceptación

El spike no se puede marcar como `Verified` hasta que todos los requisitos `Must` estén en estado `Verified` o exista una decisión explícita que documente la excepción, su riesgo y la acción correctiva.

Estado actual: `Implemented`. TEN-REQ-020 continúa `Implemented` hasta que la matriz pueda enlazar un pull request real y exista revisión humana; por tanto el resultado global no es `Verified`.
