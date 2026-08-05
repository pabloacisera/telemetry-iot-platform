# Spec 07 — Caching & Performance

## Requirements (EARS)
- WHEN the frontend requests the initial grid snapshot (`GET /motors`), THE SYSTEM SHALL read it from Redis,
  not from MySQL.
- WHEN a valid telemetry reading arrives, THE SYSTEM SHALL update the corresponding Redis hash for that
  `motor_sensor_id` in the same operation as the MySQL persistence.
- IF more than 5 requests/minute arrive from the same IP to auth routes, THEN THE SYSTEM SHALL respond 429.
- IF more than 60 requests/minute arrive from the same authenticated user to any other REST route, THEN THE SYSTEM SHALL respond 429.
