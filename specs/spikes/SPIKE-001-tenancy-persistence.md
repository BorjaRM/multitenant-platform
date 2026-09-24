---
id: SPIKE-001
title: Tenancy, RLS y persistencia transaccional
type: technical-spike
status: implemented
version: 0.2.0
owner: TBD
created: 2026-09-11
reviewed: 2026-09-11
---

# SPIKE-001 — Tenancy, RLS y persistencia transaccional

## 1. Propósito

Validar que la plataforma puede garantizar el aislamiento entre organizaciones mediante:

- PostgreSQL compartido.
- Row Level Security (RLS).
- Drizzle ORM.
- `node-postgres`.
- Pooling de conexiones.
- Contexto tenant explícito por transacción.
- Transactional outbox.
- Restricciones tenant-aware.
- Operaciones concurrentes sobre reservas.

El spike debe producir evidencia suficiente para aceptar, modificar o rechazar las decisiones técnicas relacionadas con tenancy y persistencia.

Este spike no constituye todavía la implementación productiva completa de los módulos de clientes, reservas, pagos o identidad.

## 2. Pregunta principal

> ¿Podemos ejecutar operaciones de negocio multi-tenant sobre PostgreSQL compartido garantizando que ningún usuario, proceso o consulta pueda acceder a datos de otra organización, incluso con pooling, concurrencia, reintentos o errores de aplicación?

## 3. Objetivos

### 3.1 Objetivos incluidos

1. Validar el contexto tenant dentro de una transacción y su autorización previa.
2. Validar políticas RLS para lectura, inserción, actualización y borrado.
3. Validar que el rol de aplicación no puede omitir RLS.
4. Validar que el contexto no se filtra entre conexiones reutilizadas.
5. Validar relaciones, índices y restricciones compuestas con `organization_id`.
6. Validar una unidad de trabajo tenant-aware implementada con Drizzle y `node-postgres`.
7. Validar la atomicidad entre cambio de negocio, auditoría y outbox.
8. Validar `CreateCustomer` y `BookSession` con idempotencia vinculada al tenant.
9. Validar una operación concurrente de reserva con control de aforo y transiciones de estado.
10. Validar un worker tenant-aware y un consumidor idempotente de referencia.
11. Validar roles, migraciones repetibles y bases de prueba desechables.
12. Comprobar que los tests detectan la retirada de RLS, `NOT NULL` y FKs compuestas.
13. Registrar evidencia para actualizar los ADR de persistencia.

### 3.2 Objetivos excluidos

Quedan fuera de este spike:

- Interfaz web completa.
- Aplicación móvil.
- Integración real con Clerk.
- Implementación completa de RBAC.
- Facturación.
- Integración con PSP.
- Redis.
- Despliegue cloud definitivo.
- Recuperación selectiva por tenant.
- Sistema completo de notificaciones.
- Todas las reglas comerciales de planes y suscripciones.
- Implementación definitiva de la lista de espera.
- Cola o broker externo y descubrimiento automático de eventos.
- Garantía exactly-once distribuida.
- Gestión productiva de dead-letter queues, alertas y retención.
- Todas las transiciones y reglas comerciales del dominio de reservas.
- Ejecución remota confirmada del workflow de GitHub Actions.

Para autenticación y autorización se utilizarán identidades y accesos simulados en las pruebas.

### 3.3 Cambio de alcance durante la ejecución

La revisión técnica inicial encontró pruebas no repetibles, falsos positivos y una vía de borrado cruzado mediante permisos sobre tablas globales. Para responder a esos hallazgos sin convertir el spike en un MVP, se amplió el alcance técnico de validación.

Se añadieron:

- permisos efectivos sobre tablas globales, políticas, roles y cascadas;
- migración desde una base vacía, reaplicación con datos y separación entre `fitness_migration` y `fitness_app`;
- equivalencia de columnas, nulabilidad y FKs entre Drizzle y PostgreSQL;
- `BookSession` como segundo caso de uso mínimo para probar aforo, idempotencia y eventos de extremo a extremo;
- tablas `idempotency_keys` y `consumer_receipts` como infraestructura mínima de validación;
- worker de referencia con bloqueo, reintentos, cuarentena, logs estructurados y recuperación tras una desconexión real;
- CRUD y agregados RLS sobre todas las tablas tenant, incluidas las tablas auxiliares;
- cancelación y nueva reserva, traslado entre sesiones y reducción de aforo;
- mutation tests para demostrar que las aserciones detectan controles retirados;
- validación estructural de trazabilidad y ADR, incluidos casos negativos.

