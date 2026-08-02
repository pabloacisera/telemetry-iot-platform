# Architecture

## Container diagram (7)
```
1. broker-mqtt       Eclipse Mosquitto              :1883   (auth per user + ACL per device)
2. db-mysql          MySQL 8.0                      :3306   (relational source of truth)
3. mongo-ragstore    MongoDB                        :27017  (RAG vectorized knowledge base)
4. redis-cache       Redis                          :6379   (live motor+sensor snapshot)
5. backend-nestjs    NestJS (API+WS+Auth+RAG+MQTT)  :3000
6. dashboard-grafana Grafana                        :3001   (reads only MySQL)
7. simulator-python  15 virtual "ESP32"              N/A     (MQTT pub/sub)
```
The React frontend is compiled and served as static files behind the global Nginx on the EC2 (outside this compose).

## Protocol combination (why, not just which)
- **MQTT** device↔backend: asynchronous events from many emitters, with QoS and disconnect detection (LWT).
  Handles telemetry, connection status, commands, and their acks.
- **HTTP REST** frontend↔backend: everything the client requests on demand (login, initial snapshot,
  paginated history, threshold configuration, RAG queries).
- **WebSocket** backend→frontend: everything the backend pushes without being asked (live telemetry,
  status changes, alerts, restart countdown).
- **Why NOT gRPC**: there is no other internal service for the backend (a modular monolith) to talk to.
  Adding it would be complexity without benefit — the absence of gRPC is a decision, not an oversight.

## Inbound data flow (device → dashboard)
```
Simulated ESP32 → MQTT (telemetry) → TelemetryConsumerService → validates DTO
  → TelemetryEvaluationService (thresholds + sliding window + state machine)
  → TelemetryRepository (persists to readings)
  → StatusTransitionService (if status change, audits to motor_status_history)
  → CacheModule (updates Redis snapshot)
  → RealtimeGateway (emits WS to room motor:{id})
```

## Outbound command flow (dashboard → device)
```
Frontend → POST /motors/:id/restart → CommandController → CommandService
  → generates request_id, publishes MQTT (plant/motor/{id}/cmd), saves "pending"
  → ESP32 executes, publishes ack on plant/motor/{id}/cmd/ack
  → CommandService resolves the pending, StatusTransitionService updates status
```

## Motor vs sensor separation (the most important design decision)
The state of a motor and the state of each of its 3 sensors are modeled and persisted SEPARATELY.
A sensor fault (impossible reading, stuck value, disconnection) must never trigger a motor alert;
a motor only enters `under_review`/`restarting` due to readings from sensors that are healthy (`ok`). See
full detail in `04-anomaly-state-machine.md`.

## Build order and rationale

The system is built in 8 stages (specs), in this precise order:

1. **MQTT Simulator** (spec 01) — built first because without data entering the broker nothing else can be
   tested. It's a realistic traffic generator: publishes telemetry every 15s, responds to commands, simulates
   faults on demand (via QA script), respects real timings (100s motor restart, 5s sensor restart). Validated
   in isolation against Mosquitto before the backend exists.

2. **Backend Telemetry Core** (spec 02) — consumes messages from the simulator, applies the state machine,
   persists data, and emits via WebSocket. Validated by connecting it to the already-running simulator.

3. **Auth & Security** (spec 03) — protects REST and WebSocket endpoints. Implemented after the core to
   avoid blocking business logic validation, but before the frontend.

4. **Frontend Dashboard** (spec 04) — consumes the already-functional backend (REST + WS). Validated with
   real data from the simulator flowing through the entire pipeline.

5. **RAG Module** (spec 05) — depends on the backend (Redis snapshot + recent alerts) and the knowledge
   base in Mongo. Implemented once the complete data flow is working.

6. **Grafana** (spec 06) — only needs MySQL with data. Provisioned as code to survive container recreations.

7. **Caching & Performance** (spec 07) — Redis write-through and rate limiting. Refinement on top of what
   was built in previous specs.

8. **Deployment & Infra** (spec 08) — final Docker Compose, healthchecks, optional Ansible. Built last
   because now all containers and their real dependencies are known.

Each stage produces a verifiable functional increment: the partial system can be run and the new piece
confirmed to work against what came before, before moving forward.
