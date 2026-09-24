---
id: ADR-006
title: Transactional outbox y worker
type: architecture-decision
status: proposed
created: 2026-09-11
related-spike: SPIKE-001
---

# ADR-006 — Transactional outbox y worker

## Status

Proposed

## Context

Los cambios de negocio deben persistirse junto con auditoría y eventos de integración. Si una operación crea cambios de negocio y luego falla antes de publicar un evento, el sistema corre el riesgo de quedar inconsistente. El spike exige que negocio, auditoría y outbox se confirmen o reviertan juntos.

## Decision

Se mantiene el patrón de outbox transaccional:

- el cambio de negocio se inserta en la misma transacción
- la auditoría se escribe en la misma transacción
- el evento `outbox_events` se crea en la misma transacción
- el worker procesa eventos no publicados con el `organization_id` explícito
- un evento sin tenant o con organización distinta es rechazado o enviado a error

## Consequences

### Positives

- Evita inconsistencias entre estado de negocio y eventos.
- Permite procesar eventos de forma desacoplada sin perder atomicidad local.
- El outbox puede usarse como trazabilidad de cambios por tenant.

### Trade-offs

- Agrega un paso adicional de publicación y reintentos.
- El worker debe ser idempotente y debe recibir contexto tenant explícito.
- La observabilidad y la reintentos deben estar bien definidas para no duplicar eventos.

## Evidence

- Checkpoint 4 validó que el negocio, auditoría y outbox se revierten juntos ante error.
- El outbox conserva `organization_id` y no permite escritura cruzada por tenant.

## Follow-up

El consumidor externo de produccion debe implementar la misma deduplicacion. Pendiente de PR y revision humana; no se declara entrega exactly-once entre servicios.

## Processing

El worker valida el sobre antes de abrir una transaccion, establece el tenant y bloquea el evento con `FOR NO KEY UPDATE`. Este bloqueo serializa workers sin impedir el KEY SHARE requerido por la FK de la recepcion duradera. Un evento publicado no vuelve a entregarse; un sobre de otro tenant no encuentra la fila.

El consumidor de referencia confirma una fila en `consumer_receipts`, unica por tenant, evento y consumidor, en su propia transaccion. La prueba corta realmente la conexion del worker despues de esa confirmacion: el replay no duplica el efecto y permite marcar la publicacion. Es entrega al menos una vez con efecto idempotente, no una transaccion distribuida.

## Retry policy

Tres intentos por defecto, espera de un segundo configurable y `failed_at` como cuarentena al agotar intentos. `available_at` impide reintentar antes de tiempo. Los errores persistidos usan codigo estable `DELIVERY_FAILED`, correlation ID, tenant, evento y numero de intento en logs estructurados. Nunca se copia el mensaje arbitrario del proveedor ni el payload sensible. Una desconexion que revierte la transaccion conserva el evento pendiente para el siguiente intento.

## Evidence and limits

Checkpoint 4 ejecuta consumidores reales PostgreSQL, dos workers simultaneos, respuesta perdida tras entrega, corte de conexion, tenant incorrecto y agotamiento de intentos. El descubrimiento de eventos por cola, supervisores, politica de retencion y metricas remotas siguen fuera del spike. La cola debe entregar sobres internos confiables; un UUID de tenant no constituye autorizacion para usuarios externos.