Este cambio no incorpora autenticación real, RBAC completo, un broker externo ni entrega exactly-once. Las nuevas implementaciones son superficies mínimas para obtener evidencia ejecutable de las hipótesis del spike.

### 3.4 Estado del alcance

| Área | Estado | Evidencia principal |
| --- | --- | --- |
| Roles y migraciones | Implemented | Checkpoint 1, 4 tests |
| Esquema y Drizzle | Implemented | Checkpoint 2, 4 tests |
| Autorización, RLS, UoW y pool | Implemented | Checkpoint 3, 14 tests |
| Atomicidad, idempotencia y workers | Implemented | Checkpoint 4, 12 tests |
| Reservas, aforo y reintentos | Implemented | Checkpoint 5, 6 tests |
| Conformidad documental | Implemented | Checkpoint 6, 4 tests; cierre pendiente de PR |

## 4. Hipótesis técnicas

| ID | Hipótesis | Criterio de validación |
| --- | --- | --- |
| H1 | El contexto tenant puede establecerse dentro de cada transacción | Toda operación tenant establece el contexto antes de consultar o escribir |
| H2 | PostgreSQL RLS bloquea accesos cruzados | Las pruebas de lectura, escritura y modificación cruzadas fallan |
| H3 | El contexto no sobrevive a la devolución de la conexión al pool | Las pruebas alternando organizaciones no presentan fugas |
| H4 | Las restricciones compuestas impiden relaciones entre tenants | PostgreSQL rechaza referencias cruzadas |
| H5 | La unidad de trabajo evita conexiones fuera de contexto | Los casos de uso no reciben una conexión global |
| H6 | Outbox y cambio de negocio son atómicos | Un error intermedio revierte ambos |
| H7 | El aforo se respeta bajo concurrencia | Las reservas confirmadas nunca superan el aforo |
| H8 | El patrón es compatible con workers y tareas asíncronas | Un worker debe recibir un tenant explícito para operar |

## 5. Principios de diseño

1. La organización es el tenant.
2. El centro es un ámbito operativo, no un tenant.
3. Toda tabla de negocio tenant debe incluir `organization_id`.
4. Ningún `organization_id` enviado por el cliente se considera autorizado por sí mismo.
5. La autorización se resuelve antes de establecer el contexto tenant.
6. El contexto tenant debe tener alcance de transacción.
7. El rol de aplicación no puede tener `BYPASSRLS`.
8. Las operaciones tenant utilizan una unidad de trabajo explícita.
9. Las relaciones entre entidades tenant deben incluir `organization_id`.
10. El cambio de negocio y sus eventos deben confirmarse de forma atómica.
11. Los workers y procesos asíncronos deben recibir el tenant de forma explícita.
12. Las pruebas deben incluir al menos dos organizaciones.

## 6. Arquitectura del spike

```text
AuthenticatedPrincipal simulado
        │
        ▼
Resolución de acceso a organización
        │
        ▼
AuthorizedTenantContext
        │
        ▼
TenantUnitOfWork
        │
        ├── set_config('app.current_organization_id', ..., true)
        ├── Repositorios tenant-aware
        ├── Caso de uso
        ├── AuditEvent
        └── OutboxEvent
                │
                ▼
          PostgreSQL + RLS
```

## 7. Modelo de datos mínimo

### 7.1 Entidades globales o de control

- `identities`
- `organizations`
- `organization_users`

- `idempotency_keys`
- `consumer_receipts`
Estas entidades permiten resolver quién es la identidad y a qué organizaciones puede acceder.

### 7.2 Entidades tenant

- `locations`
- `customers`
- `sessions`
- `bookings`
- `audit_events`
- `outbox_events`

