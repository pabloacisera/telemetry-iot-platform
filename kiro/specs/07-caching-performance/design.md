# Spec 07 — Design
Write-through pattern: Redis is written in the same flow as MySQL persistence, not on demand.
Redis key: `motor_sensor:{id}:last` → hash `{value, status, recorded_at}`.

`ThrottlerModule` configured with two levels:
- Auth (`/auth/login`, `/auth/refresh`): 5 req/min per IP.
- General (all other routes): 60 req/min per authenticated user.
