# Backend Telemetry Core — Developer Guide

## What is this and why is it the second piece built

The backend is a NestJS modular monolith that sits between the MQTT broker (data source) and the
frontend/Grafana (data consumers). It is the **brain** of the system — it receives raw telemetry,
evaluates it against thresholds, manages the state machines for motors and sensors, persists everything,
and pushes real-time updates to connected clients.

It is built second because:
- It needs the simulator already publishing to validate end-to-end (MQTT → evaluation → persistence → WS).
- It defines the REST API that the frontend (spec 04) will consume.
- It defines the WebSocket events that the frontend will subscribe to.
- Auth (spec 03) wraps around it, but the core logic must exist first.

## What it does (high level)

```
MQTT messages arrive → validate DTO → evaluate against thresholds/state machine
  → persist to MySQL (readings, alerts, status history)
  → update Redis snapshot (write-through)
  → emit WebSocket event to connected frontends
  → if anomaly escalates: publish MQTT command back to motor (forced restart)
```

## Modules involved in this spec

| Module | Responsibility |
|---|---|
| `TelemetryModule` | MQTT consumer, DTO validation, evaluation service, repository |
| `AlertsModule` | Alert creation, sensor_faults, manual resolution (optimistic locking) |
| `CommandModule` | Publishes MQTT commands, correlates request_id ↔ ack |
| `RealtimeGateway` | WebSocket (socket.io), rooms per motor_id, event emission |
| `CacheModule` | Redis write-through snapshot |
| `SchedulerModule` | Daily retention job (partitions, aggregation) |

## The state machine — the core of this spec

The evaluation service implements two independent state machines:

**Motor state machine** (see `docs/04-anomaly-state-machine.md`):
- Evaluates readings from healthy sensors only (ignores sensors in fault).
- Uses per-sensor consecutive anomalous counters (not a sliding window).
- N consecutive anomalous readings on one sensor (`alarmConsecutiveReadings`, configurable) → `alarm`.
- Grace timer (`alarmGracePeriodMs`, configurable) → forced trip if not resolved.
- Critical zone (single reading > `critical_max`) → immediate trip (no grace timer).
- Auto-recovery: all counters reach 0 → `alarm` → `healthy`.
- Operator can resolve alarm → cancel grace timer → `healthy`.
- 1 automatic restart attempt per episode; if recurs → `disabled`.
- Counters reset on restart.

**Sensor state machine** (independent per sensor):
- `out_of_range`: reading outside `plausible_min/max`.
- `stuck`: same value (rounded 1 decimal) for 20 consecutive readings.
- `disconnected`: no data within grace window (20s WiFi / 5s LAN).
- Auto-restart in 5s; if recurs → `fault_persistent` (requires manual intervention).
- Paused during motor `shutting_down`/`restarting`.

## How to run (once built)

```bash
# Development
cd backend/
npm install
npx prisma migrate dev
npm run start:dev

# Via Docker Compose
docker compose up backend-nestjs
```

## Key design decisions in this spec

1. **Prisma as ORM** — migrations are declarative, TypeScript types auto-generated.
2. **Consecutive counter model** — per-sensor in-memory counter (backed by Redis for scaling), replaces sliding window.
3. **Configurable alarm params** — `alarmConsecutiveReadings` and `alarmGracePeriodMs` stored per motor, hot-reloadable.
4. **Write-through to Redis** — every reading updates the snapshot, no lazy loading.
5. **Optimistic locking for alert resolution** — `WHERE resolved_at IS NULL`, 409 on conflict.
6. **Backend MQTT reconnection** — `clean_session=false` + exponential backoff, QoS 1 redelivery.

## What this does NOT do (yet — handled by other specs)

- Does not authenticate REST/WS requests (spec 03).
- Does not serve the frontend (spec 04).
- Does not answer RAG queries (spec 05).
- Does not configure Grafana (spec 06).
- Rate limiting is added in spec 07.
