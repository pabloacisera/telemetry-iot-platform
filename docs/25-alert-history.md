# 25 — Historial de Alertas y Toast con Auto-dismiss

## Descripción

Esta spec cubre dos mejoras relacionadas con el sistema de alertas:

1. **Toast con auto-dismiss**: los toasts del `AlertBanner` desaparecen automáticamente
   tras un tiempo configurable, con animación de fade-out, sin perder la funcionalidad
   de dismiss manual.

2. **Página de historial de alertas**: nueva sección en el dashboard (`/alertas`) que
   muestra una tabla paginada con todas las alertas — activas y resueltas — con
   filtrado por fecha, hora y motor, y detalle de resolución (humana vs automática).

---

## 1. Toast con auto-dismiss

### Comportamiento

- Cada toast aparece con la animación de entrada ya existente (`toast-in`).
- Tras **8 segundos** de visibilidad, inicia una animación de fade-out (1s).
- Al terminar el fade-out, el toast se elimina del DOM y de Redux (`alertDismissed`).
- El temporizador se **pausa** si el usuario hace hover sobre el toast.
- El dismiss manual (botón ✕) sigue funcionando igual y cancela el timer.
- El tiempo se puede ajustar con la constante `TOAST_VISIBLE_MS` en `AlertBanner.tsx`.

### Archivos modificados

- `frontend/src/components/alerts/AlertBanner.tsx` — lógica de timer + estado `fading`
- `frontend/src/index.css` — nueva animación `toast-out`

### No requiere cambios en backend ni Redux

El auto-dismiss es puramente visual. La alerta sigue "activa" en el backend hasta que
un operador o el sistema la resuelva via `PATCH /alerts/:id/resolve`.

---

## 2. Historial de alertas

### Ruta

`/alertas` — protegida, accesible a todos los roles autenticados (`viewer`, `operator`, `admin`).

### Layout

Misma estructura que el dashboard: header con botón "Volver", luego la tabla
dentro de `dashboard-grid-container` con overflow.

### Tabla

Columnas:

| Motor | Tipo | Causa | Disparada | Resuelta | Tiempo activa | Resolución | Estado |

- **Motor**: código + nombre.
- **Tipo**: etiqueta legible (`Alarma de motor`, `Trip forzado`, etc.).
- **Causa**: derivada de `metadata` (igual que `formatCause` del `AlertBanner`). Si el
  metadata incluye `triggerSensorType` y `triggerValue`, mostrar el valor en la celda.
- **Disparada**: fecha y hora local legible.
- **Resuelta**: fecha y hora local, o "—" si sigue activa.
- **Tiempo activa**: diferencia entre `triggeredAt` y `resolvedAt` (o "En curso").
- **Resolución**: `Humana` (si `resolvedBy` es un userId > 0) o `Automática` (si
  `resolvedBy` es null pero `resolvedAt` no es null) o `—` (sin resolver).
- **Estado**: badge `Activa` (rojo) / `Resuelta` (verde).

### Filtros

Barra de filtros sobre la tabla:

- **Desde / Hasta**: date inputs, filtran por `triggeredAt`.
- **Motor**: select con la lista de motores (`GET /config/motors` reutilizado) + opción "Todos".
- **Estado**: select `Todas | Activas | Resueltas`.
- Botón **Limpiar filtros** que resetea todos los controles.

Los filtros se envían al backend como query params (`motorId`, `from`, `to`, `status`)
y la paginación también es en servidor (`page`, `limit`). El rango **Desde** arranca por
defecto en los últimos 7 días para que la vista inicial sea manejable; `to` se convierte
a fin de día antes de enviarse.

### Paginación

25 filas por página (constante `PAGE_SIZE`). Controles `◀ N / Total ▶`. El total
proviene de la respuesta del backend (`{ data, total, page, limit }`), no del tamaño del
lote en memoria, así que el contador y las páginas son exactos incluso con miles de
alertas. El listado se auto-refresca cada 30s para reflejar resoluciones automáticas.

