# 22 — Registro de Errores y Soluciones (Troubleshooting)

Registro histórico de errores encontrados en el proyecto, su causa raíz y la solución aplicada.
Cada entrada incluye fecha, síntoma, diagnóstico y commit/archivos afectados.

---

## ERR-001: Pool de conexiones Prisma agotado (Connection Pool Timeout)

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-03 |
| **Componente** | Backend → TelemetryRepository → Prisma |
| **Severidad** | Crítica (servicio caído) |

### Síntoma

```
Timed out fetching a new connection from the connection pool.
(Current connection pool timeout: 10, connection limit: 5)
```

Todos los motores fallan simultáneamente. El backend entra en un loop de reconexión MQTT (se desconecta y reconecta cada ~10s) porque los errores no manejados colapsan el servicio.

### Causa raíz

- Prisma usa por defecto **5 conexiones** con timeout de **10 segundos**.
- El simulador publica telemetría de 15 motores al mismo tiempo.
- Cada mensaje genera hasta 3 `prisma.reading.create()` individuales (uno por sensor).
- Resultado: ~45 queries concurrentes compiten por 5 conexiones → timeout.
- **¿Por qué no ocurría antes?** Con menos motores activos o mayor intervalo entre publicaciones, las conexiones se liberaban a tiempo. Al crecer la base de datos los inserts se vuelven más lentos y el problema se magnifica.

### Solución aplicada

1. **`.env`** — Se aumentó el pool de conexiones:
   ```
   DATABASE_URL=mysql://...@localhost:3306/telemetry_db?connection_limit=20&pool_timeout=30
   ```

2. **`backend/src/telemetry/telemetry.repository.ts`** — Se reemplazó `create()` individual por un buffer que acumula lecturas y las escribe en lote con `createMany()` cada 500ms (o al llegar a 200 lecturas acumuladas).

### Prevención futura

- Si vuelve a aparecer este error, verificar:
  1. Cantidad de motores activos vs `connection_limit` en DATABASE_URL.
  2. Si el flush interval (500ms) es suficiente para la tasa de mensajes.
  3. Performance de MySQL (tablas sin índice, disco lleno, etc.).
- Considerar implementar particionado de la tabla `reading` cuando supere los 10M de registros.

---

## ERR-002: WebSocket no emitía a todos los clientes conectados

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-03 |
| **Componente** | Backend → RealtimeGateway |
| **Commit** | `4f3a2c5` |
| **Severidad** | Alta |

### Síntoma

Los clientes frontend conectados por WebSocket no recibían actualizaciones de telemetría ni alertas en tiempo real.

### Causa raíz

El `RealtimeGateway` emitía eventos solo al socket que se había suscrito, no al room completo del motor.

### Solución aplicada

Se corrigió el broadcast para emitir al room `motor:{id}` en lugar de al socket individual. También se agregó el handler de `restart-progress` en el middleware del frontend.

**Archivos:** `backend/src/realtime/realtime.gateway.ts`, `frontend/src/store/socket.middleware.ts`

---

## ERR-003: Sesión de autenticación no persistía al recargar la página

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-03 |
| **Componente** | Frontend → auth.slice / ProtectedRoute |
| **Commit** | `4f3a2c5` |
| **Severidad** | Alta |

### Síntoma

El usuario se deslogueaba al refrescar el navegador. La ruta protegida redirigía a `/login`.

### Causa raíz

El slice de autenticación no rehidrataba el token desde `localStorage` al inicializar el store. `ProtectedRoute` evaluaba `isAuthenticated = false` antes de que se completara la verificación.

### Solución aplicada

Se agregó rehidratación del token en `auth.slice.ts` y se añadió un estado de carga en `ProtectedRoute` para esperar la verificación antes de redirigir.

**Archivos:** `frontend/src/store/auth.slice.ts`, `frontend/src/components/routes/ProtectedRoute.tsx`, `frontend/src/App.tsx`

---

## ERR-004: Simulador aiomqtt 2.x — API incompatible

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-03 |
| **Componente** | Simulador Python → motor_simulator.py |
| **Commit** | `4f3a2c5` |
| **Severidad** | Media (simulador no arrancaba) |

### Síntoma

El simulador fallaba al iniciar con error de atributo en aiomqtt.

### Causa raíz

La versión 2.x de `aiomqtt` cambió la API (renombró métodos/parámetros respecto a 1.x).

