# Deployment

## Port mapping (convention)
- `backend-nestjs` listens internally on **port 3000** (inside the container, always).
- In `docker-compose.yml` it maps **4001:3000** (4001 is the host port assigned to this project on the EC2).
- The global Nginx points to `host.docker.internal:4001`.
- Other services (MySQL, Mongo, Redis, Mosquitto, Grafana) use their standard ports internally and
  are NOT exposed to the host (only accessible within the Docker network `telemetry-net`).
- Grafana maps **4002:3000** (for direct access during development, not exposed to internet in production).

## Complete traffic route
```
Web Client → https://app1.yourdomain.com
  → Cloudflare network (resolves the CNAME to the tunnel)
  → cloudflared daemon on EC2 (config.yml → forwards to localhost:81)
  → Global Nginx at /home/ec2-user/global/nginx (port 81 → evaluates conf.d/ → matches by server_name)
  → App container at /opt/<project-name> (internal port, e.g. 4001)
```

## Manual deployment, step by step
1. Copy the project to `/opt/<project-name>`.
2. `docker compose up -d` (starts the 7 containers in `telemetry-net`).
3. Create `/home/ec2-user/global/nginx/conf.d/<app>.conf`:
```nginx
server {
    listen 80;
    server_name app1.yourdomain.com;
    location / {
        proxy_pass http://host.docker.internal:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
4. Validate and reload global Nginx WITHOUT restarting it (doesn't cut other apps):
```bash
docker exec nginx-global nginx -t
docker exec nginx-global nginx -s reload
```

## Deployment with Ansible (optional)
`ansible/playbook.yml` automates the same 4 steps: copy project, bring up compose, copy Nginx conf,
validate+reload. See tasks in `kiro/specs/08-deployment-infra/tasks.md`.

## Fixed rules
- Never `docker compose restart` the global Nginx.
- Internal ports of the 7 containers are never exposed directly to internet, only via global Nginx + tunnel.
- Project-specific `.env`, never shared with other apps on the same EC2.
- Mandatory healthchecks on `db-mysql`, `mongo-ragstore`, `redis-cache`, `broker-mqtt`.
- `backend-nestjs` and `simulator-python` start only when their dependencies are healthy
  (`depends_on: condition: service_healthy`).
- Defense in depth: the backend implements connection retry with exponential backoff on boot
  (Prisma, Redis, MQTT) — `depends_on` only guarantees "container healthy", not "connection established
  from the app code".
