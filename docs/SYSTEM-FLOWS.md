# Sistema de Telemetria Industrial — Guia Completa

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Sistema de Comunicacion MQTT](#2-sistema-de-comunicacion-mqtt)
3. [Simulador de Sensores](#3-simulador-de-sensores)
4. [Backend (NestJS)](#4-backend-nestjs)
5. [Maquina de Estados del Motor](#5-maquina-de-estados-del-motor)
6. [Sistema de Evaluacion Industrial](#6-sistema-de-evaluacion-industrial)
7. [Sistema de WebSocket / Tiempo Real](#7-sistema-de-websocket--tiempo-real)
8. [Frontend (React)](#8-frontend-react)
9. [Flujo Completo de un Dato](#9-flujo-completo-de-un-dato)
10. [Archivos Clave por Modulo](#10-archivos-clave-por-modulo)

---

## 1. Arquitectura General

```
ESP32/Simulador --MQTT--> Mosquitto --MQTT--> Backend NestJS --WebSocket--> Frontend React
                                         |         |    |
                                         |         |    +--> MySQL (Prisma)
                                         |         +--> Redis (cache en vivo)
                                         |         +--> MongoDB (RAG embeddings)
                                         |
                                         +--> Grafana (dashboard historico, MySQL)
```

### Contenedores Docker

| Servicio | Puerto | Funcion |
|----------|--------|---------|
| `broker-mqtt` | 1883 (host) | Mosquitto — broker MQTT con auth y ACL |
| `simulator-python` | — | Simula 15+ dispositivos ESP32 |
| `backend-nestjs` | 3000 (interno) | API REST + WebSocket + procesamiento |
| `db-mysql` | 3306 (interno) | Base de datos principal (Prisma) |
| `redis-cache` | 6379 (interno) | Snapshots en vivo, locks distribuidos |
| `mongo-ragstore` | 27017 (interno) | Embeddings para asistente RAG |
| `dashboard-grafana` | 3000 (interno) | Dashboards historicos |
| `frontend-react` | 5173 (host) | React — servido por vite preview, rutizado por el nginx global |

### Red

Todos comparten la red `telemetry-net`. Las dependencias de arranque:
1. `broker-mqtt` arranca primero
2. `simulator-python` espera a que broker este healthy
3. `backend-nestjs` espera a MySQL, Redis, MongoDB y broker

---

## 2. Sistema de Comunicacion MQTT

### Topics principales

| Topic | Direccion | QoS | Retain | Que hace |
|-------|-----------|-----|--------|----------|
| `plant/motor/{id}/telemetry` | Sim -> Backend | 1 | No | Lee de sensores cada 15s |
| `plant/motor/{id}/status` | Sim -> Backend | 1 | Si | online/offline + LWT |
| `plant/motor/{id}/restart-progress` | Sim -> Backend | 0 | No | Cuenta regresiva de reinicio |
| `plant/motor/{id}/cmd` | Backend -> Sim | 1 | No | Comandos: stop, restart |
| `plant/motor/{id}/sensor/{type}/cmd` | Backend -> Sim | 1 | No | Reiniciar sensor individual |
| `plant/motor/{id}/cmd/ack` | Sim -> Backend | 1 | No | ACK de comandos |
| `plant/motor/{id}/sensor/{type}/cmd/ack` | Sim -> Backend | 1 | No | ACK de sensor |
| `qa/motor/{id}/inject-fault` | QA -> Sim | 1 | No | Inyeccion de fallas (QA) |
| `system/simulator/motor-added` | Backend -> Sim | 1 | Si | Hot-reload: agregar motor |
| `system/simulator/motor-removed` | Backend -> Sim | 1 | Si | Hot-reload: eliminar motor |

### Formato de payload de telemetria

```json
{
  "motor_id": 7,
  "timestamp": "2026-08-01T14:32:10Z",
  "temperature_c": 68.4,
  "vibration_mm_s": 1.65,
  "current_a": 12.1
}
```
Cada campo de sensor es opcional — solo se incluye si el sensor genero lectura.

### Credenciales MQTT

- **Dispositivos**: `esp32_motor{id}` con password generado por `MqttProvisioningService`
- **Backend**: `backend_service` con acceso a todos los topics
- **QA**: `qa_fault_injector` solo puede inyectar fallas
- **ACL por dispositivo**: Cada ESP32 solo puede escribir en topics de SU motor y leer comandos de SU motor

### Retained messages (hot-reload)

Cuando el backend crea/elimina un motor, publica un mensaje retained en `system/simulator/motor-added` o `system/simulator/motor-removed`. Si el simulador esta abajo, al reconectarse recibe el mensaje. Despues de procesarlo, el simulador limpia el retained publicando payload vacio.

**Problema conocido**: MQTT solo guarda 1 retained por topic. Si se crean 2 motores rapidamente, el segundo sobrescribe al primero. La solucion es usar topics por motor: `system/simulator/motor-added/{motorId}`.

---

## 3. Simulador de Sensores

### Archivos

| Archivo | Funcion |
|---------|---------|
| `simulator/main.py` | Punto de entrada, orquestador, hot-reload listener |
| `simulator/sensor.py` | Generacion de datos, modelo de anomalias |
| `simulator/config.py` | MotorConfig, umbrales por defecto, motores problematicos |
| `simulator/motor_simulator.py` | Cliente MQTT por motor, loop de telemetria |
| `simulator/command_handler.py` | Procesamiento de comandos (stop, restart, restart_sensor, inject-fault) |
| `simulator/persistence.py` | Persistencia en CSV de motores hot-reload |

### Como funciona el generador de datos

Cada `Sensor` (clase en `sensor.py`) tiene:

1. **Operacion normal**: `gaussiano(nominal, ruido)` — valores alrededor del nominal con ruido gaussiano
2. **Episodios de anomalia**: Cuando se dispara una anomalia (probabilidad configurable):
   - **MILD** (40%): zona de warning, 4-12 lecturas
   - **MODERATE** (35%): escalada de warning a critical, con progresion temporal
   - **SEVERE** (25%): salto inmediato a critical (trip)
3. **Fallas (faults)**: Inyectadas via MQTT para QA:
   - `stuck`: devuelve el mismo valor siempre
   - `out_of_range`: valor fuera de rango fisico
   - `disconnected`: no publica datos (None)

### Motores problematicos

Motores 5 y 11 tienen probabilidad de anomalia del 10% (vs 2% normal). Estan configurados en `config.py:58` (`PROBLEMATIC_MOTORS`).

### Persistencia de hot-reload

Los motores creados en runtime se guardan en `simulator/data/hot_motors.csv`. Al reiniciar el contenedor, el simulador carga este CSV y recrea los motores.

### Reconexion

- **WiFi** (motores 1-8): delay uniforme 0-15s
- **LAN** (motores 9-15): delay uniforme 5-30s

---

## 4. Backend (NestJS)

### Modulos

| Modulo | Archivo | Funcion |
|--------|---------|---------|
| `AuthModule` | `src/auth/` | JWT, refresh tokens, rate limiting |
| `MotorsModule` | `src/motors/` | Consulta de motores, comandos stop/restart |
| `AlertsModule` | `src/alerts/` | Alertas activas, resolucion |
| `CommandModule` | `src/command/` | Publicacion MQTT de comandos |
| `TelemetryModule` | `src/telemetry/` | Ingesta, evaluacion, persistencia de telemetria |
| `MotorConfigModule` | `src/config-module/` | CRUD de motores (admin), provision MQTT |
| `RagModule` | `src/rag/` | Asistente IA con RAG |
| `RealtimeModule` | `src/realtime/` | Gateway WebSocket (Socket.IO) |
| `CacheModule` | `src/cache/` | Redis: snapshots, locks, estado |
| `PrismaModule` | `src/prisma/` | Cliente MySQL |

### Rutas HTTP

| Metodo | Ruta | Roles | Descripcion |
|--------|------|-------|-------------|
| POST | `/auth/login` | — | Login, retorna JWT + cookie refresh |
| POST | `/auth/refresh` | Cookie | Rotacion de refresh token |
| POST | `/auth/logout` | Cookie | Revocar refresh token |
| GET | `/motors` | Todos | Todos los motores con datos en vivo (grid) |
| GET | `/motors/:id` | Todos | Motor individual: sensores, alertas, historial |
| POST | `/motors/:id/stop` | admin/operator | Comando stop via MQTT |
| POST | `/motors/:id/restart` | admin/operator | Comando restart via MQTT |
| POST | `/motors/:id/sensors/:sensorId/restart` | admin/operator | Reiniciar sensor individual |
| GET | `/alerts` | Todos | Alertas activas (no resueltas) |
| GET | `/alerts/motor/:motorId` | Todos | Alertas de un motor especifico |
| PATCH | `/alerts/:id/resolve` | admin/operator | Resolver alerta (optimistic locking) |
| GET | `/config/motors` | admin | Lista de motores para config |
| GET | `/config/standards` | admin | Estandares de sensores |
| POST | `/config/motors` | admin | Crear motor + provision MQTT + notificar simulador |
| PATCH | `/config/motors/:id` | admin | Editar metadata del motor |
| DELETE | `/config/motors/:id` | admin | Eliminar motor + deprovision MQTT |
| PATCH | `/config/motors/:motorId/sensors/:sensorId/thresholds` | admin | Editar umbrales de sensor |
| POST | `/rag/query` | Todos | Pregunta al asistente IA |

### Servicios principales del pipeline de telemetria

```
TelemetryConsumerService (MQTT subscriber)
  -> TelemetryEvaluationService (orquestador)
       -> SensorEvaluationService (deteccion de fallas por sensor)
       -> MotorEvaluationService (alarmas y trips del motor)
       -> TelemetryRepository (escritura batched a MySQL)
  -> CacheService (snapshots en Redis)
  -> StatusTransitionService (audit trail en MySQL + WebSocket)
  -> RealtimeGateway (WebSocket a frontend)
```

### TelemetryConsumerService

- Se suscribe a `plant/motor/+/telemetry`, `plant/motor/+/status`, `plant/motor/+/restart-progress`
- `handleTelemetry()`: valida payload, envia cada sensor a `TelemetryEvaluationService.evaluateReading()`
- `handleStatus()`: maneja LWT (offline -> manual_shutdown, online -> healthy)
- `handleRestartProgress()`: reenvia cuenta regresiva a WebSocket
- Timers de gracia: 20s WiFi, 5s LAN — si no llegan datos, sensores se marcan disconnected

### TelemetryEvaluationService

Orquestador que:
1. Pausa evaluacion durante shutdown/restart del motor
2. Delega a `SensorEvaluationService` para deteccion de fallas
3. Clasifica la lectura (implausible, critical, anomalous)
4. Persiste en MySQL via `TelemetryRepository`
5. Actualiza snapshot en Redis via `CacheService`
6. Emite evento WebSocket
7. Envia a `MotorEvaluationService` para logica de alarma/trip

### MotorEvaluationService

Logica industrial de alarma (ver seccion 5).

### SensorEvaluationService

Deteccion independiente de fallas por sensor:
- **out_of_range**: valor fuera de `plausible_min/max`
- **stuck**: mismo valor (redondeado a 1 decimal) por 20 lecturas consecutivas (~5 min)
- **disconnected**: sin datos en ventana de gracia (20s WiFi / 5s LAN)
- Primera falla: auto-restart despues de 5s
- Segunda falla: `fault_persistent` (requiere intervencion manual)

### StatusTransitionService

UNICO servicio que escribe en `motors.status` o `motor_sensors.status`. Todas las transiciones son auditadas con `MotorStatusHistory`.

### TelemetryRepository

Buffer en memoria que flusha cada 500ms con `createMany`. Si el buffer llega a 200, flusha inmediatamente. Si falla, re-encola al frente para reintentar.

### RetentionService

Cron cada hora (minuto 5):
1. **Agregacion**: condensa lecturas crudas del en la hora anterior en `readings_hourly_agg`
2. **Purga**: elimina lecturas crudas mayores a `RETENTION_DAYS` (default 7 dias)

---

## 5. Maquina de Estados del Motor

### Estados

| Estado | Significado |
|--------|-------------|
| `healthy` | Operacion normal |
| `under_review` | Todos los sensores en falla simultaneamente |
| `alarm` | Anomalia detectada, gracia activa |
| `shutting_down` | Apagandose (comando stop o LWT offline) |
| `restarting` | Reiniciando (100s de countdown) |
| `manual_shutdown` | Apagado manualmente, esperando reinicio |
| `disabled` | Trip multiple — requiere reactivacion manual |

### Transiciones

```
                    +-----------+
                    |  healthy  |
                    +-----+-----+
                          |
           +--------------+--------------+
           |                             |
    N lecturas anomalias           Critical reading
           |                             |
           v                             v
       +-------+                    +-------+
       | alarm |                    |  trip |
       +---+---+                    +---+---+
           |                             |
      (gracia expira)            (reinicio enviado)
           |                             |
           v                             v
       +-------+                   +-----------+
       |  trip |                   | restarting|
       +---+---+                   +-----+-----+
           |                             |
    (ya reinicio antes)          (motor vuelve online)
           |                             |
           v                             v
     +------------+                 +---------+
     |  disabled  |                 | healthy |
     +------------+                 +---------+

alarm + todas las lecturas normales -> healthy
alarm + resolve por operador -> healthy
```

### Codigo clave

- **Archivo**: `backend/src/telemetry/motor-evaluation.service.ts`
- **Estado en memoria**: Map `motorStates` (motorId -> MotorState)
- **Lock distribuido**: Redis SETNX con 200ms TTL (`lock:motor:{id}`)
- **Timer de gracia**: Redis `state:escalation:{id}` (TTL 3 min)
- **Cooldown post-reinicio**: 60s, duplica umbral de alarma

---

## 6. Sistema de Evaluacion Industrial

### Modelo de lecturas consecutivas

Cada sensor tiene un contador independiente de lecturas anomalias consecutivas. Cuando el contador alcanza `alarmConsecutiveReadings` (default 5), el motor entra en ALARM.

### Cooldown post-reinicio

Despues de un reinicio, el umbral de alarma se duplica (requiere 2N lecturas) durante 60 segundos. Esto prevene ciclos trip-restart-trip.

### Trip inmediato

Una lectura critical (por encima de `criticalMax`) causa trip sin esperar consecutive readings.

### Segunda falla

Si un motor trip despues de un reinicio automatico, se deshabilita en lugar de reiniciar otra vez.

### Metadata de alertas

Cada alerta incluye metadata JSON:
```json
{
  "triggerSensorId": 42,
  "consecutiveReadings": 5,
  "gracePeriodMs": 120000,
  "reason": "Lecturas anomalias consecutivas",
  "cause": "Temperatura"
}
```

---

## 7. Sistema de WebSocket / Tiempo Real

### Gateway

- **Archivo**: `backend/src/realtime/realtime.gateway.ts`
- **Tecnologia**: Socket.IO con CORS abierto
- **Autenticacion**: JWT via `auth: { token }` al conectar

### Rooms

| Room | Contenido |
|------|-----------|
| `dashboard` | Todos los eventos de todos los motores (auto-join al conectar) |
| `motor:{id}` | Eventos de un motor especifico (join/leave manual) |

### Eventos emitidos

| Evento | Datos | Cuando |
|--------|-------|--------|
| `telemetry` | `{ motorSensorId, motorId, sensorType, value, isAnomalous, recordedAt }` | Cada lectura de sensor |
| `status-change` | `{ motorId, fromStatus, toStatus, changedAt, changedBy }` | Cambio de estado motor/sensor |
| `alert` | `{ id, motorId, type, metadata, triggeredAt }` | Nueva alerta |
| `restart-progress` | `{ motorId, secondsRemaining }` | Cada segundo durante reinicio |

### Flujo

```
Backend evalua telemetria
  -> RealtimeGateway.emitter.emit("telemetry", data)
  -> Socket.IO envia a rooms "dashboard" + "motor:{id}"
  -> Frontend socketMiddleware recibe evento
  -> Despacha Redux action (telemetryReceived, statusChanged, alertReceived, restartProgressUpdate)
  -> React re-renderiza componentes
```

---

## 8. Frontend (React)

### Paginas

| Ruta | Pagina | Funcion |
|------|--------|---------|
| `/login` | LoginPage | Formulario email+password |
| `/dashboard` | DashboardPage | Grid de todos los motores (vista general) |
| `/motors/:id` | MotorDetailPage | Detalle de motor: graficos, controles, RAG |
| `/referencia` | ReferencePage | Documentacion de estados y umbrales |
| `/config` | ConfigPage | CRUD de motores (solo admin) |

### Componentes principales

| Componente | Archivo | Funcion |
|------------|---------|---------|
| `MotorGrid` | `src/components/motors/MotorGrid.tsx` | Grid ordenado por prioridad de estado |
| `MotorCard` | `src/components/motors/MotorCard.tsx` | Tarjeta adaptativa (ISA-101): compacta si sano, expandida si anomalo |
| `StatusBadge` | `src/components/motors/StatusBadge.tsx` | Badge ISA-101: color + icono + texto |
| `SensorChart` | `src/components/motors/SensorChart.tsx` | Grafico de linea en tiempo real (Recharts, ring buffer 50 pts) |
| `RestartCountdown` | `src/components/motors/RestartCountdown.tsx` | Cuenta regresiva de reinicio |
| `AlertBanner` | `src/components/alerts/AlertBanner.tsx` | Toast de alertas flotantes |
| `RagQueryBox` | `src/components/rag/RagQueryBox.tsx` | Chat con asistente IA |
| `ProtectedRoute` | `src/components/routes/ProtectedRoute.tsx` | Guard de autenticacion |
| `RoleGate` | `src/components/routes/RoleGate.tsx` | Renderizado condicional por rol |

### State Management (Redux)

| Slice | Estado |
|-------|--------|
| `auth` | user, accessToken, loading, refreshAttempted |
| `motors` | byId (Record<motorId, MotorData>), initialized, loading |
| `alerts` | active: Alert[] |
| `rag` | messages: RagMessage[], loading |

### Socket Middleware

- **Archivo**: `src/store/socket.middleware.ts`
- **Funcion**: Traduce eventos WebSocket a Redux actions
- **Componentes NUNCA tocan el socket directamente** — todo pasa por Redux
- Auto-reconnect: retraso 1-5s, al reconectar hace `fetchMotors()` para snapshot fresco

### Seguridad JWT

- Access token en Redux memoria (nunca localStorage) — resistente a XSS
- Refresh token en httpOnly cookie (enviado automaticamente)
- Auto-refresh en 401 con reintento de la request fallida

### Diseno ISA-101

- Tarjetas de motores usan "jerarquia por excepcion": motores sanos muestran info minima, motores anomalous se expanden
- Badges combinan color + icono + texto (nunca solo color)
- Estados en español para operadores hispanohablantes

---

## 9. Flujo Completo de un Dato

### Telemetria normal (cada 15 segundos)

```
1. Simulator: Sensor.generate_reading() -> valor con ruido gaussiano
2. Simulator: MotorSimulator._telemetry_loop() -> publica en MQTT
   Topic: plant/motor/{id}/telemetry
3. Backend: TelemetryConsumerService.handleTelemetry() -> valida DTO
4. Backend: TelemetryEvaluationService.evaluateReading()
   a. SensorEvaluationService: verifica out_of_range, stuck, disconnected
   b. TelemetryRepository: persiste en MySQL (buffered)
   c. CacheService: actualiza snapshot en Redis
   d. RealtimeGateway: emite evento WebSocket
   e. MotorEvaluationService: verifica consecutive readings -> possible alarm
5. Frontend: socketMiddleware -> Redux -> React re-render
```

### Deteccion de anomalia -> alarma -> trip

```
1. Simulator genera valor anomalo (episodio MILD/MODERATE)
2. Backend detecta valor > warningMax -> isAnomalous = true
3. MotorEvaluationService: incrementa consecutive counter
4. Despues de 5 lecturas anomalias consecutivas:
   -> triggerAlarm() -> transicion healthy -> alarm
   -> crea Alert con metadata
   -> inicia grace timer (120s default, en Redis)
   -> WebSocket: status-change + alert
5. Frontend: MotorCard se expande, AlertBanner muestra toast
6. Si el operador NO resuelve en 120s:
   -> triggerTrip() -> transicion alarm -> trip
   -> CommandService.publishRestart() -> MQTT
   -> Simulator: _restart_sequence() -> 100s countdown
   -> Frontend: RestartCountdown visible
7. Motor vuelve online -> transicion restarting -> healthy
```

### Hot-reload: crear motor

```
1. Admin: POST /config/motors en Frontend
2. Backend: MotorConfigService.createMotor()
   a. Crea motor + sensores en MySQL
   b. MqttProvisioningService: escribe password_file + acl_file, SIGHUP
   c. TelemetryConsumerService.registerMotor(): agrega a lookup maps
   d. CommandService.notifySimulatorMotorAdded(): MQTT retained
3. Simulator: _hot_reload_listener() recibe mensaje
   a. Crea MotorConfig, guarda en CSV
   b. Crea MotorSimulator, inicia Task
   c. Limpia retained message
4. Nuevo motor empieza a publicar telemetria
```

---

## 10. Archivos Clave por Modulo

### Simulador
- `simulator/main.py` — orquestador, hot-reload listener
- `simulator/sensor.py` — Sensor class, episodios de anomalia
- `simulator/config.py` — MotorConfig, SENSOR_DEFAULTS, PROBLEMATIC_MOTORS
- `simulator/motor_simulator.py` — MotorSimulator, loop de telemetria
- `simulator/command_handler.py` — handle_motor_command, handle_sensor_command
- `simulator/persistence.py` — CSV para hot-reload

### Backend — Telemetria
- `backend/src/telemetry/telemetry-consumer.service.ts` — MQTT subscriber
- `backend/src/telemetry/telemetry-evaluation.service.ts` — orquestador
- `backend/src/telemetry/motor-evaluation.service.ts` — alarmas y trips
- `backend/src/telemetry/sensor-evaluation.service.ts` — fallas por sensor
- `backend/src/telemetry/status-transition.service.ts` — audit trail
- `backend/src/telemetry/telemetry.repository.ts` — persistencia batched

### Backend — Comandos MQTT
- `backend/src/command/command.service.ts` — publish, publishRestart, publishStop, notifySimulator*

### Backend — Config
- `backend/src/config-module/motor-config.service.ts` — CRUD + provision
- `backend/src/config-module/mqtt-provisioning.service.ts` — archivos Mosquitto

### Backend — WebSocket
- `backend/src/realtime/realtime.gateway.ts` — Socket.IO gateway

### Backend — Cache
- `backend/src/cache/cache.service.ts` — Redis operations

### Frontend
- `frontend/src/store/socket.middleware.ts` — WebSocket a Redux
- `frontend/src/store/motors.slice.ts` — estado de motores
- `frontend/src/store/alerts.slice.ts` — estado de alertas
- `frontend/src/pages/DashboardPage.tsx` — vista general
- `frontend/src/pages/MotorDetailPage.tsx` — detalle de motor
- `frontend/src/components/motors/MotorCard.tsx` — tarjeta ISA-101
- `frontend/src/components/motors/SensorChart.tsx` — grafico real-time
- `frontend/src/components/alerts/AlertBanner.tsx` — toast de alertas

### Config
- `mosquitto/mosquitto.conf` — configuracion del broker
- `mosquitto/password_file` — hashes de passwords
- `mosquitto/acl_file` — reglas de acceso por topic
- `docker-compose.yml` — orquestacion de contenedores
- `.env` — variables de entorno

### Documentacion existente
- `docs/00-overview.md` a `docs/24-config-module.md` — 25 archivos de documentacion
- `CHANGELOG-2026-08-05.md` — cambios recientes (hot-reload, alarmas industriales, episodios)

---

## Glosario de Conceptos

### LWT (Last Will and Testament)

Mensaje que un dispositivo le deja al broker Mosquitto: "publica esto automaticamente si me desconecto sin aviso". El ESP32 configura un LWT con topic `plant/motor/{id}/status` y payload `{"state": "offline"}`. Si el ESP32 se cae (se apaga, pierde WiFi), Mosquitto publica el offline automaticamente. Sin LWT, el backend nunca sabria que el motor se desconecto.

### Retain

Flag en un mensaje MQTT que le dice al broker: "guarda este ultimo mensaje publicado en este topic". Cuando un nuevo subscriber se conecta, recibe ese mensaje guardado inmediatamente, sin esperar a que alguien vuelva a publicar. Se usa en:
- `plant/motor/{id}/status` — para que el backend conozca el estado actual al arrancar
- `system/simulator/motor-added` — para que el simulador reciba el mensaje si estaba abajo cuando se creo el motor

### ACK (Acknowledgment)

Confirmacion de que un comando fue recibido y ejecutado. El backend publica `stop` en `plant/motor/{id}/cmd`. El simulador recibe, ejecuta, y publica `{"status": "done"}` en `plant/motor/{id}/cmd/ack`. Sin ACK, el backend no sabria si el comando llego o no.

### ACL (Access Control List)

Reglas de permisos en Mosquitto que definen quien puede leer/escribir en cada topic. Ejemplo: `esp32_motor5` solo puede escribir en topics de `plant/motor/5/*`. Si intenta publicar en el topic del motor 6, Mosquitto lo rechaza. Esto aísla los dispositivos entre si.

### Suscripcion MQTT

La suscripcion es unidireccional por topic. El backend se suscribe a `plant/motor/+/telemetry` (recibe datos del simulador). El simulador se suscribe a `plant/motor/{id}/cmd` (recibe comandos del backend). Son dos suscripciones distintas en direcciones opuestas. Cada uno publica y suscribe a topics diferentes.

### Flush en telemetria

Vaciar el buffer en memoria a la base de datos. `TelemetryRepository` acumula lecturas en un array en memoria y las escribe a MySQL cada 500ms con `createMany` (una sola query con many inserts). Si el buffer llega a 200 lecturas, hace flush inmediato sin esperar los 500ms. Es un patron de batching para no hacer 1 insert por cada lectura (seria muy lento con 15 motores x 3 sensores x cada 15s).

### Servicio de retencion

Job programado cada hora que hace dos cosas:
1. **Agrupacion**: toma todas las lecturas crudas de la hora anterior y las condensa en una tabla de agregados (`readings_hourly_agg`) con promedio, minimo, maximo, cantidad de anomalias y fallas por sensor. Esto acelera las consultas historicas de Grafana.
2. **Purga**: elimina las lecturas crudas mayores a 7 dias (`RETENTION_DAYS`). La data cruda se borra, pero los agregados se conservan. Asi la base de datos no crece infinitamente.
