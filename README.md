# Industrial IoT Telemetry & Predictive Maintenance Platform

Real-time monitoring system for industrial motors. Detects anomalies, alerts operators, and acts autonomously if no one intervenes — with a natural language assistant that answers questions about the plant's current state.

Built as a full-stack portfolio project targeting a mid/senior backend or fullstack position. Every architectural decision is documented and justified.

---

## What it does

- **15 virtual motors**, each with 3 sensors: temperature, vibration, current
- Readings arrive every 15 seconds via MQTT (simulated ESP32 devices)
- A state machine evaluates each sensor independently and decides when a motor is at risk
- When a motor enters **alarm**: the operator has a configurable grace window to intervene
- If no one acts: the system restarts the motor automatically — once. If it trips again, it's disabled
- A **RAG assistant** (Groq LLM + vector search) answers natural-language questions about the current plant state
- **Grafana** for historical trends; the app dashboard for live monitoring

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Transport | MQTT (Mosquitto) | IoT de facto standard — async pub/sub, QoS, disconnect detection (LWT) |
| Database | MySQL 8.0 | Relational source of truth — explicit job requirement |
| Vector store | MongoDB | RAG knowledge base only — covers the NoSQL requirement |
| Cache | Redis | Live snapshot (last reading per sensor) — fast dashboard load without MySQL scans |
| Backend | NestJS + TypeScript | Layered architecture, DTOs, guards, WebSocket gateway |
| Frontend | React + Redux Toolkit | Explicit global state management — required by the target position |
| Observability | Grafana | Provisioned as code — historical aggregated visualization |
| LLM | Groq (`llama-3.3-70b-versatile`) | Free, fast, no LangChain wrapper needed for a single orchestrated call |
| Simulator | Python | 15 virtual ESP32s — realistic traffic generator with fault injection |
| Infra | Docker Compose + Ansible | 8 containers, one command to run locally or deploy to EC2 |

---

## Architecture

```
Simulated ESP32s (Python)
        │ MQTT (telemetry, LWT, cmd ack)
        ▼
  broker-mqtt (Mosquitto)
        │
        ▼
  backend-nestjs (:3000, internal)
  ├── TelemetryConsumerService   → validates, evaluates state machine
  ├── TelemetryEvaluationService → thresholds + sliding window + alarm logic
  ├── StatusTransitionService    → motor/sensor state transitions + audit log
  ├── CacheModule                → Redis write-through (live snapshot)
  ├── RealtimeGateway            → WebSocket push to frontend rooms
  ├── CommandService             → sends restart/stop commands via MQTT
  ├── RagQueryService            → RAG pipeline (Redis → Mongo → Groq)
  └── REST API                  → auth, config, alerts, history
        │
        ├── db-mysql      (readings, alerts, motors, users, status history)
        ├── mongo-ragstore (vectorized knowledge base)
        ├── redis-cache   (live snapshot — current value + sensor status)
        │
        ▼
  dashboard-grafana (internal, reads MySQL only)
  frontend-react (:5173)  ← REST + WebSocket (routed by the global Nginx)
```

**Protocol split:**
- MQTT → device ↔ backend (async events, many emitters, QoS, LWT)
- REST → frontend ↔ backend (on-demand: login, config, history, RAG queries)
- WebSocket → backend → frontend (pushed: live telemetry, status changes, alerts, restart countdown)

---

## The state machine (core business logic)

Each motor and each sensor have **separate, independent state machines**.

**Motor states:**
```
healthy → alarm           (N consecutive anomalous readings on any sensor)
alarm   → healthy         (operator resolves OR all sensors normalize)
alarm   → shutting_down   (grace timer expires — automatic trip)
healthy → shutting_down   (critical reading — immediate trip, no grace)
shutting_down → restarting → healthy
restarting → disabled     (trip recurs after auto-restart)
```