Todas las tablas tenant deben incluir:

```sql
organization_id uuid NOT NULL
```

### 7.3 Campos comunes

```text
id
organization_id
created_at
updated_at
```

Los identificadores deben ser opacos y no predecibles. Se podrá utilizar UUIDv7, ULID u otra estrategia equivalente.

### 7.4 Relaciones mínimas

```text
Identity
  └── OrganizationUser
          └── Organization
                  ├── Location
                  ├── Customer
                  ├── Session
                  ├── Booking
                  ├── AuditEvent
                  └── OutboxEvent


También son tenant-aware:

```text
Session(organization_id, location_id)
    → Location(organization_id, id)

AuditEvent/OutboxEvent(organization_id, aggregate_id)
    → Customer o Booking(organization_id, id)

ConsumerReceipt(organization_id, event_id)
    → OutboxEvent(organization_id, id)
```

Las reservas activas (`pending`, `confirmed`) son únicas por organización, cliente y sesión. Una reserva `cancelled` conserva historial y permite crear una nueva reserva activa.
Booking
  ├── Customer
  └── Session
```

### 7.5 Relaciones compuestas

Las relaciones entre entidades tenant deben incluir `organization_id`.

Conceptualmente:

```text
Booking(organization_id, customer_id)
    → Customer(organization_id, id)

Booking(organization_id, session_id)
    → Session(organization_id, id)
```

El objetivo es impedir que una reserva de la organización A pueda apuntar a un cliente o sesión de la organización B.

## 8. Roles de PostgreSQL

El spike debe utilizar como mínimo dos roles.

### 8.1 Rol de migraciones

Responsabilidades:

- Crear tablas.
- Crear índices.
- Crear restricciones.
- Crear políticas RLS.
- Ejecutar migraciones.

Este rol no debe utilizarse para ejecutar operaciones normales de la aplicación.

### 8.2 Rol de aplicación

Responsabilidades:

- Ejecutar consultas de negocio.
- Insertar y modificar datos permitidos.
- Ejecutar operaciones dentro del contexto tenant.

Restricciones:

- No debe ser propietario de las tablas, salvo que la estrategia elegida lo documente expresamente.
- No debe tener `BYPASSRLS`.
- No debe poder desactivar RLS.
- Solo debe tener los permisos necesarios.

## 9. RLS mínima

