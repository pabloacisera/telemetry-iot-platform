# Spec 08 — Tasks
1. Complete `docker-compose.yml` with all 8 services + `.env.example` (incl. `frontend-react` on 5173).
   Include `healthcheck` for `db-mysql`, `mongo-ragstore`, `redis-cache`, `broker-mqtt` and
   `depends_on: condition: service_healthy` for `backend-nestjs` and `simulator-python`.
2. Dockerfiles for `backend-nestjs`, `simulator-python` and `frontend-react` (vite preview, no nginx).
3. `ansible/deploy-app.yml` that automates: copy project to `/opt/apps/<app>`, create network, connect it
   to `nginx-global`, copy `.env` and `app.conf` to `conf.d/`, execute `nginx -t` + `nginx -s reload`,
   `docker compose up -d`.
4. Step-by-step manual deployment checklist (already defined by the developer, transfer as-is to `docs/10-deployment.md`).
