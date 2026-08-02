# Spec 08 — Deployment Infra

## Requirements (EARS)
- WHEN `docker compose up` is executed (manual or via Ansible), THE SYSTEM SHALL start the 7 containers in
  `telemetry-net` without exposing their ports directly to the internet.
- WHEN the app is added to the global Nginx, THE SYSTEM SHALL do so without restarting the `nginx-global`
  container (only `nginx -t` + `nginx -s reload`).
- THE SYSTEM SHALL document the complete traffic route: Client → Cloudflare → cloudflared → global Nginx
  (port 81) → app container.
