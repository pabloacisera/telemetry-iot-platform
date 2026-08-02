# Caching & Performance — Developer Guide

## What is this and why is it the seventh piece

This spec is a **refinement and verification** layer, not new greenfield code. The caching and rate
limiting mechanisms were built incrementally during specs 02 and 03 because they were needed for those
features to work correctly. Spec 07 exists to consolidate, verify, and document that everything is
wired together properly.

It is spec 07 because:
- Redis write-through was introduced in spec 02 (needed for WebSocket to push consistent snapshots).
- Rate limiting was introduced in spec 03 (auth security requirement).
- The GET /motors endpoint serving from Redis was built in spec 02 (frontend needs fast grid load).
- By spec 07, all pieces exist and we verify the full picture is coherent.

## Redis write-through pattern

Every valid telemetry reading triggers this flow in `TelemetryEvaluationService`:

```
MQTT message arrives → validate → persist to MySQL → update Redis snapshot → emit WebSocket
```

Redis is **not a lazy cache** (read-miss → fill). It's written **proactively** on every reading.
This guarantees the snapshot is always fresh without any cache invalidation logic.

### Redis key structure

```
motor_sensor:{id}:last → HASH { value, status, recorded_at }
```

One key per motor_sensor (45 total: 15 motors × 3 sensors). Each is a Redis hash with:
- `value`: last sensor reading (float as string).
- `status`: current sensor status (`ok`, `fault`, `fault_persistent`).
- `recorded_at`: ISO 8601 timestamp of the reading.

### Why write-through, not cache-aside?

Cache-aside (lazy fill) requires handling cache misses, stale data, and invalidation. With only 45 keys
being updated every 15 seconds, the write overhead is negligible, and the dashboard always gets fresh data
without needing a fallback path in normal operation.

## GET /motors — Redis-first with MySQL fallback

`MotorsService.getAll()` builds the grid response by:
1. Loading motor metadata from MySQL (static: code, name, location, connection_type).
2. Loading all snapshots from Redis (`KEYS motor_sensor:*:last` → `HGETALL` each).
3. Merging: motor info + live sensor values from Redis.

**Fallback**: if Redis has no data for a sensor (cold start, Redis flush), the service uses
`motor_sensors.last_value` and `motor_sensors.last_reading_at` from MySQL. This ensures the grid
always renders, even if slightly stale.

## Rate limiting (ThrottlerModule)

Two levels, configured in `AuthModule`:

| Scope | Routes | Limit | Keyed by |
|---|---|---|---|
| Auth | `/auth/login`, `/auth/refresh` | 5 req/min | IP address |
| General | All other REST routes | 60 req/min | Authenticated user |

When the limit is exceeded, the response is `429 Too Many Requests` with a `Retry-After` header.

### Why two levels?

- Auth routes are the brute-force attack surface — 5/min per IP is aggressive but reasonable
  (a legitimate user doesn't need more than 1-2 logins per minute).
- General routes are for authenticated users doing normal work — 60/min is permissive enough
  for rapid navigation but prevents abuse or accidental infinite loops in the frontend.

## What this does NOT introduce

- No Redis Pub/Sub (WebSocket push is handled by socket.io, not Redis).
- No response caching for REST endpoints (data changes every 15 seconds — HTTP caching would be misleading).
- No Redis cluster or sentinel (single instance is sufficient for 45 keys updated every 15s).
- No separate rate limiter service (NestJS ThrottlerModule is in-process, sufficient for a single backend instance).
