# Spec 08 — Tasks
1. Complete `docker-compose.yml` with all 7 services + `.env.example`. Include `healthcheck` for
   `db-mysql`, `mongo-ragstore`, `redis-cache`, `broker-mqtt` and `depends_on: condition: service_healthy`
   for `backend-nestjs` and `simulator-python`.
2. Dockerfiles for `backend-nestjs` and `simulator-python`.
3. `ansible/playbook.yml` (optional) that automates: copy project to `/opt`, `docker compose up -d`,
   copy `app.conf` to `conf.d/`, execute `nginx -t` + `nginx -s reload`.
4. Step-by-step manual deployment checklist (already defined by the developer, transfer as-is to `docs/10-deployment.md`).
