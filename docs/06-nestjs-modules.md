# NestJS Modules

Modular monolith (single process), no microservices or gRPC — see rationale in `01-architecture.md`.

```
AuthModule        login, refresh (with rotation), logout, JwtStrategy, RolesGuard
MotorsModule      Motor CRUD, snapshot (GET /motors, GET /motors/:id), stop/restart actions
MotorConfigModule Motor CRUD (admin), sensor threshold management, alert config, overrides, MQTT provisioning
TelemetryModule   TelemetryConsumerService (MQTT) + TelemetryEvaluationService (state machine) + repo
AlertsModule      alerts and sensor_faults, manual resolution endpoint (optimistic locking: 409 if already resolved)
CommandModule     publishes MQTT commands, correlates request_id ↔ ack via TelemetryConsumerService, updates status on confirmation
RealtimeGateway   WebSocket (socket.io), rooms by motor_id, emits telemetry/status-change/alert/restart-progress
CacheModule       Redis wrapper: live snapshot (read and write-through)
RagModule         LiveContextService + KnowledgeSearchService (Mongo) + RagQueryService (orchestrates + Groq LLM)
ScheduleModule    @nestjs/schedule — daily job: create future partition → aggregate (catch-up) → verify → drop → log result
```

## Each layer, its exact responsibility (to avoid mixing them)
- **Controller/Gateway**: only receives the request/event, delegates to Service. Zero business logic here.
- **DTO + Pipes**: validates shape and type of data BEFORE it reaches the Service (`class-validator`).
- **Service**: all business logic (thresholds, state transitions, command correlation, RAG).
- **Repository**: the only layer that touches the ORM (Prisma) directly.

## Rate limiting (`ThrottlerModule`)
- `/auth/login`, `/auth/refresh`: 5 requests/minute per IP.
- All other REST routes (including `/rag/query`): 60 requests/minute per authenticated user.
- The dashboard lives mostly on WebSocket; REST is only initial load and one-off actions.

## Concurrent alert resolution
`AlertsService.resolve()` uses optimistic locking:
`UPDATE alerts SET resolved_at=NOW(), resolved_by=? WHERE id=? AND resolved_at IS NULL`.
If it affects 0 rows → responds 409 Conflict ("already resolved by another user").

## Backend MQTT connection
- Client configured with `clean_session=false` + automatic reconnection (exponential backoff).
- While the backend is disconnected, Mosquitto retains pending QoS 1 messages (within the configured
  queue limit) and redelivers them upon reconnection.
- Documented known limitation: a very long gap could exceed the broker queue and lose messages.

## Inbound data flow — who calls whom
```
TelemetryConsumerService (MQTT subscriber)
  → validates TelemetryEventDto
  → TelemetryEvaluationService.evaluate(reading)
      → applies sliding window of 8 readings per motor_sensor_id
      → decides if there's a state transition (motor and/or sensor, separately)
      → TelemetryRepository.persist(reading)
      → if transition: StatusTransitionService.apply(...)
          → updates motors/motor_sensors + motor_status_history/sensor_faults
          → if forced restart required: CommandModule.publishCommand(...)
      → CacheModule.updateSnapshot(...)
      → RealtimeGateway.emitToRoom(motor_id, event)

TelemetryConsumerService also handles cmd/ack:
  → receives ack on plant/motor/{id}/cmd/ack
  → CommandService.resolveAck(request_id, status)
      → StatusTransitionService.apply(...) according to confirmed phase
```

## Outbound command flow — who calls whom
```
MotorsController.restart(motor_id) [requires role admin|operator]
  → CommandService.sendCommand(motor_id, "restart", requested_by=user)
      → generates request_id, publishes MQTT, saves pending in memory
  → (async) TelemetryConsumerService receives cmd/ack on plant/motor/{id}/cmd/ack
      → correlates request_id via CommandService.resolveAck(...)
      → StatusTransitionService.apply(...) according to confirmed phase
```
