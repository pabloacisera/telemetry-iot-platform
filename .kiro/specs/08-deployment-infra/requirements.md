# Spec 08 — Deployment Infra

## Requirements (EARS)
- WHEN `docker compose up` is executed (manual or via Ansible), THE SYSTEM SHALL start the 8 containers in
  `telemetry-net` exposing only the frontend (5173) and the MQTT broker (1883) to the host, keeping the rest
  internal (not exposed directly to the internet).
- WHEN the app is added to the global Nginx, THE SYSTEM SHALL do so without restarting the `nginx-global`
  container (only `nginx -t` + `nginx -s reload`).
- THE SYSTEM SHALL document the complete traffic route: Client → Cloudflare → cloudflared → global Nginx
  (port 80) → app container (frontend; `/api` and `/socket.io` proxied to the internal backend).
