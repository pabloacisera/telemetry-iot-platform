# Deployment & Infrastructure — Developer Guide

## What is this and why is it the last piece built

This spec packages everything built in specs 01-07 into a deployable, reproducible system. It produces:
1. A `docker-compose.yml` that brings up the entire platform locally with one command.
2. Dockerfiles for the two custom services (backend + simulator).
3. An Ansible playbook that automates deployment to the EC2 production server.

It is built last because now all containers and their real dependencies are known — no guessing about
what connects to what or which service needs to start first.

## Two modes of operation

### Local development (what you'll use daily)

```bash
docker compose up -d --build
# Then open http://localhost:5173 (frontend)
# API + WebSocket reach the backend through the Vite proxy (/api and /socket.io)
# Grafana: internal-only (no host port) — port-forward if you need the UI
```

In local mode:
- All 8 containers run in Docker, on the internal network `telemetry-net`.
- Only the frontend (5173) and the MQTT broker (1883) are published to the host.
- The frontend container serves the compiled SPA with `vite preview` and proxies `/api` and `/socket.io`
  to `backend-nestjs` (see `frontend/vite.config.ts`).
- You test everything in the browser against real data flowing from the simulator.
- The simulator starts automatically and begins publishing telemetry within seconds.

### Production (EC2 via Ansible)

> **Primer despliegue:** la infraestructura global de la EC2 (Docker, `nginx-global`, cloudflared, túnel
> y subdominio Cloudflare) se configura **una vez a mano**. Los seeds post-deploy también se corren una vez.
> Ver el runbook completo: [`docs/28-first-deploy-runbook.md`](./28-first-deploy-runbook.md).

```bash
cd ansible && ansible-playbook playbook.yml -i inventory.ini
```

Ansible automates:
1. Copy project to `/opt/apps/telemetry/` on the EC2.
2. Copy the production `.env` (from `ansible/files/.env.production`).
3. `docker compose up -d --build` (starts all 8 containers).
4. Connect the app network (`telemetry-net`) to `nginx-global`.
5. Copy `ansible/files/nginx/telemetry.conf` to the global Nginx `conf.d/`.
6. Validate + reload global Nginx (never restart).

Production access: only `telemetry.artisandevs.site` (→ frontend) is public; `/api`, `/socket.io` and
`/grafana` are routed by the global Nginx to the internal services. MySQL, Mongo, Redis and the broker
(except 1883 for the fault-injection script) stay internal.

One-time manual seeds after the first deploy (see runbook):
```bash
docker exec backend-nestjs node dist-seed/seed.js
docker exec backend-nestjs node dist-seed/seed-embeddings.js
```

## Why Ansible and not just `ssh + docker compose up`?

- **Idempotent**: running it twice doesn't break anything or duplicate config.
- **Documented**: the playbook IS the deployment documentation — no tribal knowledge.
- **Repeatable**: a new developer can deploy to a fresh EC2 without asking anyone.
- **Demonstrable**: in an interview, you show the playbook and explain the automation instead of saying "I copied files manually."

## Container architecture (8 services)

| Container | Image | Internal Port | Host Port | Depends On |
|---|---|---|---|---|
| `broker-mqtt` | eclipse-mosquitto:2 | 1883 | 1883 | — |
| `db-mysql` | mysql:8.0 | 3306 | — | — |
| `mongo-ragstore` | mongo:7 | 27017 | — | — |
| `redis-cache` | redis:7-alpine | 6379 | — | — |
| `backend-nestjs` | ./backend (custom) | 3000 | — | mysql, mongo, redis, mqtt (healthy) |
| `dashboard-grafana` | grafana/grafana:11.0 | 3000 | — | mysql (healthy) |
| `simulator-python` | ./simulator (custom) | — | — | mqtt (healthy) |
| `frontend-react` | ./frontend (custom, vite preview) | 5173 | 5173 | — |

Only the frontend (5173) and the broker (1883) are exposed to the host. Everything else is internal to
`telemetry-net`. The frontend container has NO nginx of its own — it serves the compiled SPA with
`vite preview`, and the global Nginx routes the subdomain to it, proxying `/api` and `/socket.io` to the
internal backend.