Todas las tablas tenant deben tener RLS activado y forzado:

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
```

Ejemplo de política:

```sql
CREATE POLICY customers_tenant_isolation
ON customers
USING (
  organization_id =
  NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )::uuid
)
WITH CHECK (
  organization_id =
  NULLIF(
    current_setting('app.current_organization_id', true),
    ''
  )::uuid
);
```

La política debe garantizar:

- Sin contexto tenant no hay lectura.
- Sin contexto tenant no hay inserción.
- No se puede insertar una fila para otro tenant.
- No se puede modificar una fila de otro tenant.
- No se puede borrar una fila de otro tenant.

La sintaxis exacta podrá variar durante la implementación, pero el comportamiento debe mantenerse.

## 10. Resolución del tenant

El tenant no se debe obtener directamente de una cabecera o parámetro sin validación.

Flujo requerido:

1. Verificar la identidad autenticada.
2. Recibir la organización solicitada.
3. Comprobar la relación `organization_users`.
4. Resolver roles y ámbito.
5. Crear un `AuthorizedTenantContext`.
6. Abrir la transacción.
7. Establecer el contexto PostgreSQL.
8. Ejecutar el caso de uso.
9. Confirmar o revertir la transacción.

Ejemplo de contexto:

```ts
type AuthorizedTenantContext = {
  identityId: string
  organizationId: string
  locationIds?: string[]
  permissions: string[]
}
```

## 11. Unidad de trabajo tenant-aware

Los casos de uso no deben obtener una conexión global directamente.

Interfaz conceptual:

```ts
interface TenantUnitOfWork {
  execute<T>(
    context: AuthorizedTenantContext,
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T>
}
```

Implementación conceptual:

```ts
return database.transaction(async (tx) => {
  await tx.execute(sql`
    SELECT set_config(
      'app.current_organization_id',
      ${context.organizationId},
      true
    )
  `)

  return operation(tx)
})
```

Requisitos:

- El tercer parámetro de `set_config` debe limitar el valor a la transacción.
- Todas las consultas de la operación deben utilizar `tx`.
- No se permite combinar `tx` con una conexión global.
- El contexto debe limpiarse automáticamente al finalizar la transacción.
- Un caso de uso no debe poder operar sin contexto autorizado.

## 12. Casos de uso mínimos

El alcance implementa dos recorridos mínimos completos:

```text
CreateCustomer
BookSession
```

`CreateCustomer` debe:

1. Validar la entrada.
2. Resolver la organización autorizada.
3. Abrir una unidad de trabajo.
4. Establecer el contexto tenant.
5. Crear el cliente.
6. Registrar un evento de auditoría.
7. Crear un evento en outbox.
8. Confirmar las tres operaciones juntas.

Ejemplo conceptual:

```ts
await tenantUnitOfWork.execute(context, async (tx) => {
  const customer = await customerRepository.create(tx, input)

  await auditRepository.append(tx, {
    action: "customer.created",
    targetId: customer.id,
  })

  await outboxRepository.append(tx, {
    type: "customer.created",
    aggregateId: customer.id,
  })

  return customer
})
```

`BookSession` debe:

1. Recibir un contexto autorizado y una clave de idempotencia vinculada al tenant.
2. Bloquear la sesión antes de comprobar y modificar el aforo.
3. Devolver la reserva activa existente ante un replay equivalente.
4. Rechazar el mismo cliente y sesión como duplicado activo.
5. Crear auditoría y outbox solo cuando se crea una reserva.
6. Confirmar reserva, auditoría, outbox y resultado idempotente juntos.

Los casos de uso dependen de interfaces de repositorio. No reciben Drizzle ni el pool global.

## 13. Outbox transaccional

`outbox_events` debe incluir como mínimo:

```text
id
organization_id
event_type
aggregate_type
aggregate_id
payload
occurred_at
published_at
attempts
last_error
correlation_id
available_at
failed_at
```

El consumidor de referencia utiliza además:

```text
consumer_receipts(organization_id, event_id, consumer)
```

El spike debe comprobar:

- El evento se crea en la misma transacción que el cambio de negocio.
- Un error antes del commit revierte negocio, auditoría, outbox e idempotencia.
- El evento contiene `organization_id` y referencia un agregado del mismo tenant.
- Un worker no puede procesar un evento sin contexto tenant explícito.
- Un consumidor puede procesar reintentos de forma idempotente.
- Dos workers concurrentes no duplican el efecto duradero.
- Una pérdida de respuesta o de conexión después del efecto se puede reintentar.
- `available_at` impide procesar antes del siguiente intento.
- El número de intentos está acotado y `failed_at` marca la cuarentena.
- Los logs incluyen código, correlation ID, tenant, evento e intento, sin payload ni mensajes arbitrarios del proveedor.

La garantía validada es entrega al menos una vez con efecto idempotente. No se valida exactly-once distribuido.

### 13.1 Idempotencia de solicitudes

`idempotency_keys` vincula `(organization_id, key)` con un fingerprint y el resultado. Un replay equivalente devuelve ese resultado; reutilizar la clave con otro payload falla. La fila idempotente se confirma o revierte junto con negocio, auditoría y outbox.

## 14. Prueba de concurrencia

Crear una sesión con aforo limitado y ejecutar reservas concurrentes.

### Escenario mínimo

```text
Aforo de la sesión: 10
Solicitudes simultáneas: 50
Clientes distintos: 50
```

### Resultado esperado

- Exactamente 10 reservas confirmadas.
- Las restantes se rechazan o quedan fuera de alcance según la estrategia elegida.
- Nunca existen 11 reservas confirmadas.
- Un cliente no puede tener reservas duplicadas.
- Las reservas confirmadas generan eventos idempotentes.
- El resultado es reproducible bajo carga repetida.

El spike debe comparar y documentar la estrategia utilizada:

- Bloqueo pesimista.
- Actualización condicional.
- Restricción única.
- Contador protegido transaccionalmente.
- Otra estrategia justificada.

## 15. Pruebas obligatorias

### 15.1 Aislamiento de lectura

Una identidad con acceso a A no puede consultar clientes de B.

### 15.2 Aislamiento de escritura

Una identidad con acceso a A no puede insertar o modificar filas de B.

### 15.3 Ausencia de contexto

Una operación sin contexto tenant no puede leer, insertar, modificar ni borrar datos tenant.

### 15.4 Manipulación del tenant

Si el cliente intenta enviar un `organization_id` distinto del autorizado, la operación debe fallar o ignorar el valor no autorizado.

### 15.5 Fuga del pool

Alternar operaciones de A y B usando un pool pequeño, idealmente de una conexión, durante múltiples iteraciones.

Nunca debe aparecer una fila de la organización equivocada.

### 15.6 Relaciones cruzadas

Intentar crear una reserva de A apuntando a un cliente o sesión de B.

La base de datos debe rechazar la operación.

### 15.7 Atomicidad

Forzar un error después de insertar el cliente, pero antes de completar auditoría u outbox.

No debe persistir ninguna de las operaciones.

### 15.8 Reintentos

Repetir una operación con la misma clave de idempotencia.

No debe crear duplicados.

### 15.9 Workers

Intentar procesar un evento sin `organization_id`.

El worker debe rechazarlo o enviarlo a una cola de error, según la política definida.

### 15.10 CRUD completo y tablas auxiliares

Las pruebas deben cubrir lectura, consulta por ID, conteo, inserción, actualización y borrado sin contexto y desde otro tenant sobre todas las tablas de negocio. `idempotency_keys` y `consumer_receipts` deben aplicar la misma política RLS.

### 15.11 Permisos y migraciones

El rol de aplicación debe fallar al:

- modificar o borrar organizaciones, identidades o membresías;
- desactivar RLS o modificar políticas;
- asumir el rol de migración;
- crear o truncar tablas.

La migración debe ejecutarse desde vacío, poder reaplicarse con datos válidos y conservar la propiedad de las tablas en `fitness_migration`.

### 15.12 Transiciones de reservas

Se prueban:

- `pending` a `confirmed`;
- cancelación y creación posterior de una nueva reserva activa;
- traslado a una sesión con y sin aforo;
- reducción de capacidad por encima y por debajo de las reservas confirmadas;
- timeout de bloqueo antes del commit y reintento posterior.

### 15.13 Sensibilidad de la suite

Las mutation tests retiran individualmente:

- RLS de `customers`;
- `NOT NULL` de `customers.organization_id`;
- la FK compuesta `bookings_session_tenant_match`.

Cada mutación debe convertir en rojo el test asociado por una aserción, no por un fallo de setup.

## 16. Entregables

El spike debe producir:

1. Spec versionada.
2. Migraciones SQL.
3. Definición Drizzle equivalente.
4. Configuración local de PostgreSQL.
5. Roles y permisos de base de datos.
6. Políticas RLS.
7. `TenantUnitOfWork`.
8. Caso de uso `CreateCustomer`.
9. Caso de uso mínimo de reserva concurrente.
10. Auditoría.
11. Transactional outbox.
12. Pruebas automatizadas.
13. Resultados de ejecución.
14. Decisión arquitectónica actualizada.
15. Lista de riesgos pendientes.
16. Caso de uso `BookSession`.
17. Worker y consumidor idempotente de referencia.
18. Harness de bases desechables y mutation tests.
19. Workflow de CI configurado.

## 17. Criterios de aceptación

El spike se considera técnicamente validado cuando:

- [x] No existen lecturas cruzadas entre organizaciones.
- [x] No existen escrituras cruzadas entre organizaciones ni por cascadas globales.
- [x] Una operación sin tenant no obtiene ni modifica datos.
- [x] El rol de aplicación no tiene `BYPASSRLS`, no posee tablas y no puede asumir migración.
- [x] RLS está activado y forzado en todas las tablas tenant del spike.
- [x] Las relaciones tenant-aware impiden referencias cruzadas de reservas, sesiones y eventos.
- [x] El contexto no se filtra entre conexiones del pool después de commit, rollback o error.
- [x] Negocio, auditoría, outbox e idempotencia son atómicos.
- [x] Los reintentos equivalentes no producen duplicados y los conflictos de payload se rechazan.
- [x] Cinco rondas de 50 solicitudes respetan un aforo de 10.
- [x] Los workers requieren contexto tenant explícito y sus efectos son idempotentes.
- [x] El workflow de CI contiene bootstrap, typecheck, suite repetida, trazabilidad y mutaciones.
- [x] Los resultados y fallos anteriores están documentados.
- [x] Los ADR correspondientes están actualizados como `Proposed`.
- [ ] Existe ejecución remota del workflow enlazada al PR.
- [ ] TEN-REQ-020 enlaza un PR real y existe revisión humana.

## 18. Criterios de salida

El resultado podrá ser uno de los siguientes:

### Aceptado

La arquitectura cumple los criterios y puede utilizarse como base del MVP.

### Aceptado con condiciones

La arquitectura es válida, pero requiere acciones específicas antes de producción.

### Requiere modificación

La solución necesita ajustes antes de iniciar el desarrollo funcional.

### Rechazado

La estrategia no garantiza aislamiento, consistencia o comportamiento operativo aceptable.

## 19. Decisiones posteriores

Al terminar el spike deben revisarse, como mínimo:

- `ADR-002 — PostgreSQL, RLS, pooling y contexto tenant`.
- `ADR-006 — Transactional outbox y worker`.
- `ADR-007 — Drizzle, repositorios tenant-aware y SQL revisable`.

## 20. Flujo de trabajo en GitHub

### Rama

```text
spike/tenancy-persistence
```

### Pull request

El pull request debe incluir:

- Spec del spike.
- Requisitos.
- Migraciones.
- Código.
- Pruebas.
- Resultados.
- Riesgos.
- Decisión propuesta.

Estado previo al PR:

- Estado técnico: `Implemented`.
- Requisitos con evidencia automatizada: 20 `Verified`, 1 `Implemented`.
- Bloqueadores: `PR_PENDING`, `HUMAN_REVIEW_PENDING`.
- Evidencia: 44/44 tests en dos ejecuciones; 3/3 mutaciones detectadas.
- Decisión propuesta: `Accepted with conditions`.
- Condiciones: enlazar PR, ejecutar CI remoto y obtener revisión humana.
- Alcance productivo: no aprobado por este spike.

### Trazabilidad

```text
TEN-REQ-001 → prueba → implementación → pull request
```

El pull request no debe considerarse terminado únicamente porque el código compile. Debe demostrar el cumplimiento de los requisitos y criterios de aceptación.

## 21. Riesgos pendientes

- Complejidad de RLS con consultas analíticas y agregaciones.
- Operaciones asíncronas que atraviesen límites de tenant.
- Procesos de soporte con elevación temporal.
- Exportación y borrado por organización.
- Recuperación lógica desde backups.
- Datos derivados en cachés, archivos y búsquedas.
- Coste operativo de pruebas de concurrencia.
- Compatibilidad entre RLS y futuras estrategias de particionado o routing.
- Revocación de membresía durante una transacción ya iniciada.
- Borrado concurrente de sesión u organización durante una reserva.
- Evolución de migraciones con datos históricos que violen nuevas invariantes.
- Descubrimiento, leasing y retención de outbox en un broker real.
- Disponibilidad del efecto externo entre entrega y confirmación local.
- Métricas, alertas y operación de cuarentena en producción.
- Compatibilidad de advisory locks de idempotencia bajo múltiples regiones.

## 22. Decisión final

Estado propuesto a revisión humana:

```text
Decisión propuesta: Accepted with conditions
Fecha: 2026-09-11
Responsable: spike/tenancy-persistence
ADR actualizado: ADR-002, ADR-006 y ADR-007 (Proposed)
Pull request: pending
Limitaciones: validación local, sin identidad ni broker productivos
Acciones siguientes: enlazar PR, ejecutar CI remoto y completar revisión humana
```