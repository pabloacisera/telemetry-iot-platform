# Master Prompt for Kiro

You will build an Industrial IoT Telemetry & Predictive Maintenance Platform in Real Time.
The entire design was already closed with the developer — your job is to EXECUTE following exactly what
is in `kiro/steering/` and `kiro/specs/`, and keep the human documentation in `docs/` updated every time
a spec introduces or modifies a contract (MQTT, database, endpoints).

## Execution order
1. Read ALL of `kiro/steering/` first — these are global and immutable rules, not negotiable per spec.
2. Execute specs in numerical order (01 to 08). Each spec has `requirements.md` (EARS),
   `design.md` (interfaces/schemas) and `tasks.md` (atomic task list).
3. After each completed task, run the hooks: format → typecheck → test (see below).
4. If a spec forces you to decide something not resolved in `docs/`, STOP and ask the developer
   instead of assuming — this project was specifically built avoiding unfounded decisions
   (all thresholds and timings have cited sources in `docs/05-thresholds-sources.md`).

## Hooks (automations)
- `post-task-format`: `eslint --fix` + `prettier --write` (backend/frontend), `black` (Python simulator).
- `post-task-typecheck`: `tsc --noEmit`, blocks the next hook if it fails.
- `post-task-test`: run unit tests for the touched module.
- `pre-commit`: grep for hardcoded secret patterns, blocks the commit if found.
- `post-spec-complete`: regenerate `swagger.json` from NestJS decorators.

## Do NOT do (errors already discarded in the design, do not reintroduce them)
- Do not use gRPC or separate into microservices — it's a modular NestJS monolith on purpose.
- Do not use MongoDB for telemetry — it's exclusively the RAG's vectorized knowledge base.
- Do not use Redis as a historical cache — it's exclusively the live motor+sensor snapshot.
- Do not mix motor state with sensor state — they are independent state machines,
  see `docs/04-anomaly-state-machine.md`.
- Do not add a "force fault" button in the UI — fault injection is an external QA script
  (`scripts/inject_fault.py`), outside the production app.
- Do not authenticate the simulator with JWT/API Key — it authenticates at the MQTT broker level (ACL).
- Do not use Sequelize — the chosen ORM is Prisma.
- Do not use LangChain — the RAG is orchestrated with custom NestJS code (a single Groq call doesn't justify a framework).
- Do not store the refresh token in localStorage — it's an httpOnly + Secure + SameSite=Strict cookie.
- Do not invent a multiplier for "critical zone" — the `critical_max` field exists explicitly in
  `motor_sensors` and `sensor_standards`.

## Documentation you also need to maintain
`docs/00-overview.md` is the index. If your execution changes an already-documented contract (a new MQTT
topic, a new table, a new endpoint), update the corresponding file in `docs/` in the same PR as the
spec — human documentation is not optional, it's part of the deliverable.

## 10-day roadmap
| Day | Activity |
|---|---|
| 1-2 | Specs 01-03 (simulator, backend core, auth) |
| 3-4 | Specs 04-06 (frontend, RAG, Grafana) |
| 5 | Specs 07-08 (caching, infra) + integral coherence review between specs |
| 6-9 | Adjustments, polish, edge case hardening |
| 10 | Deploy on EC2 (see `docs/10-deployment.md`), end-to-end tests, interview demo rehearsal |
