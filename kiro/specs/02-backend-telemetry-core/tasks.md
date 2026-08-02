# Spec 02 — Tasks

1. Migrations: `motors`, `sensor_standards` (seed), `motor_sensors`, `readings` (partitioned), `alerts`, `sensor_faults`, `motor_status_history`.
2. DTOs + validation (`TelemetryEventDto`).
3. `TelemetryConsumerService` (backend MQTT connection, broad ACL).
4. `TelemetryEvaluationService` with sliding window and all edge cases covered.
5. `StatusTransitionService` + audit in `motor_status_history`.
6. Integration with `CommandModule` to publish automatic forced restart.
7. Integration with `RealtimeGateway` (emission per room `motor:{id}`).
8. Integration with `CacheModule` (Redis snapshot updated on each reading).
9. Unit tests for each edge case (reference `kiro/steering/05-testing.md`).
10. REST endpoint for initial snapshot (`GET /motors` and `GET /motors/:id`) for grid and detail.