### Backend — nuevo endpoint

```
GET /alerts/history?page=1&limit=50&motorId=&from=&to=
```

Devuelve alertas paginadas con `motor` y `resolvedByUser` incluidos:

```json
{
  "data": [
    {
      "id": 42,
      "motorId": 3,
      "motor": { "id": 3, "code": "MTR-03", "name": "Motor Compresor" },
      "type": "motor_alarm",
      "metadata": { "triggerSensorType": "temperature", "triggerValue": 91.2, "consecutiveReadings": 5 },
      "triggeredAt": "2026-08-06T14:32:00.000Z",
      "resolvedAt": "2026-08-06T14:34:15.000Z",
      "resolvedBy": 2,
      "resolvedByUser": { "id": 2, "email": "operador@planta.com" },
      "resolutionNote": null
    }
  ],
  "total": 187,
  "page": 1,
  "limit": 50
}
```

### Cambios en backend

**`alerts.service.ts`** — nuevo método `getHistory(params)`:
- Filtra por `motorId`, rango de fechas, estado (`active` | `resolved` | `all`).
- Incluye relación `motor` y `resolvedByUser` (join con `users`).
- Paginado con `skip/take`.

**`alerts.controller.ts`** — nuevo endpoint `GET /alerts/history` con query params.

**`dto`** — `GetAlertHistoryDto` con validación de los query params.

### No requiere migración de base de datos

El schema ya tiene todo lo necesario: `alerts.resolved_by` (FK a `users`),
`alerts.resolved_at`, `alerts.metadata` (JSON), relación `motor`.
Solo falta exponer la relación `resolvedByUser` en las queries de Prisma.

---

## Navegación

- En `DashboardPage`, se agrega un link `Historial` visible para todos los roles
  junto a los links de Grafana y Referencia.
- En `App.tsx`, se agrega la ruta `/alertas` → `AlertHistoryPage`.

---

## Archivos involucrados

### Backend
- `src/alerts/alerts.service.ts` — nuevo método `getHistory`
- `src/alerts/alerts.controller.ts` — nuevo endpoint `GET /alerts/history`
- `src/alerts/alerts.module.ts` — sin cambios (UsersModule no necesario, query directa)

### Frontend
- `src/components/alerts/AlertBanner.tsx` — timer de auto-dismiss + fade-out
- `src/pages/AlertHistoryPage.tsx` — página nueva
- `src/pages/DashboardPage.tsx` — link al historial
- `src/App.tsx` — ruta `/alertas`
- `src/index.css` — animación `toast-out` + estilos de la tabla de historial

---

## Decisiones de diseño

- La paginación y los filtros corren **en el backend** (`GET /alerts/history?page&limit&motorId&from&to&status`).
  El frontend solo manda los parámetros y usa `total` de la respuesta. Esto evita traer
  lotes enormes en memoria y mantiene el contador/paginado exactos con miles de alertas.
- El volumen de alertas se controla en dos frentes:
  1. **De-duplicación** en `StatusTransitionService.createAlert()` — no se crea una alerta
     nueva si el motor ya tiene una abierta del mismo tipo.
  2. **Retención** — las alertas resueltas de más de `ALERT_RETENTION_DAYS` (default 30) se
     purgan por el job horario de `RetentionService` (ver `docs/20-retention-guide.md`).
- `resolvedBy: null` con `resolvedAt` no null = resolución automática del sistema
  (el motor hizo auto-restart, el sweep de 24h o el propio pipeline resolvió la alerta).
- `resolvedBy > 0` con `resolvedAt` no null = resolución humana (operador/admin).
- La tabla de historial incluye un botón **Resolver** (visible para `operator` y `admin`,
  dentro de `RoleGate`) que llama `PATCH /alerts/:id/resolve` y refresca la página.
