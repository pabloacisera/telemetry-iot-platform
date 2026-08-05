# Steering 01 — Architecture

Global and immutable rules. Any spec that contradicts them is incorrectly written.

## Backend (NestJS)
- Layered Architecture mandatory: `Controller/Gateway → DTO+Pipes → Service → Repository (ORM)`.
- Forbidden to access Prisma directly from a Controller or Gateway.
- Modular monolith: a single NestJS process, independent modules per domain
  (`auth`, `users`, `motors`, `sensors`, `telemetry`, `alerts`, `command`, `realtime`, `cache`, `rag`, `scheduler`).
- Do not use gRPC or separate microservices: no scaling problem justifies it in this project.
  Document this as a conscious decision if asked.
- Strict TypeScript (`strict: true` in tsconfig). Forbidden `any` without a comment justifying why.
- ORM: **Prisma**. Better TypeScript integration, simpler declarative migrations. Not Sequelize.
- Every external input (HTTP, WS, MQTT) is validated with DTO + `class-validator` before touching business logic.

## Motor vs sensor separation (core business rule)
- The state of a **motor** and the state of each of its **sensors** are independent and persisted separately.
- Readings from a sensor in `fault`/`fault_persistent` state NEVER participate in motor health evaluation.
- While `motor.status` is `shutting_down` or `restarting`, all fault evaluation of its sensors is paused
  (absence of data during intentional shutdown is not a disconnection).
- Upon entering `restarting`, all consecutive anomalous counters of ALL its sensors are cleared.
  Evaluation starts from zero when telemetry resumes.
- Each sensor maintains an independent consecutive anomalous counter. When N consecutive readings
  (`alarmConsecutiveReadings`, configurable per motor) are anomalous, the motor enters `alarm`.
- A grace timer (`alarmGracePeriodMs`, configurable per motor) gives the operator time to intervene
  before the system trips automatically.
- A critical reading (value > `critical_max`) triggers an immediate trip without grace timer.
- Automatic restart: 1 attempt only per episode. If it recurs → `disabled`. Upon manual reactivation,
  the counter resets to zero.

## Inter-layer communication — fixed combo, no new protocols added
- **MQTT**: device (simulated ESP32) ↔ backend. Telemetry, connection status (LWT), commands, acks.
- **HTTP REST**: frontend ↔ backend, request/response (login, CRUD, paginated history, RAG query).
- **WebSocket**: backend → frontend, real-time event push (telemetry, status changes, alerts).
- gRPC is not introduced: there is no other internal service for the backend to talk to.

## Frontend (React)
- Redux Toolkit for global state. Slices per domain: `auth`, `motors`, `alerts`, `rag`.
- Custom middleware (`socketMiddleware`) is the only point that translates WS events into Redux actions.
- Modular components, no business logic inside presentation components
  (threshold/state logic is already resolved by the backend, the frontend only displays it).
- Default view: grid of the 15 machines (id, location, status, last value per sensor).
  Clicking a machine opens the detail with real-time per-sensor charts.

## Databases
- MySQL: relational source of truth (motors, sensors, readings, alerts, users).
- Mongo: exclusively vectorized knowledge base (maintenance documents + embeddings). Not used for
  telemetry or anything that has a natural place in MySQL.
- Redis: exclusively live snapshot (last value + status per motor_sensor), to serve the dashboard's initial
  state without scanning `readings`. Not used as a historical readings cache.
