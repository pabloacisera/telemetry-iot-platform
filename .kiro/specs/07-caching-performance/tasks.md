# Spec 07 — Tasks
1. `CacheModule` (Redis wrapper).
2. Integration in `TelemetryEvaluationService` (write-through on each reading).
3. Endpoint `GET /motors` serving from Redis with fallback to MySQL if Redis lacks data (cold start).
4. `ThrottlerModule` configuration: global + auth overrides.
