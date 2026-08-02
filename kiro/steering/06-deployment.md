# Steering 06 — Deployment

- 100% containerized via Docker Compose, one internal network `telemetry-net`.
- 7 containers: `broker-mqtt`, `db-mysql`, `mongo-ragstore`, `redis-cache`, `backend-nestjs`,
  `dashboard-grafana`, `simulator-python`. The React frontend is served compiled, outside this compose,
  behind the EC2's global Nginx.
- **Mandatory healthchecks** on `db-mysql`, `mongo-ragstore`, `redis-cache`, `broker-mqtt`.
  Backend and simulator use `depends_on: condition: service_healthy`.
- **Additional defense**: the backend implements connection retry with exponential backoff on boot
  (for Prisma, Redis, and MQTT) — `depends_on` only guarantees "container healthy", not "connection established".
- **Port mapping**: backend listens on 3000 internally, mapped to 4001 on host. Grafana 3000→4002.
  Other services do NOT expose ports to the host (only accessible within `telemetry-net`).
- Never restart the global Nginx (`nginx-global`). Correct flow on config change:
  `docker exec nginx-global nginx -t` (validate) → `docker exec nginx-global nginx -s reload` (apply without
  cutting other apps).
- Internal ports of each container are NOT exposed directly to internet; only through global Nginx (port 81)
  + Cloudflare tunnel. See `docs/10-deployment.md` for the complete traffic route.
- Environment variables per service in the project's own `.env`, never shared with other projects on the EC2.
- See full manual and Ansible deployment detail in `docs/10-deployment.md`.
