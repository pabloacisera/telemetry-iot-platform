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
docker compose up -d
# Then open http://localhost:4001 (backend API)
#            http://localhost:4002 (Grafana)
# Frontend: cd frontend && npm run dev → http://localhost:5173
```

In local mode:
- All 7 infrastructure containers run in Docker.
- The frontend runs outside Docker (Vite dev server with HMR) and proxies API calls to `localhost:4001`.
- You test everything in the browser against real data flowing from the simulator.
- The simulator starts automatically and begins publishing telemetry within seconds.

### Production (EC2 via Ansible)

```bash
cd ansible && ansible-playbook playbook.yml -i inventory.ini
```

Ansible automates:
1. Copy project to `/opt/telemetry-platform/` on the EC2.
2. `docker compose up -d` (starts all 7 containers).
3. Copy Nginx config to `conf.d/`.
4. Validate + reload global Nginx (never restart).

## Why Ansible and not just `ssh + docker compose up`?

- **Idempotent**: running it twice doesn't break anything or duplicate config.
- **Documented**: the playbook IS the deployment documentation — no tribal knowledge.
- **Repeatable**: a new developer can deploy to a fresh EC2 without asking anyone.
- **Demonstrable**: in an interview, you show the playbook and explain the automation instead of saying "I copied files manually."

## Container architecture (7 services)

| Container | Image | Internal Port | Host Port | Depends On |
|---|---|---|---|---|
| `broker-mqtt` | eclipse-mosquitto:2 | 1883 | — | — |
| `db-mysql` | mysql:8.0 | 3306 | — | — |
| `mongo-ragstore` | mongo:7 | 27017 | — | — |
| `redis-cache` | redis:7-alpine | 6379 | — | — |
| `backend-nestjs` | ./backend (custom) | 3000 | 4001 | mysql, mongo, redis, mqtt (healthy) |
| `dashboard-grafana` | grafana/grafana:11.0 | 3000 | 4002 | mysql (healthy) |
| `simulator-python` | ./simulator (custom) | — | — | mqtt (healthy) |

Only backend (4001) and Grafana (4002) are exposed to the host. Everything else is internal to
`telemetry-net`.

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

# 4. Test the API
curl http://localhost:4001/motors  # (needs JWT, or temporarily disable auth for smoke test)

# 5. Start frontend dev server
cd frontend && npm run dev
# Open http://localhost:5173 in browser

# 6. Check Grafana
open http://localhost:4002  # admin / (GRAFANA_ADMIN_PASSWORD from .env)

# 7. Inject a fault to test the flow
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