**Sensor states (never affect motor directly):**
```
ok → fault (out_of_range | stuck | disconnected) → restarting (5s) → ok
fault → fault_persistent → requires manual intervention
```

Key rules:
- Readings from a **faulted sensor never participate** in motor alarm evaluation
- **1 automatic restart per episode** — if it trips again, the motor is disabled
- Alarm parameters (`alarmConsecutiveReadings`, `alarmGracePeriodMs`) are **hot-reloadable per motor** — no restart needed
- A single critical reading (`> criticalMax`) triggers an **immediate trip** — no grace window

---

## RAG assistant

Answers natural-language questions about the **current plant state**, not historical data (that's Grafana's job).

Pipeline:
1. **LiveContextService** — reads Redis snapshot (last value + sensor status per motor)
2. **KnowledgeSearchService** — vectorizes the question, cosine similarity against Mongo knowledge base (`all-MiniLM-L6-v2`, 384 dims, no external API)
3. **RagQueryService** — builds prompt, calls Groq
4. **Anti-hallucination filter** — if the LLM cites a value from a faulted sensor, it's rewritten with an explicit unreliability warning before returning

---

## Running locally

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/pabloacisera/telemetry-iot-platform.git
cd telemetry-iot-platform
cp .env.example .env        # fill in GROQ_API_KEY and secrets
docker compose up --build
```

> `simulator/data/hot_motors.csv` is git-ignored — it's auto-generated at runtime when motors are added dynamically. The format is documented in `simulator/data/hot_motors.example.csv`.

| Service | URL |
|---|---|
| React dashboard | http://localhost:5173 |
| Backend API | http://localhost:5173/api (proxied by Vite/global Nginx to the internal backend) |
| MQTT broker | localhost:1883 |
| Grafana | internal (not exposed to the host) |

Only the frontend (5173) and the MQTT broker (1883) are published to the host.
The backend, MySQL, Mongo, Redis and Grafana are internal to the Docker network `telemetry-net`.

Default credentials (seed): `admin@telemetry.com` / `admin123` (admin), `operator@telemetry.com` / `op123` (operator)

---

## Testing

```bash
# Backend — lint + typecheck + 78 tests
cd backend && npm ci && npx eslint src/ --max-warnings 0 && npx tsc --noEmit && npx jest --forceExit

# Frontend — typecheck + 20 tests
cd frontend && npm ci && npx tsc -b && npx jest --ci

# Simulator
cd simulator && pip install -r requirements-dev.txt && pytest tests/ -v
```

CI runs on every push via GitHub Actions (5 jobs: backend, frontend, simulator, docker build, grafana validation).

---

## Project structure

```
├── backend/          NestJS — API, WebSocket, MQTT consumer, RAG, auth
├── frontend/         React + Redux Toolkit — dashboard, config, alert history
├── simulator/        Python — 15 virtual ESP32s with fault injection
├── grafana/          Provisioned dashboards and datasources (as code)
├── ansible/          Automated EC2 deployment playbook
├── mosquitto/        Broker config — auth, ACL, persistence
├── docs/             25 markdown files — architecture, data model, guides
└── .kiro/            Specs and steering rules used during development
```

---

## Documentation

The `docs/` folder has 25 files covering every layer of the system in detail:

- [`01-architecture.md`](docs/01-architecture.md) — container diagram and protocol decisions
- [`02-data-model.md`](docs/02-data-model.md) — all tables, retention and aggregation
- [`03-mqtt-contract.md`](docs/03-mqtt-contract.md) — full topic contract, payloads, ACL
- [`04-anomaly-state-machine.md`](docs/04-anomaly-state-machine.md) — the core business logic
- [`08-rag-flow.md`](docs/08-rag-flow.md) — RAG pipeline, anti-hallucination, prompt design
- [`10-deployment.md`](docs/10-deployment.md) — Docker Compose + Ansible EC2 deployment
- [`SYSTEM-FLOWS.md`](docs/SYSTEM-FLOWS.md) — end-to-end flows for every scenario
