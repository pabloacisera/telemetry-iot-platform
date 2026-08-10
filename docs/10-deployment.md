# Deployment

## Port mapping (convention)
- Only the **frontend (5173)** and the **MQTT broker (1883)** are published to the host.
- `backend-nestjs` listens internally on **port 3000** (no host port).
- Other services (MySQL, Mongo, Redis, Grafana) are **NOT exposed to the host** — only reachable within the
  Docker network `telemetry-net`.
- The global Nginx (in `/opt/infra`, container `nginx-global`) proxies the subdomain to the frontend
  container and routes `/api/` and `/socket.io/` to `backend-nestjs`.

## Routing (nginx-global, telemetry.conf)
- `telemetry.artisandevs.site` → `frontend-react:5173` (SPA served by `vite preview`, no nginx inside the container).
- `telemetry.artisandevs.site/api/*` → `backend-nestjs:3000` (the `/api` prefix is stripped; the NestJS backend
  has no global prefix — routes live at `/auth`, `/motors`, etc.).
- `telemetry.artisandevs.site/socket.io/*` → `backend-nestjs:3000` with WebSocket upgrade headers.

## Complete traffic route
```
Web Client → https://telemetry.artisandevs.site
  → Cloudflare network (resolves the CNAME to the tunnel)
  → cloudflared daemon on EC2 (config.yml → forwards to localhost:80)
  → Global Nginx at /opt/infra (port 80 → evaluates conf.d/ → matches by server_name)
  → App container (frontend-react:5173; /api/ and /socket.io/ to backend-nestjs:3000)
```

## Manual deployment, step by step
1. Copy the project to `/opt/apps/telemetry`.
2. No need to create `telemetry-net` manually — `docker compose` auto-creates it
   because the compose file defines `networks: telemetry-net: name: telemetry-net`.
   (Still valid as a one-time manual step: `docker network create telemetry-net`.)
3. `docker compose up -d --build` (starts the 8 containers in `telemetry-net`).
4. Connect the network to the global Nginx: `docker network connect telemetry-net nginx-global`.
5. Create `/opt/infra/conf.d/telemetry.conf` (see `ansible/files/nginx/telemetry.conf` for the current version).
6. Validate and reload global Nginx WITHOUT restarting it (doesn't cut other apps):
```bash
docker exec nginx-global nginx -t
docker exec nginx-global nginx -s reload
```

## Deployment with Ansible
`ansible/deploy-app.yml` automates the same steps: create `/opt/apps/<app>` + network, synchronize files,
copy `.env`, connect the network to `nginx-global`, copy the nginx conf, validate + reload, and bring up
compose. See `ansible/README.md`. Migrations are handled at container startup by the backend
(`prisma migrate deploy` in `backend/Dockerfile`) — do not use `run_migrations=true` for this app.

## Fixed rules
- Never `docker compose restart` the global Nginx.
- Internal ports of the containers are never exposed directly to internet, only via global Nginx + tunnel.
  Only exceptions: frontend 5173 (local dev access) and broker 1883 (external fault-injection script).
- Project-specific `.env`, never shared with other apps on the same EC2.
- Mandatory healthchecks on `db-mysql`, `mongo-ragstore`, `redis-cache`, `broker-mqtt`.
- `backend-nestjs` and `simulator-python` start only when their dependencies are healthy
  (`depends_on: condition: service_healthy`).
- Defense in depth: the backend implements connection retry with exponential backoff on boot
  (Prisma, Redis, MQTT) — `depends_on` only guarantees "container healthy", not "connection established
  from the app code".
