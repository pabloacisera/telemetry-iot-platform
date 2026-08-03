# Mejoras UX — Changelog (rama feat/ux-improvements)

## Cambios realizados

### Botones Detener / Reiniciar (funcionales)

- **Backend:** Nuevos endpoints `POST /motors/:id/stop` y `POST /motors/:id/restart` protegidos por `@Roles('admin', 'operator')`.
- **Frontend:** Botones habilitados/deshabilitados según estado del motor:
  - **Detener:** disponible si el motor está "Saludable" o "En revisión".
  - **Reiniciar:** disponible si el motor está "En revisión", "Parada manual" o "Deshabilitado".
- **Flujo completo:** Frontend → REST API → MQTT → Simulador (100s countdown) → MQTT progress → WebSocket → Frontend (muestra countdown).

### Página de Referencia de Estados (/referencia)

- Nueva ruta `/referencia` accesible desde el dashboard (link "📋 Referencia de estados").
- Tablas con:
  - Estados del motor (significado + acción recomendada).
  - Estados del sensor (significado + acción recomendada).
  - Tipos de alerta (cuándo se generan).
  - Umbrales por sensor con fuentes normativas (ISO, NEMA).

### RAG: Conocimiento de estados

- 4 nuevos knowledge fragments en español:
  - Estados del motor.
  - Estados del sensor.
  - Tipos de alerta.
  - Comandos manuales (detener/reiniciar).
- **Requiere re-seed:** `npm run seed:embeddings` para vectorizar los nuevos fragments.

### Alertas: Botón de cierre (dismiss)

- Cada alerta tiene un botón ✕ para ocultarla de la UI.
- El dismiss es solo visual (no resuelve la alerta en el backend).
- Tipos de alerta traducidos al español en el banner.

### Charts: Correcciones visuales

- Labels de umbrales movidos a la derecha con texto abreviado ("Adv.", "Crít.") para evitar superposición.
- Eje X: máximo 6 ticks, rotados -30° con altura extra para legibilidad.
- Estado vacío: muestra "Esperando datos..." cuando no hay lecturas aún.
- Formato de hora: HH:MM:SS con locale es-AR.

### WebSocket Gateway (fix previo, rama anterior)

- Telemetría broadcast a todos los clientes (room `dashboard`).
- Room management: `join-motor` / `leave-motor` para la vista de detalle.
- Socket se conecta también en refresh (no solo login).

### Sesión persistente (fix previo, rama anterior)

- `App.tsx` intenta `refreshToken()` al montar.
- `ProtectedRoute` no redirige a login mientras el refresh está en progreso.
- El refresh token (cookie httpOnly) sobrevive recargas del navegador.
