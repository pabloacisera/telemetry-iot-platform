# Industrial IoT Telemetry & Predictive Maintenance Platform — Developer Documentation

## What is this
A real-time monitoring system for 15 industrial motors, each with 3 sensors (temperature, vibration, current),
that detects anomalies, alerts operators, and if no one intervenes, acts autonomously (restarts or disables
the motor). Includes a natural language assistant (RAG) that answers questions about the current plant state,
and Grafana for historical data.

## Why each piece exists (summary to memorize)
| Piece | Why it's here |
|---|---|
| MQTT (Mosquitto) | Lightweight pub/sub transport, IoT de facto standard, with QoS and disconnect detection (LWT). |
| MySQL | Relational source of truth: motors, sensors, readings, alerts, users. Explicit job requirement. |
| MongoDB | Exclusively the vectorized knowledge base for RAG (not telemetry). Covers the NoSQL requirement. |
| Redis | Live snapshot (last value per sensor), to load the dashboard fast without scanning MySQL. |
| NestJS | Layered backend, strict TypeScript, DTOs, guards, WebSocket gateway. |
| React + Redux Toolkit | Frontend with explicit global state, required by the job position. |
| Grafana | Historical aggregated visualization. NOT a database, only queries MySQL. |
| RAG (Mongo + LLM) | Answers in natural language about the plant's NOW, does not replace Grafana. |

## How to read this documentation
1. `01-architecture.md` — general overview and container diagram.
2. `02-data-model.md` — all tables, with their purpose and the retention/aggregation mechanism.
3. `03-mqtt-contract.md` — complete topic contract, payloads, ACL, and reconnection.
4. `04-anomaly-state-machine.md` — the most important business logic in the system.
5. `05-thresholds-sources.md` — where the numbers come from, with cited sources.
6. `06-nestjs-modules.md` and `07-frontend-architecture.md` — how the code is organized.
7. `08-rag-flow.md` — how the assistant builds its answers.
8. `09-roles-permissions.md` — who can do what.
9. `10-deployment.md` — how to deploy, step by step.
10. `11-roadmap-future-work.md` — what was intentionally left out and how it would scale.
11. `12-simulator-guide.md` — the MQTT simulator: what it is, how it works, how to run it.