## Healthchecks (mandatory)

Each infrastructure container has a healthcheck so `depends_on: condition: service_healthy` works:

- **MySQL**: `mysqladmin ping -h localhost`
- **MongoDB**: `mongosh --eval "db.adminCommand('ping')"`
- **Redis**: `redis-cli ping`
- **Mosquitto**: `mosquitto_sub -t '$SYS/broker/uptime' -C 1 -W 3`

Without these, `depends_on` only waits for the container to start, not for the service to be ready.

## Defense in depth: backend retry

Even with healthchecks, there's a race between "container reports healthy" and "connection from app code
succeeds." The backend implements exponential backoff on boot for Prisma, Redis, and MQTT connections.
This means the system self-heals from brief startup timing issues without crashing.

## The .env file

Each deployment has its own `.env` (never shared across projects on the same EC2). The `.env.example`
documents every required variable. For local development, copy it and fill in minimal values:

```bash
cp .env.example .env
# Edit: set GROQ_API_KEY, leave everything else as defaults for local
```

## How to verify locally (your workflow)

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Wait for healthy (watch the logs)
docker compose logs -f backend-nestjs

# 3. Once "Nest application successfully started" appears:
#    - Simulator is already publishing telemetry
#    - Backend is processing and persisting
#    - Redis snapshot is being updated

# 4. Test the API (through the published frontend proxy)
curl http://localhost:5173/api/motors  # (needs JWT, or temporarily disable auth for smoke test)

# 5. Open the dashboard (the frontend container serves it)
open http://localhost:5173

# 6. Check Grafana (internal-only — port-forward if needed)
docker run --rm -p 3000:3000 --network telemetry-net --name grafana-proxy alpine/socat TCP-LISTEN:3000,fork TCP:dashboard-grafana:3000
# then open http://localhost:3000  # admin / (GRAFANA_ADMIN_PASSWORD from .env)

# 7. Inject a fault to test the flow (MQTT on localhost:1883)
cd scripts && python3 inject_fault.py --motor 7 --type stuck --sensor vibration
```

## What this does NOT do

- Does not configure Cloudflare or DNS (that's a one-time manual setup per domain).
- Does not set up the EC2 instance itself (assumes Amazon Linux with Docker + Docker Compose installed).
- Does not manage SSL certificates (Cloudflare handles TLS termination).
- Does not restart the global Nginx container (only validates + reloads its config).

## CI/CD Pipeline

### CI (active now — runs on every push and PR)

The GitHub Actions pipeline at `.github/workflows/ci.yml` runs:
1. **Backend**: lint → typecheck → unit tests (jest).
2. **Frontend**: component tests (jest).
3. **Simulator**: unit tests (pytest).
4. **Grafana**: validates dashboard JSON syntax.
5. **Docker**: verifies both custom images build successfully.

All must pass before a PR can be merged.

### CD (future — auto-deploy to EC2)

When ready to enable, the CD stage will:
1. Trigger only on merge to `main` (not on PRs or feature branches).
2. Require all CI jobs to pass first.
3. Run Ansible playbook to deploy to the EC2 automatically.

**Prerequisites to activate:**
- Add GitHub Secret `EC2_SSH_KEY` (private key for SSH access).
- Add GitHub Secret `EC2_HOST` (public IP or hostname of the EC2).
- Fill `ansible/files/.env.production` with real credentials.
- Update `ansible/inventory.ini` with the EC2 IP.

The CD job is already written (commented out) in `.github/workflows/ci.yml`. Uncomment it when
the EC2 is ready and secrets are configured.

## Environment variables — single file

All environment variables live in `/.env` (root). There is no separate backend `.env`.
- **Docker**: `docker-compose.yml` reads from root `.env` via `env_file` and overrides hostnames
  (e.g., `REDIS_HOST=redis-cache` instead of `localhost`).
- **Outside Docker** (running `npm run start:dev` directly): the backend reads from root `.env`
  which has `localhost` values.

Copy `.env.example` to `.env` and fill in your values. Never commit `.env` to git.