### Solución aplicada

Se actualizó la llamada en `motor_simulator.py` para usar la API de aiomqtt 2.x.

---

## ERR-005: Paquete del simulador mal estructurado en Docker

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Docker → Simulator Dockerfile |
| **Commit** | `ce14521` |
| **Severidad** | Media (deploy fallaba) |

### Síntoma

El contenedor del simulador fallaba al iniciar con `ModuleNotFoundError`.

### Causa raíz

El `COPY` en el Dockerfile no incluía el paquete `simulator/` correctamente. Además, el backend necesitaba `openssl` para que Prisma generara el cliente.

### Solución aplicada

Se corrigió la estructura de `COPY` en `simulator/Dockerfile` y se agregó `openssl` al Dockerfile del backend.

---

## ERR-006: Puertos MySQL y MQTT no expuestos al host

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Infraestructura → docker-compose.yml |
| **Commit** | `08b21c5` |
| **Severidad** | Media (desarrollo local bloqueado) |

### Síntoma

El backend corriendo fuera de Docker no podía conectar a MySQL ni al broker MQTT.

### Causa raíz

`docker-compose.yml` no mapeaba los puertos 3306 y 1883 al host.

### Solución aplicada

Se agregaron los port mappings `3306:3306` y `1883:1883` en docker-compose.

---

## ERR-007: Configuración de Mosquitto incompleta

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Infraestructura → Mosquitto |
| **Commit** | `e2a8ce2` |
| **Severidad** | Media |

### Síntoma

Clientes MQTT no podían conectarse al broker o se rechazaba la autenticación.

### Causa raíz

Faltaba una entrada en el ACL y configuración de listener en `mosquitto.conf`.

### Solución aplicada

Se actualizó `mosquitto/acl_file` y `mosquitto/mosquitto.conf` con las reglas correctas.

---

## ERR-008: Importación circular store ↔ api en frontend

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Frontend → services/api.ts ↔ store |
| **Commit** | `06da1a1` |
| **Severidad** | Crítica (app no cargaba) |

### Síntoma

La aplicación React no iniciaba. Error de `undefined` al importar el store.

### Causa raíz

`api.ts` importaba el store para acceder al token, y el store importaba `api.ts` para los thunks → dependencia circular.

### Solución aplicada

Se extrajo la lógica de interceptores a `services/setupInterceptors.ts` que se inicializa en `main.tsx` después de crear el store, rompiendo el ciclo.

---

## ERR-009: Crash al decodificar JWT malformado

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Frontend → auth.slice.ts |
| **Commit** | `cba89eb` |
| **Severidad** | Media (crash en runtime) |

### Síntoma

La app crasheaba con un error no capturado al intentar decodificar un token corrupto o expirado desde localStorage.

### Causa raíz

`jwtDecode()` lanzaba excepción cuando el token estaba malformado y no había try/catch.

### Solución aplicada

Se envolvió `jwtDecode()` en try/catch. Si falla, se limpia el localStorage y se redirige al login.

---

## ERR-010: Socket middleware no manejaba restart-progress

| Campo | Detalle |
|-------|---------|
| **Fecha** | 2026-08-02 |
| **Componente** | Frontend → socket.middleware.ts |
| **Commit** | `b9181df` |
| **Severidad** | Baja (feature incompleta) |

### Síntoma

El countdown de reinicio de motores no se actualizaba en la UI.

### Causa raíz

El socket middleware no escuchaba el evento `restart-progress` del WebSocket, y la referencia al socket estaba fuera del closure del middleware.

### Solución aplicada

Se movió la instancia del socket dentro del closure del middleware y se agregó el handler para `restart-progress` que despacha la acción correspondiente al slice de motores.

---

## Cómo agregar una nueva entrada

```markdown
## ERR-0XX: Título descriptivo corto

| Campo | Detalle |
|-------|---------|
| **Fecha** | YYYY-MM-DD |
| **Componente** | Módulo → Archivo |
| **Commit** | `hash corto` |
| **Severidad** | Crítica / Alta / Media / Baja |

### Síntoma
Qué se observa (logs, comportamiento).

### Causa raíz
Por qué ocurre.

### Solución aplicada
Qué se cambió y en qué archivos.

### Prevención futura (opcional)
Cómo evitar que vuelva a ocurrir.
```
